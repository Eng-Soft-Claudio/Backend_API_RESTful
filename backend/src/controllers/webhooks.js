//src/controllers.webhooks.js
import Webhook from '../models/Webhook.js';
import axios from 'axios'; 
import AppError from '../utils/appError.js'; 

// Registrar webhook
export const registerWebhook = async (req, res, next) => { 
  try {
    const { url, eventType } = req.body; 

    if (!url || !eventType) {
        return next(new AppError('URL e Tipo de Evento são obrigatórios.', 400));
    }
    const allowedEvents = ['product_created', 'product_updated']; 
    if (!allowedEvents.includes(eventType)) {
         return next(new AppError(`Tipo de evento inválido. Permitidos: ${allowedEvents.join(', ')}.`, 400));
    }

    const newWebhook = await Webhook.create({ url, eventType });
    res.status(201).json({
        status: 'success',
        data: {
            webhook: newWebhook
        }
    });
  } catch (err) {
    if (err.code === 11000) {
        return next(new AppError(`Webhook com a URL '${req.body.url}' já existe.`, 409)); 
    }
    next(err);
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

// Receber webhooks
export const handleWebhook = (req, res, next) => {
  console.log("Webhook Recebido!"); 
  let event;
  if (!event) {
    console.log("Nenhuma verificação de assinatura realizada, usando req.body como evento.");
    event = req.body;
  }
  if (!event || !event.type) {
    console.error("⚠️ Payload do Webhook inválido ou sem tipo de evento.");
    console.log(req.body);
    return res.status(400).send('Webhook Error: Payload inválido.');
  }
  console.log("Tipo de Evento:", event.type);
  switch (event.type) {
    case 'payment_intent.succeeded':
        const paymentIntent = event.data.object;
        console.log(`Pagamento bem-sucedido para PaymentIntent: ${paymentIntent.id}`);
        break;
    case 'charge.failed': 
        const charge = event.data.object;
        console.log(`Cobrança falhou para Charge: ${charge.id}. Motivo: ${charge.failure_message}`);
        break;
    default:
        console.warn(`Webhook tipo de evento não tratado recebido: ${event.type}`);
}

res.status(200).json({ received: true });
};
