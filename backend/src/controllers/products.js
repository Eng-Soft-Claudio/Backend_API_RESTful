import Product from '../models/Product.js';
import { body, validationResult } from 'express-validator';
import { uploadImage } from '../utils/cloudinary.js';
import { upload } from '../middleware/upload.js';
import { triggerWebhook } from './webhooks.js';

// Criar produto (admin)
export const createProduct = [
  upload.single('image'), // Middleware para upload de arquivo
  body('name')
    .trim()
    .notEmpty()
    .withMessage('Nome do produto é obrigatório'),
  body('price')
    .isFloat({ gt: 0 })
    .withMessage('Preço deve ser maior que zero'),
  body('category')
    .isIn(['eletrônicos', 'vestuário', 'alimentos'])
    .withMessage('Categoria inválida'),

  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log("🚨 Erros de validação:", errors.array()); 
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      if (!req.file) {
        return res.status(400).json({ error: 'Nenhuma imagem enviada' });
      }
      console.log("📤 Arquivo recebido:", req.file);
      console.log("⚙️ Corpo da requisição:", req.body); 
      const result = await uploadImage(req.file.path);
      console.log("☁️ Upload Cloudinary OK:", result);

      // Cria o produto e armazena na variável
      
      const product = await Product.create({
        name: req.body.name,
        image: result.secure_url,
        price: Number(req.body.price),
        category: req.body.category
      });
      console.log("✅ Produto criado:", product);  
    
      // Dispara o webhook APÓS a criação do produto
      await triggerWebhook('product_created', product);
    
      res.status(201).json(product); // ← Envie a resposta depois de tudo
    
    } catch (err) {
      console.error("💥 ERRO CRÍTICO:", err); 
      res.status(400).json({ error: err.message });
    }}];

// Listar produtos (público) com paginação
export const getProducts = async (req, res) => {
  try {
    const { page = 1, limit = 10, q, category, sort } = req.query;
    const query = {};

    // Filtro por categoria
    if (category) query.category = category;

    // Busca full-text
    if (q) {
      query.$text = { $search: q };
    }

    // Ordenação dinâmica 
    const sortOptions = sort ? sort.split(',').join(' ') : '-createdAt';

    const products = await Product.find(query)
      .sort(sortOptions)
      .limit(limit)
      .skip((page - 1) * limit);

    res.json(products);
  } catch (err) {
    res.status(500).json({ error: 'Erro na busca', details: err.message });
  }
};

// Atualizar produto (admin)
export const updateProduct = [
  upload.single('image'),
  async (req, res) => {
    try {
      const updates = { ...req.body };
      
      if (req.file) {
        const result = await uploadImage(req.file.path);
        updates.image = result.secure_url;
      }

      const product = await Product.findByIdAndUpdate(
        req.params.id,
        updates,
        { new: true, runValidators: true }
      );

      await triggerWebhook('product_updated', product);

      res.json(product);
    } catch (err) {
      res.status(400).json({ 
        error: 'Erro ao atualizar produto',
        details: err.message 
      });
    }
  }
];


// Deletar produto (admin)
export const deleteProduct = async (req, res) => {
  try {
    await Product.findByIdAndDelete(req.params.id);
    res.json({ message: 'Produto removido com sucesso' });
  } catch (err) {
    res.status(500).json({ 
      error: 'Erro ao remover produto',
      details: err.message 
    });
  }
};