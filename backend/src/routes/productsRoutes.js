// src/routes/products.js
import express from "express";
import { authenticate, isAdmin } from "../middleware/auth.js";
import { body, param, query } from "express-validator";
import {
  createProduct,
  getProducts,
  updateProduct,
  deleteProduct,
  getProductById,
} from "../controllers/productsController.js"; // Ajuste o nome do controller se necessário
import Category from "../models/Category.js";
import { upload } from "../middleware/upload.js"; // Importa configuração do Multer

const router = express.Router();

// --- VALIDAÇÕES ---

// Validação de MongoID em parâmetros de rota
const mongoIdValidation = (paramName, message) => [
  param(paramName, message || `ID inválido para ${paramName}`).isMongoId(),
];

// Validação customizada para verificar se a categoria existe no DB
const categoryExistsValidation = (fieldName = "category") =>
  body(fieldName, "ID de Categoria inválido ou não existente")
    .isMongoId()
    .custom(async (categoryId) => {
      const category = await Category.findById(categoryId);
      if (!category) {
        // Rejeita a promessa se a categoria não for encontrada
        return Promise.reject("Categoria não encontrada.");
      }
      // Se encontrar, a validação passa
    });

// Regras para criar produto (usado no POST)
const createProductValidationRules = [
  body("name", "Nome do produto é obrigatório").trim().notEmpty(),
  body("price", "Preço inválido (deve ser número positivo)")
    .isFloat({ gt: 0 })
    .withMessage("Preço deve ser maior que zero.")
    .toFloat(), // Converte para float
  categoryExistsValidation("category"), // Valida a categoria obrigatória
  body("description", "Descrição inválida (opcional)").optional().trim(),
  body("stock", "Estoque inválido (deve ser número inteiro não negativo)")
    .optional() // Estoque é opcional, default 0 no Model
    .isInt({ min: 0 })
    .withMessage("Estoque não pode ser negativo.")
    .toInt(), // Converte para inteiro
];

// Regras para atualizar produto (usado no PUT) - campos são opcionais
const updateProductValidationRules = [
  body("name", "Nome não pode ser vazio se fornecido")
    .optional()
    .trim()
    .notEmpty(),
  body("price", "Preço deve ser positivo se fornecido")
    .optional()
    .isFloat({ gt: 0 })
    .withMessage("Preço deve ser maior que zero.")
    .toFloat(),
  body("category", "ID de Categoria inválido ou não existente") // Valida se categoria for enviada
    .optional()
    .isMongoId()
    .withMessage("Formato de ID de categoria inválido.")
    .custom(async (categoryId) => {
      if (!categoryId) return; // Se não foi enviado, não valida existência
      const category = await Category.findById(categoryId);
      if (!category) {
        return Promise.reject("Categoria não encontrada.");
      }
    }),
  body("description", "Descrição inválida")
    .optional({ nullable: true, checkFalsy: true }) // Permite null ou "" para limpar descrição
    .trim(),
  body("stock", "Estoque inválido (deve ser número inteiro não negativo)")
    .optional({ nullable: true }) // Permite null para talvez indicar "sem estoque"
    .isInt({ min: 0 })
    .withMessage("Estoque não pode ser negativo.")
    .toInt(),
];

// Regras para validar query params da rota GET /
const getProductsValidationRules = [
  query("page", "Página inválida (deve ser número inteiro maior que zero)")
    .optional()
    .isInt({ gt: 0 })
    .toInt(),
  query("limit", "Limite inválido (deve ser número inteiro maior que zero)")
    .optional()
    .isInt({ gt: 0 })
    .toInt(),
  query("category", "Identificador de categoria inválido (string)")
    .optional()
    .isString()
    .trim(),
  query("q", "Termo de busca inválido").optional().trim().escape(), // .escape() para prevenir XSS básico
  query("sort", "Critério de ordenação inválido (use campos ou -campo)")
    .optional()
    // Regex simples para permitir nomes de campos, vírgulas e hífens
    .matches(/^[a-zA-Z0-9_., -]+$/)
    .withMessage("Formato de ordenação inválido.")
    .trim(),
];

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
 *     description: Retorna uma lista de produtos. Pode ser filtrada por categoria (ID ou slug), busca textual (q), ordenada e paginada. Rota pública.
 *     parameters:
 *       - $ref: '#/components/parameters/PageQueryParam'
 *       - $ref: '#/components/parameters/LimitQueryParam'
 *       - $ref: '#/components/parameters/CategoryQueryParam'
 *       - $ref: '#/components/parameters/SearchQueryParam'
 *       - $ref: '#/components/parameters/SortQueryParam'
 *     responses:
 *       '200':
 *         description: Lista de produtos obtida com sucesso.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ProductListOutput' # Referencia schema centralizado
 *       '400':
 *         description: Erro de validação nos parâmetros de query.
 *         content: { application/json: { schema: { $ref: '#/components/schemas/ErrorValidationResponse' }}}
 *       '500':
 *         description: Erro interno do servidor.
 *         content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' }}}
 */
