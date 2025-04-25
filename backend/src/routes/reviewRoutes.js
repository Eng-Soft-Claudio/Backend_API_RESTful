// src/routes/reviewRoutes.js
import express from 'express';
import { body, param, query } from 'express-validator';
import { authenticate } from '../middleware/auth.js';
import { isAdmin } from '../middleware/auth.js'; // Implantação futura: rota exclusiva admin
import {
    createReview,
    getReviewsForProduct,
    deleteReview
    // updateMyReview (se implementar)
} from '../controllers/reviewController.js';

const router = express.Router();

// --- Validações ---
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

/**
 * @swagger
 * tags:
 *   name: Reviews
 *   description: Operações de avaliações de produtos.
 */

/**
 * @swagger
 * /api/reviews/product/{productId}:
 *   get:
 *     summary: Obtém avaliações de um produto específico (Público).
 *     tags: [Reviews]
 *     security: [] # Público
 *     parameters:
 *       - in: path
 *         name: productId # Corresponde ao parâmetro na URL
 *         required: true
 *         schema: { type: string, format: objectid }
 *         description: ID do produto para listar avaliações.
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1, minimum: 1 }
 *         description: Número da página.
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 10, minimum: 1 }
 *         description: Número de avaliações por página.
 *     responses:
 *       '200':
 *         description: Lista de avaliações e paginação.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ReviewListOutput' # Schema centralizado
 *       '400':
 *         description: ID de produto inválido ou parâmetros de paginação inválidos.
 *         content: { application/json: { schema: { $ref: '#/components/schemas/ErrorValidationResponse' }}}
 *       '404':
 *         description: Produto não encontrado.
 *         content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' }}}
 *       '500':
 *         description: Erro interno.
 *         content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' }}}
 */
router.get(
    '/product/:productId',
    productIdParamValidation,
    paginationValidation,
    getReviewsForProduct
);

/**
 * @swagger
 * /api/reviews/product/{productId}:
 *   post:
 *     summary: Cria uma nova avaliação para um produto (Requer Login).
 *     tags: [Reviews]
 *     security:
 *       - bearerAuth: [] # Requer autenticação
 *     parameters:
 *       - in: path
 *         name: productId
 *         required: true
 *         schema: { type: string, format: objectid }
 *         description: ID do produto a ser avaliado.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ReviewInput'
 *     responses:
 *       '201':
 *         description: Avaliação criada com sucesso.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                  status: { type: string, example: success }
 *                  data:
 *                      type: object
 *                      properties:
 *                          review: { $ref: '#/components/schemas/ReviewOutput' }
 *       '400':
 *         description: Erro de validação, usuário já avaliou, ou ID de produto inválido.
 *         content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' }}} # Ou ErrorValidationResponse
 *       '401':
 *         description: Não autorizado.
 *         content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' }}}
 *       '403':
 *         description: Acesso proibido (ex: se implementar regra de só poder avaliar após compra).
 *         content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' }}}
 *       '404':
 *         description: Produto não encontrado.
 *         content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' }}}
 *       '500':
 *         description: Erro interno.
 *         content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' }}}
 */
router.post(
    '/product/:productId',
    authenticate,
    productIdParamValidation,
    createReviewValidation,
    createReview
);

/**
 * @swagger
 * /api/reviews/{reviewId}:
 *   delete:
 *     summary: Deleta uma avaliação (Requer Login; Admin ou Dono).
 *     tags: [Reviews]
 *     security:
 *       - bearerAuth: [] # Requer autenticação (permissão checada no controller)
 *     parameters:
 *       - $ref: '#/components/parameters/ReviewIdParam' # Usa parâmetro centralizado
 *     responses:
 *       '204':
 *         description: Avaliação deletada com sucesso (Sem conteúdo).
 *       '400':
 *         description: ID de avaliação inválido.
 *         content: { application/json: { schema: { $ref: '#/components/schemas/ErrorValidationResponse' }}}
 *       '401':
 *         description: Não autorizado.
 *         content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' }}}
 *       '404':
 *         description: Avaliação não encontrada ou sem permissão para deletar.
 *         content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' }}}
 *       '500':
 *         description: Erro interno.
 *         content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' }}}
 */
router.delete(
    '/:reviewId',
    authenticate,
    reviewIdParamValidation,
    deleteReview
);

// Adicionar rota PUT /:reviewId para update se implementar o controller

export default router;