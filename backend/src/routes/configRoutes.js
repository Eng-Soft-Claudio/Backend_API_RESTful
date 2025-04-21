// src/routes/configRoutes.js
import express from 'express';
import { getMercadoPagoPublicKey } from '../controllers/configController.js';

const router = express.Router();

// Rota pública para obter a chave pública do MP
router.get('/mp-public-key', getMercadoPagoPublicKey);

export default router;