// src/controllers/category.js
import Category from '../models/Category.js';
import AppError from '../utils/appError.js';
import Product from '../models/Product.js'; // Importar para verificar produtos antes de deletar
import { validationResult } from 'express-validator';

// Criar Categoria
export const createCategory = async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    const { name, description } = req.body;

    try {
        const newCategory = await Category.create({ name, description });
        res.status(201).json(newCategory);
    } catch (err) {
        if (err.code === 11000) {
             return next(new AppError(`Categoria com nome '${name}' já existe.`, 409));
        }
        next(err); 
    }
};

// Listar Categorias
export const getCategories = async (req, res, next) => {
    try {
        const categories = await Category.find().sort('name');
        res.status(200).json(categories);
    } catch (err) {
        next(err);
    }
};

// Obter Categoria por ID
export const getCategoryById = async (req, res, next) => {
    const errors = validationResult(req); 
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    try {
        const category = await Category.findById(req.params.id);
        if (!category) {
            return next(new AppError(`Categoria não encontrada!`, 404));
        }
        res.status(200).json(category);
    } catch (err) {
        next(err);
    }
};

// Atualizar Categoria
export const updateCategory = async (req, res, next) => {
    const errors = validationResult(req); 
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    const { name, description } = req.body;
    const categoryId = req.params.id;

    try {
        const category = await Category.findById(categoryId);
        if (!category) {
            return next(new AppError(`Categoria não encontrada!`, 404));
        }

        if (name) category.name = name;
        if (description !== undefined) category.description = description; 

        const updatedCategory = await category.save(); 
        res.status(200).json(updatedCategory);

    } catch (err) {
         if (err.code === 11000) {
             return next(new AppError(`Já existe uma categoria com nome/slug similar.`, 409));
        }
        next(err);
    }
};

// Deletar Categoria
export const deleteCategory = async (req, res, next) => {
    const errors = validationResult(req); 
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    const categoryId = req.params.id;

    try {
        
        const productCount = await Product.countDocuments({ category: categoryId });
        if (productCount > 0) {
            return next(new AppError(`Não é possível deletar. Existem ${productCount} produto(s) nesta categoria.`, 400));
        }

        const category = await Category.findByIdAndDelete(categoryId);

        if (!category) {
            return next(new AppError(`Categoria não encontrada!`, 404));
        }

        res.status(200).json({ message: 'Categoria removida com sucesso' }); 

    } catch (err) {
        next(err);
    }
};