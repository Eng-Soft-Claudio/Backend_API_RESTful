//src/routes/cartRoutes.js
import express from "express";
import { body, param } from "express-validator";
import { authenticate } from "../middleware/auth.js";
import {
  getMyCart,
  addItemToCart,
  updateCartItemQuantity,
  removeCartItem,
  clearCart,
} from "../controllers/cartController.js";

const router = express.Router();

// Aplica autenticação a todas as rotas do carrinho
router.use(authenticate);

// --- Regras de Validação ---

// Validação para adicionar item
const addItemValidationRules = [
  body("productId", "ID do produto inválido").isMongoId(),
  body("quantity", "Quantidade inválida").isInt({ gt: 0 }).toInt(),
];

// Validação para atualizar quantidade (ID do produto vem da URL)
const updateQuantityValidationRules = [
  body("quantity", "Quantidade inválida").isInt({ gt: 0 }).toInt(),
];

// Validação para parâmetro ID do produto na URL
const productIdParamValidation = [
  param("productId", "ID do produto inválido na URL").isMongoId(),
];

// --- Definição das Rotas ---

/**
 * @swagger
 * tags:
 *   name: Cart
 *   description: Operações do carrinho de compras do usuário logado.
 */

/**
 * @swagger
 * /api/cart:
 *   get:
 *     summary: Obtém o carrinho de compras do usuário logado.
 *     tags: [Cart]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200':
 *         description: Carrinho obtido com sucesso (pode estar vazio).
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, example: success }
 *                 data:
 *                   type: object
 *                   properties:
 *                     cart:
 *                       type: object # Definir schema CartOutput depois
 *                       properties:
 *                         _id: { type: string, format: objectid, nullable: true }
 *                         user: { type: string, format: objectid }
 *                         items:
 *                           type: array
 *                           items:
 *                             type: object # Definir schema CartItemOutput depois
 *                             properties:
 *                               product: { $ref: '#/components/schemas/ProductOutput' } # Produto populado
 *                               quantity: { type: integer, example: 2 }
 *                               subtotal: { type: number, format: float, example: 3199.98 } # Virtual
 *                         createdAt: { type: string, format: date-time, nullable: true }
 *                         updatedAt: { type: string, format: date-time, nullable: true }
 *                         # total: { type: number, format: float, example: 3299.97 } # Se incluir total
 *       '401':
 *         description: Não autorizado.
 *         content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } }
 *       '500':
 *         description: Erro interno.
 *         content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } }
 */
router.get("/", getMyCart);

/**
 * @swagger
 * /api/cart/items:
 *   post:
 *     summary: Adiciona um item (ou incrementa quantidade) ao carrinho.
 *     tags: [Cart]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       description: ID do produto e quantidade a adicionar.
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - productId
 *               - quantity
 *             properties:
 *               productId:
 *                 type: string
 *                 format: objectid
 *                 description: ID do produto a ser adicionado.
 *                 example: '6801a...'
 *               quantity:
 *                 type: integer
 *                 minimum: 1
 *                 description: Quantidade a ser adicionada.
 *                 example: 1
 *     responses:
 *       '200':
 *         description: Item adicionado/atualizado com sucesso. Retorna o carrinho atualizado.
 *         content:
 *           application/json:
 *             schema: # Mesmo schema da resposta do GET /cart
 *               type: object
 *               properties:
 *                 status: { type: string, example: success }
 *                 message: { type: string, example: 'Item adicionado/atualizado no carrinho!' }
 *                 data:
 *                   type: object
 *                   properties:
 *                     cart: { type: object } # Referenciar CartOutput depois
 *       '400':
 *         description: Erro de validação (ID inválido, quantidade inválida, estoque insuficiente - se implementado).
 *         content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } # Ou ErrorValidationResponse
 *       '401':
 *         description: Não autorizado.
 *         content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } }
 *       '404':
 *         description: Produto não encontrado.
 *         content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } }
 *       '500':
 *         description: Erro interno.
 *         content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } }
 */
router.post("/items", addItemValidationRules, addItemToCart);

/**
 * @swagger
 * /api/cart/items/{productId}:
 *   put:
 *     summary: Atualiza a quantidade de um item específico no carrinho.
 *     tags: [Cart]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: productId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *           format: objectid
 *         description: ID do produto cuja quantidade será atualizada.
 *     requestBody:
 *       required: true
 *       description: Nova quantidade desejada para o item.
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - quantity
 *             properties:
 *               quantity:
 *                 type: integer
 *                 minimum: 1
 *                 description: A nova quantidade total para este item.
 *                 example: 3
 *     responses:
 *       '200':
 *         description: Quantidade atualizada. Retorna o carrinho atualizado.
 *         content:
 *           application/json:
 *             schema: # Mesmo schema da resposta do GET /cart
 *                type: object
 *                properties:
 *                  status: { type: string, example: success }
 *                  message: { type: string, example: 'Quantidade do item atualizada.' }
 *                  data:
 *                    type: object
 *                    properties:
 *                      cart: { type: object } # Referenciar CartOutput depois
 *       '400':
 *         description: Erro de validação (ID inválido, quantidade < 1).
 *         content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } # Ou ErrorValidationResponse
 *       '401':
 *         description: Não autorizado.
 *         content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } }
 *       '404':
 *         description: Carrinho, produto ou item não encontrado.
 *         content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } }
 *       '500':
 *         description: Erro interno.
 *         content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } }
 */
router.put(
  "/items/:productId",
  productIdParamValidation,
  updateQuantityValidationRules,
  updateCartItemQuantity
);

/**
 * @swagger
 * /api/cart/items/{productId}:
 *   delete:
 *     summary: Remove um item específico do carrinho.
 *     tags: [Cart]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: productId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *           format: objectid
 *         description: ID do produto a ser removido do carrinho.
 *     responses:
 *       '200':
 *         description: Item removido. Retorna o carrinho atualizado.
 *         content:
 *           application/json:
 *             schema: # Mesmo schema da resposta do GET /cart
 *               type: object
 *               properties:
 *                  status: { type: string, example: success }
 *                  message: { type: string, example: 'Item removido do carrinho.' }
 *                  data:
 *                    type: object
 *                    properties:
 *                      cart: { type: object } # Referenciar CartOutput depois
 *       '400':
 *         description: ID inválido.
 *         content: { application/json: { schema: { $ref: '#/components/schemas/ErrorValidationResponse' } } }
 *       '401':
 *         description: Não autorizado.
 *         content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } }
 *       '404':
 *         description: Carrinho ou item não encontrado.
 *         content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } }
 *       '500':
 *         description: Erro interno.
 *         content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } }
 */
router.delete("/items/:productId", productIdParamValidation, removeCartItem);

/**
 * @swagger
 * /api/cart:
 *   delete:
 *     summary: Limpa o carrinho (remove todos os itens).
 *     tags: [Cart]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200':
 *         description: Carrinho limpo com sucesso. Retorna o carrinho vazio.
 *         content:
 *           application/json:
 *             schema: # Mesmo schema da resposta do GET /cart (mas items será vazio)
 *               type: object
 *               properties:
 *                 status: { type: string, example: success }
 *                 message: { type: string, example: 'Carrinho limpo com sucesso.' }
 *                 data:
 *                   type: object
 *                   properties:
 *                     cart: { type: object } # Referenciar CartOutput depois
 *       '401':
 *         description: Não autorizado.
 *         content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } }
 *       '500':
 *         description: Erro interno.
 *         content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } }
 */
router.delete("/", clearCart);

export default router;
