// src/routes/configRoutes.js
import express from 'express';
import { getMercadoPagoPublicKey } from '../controllers/configController.js';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Configuration
 *   description: Endpoints para obter configurações públicas da API.
 */

/**
 * @swagger
 * /api/config/mp-public-key:
 *   get:
 *     summary: Obtém a chave pública do Mercado Pago.
 *     tags: [Configuration]
 *     security: [] # Endpoint público
 *     responses:
 *       '200':
 *         description: Chave pública obtida com sucesso.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/MpPublicKeyOutput' # Schema centralizado
 *       '500':
 *         description: Erro interno (chave não configurada no servidor).
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/mp-public-key', getMercadoPagoPublicKey);

export default router;