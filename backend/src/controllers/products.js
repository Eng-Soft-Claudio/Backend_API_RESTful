// src/controllers/products.js
import Product from '../models/Product.js';
import Category from '../models/Category.js';
import { validationResult } from 'express-validator';
import { uploadImage } from '../utils/cloudinary.js';
import { triggerWebhook } from './webhooks.js';
import mongoose from 'mongoose'; 

/**
 * @description Cria um novo produto. Espera que Multer (upload.single) e as validações rodem ANTES na rota.
 * @route POST /api/products
 * @access Admin
 */

export const createProduct = async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    try {

        if (!req.file) {
            console.error("Controller createProduct: req.file não definido após middlewares.");
            return res.status(400).json({ error: 'Arquivo de imagem obrigatório não encontrado.' });
        }

        const result = await uploadImage(req.file.path);

        const productData = {
            name: req.body.name,
            image: result.secure_url,
            price: Number(req.body.price), 
            category: req.body.category, 
            description: req.body.description, 
            stock: req.body.stock ? Number(req.body.stock) : 0 
        };

        const product = await Product.create(productData);

        await triggerWebhook('product_created', product);

        const populatedProduct = await Product.findById(product._id)
            .populate('category', 'name slug') 
            .lean();

        res.status(201).json(populatedProduct); 

    } catch (err) {
        next(err); 
    }
};

/**
 * @description Lista produtos com filtros, paginação e ordenação.
 * @route GET /api/products
 * @access Public (ou conforme definido na rota)
 */

export const getProducts = async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    try {
        const { page = 1, limit = 10, q, category: categoryIdentifier, sort } = req.query;
        const filterQuery = {}; 

        if (categoryIdentifier) {
            let foundCategory = await Category.findOne({
                $or: [
                    { _id: mongoose.Types.ObjectId.isValid(categoryIdentifier) ? categoryIdentifier : null },
                    { slug: categoryIdentifier.toLowerCase() }
                ]
            }).select('_id').lean(); 

            if (foundCategory) {
                filterQuery.category = foundCategory._id;
            } else {
                return res.status(200).json({
                    status: 'success',
                    results: 0,
                    products: [],
                    message: "Categoria não encontrada",
                    totalPages: 0,
                    currentPage: page,
                    totalProducts: 0
                });;
            }
        }

        if (q) {
            filterQuery.$text = { $search: q };
        }

        const sortOptions = sort ? String(sort).split(',').join(' ') : '-createdAt';

        const [products, totalProducts] = await Promise.all([
            Product.find(filterQuery)              
                   .populate('category', 'name slug')
                   .sort(sortOptions)
                   .limit(limit)
                   .skip((page - 1) * limit)
                   .lean(),
            Product.countDocuments(filterQuery)     
        ]);

        const totalPages = Math.ceil(totalProducts / limit);

        res.status(200).json({
            status: 'success',
            results: products.length, 
            totalProducts: totalProducts, 
            totalPages: totalPages,       
            currentPage: page,          
            products,                  
        });

    } catch (err) {
        next(err);
    }
};

/**
 * @description Atualiza um produto existente. Espera que Multer e validações rodem ANTES na rota.
 * @route PUT /api/products/:id
 * @access Admin
 */

export const updateProduct = async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    try {
        const updates = { ...req.body }; 
        const productId = req.params.id; 

        if (req.file) {
            const result = await uploadImage(req.file.path);
            updates.image = result.secure_url;
        }

        if (updates.price !== undefined) { 
            updates.price = Number(updates.price);
        }
        if (updates.stock !== undefined) {
            updates.stock = Number(updates.stock);
        }

        const product = await Product.findByIdAndUpdate(
            productId,
            updates,
            { new: true, runValidators: true }
        ).populate('category', 'name slug'); 

        if (!product) {
            const error = new Error('Produto não encontrado');
            error.statusCode = 404;
            error.status = 'fail';
            error.isOperational = true;
            return next(error); 
        }

        await triggerWebhook('product_updated', product);

        res.status(200).json(product);

    } catch (err) {
        next(err);
    }
};

/**
 * @description Deleta um produto pelo ID.
 * @route DELETE /api/products/:id
 * @access Admin
 */

export const deleteProduct = async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    try {
        const product = await Product.findByIdAndDelete(req.params.id);

        if (!product) {
            const error = new Error('Produto não encontrado');
            error.statusCode = 404;
            error.status = 'fail';
            error.isOperational = true;
            return next(error);
        }

        res.status(200).json({
            status: 'success',
            message: 'Produto removido com sucesso',
        });

    } catch (err) {
        next(err);
    }
};