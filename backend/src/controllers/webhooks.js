/**
 * @fileoverview Controller para lidar com Webhooks, tanto registro interno quanto recebimento externo.
 */

import crypto from 'crypto'; 
import Order from '../models/Order.js';         
import AppError from '../utils/appError.js';    
import mpClient, { Payment, isMercadoPagoConfigured } from '../config/mercadopago.js'; 



/**
 * @description Processa notificações de webhook recebidas do Mercado Pago.
 * @route POST /api/webhooks/handler
 * @access Público (Segurança via verificação de assinatura)
 */
export const handleWebhook = async (req, res, next) => {
    console.log("---- INÍCIO: Processamento de Webhook Mercado Pago ----");
    let notificationPayload; 

    try {
        // --- 1. VERIFICAÇÃO DE ASSINATURA (Implementação Essencial para Produção) ---
        const signatureHeader = req.headers['x-signature']; 
        const webhookSecret = process.env.MP_WEBHOOK_SECRET;
        // O corpo RAW é necessário. Use middleware express.raw() na rota.
        const rawBody = req.body;

        // Valida se temos o necessário para verificar
        if (signatureHeader && webhookSecret) {
            if (!rawBody || !Buffer.isBuffer(rawBody) || rawBody.length === 0) {
                 console.error("Webhook MP: Corpo raw ausente/inválido para verificação de assinatura.");
                 return res.status(400).send('Invalid request body for signature check.');
            }

            console.log("Webhook MP: Tentando verificar assinatura...");
            const sigParts = signatureHeader.split(',').map(part => part.trim().split('='));
            const sigData = Object.fromEntries(sigParts);
            const receivedTimestamp = sigData.ts;
            const receivedSignature = sigData.v1; 

            if (!receivedTimestamp || !receivedSignature) {
                throw new Error('Formato inválido do header X-Signature (esperado: ts=...,v1=...).');
            }

            // Parse o corpo RAW para obter o ID do pagamento 
            try {
                notificationPayload = JSON.parse(rawBody.toString());
            } catch (parseError) {
                 throw new Error('Corpo da requisição não é JSON válido.');
            }
            const paymentId = notificationPayload?.data?.id;
            if (!paymentId) {
                throw new Error('Dados inválidos na notificação (sem data.id).');
            }

            // Construir a string base (CONFIRMAR FORMATO NA DOCUMENTAÇÃO MP!)
            // Formato provável: id_do_pagamento.timestamp_recebido.corpo_raw_request
            const baseString = `${paymentId}.${receivedTimestamp}.${rawBody.toString()}`;

            // Calcular assinatura esperada
            const hmac = crypto.createHmac('sha256', webhookSecret);
            const calculatedSignature = hmac.update(baseString).digest('hex');

            // Comparar assinaturas de forma segura
            const signaturesMatch = crypto.timingSafeEqual(
                Buffer.from(receivedSignature, 'hex'),
                Buffer.from(calculatedSignature, 'hex')
            );

            if (!signaturesMatch) {
                console.error("Webhook MP: Assinatura inválida!");
                return res.status(400).send('Invalid signature.'); 
            }

            console.log("Webhook MP: Assinatura verificada com sucesso.");

        } else {
             console.warn("Webhook MP: Assinatura ou Secret ausente. Processando sem verificação (INSEGURO!).");
             try {
                 if (Buffer.isBuffer(req.body)) { 
                     notificationPayload = JSON.parse(req.body.toString());
                 } else if (typeof req.body === 'object' && req.body !== null) { 
                      notificationPayload = req.body;
                 } else {
                     throw new Error('Formato de corpo inesperado.');
                 }
             } catch (e) {
                  console.error("Webhook MP: Erro ao parsear corpo (sem verificação):", e);
                  return res.status(400).send('Invalid request body.');
             }
        }
        // --- FIM DA VERIFICAÇÃO ---


        // --- 2. Processamento do Evento (Usa notificationPayload) ---
        if (!notificationPayload) {
            console.error("Webhook MP: Falha crítica ao obter payload da notificação.");
            return res.status(500).send('Internal processing error.');
        }

        const eventType = notificationPayload?.type;
        const paymentId = notificationPayload?.data?.id;

        // Ignora se não for um evento de pagamento ou não tiver ID
        if (eventType !== 'payment' || !paymentId) {
            console.log(`Webhook MP: Evento ignorado (Tipo: ${eventType}, ID Dados: ${paymentId || 'N/A'}).`);
            return res.status(200).json({ received: true, message: 'Event type ignored or data ID missing.' });
        }

        console.log(`Webhook MP: Processando evento para Pagamento ID: ${paymentId}`);

        // 3. Buscar Detalhes Atualizados do Pagamento na API do MP
        if (!isMercadoPagoConfigured()) {
            throw new AppError('SDK MP não configurado para verificar pagamento.', 500);
        }
        const payment = new Payment(mpClient);
        const paymentDetails = await payment.get({ id: paymentId });
        console.log(`Webhook MP: Detalhes do pagamento ${paymentId} obtidos da API MP.`);

        const finalPaymentStatus = paymentDetails?.status;
        const externalReference = paymentDetails?.external_reference; 

        if (!finalPaymentStatus || !externalReference) {
             console.error("Webhook MP: Resposta da API MP inválida ou sem status/external_reference.", paymentDetails);
             throw new AppError('Resposta inválida ao buscar detalhes do pagamento no MP.', 502);
        }

        // 4. Encontrar Pedido Correspondente
        const order = await Order.findById(externalReference);
        if (!order) {
            console.warn(`Webhook MP: Pedido não encontrado para external_reference (orderId): ${externalReference}.`);
            return res.status(200).json({ received: true, message: 'Order not found.' });
        }

        console.log(`Webhook MP: Pedido ${order._id} encontrado. Status atual: ${order.orderStatus}. Status API MP: ${finalPaymentStatus}`);

        // 5. Atualizar Status do Pedido (Apenas se Pendente e Status MP Relevante)
        if (order.orderStatus === 'pending_payment') {
            let newStatus = null;
            let shouldUpdatePaymentResult = false;

            // Mapeamento de Status MP -> Status Pedido
            if (finalPaymentStatus === 'approved') {
                newStatus = 'processing';
                order.paidAt = new Date();
                shouldUpdatePaymentResult = true;
            } else if (['rejected', 'cancelled', 'refunded', 'charged_back', 'failed'].includes(finalPaymentStatus)) {
                newStatus = 'failed';
                shouldUpdatePaymentResult = true;
                // TODO: Considerar lógica para retornar estoque aqui (pode ser complexo)
            }

            // Atualiza o pedido se necessário
            if (newStatus) {
                order.orderStatus = newStatus;
                if (shouldUpdatePaymentResult) {
                    order.paymentResult = {
                        id: paymentId.toString(),
                        status: finalPaymentStatus,
                        update_time: paymentDetails?.date_last_updated || new Date().toISOString(),
                        email_address: paymentDetails?.payer?.email || null
                    };
                }
                await order.save(); // Salva as alterações
                console.log(`Webhook MP: Status do Pedido ${order._id} atualizado para ${newStatus}.`);
                // TODO: Disparar eventos internos (email, etc.)
            } else {
                console.log(`Webhook MP: Status MP (${finalPaymentStatus}) não resultou em atualização para pedido ${order._id}.`);
            }
        } else {
             console.log(`Webhook MP: Pedido ${order._id} não está mais 'pending_payment' (${order.orderStatus}), ignorando webhook.`);
        }

        // 6. Responder 200 OK ao Mercado Pago OBRIGATORIAMENTE
        console.log(`Webhook MP: Processamento do evento para Pedido ${order._id} concluído.`);
        res.status(200).json({ received: true });

    } catch(err) {
         // Captura erros da verificação de assinatura, busca na API MP ou busca/salvamento local
         console.error(`Webhook MP: Erro GERAL ao processar notificação (Pagamento ID: ${paymentId || 'N/A'}):`, err);
         // Passa para o handler global
         next(err instanceof AppError ? err : new AppError(`Erro interno ao processar notificação MP: ${err.message}`, 500));
    }
    console.log("---- FIM: Processamento de Webhook Mercado Pago ----");
};