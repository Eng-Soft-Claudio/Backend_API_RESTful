// src/routes/webhooks.js
import express from 'express';
import { createWebhook } from '../controllers/webhooks.js'; // Ou o nome correto da função que recebe o webhook

const router = express.Router();

router.post('/', createWebhook);

export default router;