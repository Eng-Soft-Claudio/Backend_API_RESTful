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

/**
 * @swagger
 * tags:
 *   name: Categories
 *   description: Gerenciamento de categorias de produtos.
 */

/**
 * @swagger
 * /api/categories:
 *   post:
 *     summary: Cria uma nova categoria (Admin).
 *     tags: [Categories]
 *     security:
 *       - bearerAuth: [] # Requer Admin
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CategoryInput'
 *     responses:
 *       '201':
 *         description: Categoria criada.
 *         content: { application/json: { schema: { $ref: '#/components/schemas/CategoryOutput' }}}
 *       '400':
 *         description: Erro de validação.
 *         content: { application/json: { schema: { $ref: '#/components/schemas/ErrorValidationResponse' }}}
 *       '401':
 *         description: Não autorizado.
 *         content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' }}}
 *       '403':
 *         description: Acesso proibido (não é admin).
 *         content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' }}}
 *       '409':
 *         description: Conflito (nome/slug já existe).
 *         content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' }}}
 *       '500':
 *         description: Erro interno.
 *         content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' }}}
 */
router.post('/', authenticate, isAdmin, categoryValidationRules, createCategory);

/**
 * @swagger
 * /api/categories:
 *   get:
 *     summary: Lista todas as categorias.
 *     tags: [Categories]
 *     security: [] # MARCAÇÃO CORRIGIDA: Endpoint público
 *     responses:
 *       '200':
 *         description: Lista de categorias.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/CategoryOutput'
 *       '500':
 *         description: Erro interno.
 *         content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' }}}
 */
router.get('/', getCategories);

/**
 * @swagger
 * /api/categories/{id}:
 *   get:
 *     summary: Obtém uma categoria específica por ID.
 *     tags: [Categories]
 *     security: [] # MARCAÇÃO CORRIGIDA: Endpoint público
 *     parameters:
 *       - $ref: '#/components/parameters/CategoryIdParam' # USA PARÂMETRO CENTRALIZADO
 *     responses:
 *       '200':
 *         description: Detalhes da categoria.
 *         content: { application/json: { schema: { $ref: '#/components/schemas/CategoryOutput' }}}
 *       '400':
 *         description: ID inválido.
 *         content: { application/json: { schema: { $ref: '#/components/schemas/ErrorValidationResponse' }}}
 *       '404':
 *         description: Categoria não encontrada.
 *         content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' }}}
 *       '500':
 *         description: Erro interno.
 *         content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' }}}
 */
router.get('/:id', idValidationRule, getCategoryById);

/**
 * @swagger
 * /api/categories/{id}:
 *   put:
 *     summary: Atualiza uma categoria existente (Admin).
 *     tags: [Categories]
 *     security:
 *       - bearerAuth: [] # Requer Admin
 *     parameters:
 *       - $ref: '#/components/parameters/CategoryIdParam'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CategoryInput'
 *     responses:
 *       '200':
 *         description: Categoria atualizada.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CategoryOutput' # Retorna a categoria atualizada
 *       '400':
 *         description: Erro de validação (ID inválido ou dados do corpo inválidos).
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorValidationResponse'
 *       '401':
 *         description: Não autorizado.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       '403':
 *         description: Acesso proibido (não é admin).
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       '404':
 *         description: Categoria não encontrada para atualizar.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       '409':
 *         description: Conflito (tentativa de atualizar para um nome/slug que já existe em outra categoria).
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       '500':
 *         description: Erro interno do servidor.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
// Nota: idValidationRule e categoryValidationRules são aplicados aqui.
router.put('/:id', authenticate, isAdmin, idValidationRule, categoryValidationRules, updateCategory);

/**
 * @swagger
 * /api/categories/{id}:
 *   delete:
 *     summary: Deleta uma categoria (Admin).
 *     tags: [Categories]
 *     security:
 *       - bearerAuth: [] # Requer Admin
 *     parameters:
 *       - $ref: '#/components/parameters/CategoryIdParam'
 *     responses:
 *       '200':
 *         description: Categoria deletada.
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse' # Usa resposta de sucesso genérica
 *       '204':
 *          description: Categoria deletada com sucesso (alternativa sem corpo de resposta).
 *       '400':
 *         description: Erro de validação (ID inválido ou não pode deletar pois existem produtos associados).
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse' # Ou ErrorValidationResponse se for do ID
 *       '401':
 *         description: Não autorizado.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       '403':
 *         description: Acesso proibido (não é admin).
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       '404':
 *         description: Categoria não encontrada para deletar.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       '500':
 *         description: Erro interno do servidor.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.delete('/:id', authenticate, isAdmin, idValidationRule, deleteCategory);

export default router;