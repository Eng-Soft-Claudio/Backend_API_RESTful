import Webhook from '../models/Webhook.js';
import axios from 'axios'; 

// Registrar webhook
export const createWebhook = async (req, res) => {
  try {
    const { url, eventType } = req.body;
    const webhook = await Webhook.create({ url, eventType });
    res.status(201).json(webhook);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// Disparar webhooks
export const triggerWebhook = async (eventType, data) => {
  const webhooks = await Webhook.find({ eventType });
  webhooks.forEach(async (webhook) => {
    try {
      await axios.post(webhook.url, data);
    } catch (err) {
      console.error(`Erro no webhook ${webhook.url}:`, err.message);
    }
  });
};