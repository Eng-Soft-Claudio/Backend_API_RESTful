// src/routes/orderRoutes.js
import express from "express";
import { body, param } from "express-validator";
import { authenticate, isAdmin } from "../middleware/auth.js";
import {
  createOrder,
  getMyOrders,
  getOrderById,
  payOrder,
  getAllOrders, // Controller para Admin listar todos
  updateOrderToShipped, // Controller para Admin marcar como enviado
  updateOrderToDelivered, // Controller para Admin marcar como entregue
} from "../controllers/orderController.js";
import Address from "../models/Address.js"; // Usado na validação de createOrder

const router = express.Router();

// Aplica autenticação a TODAS as rotas de pedido
router.use(authenticate);

// --- Validações Reutilizáveis ---

// Validação para criar pedido
const createOrderValidationRules = [
  body(
    "shippingAddressId",
    "ID do endereço de entrega inválido ou não pertence a você"
  )
    .isMongoId()
    .custom(async (value, { req }) => {
      // Verifica se o endereço existe E pertence ao usuário logado
      const address = await Address.findOne({ _id: value, user: req.user.id });
      if (!address) {
        throw new Error("Endereço de entrega inválido ou não pertence a você.");
      }
      // Não precisa anexar o endereço aqui, o controller buscará novamente dentro da transação
      // req.shippingAddressData = address;
      return true;
    }),
  body("paymentMethod", "Método de pagamento é obrigatório").trim().notEmpty(),
];

// Validação para parâmetro ID do pedido na URL
const orderIdParamValidation = [
  param("id", "ID do pedido inválido na URL").isMongoId(),
];

// Validação para pagar pedido (Mercado Pago V1)
const payOrderValidationRules = [
  // Obrigatórios
  body(
    "payment_method_id",
    "ID do método de pagamento é obrigatório (ex: visa, pix)"
  )
    .trim()
    .notEmpty(),
  body("payer", "Informações do pagador são obrigatórias").isObject(),
  body("payer.email", "Email do pagador é obrigatório")
    .isEmail()
    .normalizeEmail(),

  // Condicionais (geralmente para cartão)
  body("token", "Token de pagamento é obrigatório para este método")
    // Exige token se não for PIX ou dinheiro em conta (adicione outros métodos se necessário)
    .if(
      body("payment_method_id")
        .not()
        .isIn(["pix", "account_money", "bolbradesco"])
    ) // Exemplo: não exige para boleto
    .trim()
    .notEmpty(),
  body("installments", "Número de parcelas é obrigatório (mínimo 1)")
    .if(
      body("payment_method_id")
        .not()
        .isIn(["pix", "account_money", "bolbradesco"])
    )
    .isInt({ min: 1 })
    .withMessage("Parcela deve ser no mínimo 1")
    .toInt(),
  body("issuer_id", "ID do emissor (banco) é inválido")
    .if(
      body("payment_method_id")
        .not()
        .isIn(["pix", "account_money", "bolbradesco"])
    )
    .optional()
    .trim(), // Opcional, mas se enviado, não pode ser vazio

  // Identificação do pagador (pode ser obrigatória dependendo do país/valor/método)
  // Tornando opcional na validação geral, mas a API do MP pode exigir
  body(
    "payer.identification.type",
    "Tipo de identificação do pagador inválido (ex: CPF, CNPJ)"
  )
    .optional()
    .trim()
    .notEmpty(),
  body(
    "payer.identification.number",
    "Número de identificação do pagador inválido"
  )
    .if(body("payer.identification.type").exists({ checkFalsy: true })) // Só valida número se tipo foi enviado
    .trim()
    .notEmpty(),
];

// --- Definição das Rotas ---

/**
 * @swagger
 * tags:
 *   name: Orders
 *   description: Operações relacionadas a pedidos.
 */

// --- Rotas do Usuário Logado ---

