/**
 * @fileoverview Controller para lidar com Webhooks do Mercado Pago.
 */

import crypto from 'crypto'; // Módulo nativo para criptografia (HMAC)
import Order from '../models/Order.js'; // Modelo para buscar/atualizar pedidos
import AppError from '../utils/appError.js'; // Para erros operacionais
import mpClient, { Payment, isMercadoPagoConfigured } from '../config/mercadopago.js'; // SDK e client configurado do MP

/**
 * Verifica a assinatura de um webhook do Mercado Pago conforme a documentação oficial.
 * Calcula o HMAC-SHA256 sobre um template composto por dados da query string e headers.
 * @param {import('express').Request} req O objeto da requisição Express.
 * @param {string | undefined} webhookSecret O segredo configurado no painel do MP e no .env.
 * @returns {{isValid: boolean, message: string}} Objeto indicando se a assinatura é válida e uma mensagem.
 */
const verifyMercadoPagoSignature = (req, webhookSecret) => {
    // 1. Extrair Headers necessários para validação
    const signatureHeader = req.headers['x-signature'];
    const requestId = req.headers['x-request-id']; // Opcional, mas usado no template se presente

    // 2. Validações iniciais
    if (!signatureHeader) {
        return { isValid: false, message: "Header 'x-signature' ausente." };
    }
    if (!webhookSecret) {
        // Logar erro interno, mas retornar mensagem genérica para o MP
        console.error("CRÍTICO: MP_WEBHOOK_SECRET não configurado no ambiente.");
        return { isValid: false, message: "Configuração interna incompleta." };
    }

    try {
        // 3. Parsear Header X-Signature para obter ts e v1
        const sigParts = signatureHeader.split(',').map(part => part.trim().split('='));
        const sigData = Object.fromEntries(sigParts);
        const timestamp = sigData.ts;         // ts extraído do header
        const receivedSignature = sigData.v1; // v1 (HMAC) extraído do header

        if (!timestamp || !receivedSignature) {
            throw new Error('Formato inválido do header X-Signature (ts ou v1 ausente).');
        }

        // 4. Extrair data.id da QUERY STRING da URL da notificação
        const dataId = req.query['data.id']; // Vem da URL: ?data.id=...&type=payment
        if (!dataId) {
             throw new Error("Parâmetro de consulta 'data.id' ausente na URL do webhook.");
        }

        // 5. Construir a String Base (Template Oficial Documentado)
        // Formato: id:[data.id_url];request-id:[x-request-id_header];ts:[ts_header];
        const templateParts = [];
        templateParts.push(`id:${dataId}`);
        if (requestId) { // Inclui request-id apenas se ele foi enviado no header
             templateParts.push(`request-id:${requestId}`);
        }
        templateParts.push(`ts:${timestamp}`);
        const template = templateParts.join(';'); // Junta com ponto e vírgula

        console.log("Webhook Verify MP - Segredo Usado (parcial):", webhookSecret.substring(0, 5) + "..."); // Apenas para debug leve
        console.log("Webhook Verify MP - Base String Usada:", template);

        // 6. Calcular Assinatura Esperada (HMAC-SHA256 sobre o TEMPLATE)
        const hmac = crypto.createHmac('sha256', webhookSecret);
        const calculatedSignature = hmac.update(template).digest('hex');
        console.log("Webhook Verify MP - Assinatura Calculada:", calculatedSignature);
        console.log("Webhook Verify MP - Assinatura Recebida :", receivedSignature);

        // 7. Comparar Assinaturas de Forma Segura
        const receivedSigBuffer = Buffer.from(receivedSignature, 'hex');
        const calculatedSigBuffer = Buffer.from(calculatedSignature, 'hex');

        // Verifica o tamanho antes da comparação segura
        if (receivedSigBuffer.length !== calculatedSigBuffer.length) {
             console.error("Webhook MP: Discrepância no tamanho das assinaturas.");
             return { isValid: false, message: "Assinatura inválida (tamanho incorreto)." };
        }

        // Comparação segura contra ataques de temporização
        if (!crypto.timingSafeEqual(receivedSigBuffer, calculatedSigBuffer)) {
            console.error("Webhook MP: Falha na comparação timingSafeEqual das assinaturas.");
            return { isValid: false, message: "Assinatura inválida." };
        }

        // Se chegou aqui, a assinatura é válida!
        return { isValid: true, message: "Assinatura verificada com sucesso." };

    } catch (error) {
        // Captura erros de parsing ou outros erros inesperados durante a verificação
        console.error("Webhook MP: Erro CRÍTICO durante a verificação da assinatura:", error);
        return { isValid: false, message: `Erro ao processar assinatura: ${error.message}` };
    }
};


/**
 * @description Processa notificações de webhook recebidas do Mercado Pago.
 *              Verifica a assinatura e atualiza o status do pedido correspondente.
 * @route POST /api/webhooks/handler
 * @access Público (Segurança via verificação de assinatura)
 */
