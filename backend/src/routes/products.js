//src/routes/products.js
import express from "express";
import { authenticate, isAdmin } from "../middleware/auth.js";
import { body, param, query } from "express-validator";
import {
  createProduct,
  getProducts,
  updateProduct,
  deleteProduct,
} from "../controllers/products.js";
import Category from "../models/Category.js";
import { upload } from "../middleware/upload.js";

// --- VALIDAÇÕES ---

const mongoIdValidation = (paramName, message) => [
  param(paramName, message || `ID inválido para ${paramName}`).isMongoId(),
];

const categoryExists = body(
  "category",
  "ID de Categoria inválido ou não existente"
)
  .isMongoId()
  .custom(async (categoryId) => {
    const category = await Category.findById(categoryId);
    if (!category) {
      return Promise.reject("Categoria não encontrada.");
    }
  });

const createProductValidationRules = [
  body("name", "Nome obrigatório").trim().notEmpty(),
  body("price", "Preço inválido").isFloat({ gt: 0 }).toFloat(),
  categoryExists,
  body("description", "Descrição inválida").optional().trim(),
  body("stock", "Estoque inválido").optional().isInt({ min: 0 }).toInt(),
];

const updateProductValidationRules = [
  body("name", "Nome não pode ser vazio").optional().trim().notEmpty(),
  body("price", "Preço deve ser positivo").optional().isFloat({ gt: 0 }),
  body("category", "ID de Categoria inválido")
    .optional()
    .isMongoId()
    .custom(async (categoryId) => {
      if (!categoryId) return;
      const category = await Category.findById(categoryId);
      if (!category) return Promise.reject("Categoria não encontrada.");
    }),
  body("description", "Descrição inválida")
    .optional({ nullable: true, checkFalsy: true })
    .trim(),
  body("stock", "Estoque inválido")
    .optional({ nullable: true })
    .isInt({ min: 0 })
    .toInt(),
];

const getProductsValidationRules = [
  query("page", "Página inválida").optional().isInt({ gt: 0 }).toInt(),
  query("limit", "Limite inválido").optional().isInt({ gt: 0 }).toInt(),
  query("category", "Identificador de categoria inválido")
    .optional()
    .isString()
    .trim(),
  query("q", "Termo de busca inválido").optional().trim().escape(),
  query("sort", "Ordenação inválida")
    .optional()
    .matches(/^[a-zA-Z_, -]+$/)
    .trim(),
];

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Products
 *   description: Gerenciamento de produtos do e-commerce.
 */

// --- ROTAS ---

/**
 * @swagger
 * /api/products:
 *   get:
 *     summary: Lista produtos com filtros, ordenação e paginação.
 *     tags: [Products]
 *     description: Retorna uma lista de produtos. Pode ser filtrada por categoria (ID ou slug), busca textual (q), ordenada e paginada.
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *           minimum: 1
 *         description: Número da página para paginação.
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *           minimum: 1
 *         description: Número de produtos por página.
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *         description: Filtra produtos por ID ou slug da categoria.
 *         example: 'eletronicos'
 *       - in: query
 *         name: q
 *         schema:
 *           type: string
 *         description: Termo para busca textual no nome/descrição dos produtos (requer índice $text no modelo).
 *         example: 'laptop'
 *       - in: query
 *         name: sort
 *         schema:
 *           type: string
 *         description: Critério de ordenação. Use nome do campo ou -nome para descendente (ex: '-price', 'name,-createdAt'). Padrão '-createdAt'.
 *         example: '-price'
 *     responses:
 *       '200':
 *         description: Lista de produtos obtida com sucesso (pode estar vazia se categoria não existir no filtro).
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 results:
 *                   type: integer
 *                   description: Número de produtos nesta página.
 *                   example: 10
 *                 products:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/ProductOutput' # Lista de produtos
 *                 message: # Opcional, apenas se categoria não for encontrada
 *                    type: string
 *                    example: Categoria não encontrada
 *       '400':
 *         description: Erro de validação nos parâmetros de query (ex: page/limit não numérico).
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorValidationResponse'
 *       '500':
 *         description: Erro interno do servidor.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get("/", getProductsValidationRules, getProducts);

/**
 * @swagger
 * /api/products:
 *   post:
 *     summary: Cria um novo produto (Admin).
 *     tags: [Products]
 *     description: Adiciona um novo produto ao catálogo. Requer envio de dados via `multipart/form-data` por causa da imagem. Apenas administradores.
 *     security:
 *       - bearerAuth: [] # Requer token de admin
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data: # <<< TIPO DE CONTEÚDO PARA UPLOAD
 *           schema:
 *             $ref: '#/components/schemas/ProductInput' # Usa o schema ProductInput
 *           encoding: # Opcional, mas ajuda a UI do Swagger
 *              image:
 *                  contentType: image/png, image/jpeg, image/webp, image/gif
 *     responses:
 *       '201':
 *         description: Produto criado com sucesso.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ProductOutput' # Retorna o produto criado
 *       '400':
 *         description: Erro de validação (dados faltando/inválidos, categoria não existe, tipo de imagem inválido).
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorValidationResponse' # Ou ErrorResponse para outros 400
 *       '401': { description: Não autorizado, content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
 *       '403': { description: Acesso proibido (não é admin), content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
 *       '404': { description: Categoria referenciada não encontrada (se validação custom falhar), content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
 *       '500': { description: Erro interno (ex: falha no upload ou DB), content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
 */