/**
 * @swagger
 * /api/orders:
 *   post:
 *     summary: Cria um novo pedido inicial (status pending_payment).
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       description: ID do endereço de entrega cadastrado e método de pagamento inicial escolhido.
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [shippingAddressId, paymentMethod]
 *             properties:
 *               shippingAddressId:
 *                  type: string
 *                  format: objectid
 *                  description: O ID de um endereço VÁLIDO e pertencente ao usuário logado.
 *                  example: '6701a...'
 *               paymentMethod:
 *                  type: string
 *                  description: Descrição textual do método de pagamento escolhido (ex: Cartão Visa, PIX).
 *                  example: 'Cartão de Crédito'
 *     responses:
 *       '201':
 *         description: Pedido criado com sucesso (status pending_payment), estoque decrementado, carrinho limpo.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, example: success }
 *                 data:
 *                   type: object
 *                   properties:
 *                     order: { $ref: '#/components/schemas/OrderOutput' }
 *       '400':
 *         description: Erro de validação (endereço inválido/não pertence ao user, carrinho vazio, estoque insuficiente).
 *         content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' }}} # Ou ErrorValidationResponse
 *       '401':
 *         description: Não autenticado.
 *         content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' }}}
 *       '404':
 *         description: Carrinho não encontrado para o usuário.
 *         content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' }}}
 *       '500':
 *         description: Erro interno do servidor (ex: falha na transação do DB).
 *         content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' }}}
 */
router.post("/", createOrderValidationRules, createOrder); // Rota para criar pedido

/**
 * @swagger
 * /api/orders/my:
 *   get:
 *     summary: Lista todos os pedidos feitos pelo usuário logado.
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200':
 *         description: Lista de pedidos obtida com sucesso (ordenada por data, mais recentes primeiro).
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, example: success }
 *                 results: { type: integer, description: "Número de pedidos retornados", example: 5 }
 *                 data:
 *                   type: object
 *                   properties:
 *                     orders:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/OrderOutput'
 *       '401':
 *          description: Não autenticado.
 *          content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' }}}
 *       '500':
 *          description: Erro interno.
 *          content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' }}}
 */
router.get("/my", getMyOrders); // Rota para listar pedidos do usuário

/**
 * @swagger
 * /api/orders/{id}/pay:
 *   post:
 *     summary: Processa o pagamento de um pedido usando dados do SDK JS do MP.
 *     tags: [Orders]
 *     description: Envia os dados tokenizados (ex: card token) obtidos do frontend para a API do Mercado Pago para tentar realizar o pagamento de um pedido com status 'pending_payment'. Atualiza o status do pedido e retorna estoque em caso de falha imediata.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/OrderIdParam'
 *     requestBody:
 *       required: true
 *       description: Dados do pagamento obtidos do SDK JS V2 (Card Token, etc.).
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/OrderPaymentInput'
 *     responses:
 *       '200':
 *         description: Pagamento processado pelo gateway (verificar status na resposta, pode ser 'approved', 'rejected', 'pending', etc.). Retorna o pedido atualizado.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                  status: { type: string, example: success }
 *                  message: { type: string, example: "Pagamento processado com status inicial: approved"}
 *                  data:
 *                      type: object
 *                      properties:
 *                          order: { $ref: '#/components/schemas/OrderOutput' }
 *       '400':
 *          description: Erro de validação nos dados de pagamento, pedido não está pendente, pedido já pago, ou erro retornado pelo Mercado Pago (ex: cartão inválido).
 *          content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' }}} # Ou ErrorValidationResponse
 *       '401':
 *          description: Não autenticado.
 *          content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' }}}
 *       '404':
 *          description: Pedido não encontrado ou não pertence ao usuário.
 *          content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' }}}
 *       '500':
 *          description: Erro interno do servidor (ex: falha ao salvar pedido após chamada MP).
 *          content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' }}}
 *       '502':
 *          description: Bad Gateway (resposta inválida do Mercado Pago).
 *          content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' }}}
 *       '503':
 *          description: Service Unavailable (configuração do gateway de pagamento indisponível).
 *          content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' }}}
 */
router.post(
  "/:id/pay",
  orderIdParamValidation,
  payOrderValidationRules,
  payOrder
); // Rota para pagar pedido

/**
 * @swagger
 * /api/orders/{id}:
 *   get:
 *     summary: Obtém detalhes de um pedido específico.
 *     tags: [Orders]
 *     description: Usuário logado pode obter detalhes de seus próprios pedidos. Administradores podem obter detalhes de qualquer pedido.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/OrderIdParam'
 *     responses:
 *       '200':
 *         description: Detalhes do pedido (com dados do usuário populados).
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, example: success }
 *                 data:
 *                   type: object
 *                   properties:
 *                     order: { $ref: '#/components/schemas/OrderOutput' }
 *       '400':
 *          description: ID do pedido inválido.
 *          content: { application/json: { schema: { $ref: '#/components/schemas/ErrorValidationResponse' }}}
 *       '401':
 *          description: Não autenticado.
 *          content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' }}}
 *       '404':
 *          description: Pedido não encontrado ou não pertence ao usuário (se não for admin).
 *          content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' }}}
 *       '500':
 *          description: Erro interno.
 *          content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' }}}
 */
