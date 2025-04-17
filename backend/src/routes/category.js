// src/routes/category.js
import express from 'express';
import { body, param } from 'express-validator';
import { authenticate, isAdmin } from '../middleware/auth.js'; 
import {
    createCategory,
    getCategories,
    getCategoryById,
    updateCategory,
    deleteCategory
} from '../controllers/category.js'; 

const router = express.Router();

// --- Validações ---
const categoryValidationRules = [
    body('name', 'Nome da categoria é obrigatório').trim().notEmpty(),
    body('description', 'Descrição inválida').optional().trim()
];

const idValidationRule = [
    param('id', 'ID de categoria inválido').isMongoId()
];

// --- Rotas ---
router.post('/', authenticate, isAdmin, categoryValidationRules, createCategory);
router.get('/', getCategories); 
router.get('/:id', idValidationRule, getCategoryById);
router.put('/:id', authenticate, isAdmin, idValidationRule, categoryValidationRules, updateCategory);
router.delete('/:id', authenticate, isAdmin, idValidationRule, deleteCategory);

export default router;