//src/routes/orderRoutes.js
import express from 'express';
import { body, param } from 'express-validator';
import { authenticate } from '../middleware/auth.js'; // Autenticação sempre necessária
// Importar isAdmin se/quando criarmos rotas de admin para pedidos
// import { isAdmin } from '../middleware/auth.js';
import {
    createOrder,
    getMyOrders,
    getOrderById,
    createOrderPayment
    // Importar outras funções do controller quando forem criadas
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
 *     summary: Cria um novo pedido a partir do carrinho do usuário logado.
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       description: ID do endereço de entrega e método de pagamento. O carrinho atual do usuário será usado para os itens.
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - shippingAddressId
 *               - paymentMethod
 *             properties:
 *               shippingAddressId:
 *                 type: string
 *                 format: objectid
 *                 description: ID de um endereço válido pertencente ao usuário.
 *                 example: '6701a...'
 *               paymentMethod:
 *                 type: string
 *                 description: Método de pagamento escolhido (ex: 'Cartão de Crédito', 'PIX').
 *                 example: 'PIX'
 *     responses:
 *       '201':
 *         description: Pedido criado com sucesso. Retorna os detalhes do pedido.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, example: success }
 *                 data:
 *                   type: object
 *                   properties:
 *                     order: { $ref: '#/components/schemas/OrderOutput' } # Definir OrderOutput depois
 *       '400':
 *         description: Erro de validação (endereço inválido, carrinho vazio, estoque insuficiente).
 *         content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } # Ou ErrorValidationResponse
 *       '401':
 *         description: Não autorizado.
 *         content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } }
 *       '500':
 *         description: Erro interno (ex: falha na transação).
 *         content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } }
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
 *                 results: { type: integer, example: 3 }
 *                 data:
 *                   type: object
 *                   properties:
 *                     orders:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/OrderOutput' # Definir OrderOutput depois
 *       '401':
 *         description: Não autorizado.
 *         content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } }
 *       '500':
 *         description: Erro interno.
 *         content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } }
 */
router.get(
    '/my', 
    getMyOrders
);

/**
 * @swagger
 * /api/orders/{id}/create-payment:
 *   post:
 *     summary: Inicia um pagamento PIX para um pedido existente.
 *     tags: [Orders]
 *     description: Cria uma solicitação de pagamento PIX junto ao Mercado Pago para um pedido que está com status 'pending_payment'. Retorna os dados necessários para exibir o QR Code e o código Copia e Cola.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *           format: objectid
 *         description: ID do pedido para o qual iniciar o pagamento.
 *     responses:
 *       '200':
 *         description: Dados PIX gerados com sucesso.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/OrderPaymentResponse' # Definir este schema
 *       '400':
 *         description: Erro (Pedido já pago, status inválido, erro ao gerar PIX no MP).
 *         content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } }
 *       '401':
 *         description: Não autorizado.
 *         content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } }
 *       '404':
 *         description: Pedido não encontrado ou não pertence ao usuário.
 *         content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } }
 *       '500':
 *         description: Erro interno do servidor.
 *         content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } }
 *       '502':
 *         description: Erro na comunicação com o Mercado Pago.
 *         content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } }
 */
router.post(
    '/:id/create-payment',
    orderIdParamValidation, 
    createOrderPayment   
);

/**
 * @swagger
 * /api/orders/{id}:
 *   get:
 *     summary: Obtém detalhes de um pedido específico (próprio ou qualquer um se for admin).
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *           format: objectid
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
 *                     order: { $ref: '#/components/schemas/OrderOutput' } # Definir OrderOutput depois
 *       '400':
 *         description: ID inválido.
 *         content: { application/json: { schema: { $ref: '#/components/schemas/ErrorValidationResponse' } } }
 *       '401':
 *         description: Não autorizado.
 *         content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } }
 *       '404':
 *         description: Pedido não encontrado (ou não pertence ao usuário, se não for admin).
 *         content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } }
 *       '500':
 *         description: Erro interno.
 *         content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } }
 */
router.get(
    '/:id',
    orderIdParamValidation, 
    getOrderById
);

// --- Rotas Futuras ---

export default router;