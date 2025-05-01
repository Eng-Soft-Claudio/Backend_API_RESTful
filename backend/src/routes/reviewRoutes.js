// src/routes/reviewRoutes.js
import express from "express";
import { body, param, query } from "express-validator";
import { authenticate } from "../middleware/auth.js"; // Middleware de autenticação
import { isAdmin } from "../middleware/auth.js"; // Middleware de admin (usado se necessário)
import {
  createReview,
  getReviewsForProduct,
  deleteReview,
  // updateMyReview // Controller para atualizar (se implementar)
} from "../controllers/reviewController.js"; // Importa os controllers

const router = express.Router();

// --- Validações Reutilizáveis ---

// Validação para ID de produto no parâmetro da URL
const productIdParamValidation = [
  param("productId", "ID de produto inválido na URL").isMongoId(),
];

// Validação para ID de avaliação no parâmetro da URL
const reviewIdParamValidation = [
  param("reviewId", "ID de avaliação inválido na URL").isMongoId(),
];

// Validação para o corpo da criação de avaliação
const createReviewValidation = [
  body(
    "rating",
    "A nota (rating) é obrigatória e deve ser um número entre 1 e 5"
  )
    .notEmpty()
    .withMessage("A nota é obrigatória.")
    .isInt({ min: 1, max: 5 })
    .withMessage("A nota deve ser entre 1 e 5."),
  body("comment", "Comentário inválido (máx 1000 caracteres)")
    .optional() // Comentário é opcional
    .trim()
    .isLength({ max: 1000 })
    .withMessage("Comentário pode ter no máximo 1000 caracteres."),
];

// Validação para query params de paginação
const paginationValidation = [
  query("page", "Página inválida (deve ser número inteiro positivo)")
    .optional()
    .isInt({ gt: 0 })
    .toInt(),
  query("limit", "Limite inválido (deve ser número inteiro positivo)")
    .optional()
    .isInt({ gt: 0 })
    .toInt(),
];

// --- Definição das Rotas ---

/**
 * @swagger
 * tags:
 *   name: Reviews
 *   description: Operações de avaliações de produtos.
 */

// Rota para LISTAR avaliações de um produto específico (PÚBLICA)
/**
 * @swagger
 * /api/reviews/product/{productId}:
 *   get:
 *     summary: Obtém avaliações de um produto específico (Público).
 *     tags: [Reviews]
 *     security: []
 *     parameters:
 *       - $ref: '#/components/parameters/ProductIdParam' # Usa param centralizado
 *       - $ref: '#/components/parameters/PageQueryParam'
 *       - $ref: '#/components/parameters/LimitQueryParam'
 *     responses:
 *       '200':
 *         description: Lista de avaliações e informações de paginação.
 *         content: { application/json: { schema: { $ref: '#/components/schemas/ReviewListOutput' }}}
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
  "/product/:productId",
  productIdParamValidation, // Valida o :productId na URL
  paginationValidation, // Valida os query params opcionais ?page e ?limit
  getReviewsForProduct // Chama o controller
);

// Rota para CRIAR uma avaliação para um produto (REQUER LOGIN)
/**
 * @swagger
 * /api/reviews/product/{productId}:
 *   post:
 *     summary: Cria uma nova avaliação para um produto (Requer Login).
 *     tags: [Reviews]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/ProductIdParam'
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
 *         description: Erro de validação (rating/comment inválido), usuário já avaliou, ou ID de produto inválido.
 *         content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' }}}
 *       '401': { description: Não autorizado, content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' }}}}
 *       '404': { description: Produto não encontrado, content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' }}}}
 *       '500': { description: Erro interno, content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' }}}}
 */
router.post(
  "/product/:productId",
  authenticate, // 1. Garante que usuário está logado
  productIdParamValidation, // 2. Valida ID do produto na URL
  createReviewValidation, // 3. Valida 'rating' e 'comment' no corpo
  createReview // 4. Controller executa
);

// Rota para DELETAR uma avaliação (REQUER LOGIN - Permissão verificada no controller)
/**
 * @swagger
 * /api/reviews/{reviewId}:
 *   delete:
 *     summary: Deleta uma avaliação (Requer Login; Admin ou Dono).
 *     tags: [Reviews]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/ReviewIdParam'
 *     responses:
 *       '204':
 *         description: Avaliação deletada com sucesso.
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
  "/:reviewId",
  authenticate, // 1. Garante login
  reviewIdParamValidation, // 2. Valida ID da review na URL
  deleteReview // 3. Controller executa (verifica permissão e deleta)
);

// Futuro: Rota para ATUALIZAR uma avaliação (PUT ou PATCH /:reviewId)
// router.put('/:reviewId', authenticate, reviewIdParamValidation, updateReviewValidation, updateMyReview);

export default router;
