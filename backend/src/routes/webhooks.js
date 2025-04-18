// src/routes/webhooks.js
import express from 'express';
import { createWebhook } from '../controllers/webhooks.js';
import { body } from 'express-validator';
import { authenticate, isAdmin } from '../middleware/auth.js'; 

const router = express.Router();

// --- Validações para Registro de Webhook ---
const registerWebhookValidationRules = [
    body('url', 'URL inválida').isURL(),
    body('eventType', 'Tipo de evento inválido').isIn(['product_created', 'product_updated']) // Sincronizar com controller/schema
];

/**
 * @swagger
 * tags:
 *   name: Webhooks
 *   description: Endpoints para recebimento de eventos de webhooks externos.
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     WebhookInput:
 *       type: object
 *       description: Payload genérico de webhook. A estrutura exata depende do serviço de origem (ex: Stripe, PagSeguro, etc.).
 *       properties:
 *         type:
 *           type: string
 *           description: Tipo do evento recebido (ex: 'payment.succeeded', 'order.updated').
 *           example: 'payment.succeeded'
 *         data:
 *           type: object
 *           description: Objeto contendo os dados específicos do evento.
 *       additionalProperties: true # Permite propriedades não definidas explicitamente
 *     WebhookResponse:
 *       type: object
 *       properties:
 *         received:
 *           type: boolean
 *           description: Confirmação de recebimento.
 *           example: true
 */

/**
 * @swagger
 * /api/webhooks:
 *   post:
 *     summary: Recebe eventos de webhook.
 *     tags: [Webhooks]
 *     description: |
 *       Endpoint genérico para receber notificações de webhooks de serviços externos.
 *       A lógica de processamento (incluindo verificação de assinatura, se aplicável)
 *       é tratada no controller. Alguns serviços (como Stripe) podem exigir o
 *       recebimento do corpo da requisição como 'raw' (não JSON) para validação da assinatura.
 *       Configure o middleware de body-parser apropriado se necessário para essa rota específica.
 *     requestBody:
 *       description: Payload do webhook enviado pelo serviço externo.
 *       required: true
 *       content:
 *         application/json: # Tipo mais comum, mas pode variar
 *           schema:
 *             $ref: '#/components/schemas/WebhookInput'
 *         # text/plain: # Adicionar se precisar receber corpo raw
 *         #  schema:
 *         #    type: string
 *         #    description: Corpo raw da requisição (ex: para verificação de assinatura)
 *     responses:
 *       '200':
 *         description: Webhook recebido e processamento iniciado com sucesso (ou apenas confirmação de recebimento).
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/WebhookResponse'
 *       '400':
 *         description: Payload inválido, assinatura inválida (se aplicável) ou erro no tipo de evento.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse' # Ou ErrorValidationResponse
 *       '500':
 *         description: Erro interno ao processar o webhook.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *     # Nota: Webhooks geralmente não usam autenticação JWT Bearer padrão.
 *     # A segurança é feita por verificação de assinatura ou segredos específicos.
 *     security: [] # Marca como público em termos de JWT, segurança é interna.
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     # ... (WebhookInput, WebhookResponse existentes)
 *     WebhookRegisterInput: # NOVO Schema para registro
 *       type: object
 *       required:
 *         - url
 *         - eventType
 *       properties:
 *         url:
 *           type: string
 *           format: url
 *           description: A URL do endpoint externo que receberá a notificação.
 *           example: https://meu-servico.com/webhook-listener
 *         eventType:
 *           type: string
 *           enum: [product_created, product_updated]
 *           description: O tipo de evento que disparará este webhook.
 *           example: product_updated
 *     WebhookRegisterOutput: # NOVO Schema para resposta de registro
 *       type: object
 *       properties:
 *         status:
 *           type: string
 *           example: success
 *         data:
 *           type: object
 *           properties:
 *             webhook:
 *                type: object
 *                properties:
 *                  _id:
 *                      type: string
 *                      format: objectid
 *                  url:
 *                      type: string
 *                      format: url
 *                  eventType:
 *                      type: string
 *                      enum: [product_created, product_updated]
 *                  createdAt:
 *                      type: string
 *                      format: date-time
 *                  updatedAt:
 *                      type: string
 *                      format: date-time
 */

// --- ROTA PARA REGISTRAR WEBHOOKS (ADMIN) ---
/**
 * @swagger
 * /api/webhooks:
 *   post:
 *     summary: Registra uma nova URL para receber notificações de webhook (Admin).
 *     tags: [Webhooks Admin] # Tag diferente
 *     description: Permite que um administrador registre um endpoint externo para ser notificado quando certos eventos ocorrerem no sistema (ex: produto criado).
 *     security:
 *       - bearerAuth: [] # Requer autenticação de Admin
 *     requestBody:
 *       description: Dados do webhook a ser registrado.
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/WebhookRegisterInput' # Usa o novo schema
 *     responses:
 *       '201':
 *         description: Webhook registrado com sucesso.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/WebhookRegisterOutput' # Usa o novo schema de output
 *       '400':
 *         description: Dados inválidos (URL inválida, tipo de evento não permitido).
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorValidationResponse'
 *       '401': { description: Não autorizado, content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
 *       '403': { description: Acesso proibido (não é admin), content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
 *       '409': { description: Conflito (URL já registrada), content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
 *       '500': { description: Erro interno, content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
 */

router.post(
    '/',
    authenticate,
    isAdmin,
    registerWebhookValidationRules,
    registerWebhook
);

// --- ROTA PARA RECEBER WEBHOOKS EXTERNOS ---
/**
 * @swagger
 * tags:
 *   name: Webhook Handler
 *   description: Endpoint para recebimento de eventos de webhooks externos.
 */

/**
 * @swagger
 * /api/webhooks/handler: # << NOVA ROTA
 *   post:
 *     summary: Recebe eventos de webhook de serviços externos.
 *     tags: [Webhook Handler] # Nova Tag
 *     description: |
 *       Endpoint público (ou protegido por assinatura) para receber notificações de webhooks (ex: Stripe, PagSeguro).
 *       **Importante:** A segurança deste endpoint geralmente NÃO usa JWT Bearer, mas sim verificação de assinatura específica do serviço de origem dentro do controller `handleWebhook`.
 *       Pode ser necessário configurar um middleware de body-parser para ler o corpo RAW se a verificação de assinatura for necessária.
 *     requestBody:
 *       description: Payload do webhook enviado pelo serviço externo. O formato exato varia.
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/WebhookInput' # Schema genérico
 *         # Exemplo se precisar do corpo raw:
 *         # application/octet-stream:
 *         #   schema:
 *         #    type: string
 *         #    format: binary
 *     responses:
 *       '200':
 *         description: Webhook recebido com sucesso (confirmação para o serviço externo).
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/WebhookResponse'
 *       '400':
 *         description: Payload inválido ou falha na verificação da assinatura (se aplicável).
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       '500':
 *         description: Erro interno ao processar o webhook.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *     security: [] # Marca como público em termos de JWT
 */


export default router;