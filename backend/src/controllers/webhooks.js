//src/controllers/webhooks.js
import crypto from "crypto";
import Order from "../models/Order.js";
import AppError from "../utils/appError.js";
import mpClient, {
    Payment,
    isMercadoPagoConfigured,
} from "../config/mercadopago.js"; // SDK e client configurado do MP
import { returnStockForOrderItems } from './orderController.js';

/**
 * Verifica a assinatura de um webhook do Mercado Pago conforme a documentação oficial.
 * Calcula o HMAC-SHA256 sobre um template composto por dados da query string e headers.
 * @param {import('express').Request} req O objeto da requisição Express.
 * @param {Buffer | undefined} rawBody O corpo RAW da requisição (requer middleware express.raw).
 * @param {string | undefined} webhookSecret O segredo configurado no painel do MP e no .env.
 * @returns {{isValid: boolean, message: string, notificationPayload: object | null}} Objeto indicando validade, mensagem e payload JSON parseado (se válido).
 */
const verifyMercadoPagoSignature = (req, rawBody, webhookSecret) => {

    // 1. Extrair Headers necessários para validação
    const signatureHeader = req.headers["x-signature"];
    const requestId = req.headers["x-request-id"];

    // 2. Validações iniciais
    if (!signatureHeader)
        return {
            isValid: false,
            message: "Header 'x-signature' ausente.",
            notificationPayload: null,
        };
    // Verifica se o segredo existe E é uma string
    if (!webhookSecret || typeof webhookSecret !== "string") {
        console.error("!!! ALERTA: MP_WEBHOOK_SECRET INVÁLIDO !!!");
        return {
            isValid: false,
            message: "MP_WEBHOOK_SECRET inválido ou não configurado.",
            notificationPayload: null,
        };
    }
    // Validação do rawBody
    if (!rawBody || !Buffer.isBuffer(rawBody) || rawBody.length === 0) {
        return {
            isValid: false,
            message: "Corpo raw ausente/inválido para verificação.",
            notificationPayload: null,
        };
    }

    try {
        // 3. Parsear Header X-Signature
        const sigParts = signatureHeader
            .split(",")
            .map((part) => part.trim().split("="));
        const sigData = Object.fromEntries(sigParts);
        const timestamp = sigData.ts;
        const receivedSignature = sigData.v1;

        if (!timestamp || !receivedSignature) {
            throw new Error(
                "Formato inválido do header X-Signature (ts ou v1 ausente)."
            );
        }

        // 4. Extrair data.id da QUERY STRING
        const dataId = req.query["data.id"];
        if (!dataId) {
            throw new Error(
                "Parâmetro de consulta 'data.id' ausente na URL do webhook."
            );
        }

        // 5. Construir a String Base (Template Oficial)
        const templateParts = [];
        templateParts.push(`id:${dataId}`);
        if (requestId) {
            templateParts.push(`request-id:${requestId}`);
        }
        templateParts.push(`ts:${timestamp}`);
        const template = templateParts.join(";");

        // 6. Calcular Assinatura Esperada
        const hmac = crypto.createHmac('sha256', webhookSecret);
        const calculatedSignature = hmac.update(template).digest('hex');

        // 7. Comparar Assinaturas
        const receivedSigBuffer = Buffer.from(receivedSignature, "hex");
        const calculatedSigBuffer = Buffer.from(calculatedSignature, "hex");

        if (
            receivedSigBuffer.length !== calculatedSigBuffer.length ||
            !crypto.timingSafeEqual(receivedSigBuffer, calculatedSigBuffer)
        ) {
            return {
                isValid: false,
                message: "Assinatura inválida.",
                notificationPayload: null,
            };
        }

        // 8. Parsear o Corpo Raw para retornar o payload
        let notificationPayload;
        try {
            notificationPayload = JSON.parse(rawBody.toString());
        } catch (parseError) {
            throw new Error(
                "Corpo da requisição não é JSON válido, apesar da assinatura válida."
            );
        }

        return {
            isValid: true,
            message: "Assinatura verificada com sucesso.",
            notificationPayload: notificationPayload,
        };
    } catch (error) {
        console.error(
            "Webhook MP: Erro durante a verificação da assinatura:",
            error
        );
        return {
            isValid: false,
            message: `Erro ao processar assinatura: ${error.message}`,
            notificationPayload: null,
        };
    }
};

/**
 * @description Processa notificações de webhook recebidas do Mercado Pago.
 *              Verifica a assinatura e atualiza o status do pedido correspondente.
 * @route POST /api/webhooks/handler
 * @access Público (Segurança via verificação de assinatura)
 */
