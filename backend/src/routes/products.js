//src/routes/products.js
import express from 'express';
import { authenticate, isAdmin } from '../middleware/auth.js';
import { body, param, query} from 'express-validator'; 
import { 
  createProduct, 
  getProducts, 
  updateProduct, 
  deleteProduct 
} from '../controllers/products.js';
import Category from '../models/Category.js';
import { upload } from '../middleware/upload.js';

const mongoIdValidation = (paramName, message) => [
   param(paramName, message || `ID inválido para ${paramName}`).isMongoId()
];

const categoryExists = body('category', 'ID de Categoria inválido ou não existente')
    .isMongoId()  
    .custom(async (categoryId) => { 
        const category = await Category.findById(categoryId);
        if (!category) {
            return Promise.reject('Categoria não encontrada.'); 
        }
    });

const createProductValidationRules = [
   body('name', 'Nome obrigatório').trim().notEmpty(),
   body('price', 'Preço inválido').isFloat({ gt: 0 }),
   categoryExists,
   body('description', 'Descrição inválida').optional().trim(),
   body('stock', 'Estoque inválido').optional().isInt({ min: 0 }).toInt()
];

const updateProductValidationRules = [
   ...mongoIdValidation('id', 'ID de produto inválido'), 
   body('name', 'Nome não pode ser vazio').optional().trim().notEmpty(),
   body('price', 'Preço deve ser positivo').optional().isFloat({ gt: 0 }),
   body('category', 'ID de Categoria inválido') 
       .optional()                            
       .isMongoId()
       .custom(async (categoryId) => { 
          if (!categoryId) return; 
          const category = await Category.findById(categoryId);
          if (!category) return Promise.reject('Categoria não encontrada.');
       }),
   body('description', 'Descrição inválida').optional({ checkFalsy: true }).trim(), // checkFalsy permite enviar "" para limpar
   body('stock', 'Estoque inválido').optional().isInt({ min: 0 }).toInt()
];

const getProductsValidationRules = [
   query('page', 'Página inválida').optional().isInt({ gt: 0 }).toInt(),
   query('limit', 'Limite inválido').optional().isInt({ gt: 0 }).toInt(),
   query('category', 'Identificador de categoria inválido') 
       .optional()
       .isString()
       .trim(),
   query('q', 'Termo de busca inválido').optional().trim().escape(),
   query('sort', 'Ordenação inválida').optional().matches(/^[a-zA-Z_, -]+$/).trim()
];

const router = express.Router();

router.get('/', getProductsValidationRules, getProducts);
router.post('/', authenticate, isAdmin, upload.single('image'), createProductValidationRules, createProduct);
router.put('/:id', authenticate, isAdmin, upload.single('image'), updateProductValidationRules, updateProduct);
router.delete('/:id', authenticate, isAdmin, mongoIdValidation('id', 'ID de produto inválido'), deleteProduct);

export default router;