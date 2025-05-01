// src/routes/category.js
import express from "express";
import { body, param } from "express-validator";
import { authenticate, isAdmin } from "../middleware/auth.js"; // Importa middlewares
import {
  createCategory,
  getCategories,
  getCategoryById,
  updateCategory,
  deleteCategory,
} from "../controllers/categoryController.js"; 

const router = express.Router();

// --- Validações Reutilizáveis ---

// Regra para validar o nome (obrigatório e não vazio) e descrição (opcional)
const categoryValidationRules = [
  body("name", "Nome da categoria é obrigatório").trim().notEmpty(),
  body("description", "Descrição inválida (opcional)").optional().trim(), // Apenas valida se existe
];

// Regra para validar se o parâmetro :id é um MongoID válido
const idValidationRule = [param("id", "ID de categoria inválido").isMongoId()];

// --- Rotas ---

/**
 * @swagger
 * tags:
 *   name: Categories
 *   description: Gerenciamento de categorias de produtos.
 */

// Rota para CRIAR categoria (POST /api/categories)
// Requer autenticação (authenticate) e que o usuário seja admin (isAdmin)
// Aplica as regras de validação do corpo (categoryValidationRules)
/**
 * @swagger
 * /api/categories:
 *   post:
 *     summary: Cria uma nova categoria (Admin).
 *     tags: [Categories]
 *     security:
 *       - bearerAuth: []
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
router.post(
  "/",
  authenticate,
  isAdmin,
  categoryValidationRules,
  createCategory
);

// Rota para LISTAR todas as categorias (GET /api/categories)
// Rota pública, não requer autenticação
/**
 * @swagger
 * /api/categories:
 *   get:
 *     summary: Lista todas as categorias.
 *     tags: [Categories]
 *     security: []
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
router.get("/", getCategories);

// Rota para OBTER uma categoria por ID (GET /api/categories/:id)
// Rota pública, mas valida o formato do ID
/**
 * @swagger
 * /api/categories/{id}:
 *   get:
 *     summary: Obtém uma categoria específica por ID.
 *     tags: [Categories]
 *     security: []
 *     parameters:
 *       - $ref: '#/components/parameters/CategoryIdParam'
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
router.get("/:id", idValidationRule, getCategoryById);

// Rota para ATUALIZAR categoria (PUT /api/categories/:id)
// Requer autenticação e admin
// Valida o ID e os dados do corpo
/**
 * @swagger
 * /api/categories/{id}:
 *   put:
 *     summary: Atualiza uma categoria existente (Admin).
 *     tags: [Categories]
 *     security:
 *       - bearerAuth: []
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
 *               $ref: '#/components/schemas/CategoryOutput'
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
router.put(
  "/:id",
  authenticate,
  isAdmin,
  idValidationRule,
  categoryValidationRules,
  updateCategory
);

// Rota para DELETAR categoria (DELETE /api/categories/:id)
// Requer autenticação e admin
// Valida o ID
/**
 * @swagger
 * /api/categories/{id}:
 *   delete:
 *     summary: Deleta uma categoria (Admin).
 *     tags: [Categories]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/CategoryIdParam'
 *     responses:
 *       '200':
 *         description: Categoria deletada (se vazia). Retorna mensagem de sucesso.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       '204':
 *          description: Categoria deletada com sucesso (alternativa sem corpo de resposta, se controller for ajustado).
 *       '400':
 *         description: Erro de validação (ID inválido ou não pode deletar pois existem produtos associados).
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse' # Mensagem específica do controller
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
router.delete("/:id", authenticate, isAdmin, idValidationRule, deleteCategory);

export default router;
