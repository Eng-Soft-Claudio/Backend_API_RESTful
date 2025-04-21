//src/routes/orderRoutes.js
import express from 'express';
import { body, param } from 'express-validator';
import { authenticate } from '../middleware/auth.js'; 
import {
    createOrder,
    getMyOrders,
    getOrderById,
    payOrder
} from '../controllers/orderController.js';
import Address from '../models/Address.js'; 

const router = express.Router();

router.use(authenticate);

// --- Regras de Validação ---

// Validação para criar pedido
const createOrderValidationRules = [
    body('shippingAddressId', 'ID do endereço de entrega inválido ou não pertence a você')
        .isMongoId()
        .custom(async (value, { req }) => {
            // Verifica se o endereço existe E pertence ao usuário logado
            const address = await Address.findOne({ _id: value, user: req.user.id });
            if (!address) {
                return Promise.reject('Endereço de entrega inválido ou não pertence a você.');
            }
            req.shippingAddressData = address;
        }),
    body('paymentMethod', 'Método de pagamento é obrigatório').trim().notEmpty()
];

// Validação para parâmetro ID do pedido na URL
const orderIdParamValidation = [
    param('id', 'ID do pedido inválido na URL').isMongoId()
];

// Validação para pagar pedido
const payOrderValidationRules = [
    body('token', 'Token de pagamento é obrigatório').trim().notEmpty(), 
    body('payment_method_id', 'ID do método de pagamento é obrigatório').trim().notEmpty(), 
    body('installments', 'Número de parcelas é obrigatório').isInt({ min: 1 }).toInt(),
    body('payer', 'Informações do pagador são obrigatórias').isObject(),
    body('payer.email', 'Email do pagador é obrigatório').isEmail().normalizeEmail(),
    body('issuer_id', 'ID do emissor (banco) é opcional').optional().trim() 
];


// --- Definição das Rotas ---

/**
 * @swagger
 * tags:
 *   name: Orders
 *   description: Operações relacionadas a pedidos.
 */

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
 *       description: ID do endereço e método de pagamento inicial.
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [shippingAddressId, paymentMethod]
 *             properties:
 *               shippingAddressId: { type: string, format: objectid }
 *               paymentMethod: { type: string, example: 'Cartão de Crédito' } # Ou PIX, Boleto...
 *     responses:
 *       '201':
 *         description: Pedido criado com sucesso (status pending_payment).
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, example: success }
 *                 data:
 *                   type: object
 *                   properties:
 *                     order: { $ref: '#/components/schemas/OrderOutput' } // << REFERENCIA OrderOutput
 *       # ... (outras respostas 4xx, 5xx) ...
 */
router.post(
    '/',
    createOrderValidationRules,
    createOrder
);

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
 *         description: Lista de pedidos obtida com sucesso.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, example: success }
 *                 results: { type: integer }
 *                 data:
 *                   type: object
 *                   properties:
 *                     orders:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/OrderOutput' // << REFERENCIA OrderOutput
 *       # ... (outras respostas 4xx, 5xx) ...
 */
router.get(
    '/my',
    getMyOrders
);

/**
 * @swagger
 * /api/orders/{id}/pay:
 *   post:
 *     summary: Processa o pagamento de um pedido usando dados do SDK JS do MP.
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string, format: objectid }
 *         description: ID do pedido a ser pago.
 *     requestBody:
 *       required: true
 *       description: Dados do pagamento obtidos do SDK JS V2 (Card Token, etc.).
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/OrderPaymentInput' // << REFERENCIA OrderPaymentInput
 *     responses:
 *       '200':
 *         description: Pagamento processado (verificar status na resposta). Retorna o pedido atualizado.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                  status: { type: string, example: success }
 *                  message: { type: string, example: "Pagamento processado com status: approved"}
 *                  data:
 *                      type: object
 *                      properties:
 *                          order: { $ref: '#/components/schemas/OrderOutput' } // << REFERENCIA OrderOutput
 *       # ... (outras respostas 4xx, 5xx) ...
 */
router.post(
    '/:id/pay',
    orderIdParamValidation,
    payOrderValidationRules,
    payOrder
);

/**
 * @swagger
 * /api/orders/{id}:
 *   get:
 *     summary: Obtém detalhes de um pedido específico.
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string, format: objectid }
 *         description: ID do pedido a ser obtido.
 *     responses:
 *       '200':
 *         description: Detalhes do pedido.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, example: success }
 *                 data:
 *                   type: object
 *                   properties:
 *                     order: { $ref: '#/components/schemas/OrderOutput' } // << REFERENCIA OrderOutput
 *       # ... (outras respostas 4xx, 5xx) ...
 */
router.get(
    '/:id',
    orderIdParamValidation,
    getOrderById
);

export default router;