router.get("/:id", orderIdParamValidation, getOrderById); // Rota para obter pedido por ID

// --- Rotas Exclusivas de Admin ---

/**
 * @swagger
 * /api/orders:
 *   get:
 *     summary: Lista TODOS os pedidos com paginação (Admin).
 *     tags: [Orders (Admin)]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *         description: Número da página.
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 15 }
 *         description: Quantidade de pedidos por página.
 *       - in: query
 *         name: sort
 *         schema: { type: string, default: '-createdAt' }
 *         description: Campo para ordenação (prefixo '-' para decrescente). Ex: 'totalPrice', '-user.name'.
 *     responses:
 *       '200':
 *         description: Lista de pedidos paginada.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                  status: { type: string, example: success }
 *                  results: { type: integer, description: "Pedidos nesta página" }
 *                  totalOrders: { type: integer, description: "Total de pedidos no DB" }
 *                  totalPages: { type: integer, description: "Total de páginas" }
 *                  currentPage: { type: integer, description: "Página atual" }
 *                  data:
 *                      type: object
 *                      properties:
 *                          orders:
 *                              type: array
 *                              items: { $ref: '#/components/schemas/OrderOutput' }
 *       '401':
 *          description: Não autenticado.
 *          content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' }}}
 *       '403':
 *          description: Acesso proibido (não é admin).
 *          content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' }}}
 *       '500':
 *          description: Erro interno.
 *          content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' }}}
 */
router.get("/", isAdmin, getAllOrders); // Rota para Admin listar TODOS os pedidos

/**
 * @swagger
 * /api/orders/{id}/ship:
 *   put:
 *     summary: Marca um pedido como enviado (Admin).
 *     tags: [Orders (Admin)]
 *     description: Atualiza o status de um pedido para 'shipped'. Só funciona se o status atual for 'processing' ou 'paid'.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/OrderIdParam'
 *     responses:
 *       '200':
 *         description: Pedido marcado como enviado. Retorna o pedido atualizado.
 *         content:
 *           application/json:
 *             schema:
 *                type: object
 *                properties:
 *                  status: { type: string, example: success }
 *                  data:
 *                    type: object
 *                    properties:
 *                      order: { $ref: '#/components/schemas/OrderOutput' }
 *       '400':
 *          description: ID inválido ou pedido não está no status correto para ser marcado como enviado.
 *          content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' }}} # Ou ErrorValidationResponse
 *       '401':
 *          description: Não autenticado.
 *          content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' }}}
 *       '403':
 *          description: Acesso proibido.
 *          content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' }}}
 *       '404':
 *          description: Pedido não encontrado.
 *          content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' }}}
 *       '500':
 *          description: Erro interno.
 *          content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' }}}
 */
router.put("/:id/ship", isAdmin, orderIdParamValidation, updateOrderToShipped);

/**
 * @swagger
 * /api/orders/{id}/deliver:
 *   put:
 *     summary: Marca um pedido como entregue (Admin).
 *     tags: [Orders (Admin)]
 *     description: Atualiza o status de um pedido para 'delivered' e define a data de entrega. Só funciona se o status atual for 'shipped'.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/OrderIdParam'
 *     responses:
 *       '200':
 *         description: Pedido marcado como entregue. Retorna o pedido atualizado.
 *         content:
 *           application/json:
 *             schema:
 *                type: object
 *                properties:
 *                  status: { type: string, example: success }
 *                  data:
 *                    type: object
 *                    properties:
 *                      order: { $ref: '#/components/schemas/OrderOutput' }
 *       '400':
 *          description: ID inválido ou pedido não está no status 'shipped'.
 *          content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' }}} # Ou ErrorValidationResponse
 *       '401':
 *          description: Não autenticado.
 *          content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' }}}
 *       '403':
 *          description: Acesso proibido.
 *          content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' }}}
 *       '404':
 *          description: Pedido não encontrado.
 *          content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' }}}
 *       '500':
 *          description: Erro interno.
 *          content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' }}}
 */
router.put(
  "/:id/deliver",
  isAdmin,
  orderIdParamValidation,
  updateOrderToDelivered
);

export default router;
