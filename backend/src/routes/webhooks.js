// src/routes/webhooks.js
import express from 'express';
import { createWebhook } from '../controllers/webhooks.js'; // Ou o nome correto da função que recebe o webhook

const router = express.Router();

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

router.post('/', createWebhook);

export default router;