router.post(
  "/",
  authenticate,
  isAdmin,
  upload.single("image"),
  createProductValidationRules,
  createProduct
);

/**
 * @swagger
 * /api/products/{id}:
 *   put:
 *     summary: Atualiza um produto existente (Admin).
 *     tags: [Products]
 *     description: Modifica os detalhes de um produto existente. Pode incluir uma nova imagem via `multipart/form-data`. Apenas administradores. Se uma nova imagem for enviada, a anterior pode ser removida do Cloudinary.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id # Definindo parâmetro aqui ou usando $ref
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *           format: objectid
 *         description: ID do produto a ser atualizado.
 *     requestBody:
 *       description: Campos do produto a serem atualizados (pelo menos um, imagem é opcional).
 *       content:
 *         multipart/form-data: # <<< TIPO DE CONTEÚDO PARA UPLOAD (mesmo que imagem seja opcional)
 *           schema:
 *             $ref: '#/components/schemas/ProductUpdateInput' # Schema de atualização
 *           encoding:
 *              image:
 *                  contentType: image/png, image/jpeg, image/webp, image/gif
 *     responses:
 *       '200':
 *         description: Produto atualizado com sucesso.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ProductOutput' # Retorna produto atualizado
 *       '400': { description: ID/Dados inválidos, categoria não existe, etc., content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
 *       '401': { description: Não autorizado, content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
 *       '403': { description: Acesso proibido, content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
 *       '404': { description: Produto ou Categoria não encontrada, content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
 *       '500': { description: Erro interno, content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
 */
// Nota: Usamos PUT aqui, mas PATCH também seria semanticamente correto para atualizações parciais.
router.put(
  "/:id",
  authenticate,
  isAdmin,
  mongoIdValidation("id", "ID de produto inválido"),
  upload.single("image"),
  updateProductValidationRules,
  updateProduct
);

/**
 * @swagger
 * /api/products/{id}:
 *   delete:
 *     summary: Deleta um produto (Admin).
 *     tags: [Products]
 *     description: Remove um produto do catálogo. A imagem associada no Cloudinary pode ser removida também (verificar implementação). Apenas administradores.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *           format: objectid
 *         description: ID do produto a ser deletado.
 *     responses:
 *       '200': # Ou 204 No Content
 *         description: Produto deletado com sucesso.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       '204':
 *         description: Produto deletado com sucesso (Sem conteúdo).
 *       '400': { description: ID inválido, content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
 *       '401': { description: Não autorizado, content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
 *       '403': { description: Acesso proibido, content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
 *       '404': { description: Produto não encontrado, content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
 *       '500': { description: Erro interno, content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
 */
router.delete(
  "/:id",
  authenticate,
  isAdmin,
  mongoIdValidation("id", "ID de produto inválido"),
  deleteProduct
);

export default router;