export const handleWebhook = async (req, res, next) => {
    let notificationPayload;
    let processingError = null;
    let initialPaymentIdLog = req.query["data.id"];

    try {
        // --- 1. VERIFICAÇÃO DE ASSINATURA ---
        const webhookSecret = process.env.MP_WEBHOOK_SECRET;

        if (webhookSecret) {
            // Verifica se o corpo é Buffer (necessário para express.raw)
            if (!Buffer.isBuffer(req.body)) {
                // Retorna erro pois a configuração do middleware está inconsistente com a necessidade da verificação
                return res.status(400).send("Webhook Error: Invalid body type. Ensure 'express.raw' is used.");
            }
            // Chama a função que valida a assinatura
            const verificationResult = verifyMercadoPagoSignature(req, req.body, webhookSecret);

            if (!verificationResult.isValid) {
                // Se a assinatura falhar, retorna 400 Bad Request
                return res.status(400).json({
                    status: 'fail',
                    message: `Webhook Error: ${verificationResult.message}`
                });
            }
            // Se passou, pega o payload parseado retornado pela função de verificação
            notificationPayload = verificationResult.notificationPayload;

        } else {
            // Tenta parsear o corpo (que provavelmente veio como JSON)
            try {
                if (typeof req.body === 'object' && req.body !== null) {
                    notificationPayload = req.body;
                } else {
                    // Tenta parsear como último recurso se não for objeto (ex: se express.raw ainda estiver ativo)
                    notificationPayload = JSON.parse(req.body.toString());
                }
            } catch (e) {
                return res.status(400).send('Invalid request body.');
            }
        }


        // --- 2. Processamento do Evento ---
        if (!notificationPayload) {
            throw new Error(
                "Falha crítica ao obter payload da notificação após verificação/parsing."
            );
        }

        // Extrair dados relevantes do PAYLOAD JSON (não mais da query)
        const eventType = notificationPayload?.type;
        const paymentId = notificationPayload?.data?.id;
        initialPaymentIdLog = paymentId;

        if (eventType !== "payment" || !paymentId) {
            return res
                .status(200)
                .json({
                    received: true,
                    message: "Event type ignored or data ID missing.",
                });
        }

        // 3. Buscar Detalhes Atualizados do Pagamento na API do MP
        if (!isMercadoPagoConfigured()) {
            throw new AppError("SDK MP não configurado.", 500);
        }
        const payment = new Payment(mpClient);
        const paymentDetails = await payment.get({ id: paymentId });
        const finalPaymentStatus = paymentDetails?.status;
        const externalReference = paymentDetails?.external_reference;
        if (!finalPaymentStatus || !externalReference) {
            throw new AppError(
                "Resposta inválida do MP ao buscar pagamento (sem status ou ref externa).",
                502
            );
        }

        // 4. Encontrar Pedido Correspondente
        const order = await Order.findById(externalReference);
        if (!order) {
            return res
                .status(200)
                .json({ received: true, message: "Order not found for this payment." });
        }

        // 5. Atualizar Status do Pedido
        const updatableStatus = ['pending_payment', 'processing', 'paid', 'shipped', 'failed'];
        if (updatableStatus.includes(order.orderStatus)) {
            let newStatus = order.orderStatus;
            let needsStockReturn = false;

            // Mapeamento de Status MP -> Status Pedido
            if (finalPaymentStatus === "approved") {
                if (order.orderStatus === "pending_payment") {
                    newStatus = "processing"; // Ou 'paid'
                    order.paidAt = new Date();
                }
            } else if (['rejected', 'cancelled', 'failed', 'refunded', 'charged_back'].includes(finalPaymentStatus)) {
                const previousStatus = order.orderStatus;
                newStatus = finalPaymentStatus === "refunded" ? "refunded" :
                    finalPaymentStatus === "cancelled" ? "cancelled" : "failed";

                // ----> Lógica para retornar estoque via Webhook <----
                // Retorna estoque apenas se o pedido estava em um estado onde o estoque FOI decrementado
                // E AINDA não está em um status final de falha/cancelado/reembolsado.
                // Isso evita retornar estoque múltiplas vezes para o mesmo pedido.
                if (['pending_payment', 'processing', 'paid', 'shipped'].includes(previousStatus) && !['failed', 'cancelled', 'refunded'].includes(newStatus)) {
                    needsStockReturn = true;
                }
            }

            // Atualiza o pedido se o status mudou
            if (newStatus !== order.orderStatus) {
                order.orderStatus = newStatus;
                // Atualiza paymentResult independentemente da mudança de status principal
                order.paymentResult = {
                    id: paymentDetails.id?.toString() || null,
                    status: finalPaymentStatus || null,
                    update_time: paymentDetails.date_last_updated || paymentDetails.date_created || new Date().toISOString(),
                    email_address: paymentDetails.payer?.email || null,
                    card_brand: paymentDetails.payment_method_id || null,
                    card_last_four: paymentDetails.card?.last_four_digits || null
                };

                await order.save();

                // Chama a função para retornar o estoque DEPOIS de salvar o novo status
                if (needsStockReturn) {
                    await returnStockForOrderItems(order.orderItems);
                }

            } else {
                // Mesmo sem mudar status, atualiza paymentResult para ter os dados mais recentes
                order.paymentResult = {
                    id: paymentDetails.id?.toString() || null,
                    status: finalPaymentStatus || null,
                    update_time: paymentDetails.date_last_updated || paymentDetails.date_created || new Date().toISOString(),
                    email_address: paymentDetails.payer?.email || null,
                    card_brand: paymentDetails.payment_method_id || null,
                    card_last_four: paymentDetails.card?.last_four_digits || null
                };
                await order.save();
            }
        }

        // 6. Responder 200 OK ao Mercado Pago
        res.status(200).json({ received: true });

    } catch (err) {
        processingError = err; // Guarda erro para log, mas responde 200 OK
    }

    // Resposta final - Prioriza 200 OK para evitar retentativas do MP por erros internos nossos
    if (!res.headersSent) {
        if (processingError) {
            res.status(200).json({ 
                    received: true,
                    processed: false, 
                    error: "Internal processing error occurred.",
            });
        } else {
            res.status(200).json({ received: true });
        }
    }
};
