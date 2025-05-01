// src/routes/webhooks.js
import express from "express";
import { handleWebhook } from "../controllers/webhooksController.js";

const router = express.Router();

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
router.post(
  "/handler",
  // Middleware raw body (se necessário para assinatura) ou parsing manual
  express.raw({ type: "application/json", limit: "5mb" }),
  handleWebhook
);

export default router;
