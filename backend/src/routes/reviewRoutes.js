// src/routes/reviewRoutes.js
import express from 'express';
import { body, param, query } from 'express-validator';
import { authenticate } from '../middleware/auth.js';
import { isAdmin } from '../middleware/auth.js'; // Se precisar de rota admin separada
import {
    createReview,
    getReviewsForProduct,
    deleteReview
    // updateMyReview (se implementar)
} from '../controllers/reviewController.js';

const router = express.Router();

// --- Regras de Validação ---
const productIdParamValidation = [
    param('productId', 'ID de produto inválido na URL').isMongoId()
];

const reviewIdParamValidation = [
    param('reviewId', 'ID de avaliação inválido na URL').isMongoId()
];

const createReviewValidation = [
    body('rating', 'A nota (rating) é obrigatória e deve ser um número entre 1 e 5')
        .isInt({ min: 1, max: 5 }),
    body('comment', 'Comentário inválido (máx 1000 caracteres)')
        .optional()
        .trim()
        .isLength({ max: 1000 })
];

const paginationValidation = [
    query('page', 'Página inválida').optional().isInt({ gt: 0 }).toInt(),
    query('limit', 'Limite inválido').optional().isInt({ gt: 0 }).toInt()
];


// --- Definição das Rotas ---

// Rota para obter avaliações de um produto específico (pública)
router.get(
    '/product/:productId',
    productIdParamValidation,
    paginationValidation,
    getReviewsForProduct
);

// Rota para criar uma avaliação para um produto específico (requer login)
router.post(
    '/product/:productId',
    authenticate,
    productIdParamValidation,
    createReviewValidation,
    createReview
);

// Rota para deletar uma avaliação (requer login, controller verifica permissão user/admin)
router.delete(
    '/:reviewId',
    authenticate,
    reviewIdParamValidation,
    deleteReview
);

// Adicionar rota PUT /:reviewId para update se implementar o controller

export default router;