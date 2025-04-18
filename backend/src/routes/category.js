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
 * /api/categories:
 *   post:
 *     summary: Cria uma nova categoria.
 *     tags: [Categories]
 *     description: Cria uma nova categoria de produto. Apenas administradores podem criar categorias.
 *     security:
 *       - bearerAuth: [] # Indica que requer autenticação JWT Bearer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CategoryInput' # Schema para criar categoria
 *     responses:
 *       '201':
 *         description: Categoria criada com sucesso.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CategoryOutput' # Retorna a categoria criada
 *       '400':
 *         description: Erro de validação (ex: nome faltando).
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorValidationResponse'
 *       '401':
 *         description: Não autorizado (token inválido ou ausente).
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       '403':
 *         description: Acesso proibido (usuário não é admin).
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       '409':
 *         description: Conflito (categoria com este nome/slug já existe).
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
router.post('/', authenticate, isAdmin, categoryValidationRules, createCategory);

/**
 * @swagger
 * /api/categories:
 *   get:
 *     summary: Lista todas as categorias.
 *     tags: [Categories]
 *     description: Retorna uma lista de todas as categorias cadastradas, ordenadas por nome. Esta rota pode ser pública ou exigir autenticação dependendo da sua necessidade (atualmente pública).
 *     security:
 *       - bearerAuth: [] # Indica que requer autenticação JWT Bearer
 *     responses:
 *       '200':
 *         description: Lista de categorias obtida com sucesso.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/CategoryOutput' # Lista de categorias
 *       '500':
 *         description: Erro interno do servidor.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/', getCategories); 

/**
 * @swagger
 * /api/categories/{id}:
 *   get:
 *     summary: Obtém uma categoria específica por ID.
 *     tags: [Categories]
 *     description: Retorna os detalhes de uma categoria específica usando seu ID MongoDB.
 *     security: [] 
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: objectid
 *         description: O ID MongoDB da categoria a ser obtida.
 *         example: 6801350d65d4d9e110605dbaf
 *     responses:
 *       '200':
 *         description: Detalhes da categoria.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CategoryOutput'
 *       '400':
 *         description: ID inválido (não é um ObjectId válido).
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorValidationResponse' # Erro da validação 'idValidationRule'
 *       '404':
 *         description: Categoria não encontrada.
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
router.get('/:id', idValidationRule, getCategoryById);

/**
 * @swagger
 * /api/categories/{id}:
 *   put:
 *     summary: Atualiza uma categoria existente.
 *     tags: [Categories]
 *     description: Atualiza o nome e/ou descrição de uma categoria existente. Apenas administradores.
 *     security:
 *       - bearerAuth: [] # Requer token JWT
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: objectid
 *         description: O ID MongoDB da categoria a ser atualizada.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CategoryInput' # Usa o mesmo schema da criação
 *     responses:
 *       '200':
 *         description: Categoria atualizada com sucesso.
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
 *     summary: Deleta uma categoria.
 *     tags: [Categories]
 *     description: Remove uma categoria do sistema. Apenas administradores. A operação falhará se houver produtos associados a esta categoria.
 *     security:
 *       - bearerAuth: [] # Requer token JWT
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: objectid
 *         description: O ID MongoDB da categoria a ser deletada.
 *     responses:
 *       '200':
 *         description: Categoria deletada com sucesso.
 *         content:
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