export const handleWebhook = async (req, res, next) => {
    console.log("---- INÍCIO: Processamento de Webhook Mercado Pago ----");
    let notificationPayload;
    let processingError = null;
    let paymentId = req.query['data.id'] || req.body?.data?.id; // Tenta pegar ID para log de erro

    try {
        // --- 1. VERIFICAÇÃO DE ASSINATURA ---
        const webhookSecret = process.env.MP_WEBHOOK_SECRET;
        if (!webhookSecret) {
             console.warn("Webhook MP: MP_WEBHOOK_SECRET não definido. Processando sem verificação (INSEGURO!).");
             // Parseia o corpo, assumindo que pode ser JSON ou RAW
             if (Buffer.isBuffer(req.body)) {
                notificationPayload = JSON.parse(req.body.toString());
             } else if (typeof req.body === 'object' && req.body !== null) {
                 notificationPayload = req.body;
             } else {
                 throw new Error('Formato de corpo inesperado ao processar sem segredo.');
             }
        } else {
            // Realiza a verificação (req.body DEVE ser um Buffer aqui devido ao express.raw)
             if (!Buffer.isBuffer(req.body)) {
                 console.error("Webhook MP: Verificação de assinatura esperava Buffer, mas recebeu:", typeof req.body);
                 return res.status(400).send("Webhook Error: Invalid body type for signature check. Ensure 'express.raw' middleware is used correctly.");
             }
             const verificationResult = verifyMercadoPagoSignature(req, req.body, webhookSecret);

             if (!verificationResult.isValid) {
                 console.error(`Webhook MP: Falha na verificação - ${verificationResult.message}`);
                 return res.status(400).send(`Webhook Error: ${verificationResult.message}`);
             }
             console.log(`Webhook MP: ${verificationResult.message}`);
             notificationPayload = verificationResult.notificationPayload; // Pega o payload já parseado
        }
        // --- FIM DA VERIFICAÇÃO/PARSING ---

        // --- 2. Processamento do Evento ---
        if (!notificationPayload) { throw new Error("Falha crítica ao obter payload da notificação."); }
        console.log("Webhook MP: Payload a ser processado:", JSON.stringify(notificationPayload, null, 2));

        const eventType = notificationPayload?.type;
        paymentId = notificationPayload?.data?.id; // Atualiza paymentId com o valor do corpo

        if (eventType !== 'payment' || !paymentId) {
            console.log(`Webhook MP: Evento ignorado (Tipo: ${eventType}, ID Dados: ${paymentId || 'N/A'}).`);
            return res.status(200).json({ received: true, message: 'Event type ignored or data ID missing.' });
        }

        console.log(`Webhook MP: Processando evento para Pagamento ID: ${paymentId}`);

        // 3. Buscar Detalhes Atualizados do Pagamento na API do MP
        if (!isMercadoPagoConfigured()) { throw new AppError('SDK MP não configurado.', 500); }
        const payment = new Payment(mpClient);
        const paymentDetails = await payment.get({ id: paymentId });
        console.log(`Webhook MP: Detalhes do pagamento ${paymentId} obtidos. Status API MP: ${paymentDetails?.status}`);
        const finalPaymentStatus = paymentDetails?.status;
        const externalReference = paymentDetails?.external_reference; // Nosso Order ID
        if (!finalPaymentStatus || !externalReference) { throw new AppError('Resposta inválida do MP ao buscar pagamento.', 502); }

        // 4. Encontrar Pedido Correspondente
        const order = await Order.findById(externalReference);
        if (!order) {
            console.warn(`Webhook MP: Pedido não encontrado para external_reference (orderId): ${externalReference}.`);
            return res.status(200).json({ received: true, message: 'Order not found.' });
        }
        console.log(`Webhook MP: Pedido ${order._id} encontrado. Status atual: ${order.orderStatus}.`);

        // 5. Atualizar Status do Pedido
        if (order.orderStatus === 'pending_payment') {
            let newStatus = order.orderStatus; // Inicia com o status atual
            let shouldUpdatePaymentResult = false;

            if (finalPaymentStatus === 'approved') {
                newStatus = 'processing'; // Muda para processando
                order.paidAt = new Date();
                shouldUpdatePaymentResult = true;
            } else if (['rejected', 'cancelled', 'refunded', 'charged_back', 'failed'].includes(finalPaymentStatus)) {
                newStatus = 'failed'; // Marca como falho
                shouldUpdatePaymentResult = true;
            }

            // Salva apenas se o status realmente mudou
            if (newStatus !== order.orderStatus) {
                order.orderStatus = newStatus;
                if (shouldUpdatePaymentResult) {
                    order.paymentResult = {
                        id: paymentId.toString(),
                        status: finalPaymentStatus,
                        update_time: paymentDetails?.date_last_updated || new Date().toISOString(),
                        email_address: paymentDetails?.payer?.email || null
                    };
                }
                await order.save();
                console.log(`Webhook MP: Status do Pedido ${order._id} atualizado para ${newStatus}.`);
                // TODO: Adicionar lógica pós-pagamento (email, etc.)
            } else {
                console.log(`Webhook MP: Status MP (${finalPaymentStatus}) não necessitou atualização para pedido ${order._id}.`);
            }
        } else {
             console.log(`Webhook MP: Pedido ${order._id} já teve status atualizado (${order.orderStatus}), ignorando webhook.`);
        }

        // 6. Responder 200 OK ao Mercado Pago
        console.log(`Webhook MP: Processamento do evento para Pedido ${order._id} concluído.`);
        res.status(200).json({ received: true });

    } catch(err) {
         console.error(`Webhook MP: Erro GERAL ao processar notificação (Payment ID: ${paymentId || 'N/A'}):`, err);
         processingError = err; // Guarda erro para log, mas responde 200 OK
    }

    // Resposta final - Prioriza 200 OK para evitar retentativas do MP por erros internos nossos
    if (!res.headersSent) {
        if (processingError) {
             console.error("Webhook MP: Erro interno ocorreu, respondendo 200 OK ao MP.");
             res.status(200).json({ received: true, processed: false, error: 'Internal processing error occurred.' });
        } else {
             // Se chegou aqui sem erro E sem resposta enviada
             res.status(200).json({ received: true });
        }
    }
    console.log("---- FIM: Processamento de Webhook Mercado Pago ----");
};
