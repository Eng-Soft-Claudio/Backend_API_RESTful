// src/controllers/productsController.js
import Product from '../models/Product.js';
import Category from '../models/Category.js';
import { validationResult } from 'express-validator';
import { uploadImage, deleteImage } from '../utils/cloudinary.js'; // Importa funções do Cloudinary
import mongoose from 'mongoose';
import AppError from '../utils/appError.js';

/**
 * @description Cria um novo produto. Requer upload de imagem via multipart/form-data.
 * @route POST /api/products
 * @access Admin
 */
export const createProduct = async (req, res, next) => {
  // Validação de entrada (feita na rota com express-validator)
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    // Se a validação dos campos de texto/número falhar
    return res.status(400).json({ errors: errors.array() });
  }

  // Validação específica para o upload da imagem
  if (!req.file) {
    // Se o middleware upload.single('image') não anexou um arquivo
    return next(new AppError("Imagem do produto é obrigatória.", 400));
  }

  let imageUrl = null;
  let imagePublicId = null;

  try {
    // 1. Faz upload da imagem para Cloudinary
    try {
        const result = await uploadImage(req.file.path); // Usa o caminho temporário do Multer
        imageUrl = result.secure_url;
        imagePublicId = result.public_id;
    } catch(uploadError) {
        console.error("Controller: Erro no upload para Cloudinary:", uploadError);
        // Retorna um erro 500 específico para falha no upload
        return next(new AppError("Falha ao fazer upload da imagem.", 500));
    }

    // 2. Monta os dados do produto
    const productData = {
      name: req.body.name,
      price: Number(req.body.price), // Garante que é número
      category: req.body.category,   // ID da categoria já validado na rota
      description: req.body.description,
      stock: req.body.stock ? Number(req.body.stock) : 0, // Garante número, default 0
      image: imageUrl,           // URL da imagem vinda do Cloudinary
      imagePublicId: imagePublicId // ID público vindo do Cloudinary
    };

    // 3. Cria o produto no banco de dados
    const product = await Product.create(productData);

    // 4. Popula a categoria para a resposta
    // (Lean() otimiza, mas retorna objeto puro sem métodos Mongoose)
    const populatedProduct = await Product.findById(product._id)
                                      .populate('category', 'name slug')
                                      .lean();

    // 5. Retorna o produto criado
    res.status(201).json(populatedProduct);

  } catch (err) {
    // 6. Tratamento de erro do DB ou outro erro inesperado
    // Se o erro for de duplicação de nome (se houver índice unique)
    if (err.code === 11000 && err.keyPattern && err.keyPattern.name) {
         return next(new AppError(`Produto com nome '${req.body.name}' já existe.`, 409));
    }
    // Se deu erro no DB após o upload, idealmente deletaríamos a imagem do Cloudinary
    if (imagePublicId) {
        console.warn(`Erro ao criar produto no DB após upload (${imagePublicId}). Tentando deletar imagem do Cloudinary...`);
        try { await deleteImage(imagePublicId); } catch (delErr) { console.error("Erro ao deletar imagem órfã:", delErr); }
    }
    next(err); // Passa para o handler global
  }
};


/**
 * @description Lista produtos com filtros, paginação e ordenação.
 * @route GET /api/products
 * @access Público
 */
export const getProducts = async (req, res, next) => {
    // Validação dos query params (feita na rota)
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    try {
        const {
            page = 1,
            limit = 10,
            q,
            category: categoryIdentifier,
            sort
        } = req.query;

        const currentPageNum = parseInt(page, 10);
        const limitNum = parseInt(limit, 10);
        const skip = (currentPageNum - 1) * limitNum;

        const filterQuery = {};

        // Filtro por Categoria (ID ou Slug)
        if (categoryIdentifier) {
            const categoryFilter = mongoose.Types.ObjectId.isValid(String(categoryIdentifier))
                ? { _id: categoryIdentifier }
                : { slug: String(categoryIdentifier).toLowerCase() };

            const foundCategory = await Category.findOne(categoryFilter).select('_id').lean();

            if (foundCategory) {
                filterQuery.category = foundCategory._id;
            } else {
                // Retorna resposta vazia com mensagem clara
                return res.status(200).json({
                    status: 'success',
                    results: 0,
                    products: [],
                    message: 'Categoria não encontrada', // Informa o motivo do resultado vazio
                    totalPages: 0,
                    currentPage: currentPageNum,
                    totalProducts: 0
                });
            }
        }

        // Filtro por Busca Textual
        if (q) {
            filterQuery.$text = { $search: String(q) };
        }

        // Opções de Ordenação
        const sortOptions = sort ? String(sort).split(',').join(' ') : '-createdAt';

        // Executa a busca e a contagem
        const [products, totalProducts] = await Promise.all([
            Product.find(filterQuery)
                   .populate('category', 'name slug')
                   .sort(sortOptions)
                   .limit(limitNum)
                   .skip(skip)
                   .lean(),
            Product.countDocuments(filterQuery)
        ]);

        const totalPages = Math.ceil(totalProducts / limitNum);

        // Retorna a resposta paginada
        res.status(200).json({
            status: 'success',
            results: products.length,
            totalProducts: totalProducts,
            totalPages: totalPages,
            currentPage: currentPageNum,
            products // O array de produtos
        });

    } catch (err) {
        next(err);
    }
};


/**
 * @description Obtém um produto específico pelo seu ID.
 * @route GET /api/products/:id
 * @access Público
 */
export const getProductById = async (req, res, next) => {
    // Validação do formato do ID (feita na rota)
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    try {
        const productId = req.params.id;
        const product = await Product.findById(productId)
                                   .populate('category', 'name slug')
                                   .lean();

        if (!product) {
            return next(new AppError('Produto não encontrado.', 404));
        }
        res.status(200).json(product); // Retorna apenas o objeto do produto

    } catch (err) {
         // Trata erros inesperados do findById
        next(err);
    }
};


