// src/routes/configRoutes.js
import express from "express";
import { getMercadoPagoPublicKey } from "../controllers/configController.js";

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Config
 *   description: Endpoints para obter configurações públicas da API (ex: chaves de API de frontend).
 */

/**
 * @swagger
 * /api/config/mp-public-key:
 *   get:
 *     summary: Obtém a chave pública do Mercado Pago.
 *     tags: [Config]
 *     description: Retorna a chave pública do Mercado Pago necessária para inicializar o SDK JS V2 no frontend. Esta chave é segura para ser exposta no lado do cliente.
 *     security: [] # Rota pública
 *     responses:
 *       '200':
 *         description: Chave pública obtida com sucesso.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/MpPublicKeyOutput' # Referencia o schema definido em app.js
 *       '503':
 *         description: Serviço indisponível (chave pública não configurada no backend).
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       '500':
 *         description: Erro interno inesperado no servidor.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get("/mp-public-key", getMercadoPagoPublicKey);

export default router;