router.get("/", getProductsValidationRules, getProducts);

/**
 * @swagger
 * /api/products/{id}:
 *   get:
 *     summary: Obtém detalhes de um produto específico por ID.
 *     tags: [Products]
 *     description: Retorna os detalhes de um único produto, incluindo sua categoria populada. Rota pública.
 *     parameters:
 *       - $ref: '#/components/parameters/ProductIdParam' # Usa parâmetro centralizado
 *     responses:
 *       '200':
 *         description: Detalhes do produto.
 *         content: { application/json: { schema: { $ref: '#/components/schemas/ProductOutput' }}}
 *       '400':
 *         description: ID do produto inválido.
 *         content: { application/json: { schema: { $ref: '#/components/schemas/ErrorValidationResponse' }}}
 *       '404':
 *         description: Produto não encontrado.
 *         content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' }}}
 *       '500':
 *         description: Erro interno.
 *         content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' }}}
 */
router.get(
  "/:id",
  mongoIdValidation("id", "ID de produto inválido"),
  getProductById
);

/**
 * @swagger
 * /api/products:
 *   post:
 *     summary: Cria um novo produto (Admin).
 *     tags: [Products]
 *     description: Adiciona um novo produto ao catálogo. Requer envio de dados via `multipart/form-data` por causa da imagem. Apenas administradores.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             $ref: '#/components/schemas/ProductInput'
 *           encoding:
 *              image:
 *                  contentType: image/png, image/jpeg, image/webp, image/gif
 *     responses:
 *       '201':
 *         description: Produto criado com sucesso.
 *         content: { application/json: { schema: { $ref: '#/components/schemas/ProductOutput' }}}
 *       '400': { description: Erro de validação (dados/imagem faltando/inválidos, categoria não existe), content: { application/json: { schema: { $ref: '#/components/schemas/ErrorValidationResponse' }}}}
 *       '401': { description: Não autorizado, content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' }}}}
 *       '403': { description: Acesso proibido, content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' }}}}
 *       '409': { description: Conflito (ex: nome duplicado, se houver índice unique), content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' }}}}
 *       '500': { description: Erro interno (falha no upload ou DB), content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' }}}}
 */
router.post(
  "/",
  authenticate, // 1. Verifica se está logado
  isAdmin, // 2. Verifica se é admin
  upload.single("image"), // 3. Tenta processar o upload da imagem (anexa req.file se sucesso)
  createProductValidationRules, // 4. Valida os campos de texto/número
  createProduct // 5. Controller executa (verifica req.file e continua)
);

/**
 * @swagger
 * /api/products/{id}:
 *   put:
 *     summary: Atualiza um produto existente (Admin).
 *     tags: [Products]
 *     description: Modifica os detalhes de um produto. Enviar via `multipart/form-data`. Imagem é opcional. Apenas administradores.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/ProductIdParam'
 *     requestBody:
 *       description: Campos do produto a serem atualizados (pelo menos um, imagem é opcional).
 *       content:
 *         multipart/form-data:
 *           schema:
 *             $ref: '#/components/schemas/ProductUpdateInput'
 *           encoding:
 *              image:
 *                  contentType: image/png, image/jpeg, image/webp, image/gif
 *     responses:
 *       '200':
 *         description: Produto atualizado com sucesso.
 *         content: { application/json: { schema: { $ref: '#/components/schemas/ProductOutput' }}}
 *       '400': { description: ID/Dados inválidos, categoria não existe, etc., content: { application/json: { schema: { $ref: '#/components/schemas/ErrorValidationResponse' }}}}
 *       '401': { description: Não autorizado, content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' }}}}
 *       '403': { description: Acesso proibido, content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' }}}}
 *       '404': { description: Produto ou Categoria não encontrada, content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' }}}}
 *       '409': { description: Conflito (ex: nome duplicado), content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' }}}}
 *       '500': { description: Erro interno, content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' }}}}
 */
router.put(
  "/:id",
  authenticate,
  isAdmin,
  mongoIdValidation("id", "ID de produto inválido"), // 1. Valida ID do produto
  upload.single("image"), // 2. Processa imagem (opcional)
  updateProductValidationRules, // 3. Valida outros campos (opcionais)
  updateProduct // 4. Controller executa
);

/**
 * @swagger
 * /api/products/{id}:
 *   delete:
 *     summary: Deleta um produto (Admin).
 *     tags: [Products]
 *     description: Remove um produto do catálogo e sua imagem associada (se houver). Apenas administradores.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/ProductIdParam'
 *     responses:
 *       '200':
 *         description: Produto deletado com sucesso.
 *         content: { application/json: { schema: { $ref: '#/components/schemas/SuccessResponse' }}}
 *       '204':
 *         description: Produto deletado com sucesso (Sem conteúdo).
 *       '400': { description: ID inválido, content: { application/json: { schema: { $ref: '#/components/schemas/ErrorValidationResponse' }}}}
 *       '401': { description: Não autorizado, content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' }}}}
 *       '403': { description: Acesso proibido, content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' }}}}
 *       '404': { description: Produto não encontrado, content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' }}}}
 *       '500': { description: Erro interno, content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' }}}}
 */