/**
 * @description Atualiza um produto existente. Permite upload de nova imagem.
 * @route PUT /api/products/:id
 * @access Admin
 */
export const updateProduct = async (req, res, next) => {
    // Validação do ID (rota) e dados do corpo (rota)
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    const productId = req.params.id;
    // Cria uma cópia MUTÁVEL do req.body para poder modificar/deletar propriedades
    const updates = { ...req.body };
    let oldPublicId = null;
    let newImageUploaded = false; // Flag para saber se houve novo upload

    try {
        // 1. Busca o produto existente para pegar o ID da imagem antiga
        const existingProduct = await Product.findById(productId); // Não usar lean() aqui se precisar de métodos Mongoose
        if (!existingProduct) {
            return next(new AppError("Produto não encontrado para atualizar.", 404));
        }
        oldPublicId = existingProduct.imagePublicId;

        // 2. Se uma nova imagem foi enviada
        if (req.file) {
            newImageUploaded = true;
            // 2a. Faz upload da nova imagem PRIMEIRO
            let uploadResult;
            try {
                uploadResult = await uploadImage(req.file.path);
                updates.image = uploadResult.secure_url;
                updates.imagePublicId = uploadResult.public_id;
            } catch (uploadError) {
                console.error("Erro no upload da nova imagem durante atualização:", uploadError);
                return next(new AppError("Falha ao fazer upload da nova imagem.", 500));
            }

            // 2b. Se upload deu certo E existia imagem antiga, deleta a antiga
            if (oldPublicId) {
                try {
                    await deleteImage(oldPublicId);
                } catch (cloudinaryErr) {
                    console.warn(`Falha ao deletar imagem antiga (${oldPublicId}) do Cloudinary após novo upload:`, cloudinaryErr);
                    // Continua mesmo assim, pois a nova imagem já foi salva
                }
            }
        } else {
            // Se não enviou nova imagem, remove as props de imagem do objeto 'updates'
            // para não sobrescrever as existentes com undefined
            delete updates.image;
            delete updates.imagePublicId;
        }

        // 3. Converte price e stock para Number, se foram enviados
        if (updates.price !== undefined) {
            updates.price = Number(updates.price);
        }
        if (updates.stock !== undefined) {
            updates.stock = Number(updates.stock);
        }
         // Remove campos que não devem ser atualizados diretamente
         delete updates.rating;
         delete updates.numReviews;

        // 4. Atualiza o produto no banco de dados
        const product = await Product.findByIdAndUpdate(productId, updates, {
            new: true,           // Retorna o documento atualizado
            runValidators: true, // Roda validadores do Mongoose
        }).populate('category', 'name slug'); // Popula a categoria na resposta

        // 5. Verifica se a atualização foi bem-sucedida
        if (!product) {
            // Se não encontrou/atualizou, e uma nova imagem foi carregada, deleta a imagem órfã
            if (newImageUploaded && updates.imagePublicId) {
                 console.warn(`Produto ${productId} não encontrado para update APÓS upload. Deletando imagem órfã ${updates.imagePublicId}`);
                 try { await deleteImage(updates.imagePublicId); } catch(delErr) {}
            }
            return next(new AppError("Produto não encontrado após tentativa de update.", 404));
        }

        // 6. Retorna o produto atualizado
        res.status(200).json(product);

    } catch (err) {
        // Se deu erro (ex: validação, DB) APÓS um novo upload bem-sucedido, deleta a imagem órfã
         if (newImageUploaded && updates.imagePublicId) {
             console.warn(`Erro (${err.message}) ao salvar produto ${productId} APÓS upload. Deletando imagem órfã ${updates.imagePublicId}`);
             try { await deleteImage(updates.imagePublicId); } catch(delErr) {console.error("Erro ao deletar img órfã no catch:", delErr);}
         }
        // Trata erro de duplicação de nome no save, se aplicável
        if (err.code === 11000 && err.keyPattern && err.keyPattern.name) {
            return next(new AppError(`Produto com nome '${updates.name}' já existe.`, 409));
        }
        next(err); // Passa outros erros para o handler global
    }
};


/**
 * @description Deleta um produto pelo ID e sua imagem associada no Cloudinary.
 * @route DELETE /api/products/:id
 * @access Admin
 */
export const deleteProduct = async (req, res, next) => {
    // Validação do ID (rota)
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    try {
        const productId = req.params.id;

        // 1. Deleta o produto do banco PRIMEIRO, e pega o documento deletado
        //    para saber qual imagem (se houver) deletar do Cloudinary.
        const deletedProduct = await Product.findByIdAndDelete(productId);

        // Se não encontrou nada para deletar, retorna 404
        if (!deletedProduct) {
            return next(new AppError("Produto não encontrado para deletar.", 404));
        }

        // 2. Se o produto foi deletado E tinha um imagePublicId, tenta deletar do Cloudinary
        if (deletedProduct.imagePublicId) {
            try {
                await deleteImage(deletedProduct.imagePublicId);
            } catch (cloudinaryErr) {
                // Loga o erro, mas considera a operação principal (deleção no DB) um sucesso
                console.warn(`Produto ${productId} deletado do DB, mas falha ao deletar imagem ${deletedProduct.imagePublicId} do Cloudinary:`, cloudinaryErr);
            }
        }

        // 3. Retorna sucesso
        res.status(200).json({
            status: 'success',
            message: 'Produto removido com sucesso',
        });

    } catch (err) {
        // Trata CastError (já pego na rota) ou outros erros do DB
        next(err);
    }
};