router.delete(
  "/:id",
  authenticate,
  isAdmin,
  mongoIdValidation("id", "ID de produto inválido"), // Valida o ID primeiro
  deleteProduct
);

// --- Componentes Swagger Reutilizáveis (Definição Centralizada em app.js) ---

/**
 * @swagger
 * components:
 *   schemas:
 *     ProductInput:
 *       type: object
 *       required:
 *         - name
 *         - price
 *         - category
 *         - image # Marcado como obrigatório aqui, mas controller verifica req.file
 *       properties:
 *         name:
 *           type: string
 *           description: Nome do produto.
 *           example: "Smartphone XPTO 128GB"
 *         description:
 *           type: string
 *           description: Descrição detalhada do produto (opcional).
 *           example: "Smartphone com tela AMOLED, 128GB de armazenamento e câmera de 48MP."
 *         price:
 *           type: number
 *           format: float
 *           description: Preço do produto (maior que zero).
 *           example: 1999.90
 *           minimum: 0.01
 *         category:
 *           type: string
 *           format: objectid
 *           description: ID da categoria à qual o produto pertence.
 *           example: "60d5ecb8d6d2f3a3d4f0e1a1"
 *         stock:
 *           type: integer
 *           description: Quantidade em estoque (opcional, padrão 0, não negativo).
 *           example: 50
 *           minimum: 0
 *         image:
 *           type: string
 *           format: binary
 *           description: Arquivo de imagem do produto (enviar via multipart/form-data).
 *     ProductUpdateInput:
 *       type: object
 *       properties:
 *         name: { type: string, example: "Smartphone XPTO Plus 256GB" }
 *         description: { type: string, example: "Versão atualizada com mais armazenamento." }
 *         price: { type: number, format: float, example: 2499.00, minimum: 0.01 }
 *         category: { type: string, format: objectid, example: "60d5ecb8d6d2f3a3d4f0e1a1" }
 *         stock: { type: integer, example: 30, minimum: 0 }
 *         image:
 *           type: string
 *           format: binary
 *           description: (Opcional) Novo arquivo de imagem do produto.
 *     ProductOutput:
 *       type: object
 *       properties:
 *         _id: { type: string, format: objectid }
 *         name: { type: string }
 *         description: { type: string }
 *         image: { type: string, format: url }
 *         imagePublicId: { type: string, description: "ID público no Cloudinary" }
 *         price: { type: number, format: float }
 *         stock: { type: integer }
 *         category: # Categoria populada
 *            type: object
 *            properties:
 *              _id: { type: string, format: objectid }
 *              name: { type: string }
 *              slug: { type: string }
 *         rating: { type: number, format: float, default: 0 }
 *         numReviews: { type: integer, default: 0 }
 *         createdAt: { type: string, format: date-time }
 *         updatedAt: { type: string, format: date-time }
 *     ProductListOutput: # Schema para a resposta de GET /api/products
 *        type: object
 *        properties:
 *          status: { type: string, example: success }
 *          results: { type: integer, description: "Número de produtos nesta página" }
 *          totalProducts: { type: integer, description: "Total de produtos que casam com o filtro" }
 *          totalPages: { type: integer, description: "Total de páginas disponíveis" }
 *          currentPage: { type: integer, description: "Número da página atual" }
 *          products:
 *             type: array
 *             items:
 *               $ref: '#/components/schemas/ProductOutput'
 *          message: # Opcional
 *              type: string
 *              example: Categoria não encontrada
 *   parameters:
 *     ProductIdParam:
 *       name: id
 *       in: path
 *       required: true
 *       schema:
 *         type: string
 *         format: objectid
 *       description: O ID MongoDB do produto.
 *       example: "60d5f2a3e7b8d9f1c8e4b8a2"
 *     PageQueryParam:
 *        in: query
 *        name: page
 *        schema: { type: integer, default: 1, minimum: 1 }
 *        description: Número da página.
 *     LimitQueryParam:
 *        in: query
 *        name: limit
 *        schema: { type: integer, default: 10, minimum: 1 }
 *        description: Itens por página.
 *     CategoryQueryParam:
 *        in: query
 *        name: category
 *        schema: { type: string }
 *        description: ID ou Slug da Categoria para filtrar.
 *     SearchQueryParam:
 *        in: query
 *        name: q
 *        schema: { type: string }
 *        description: Termo para busca textual.
 *     SortQueryParam:
 *        in: query
 *        name: sort
 *        schema: { type: string, default: '-createdAt' }
 *        description: Critério de ordenação (ex: '-price', 'name').
 */

export default router;
