/**
 * @fileoverview Controller para lidar com Webhooks do Mercado Pago.
 */

import crypto from "crypto";
import Order from "../models/Order.js";
import AppError from "../utils/appError.js";
import mpClient, {
    Payment,
    isMercadoPagoConfigured,
} from "../config/mercadopago.js"; // SDK e client configurado do MP

/**
 * Verifica a assinatura de um webhook do Mercado Pago conforme a documentação oficial.
 * Calcula o HMAC-SHA256 sobre um template composto por dados da query string e headers.
 * @param {import('express').Request} req O objeto da requisição Express.
 * @param {Buffer | undefined} rawBody O corpo RAW da requisição (requer middleware express.raw).
 * @param {string | undefined} webhookSecret O segredo configurado no painel do MP e no .env.
 * @returns {{isValid: boolean, message: string, notificationPayload: object | null}} Objeto indicando validade, mensagem e payload JSON parseado (se válido).
 */
const verifyMercadoPagoSignature = (req, rawBody, webhookSecret) => {
    // Adiciona log para depurar o tipo inicial do segredo
    console.log(
        "Webhook Verify MP - TIPO de webhookSecret (início):",
        typeof webhookSecret
    );

    // 1. Extrair Headers necessários para validação
    const signatureHeader = req.headers["x-signature"];
    const requestId = req.headers["x-request-id"];

    console.log('signatureHeader: ', signatureHeader)
    console.log('requestId: ', requestId)

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
        console.log("Webhook Verify MP - Base String Usada:", template);

        // 6. Calcular Assinatura Esperada
        // O segredo JÁ FOI VALIDADO como string acima
        //const hmac = crypto.createHmac('sha256', webhookSecret);
        //const calculatedSignature = hmac.update(template).digest('hex');
        const hmac = crypto.createHmac(
            "sha256",
            Buffer.from(
                webhookSecret,
                "utf-8"
            )
        );
        const calculatedSignature = hmac.update(
            template,
            "utf-8"
        ).digest(
            "hex"
        );

        console.log("Webhook Verify MP - Assinatura Calculada: ", calculatedSignature);
        console.log("Webhook Verify MP - Assinatura Recebida :", receivedSignature);

        // 7. Comparar Assinaturas
        const receivedSigBuffer = Buffer.from(receivedSignature, "hex");
        const calculatedSigBuffer = Buffer.from(calculatedSignature, "hex");

        if (
            receivedSigBuffer.length !== calculatedSigBuffer.length ||
            !crypto.timingSafeEqual(receivedSigBuffer, calculatedSigBuffer)
        ) {
            console.error(
                "Webhook MP: Falha na comparação timingSafeEqual das assinaturas."
            );
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
    console.log("---- INÍCIO: Processamento de Webhook Mercado Pago ----");
    console.log("Webhook Handler - Query Params:", req.query);
    let notificationPayload;
    let processingError = null;
    // Tenta pegar ID da query para log inicial de erro, mas o ID real virá do payload validado
    let initialPaymentIdLog = req.query["data.id"];

    try {
        // --- 1. VERIFICAÇÃO DE ASSINATURA ---
        const webhookSecret = process.env.MP_WEBHOOK_SECRET;

        // ===============================================================
        // ======================= INÍCIO PLANO B ========================
        // ===============================================================
        // A validação da assinatura HMAC está falhando consistentemente no Sandbox MP.
        // Comente a validação abaixo e descomente o bloco "Processa sem verificação"
        // TEMPORARIAMENTE para testar a lógica de atualização do pedido.
        // !!! LEMBRE-SE DE REATIVAR A VALIDAÇÃO ANTES DA PRODUÇÃO !!!

        /* <<< BLOCO DE VERIFICAÇÃO (COMENTADO PARA PLANO B) >>> */
        if (webhookSecret) {
            // Verifica se o corpo é Buffer (necessário para express.raw)
            if (!Buffer.isBuffer(req.body)) {
                console.error("Webhook MP: Verificação esperava Buffer, mas recebeu:", typeof req.body);
                // Retorna erro pois a configuração do middleware está inconsistente com a necessidade da verificação
                return res.status(400).send("Webhook Error: Invalid body type. Ensure 'express.raw' is used.");
            }
            // Chama a função que valida a assinatura
            const verificationResult = verifyMercadoPagoSignature(req, req.body, webhookSecret);

            if (!verificationResult.isValid) {
                // Se a assinatura falhar, retorna 400 Bad Request
                console.error(`Webhook MP: Falha na verificação - ${verificationResult.message}`);
                return res.status(400).send(`Webhook Error: ${verificationResult.message}`);
            }
            // Se passou, pega o payload parseado retornado pela função de verificação
            console.log(`Webhook MP: ${verificationResult.message}`);
            notificationPayload = verificationResult.notificationPayload;

        } else {
            // Se o segredo não está configurado, avisa e continua sem validação (INSEGURO)
            console.warn("Webhook MP: MP_WEBHOOK_SECRET não definido. Processando sem verificação (INSEGURO!).");
            // Tenta parsear o corpo (que provavelmente veio como JSON)
            try {
                if (typeof req.body === 'object' && req.body !== null) {
                    notificationPayload = req.body;
                } else {
                    // Tenta parsear como último recurso se não for objeto (ex: se express.raw ainda estiver ativo)
                    notificationPayload = JSON.parse(req.body.toString());
                }
            } catch (e) {
                console.error("Webhook MP: Erro ao parsear corpo (sem secret):", e);
                return res.status(400).send('Invalid request body.');
            }
        }
        /* <<< FIM BLOCO DE VERIFICAÇÃO (COMENTADO PARA PLANO B) >>> */


        // --- Bloco ATIVO para Plano B (Processa sem verificação) ---
        // console.error("!!! ALERTA DE SEGURANÇA: VERIFICAÇÃO DE ASSINATURA DO WEBHOOK DESATIVADA !!!");
        // try {
        //     // Assume que express.json() global fez o parse (Remova/Comente express.raw na rota)
        //     if (typeof req.body === 'object' && req.body !== null) {
        //         notificationPayload = req.body;
        //     } else {
        //         // Se por acaso ainda vier como Buffer, tenta parsear
        //         if (Buffer.isBuffer(req.body)) {
        //             console.log("Webhook MP (Plano B): Recebido Buffer, tentando parsear JSON.");
        //             notificationPayload = JSON.parse(req.body.toString());
        //         } else {
        //             throw new Error('Formato de corpo inesperado.');
        //         }
        //     }
        // } catch (e) {
        //     console.error("Webhook MP (Plano B): Erro ao obter/parsear corpo:", e);
        //     return res.status(400).send('Invalid request body.');
        // }
        // ===============================================================
        // ======================== FIM PLANO B ==========================
        // ===============================================================
        // --- FIM DA VERIFICAÇÃO/PARSING ---

        // --- 2. Processamento do Evento ---
        if (!notificationPayload) {
            // Se chegou aqui, algo deu errado no parsing mesmo sem erro lançado
            throw new Error(
                "Falha crítica ao obter payload da notificação após verificação/parsing."
            );
        }
        console.log(
            "Webhook MP: Payload a ser processado:",
            JSON.stringify(notificationPayload, null, 2)
        );

        // Extrair dados relevantes do PAYLOAD JSON (não mais da query)
        const eventType = notificationPayload?.type;
        const paymentId = notificationPayload?.data?.id; // ID do pagamento DO CORPO JSON
        initialPaymentIdLog = paymentId; // Atualiza para o log de erro final

        if (eventType !== "payment" || !paymentId) {
            console.log(
                `Webhook MP: Evento ignorado (Tipo: ${eventType}, ID Dados: ${paymentId || "N/A"
                }).`
            );
            return res
                .status(200)
                .json({
                    received: true,
                    message: "Event type ignored or data ID missing.",
                });
        }

        console.log(
            `Webhook MP: Processando evento para Pagamento ID: ${paymentId}`
        );

        // 3. Buscar Detalhes Atualizados do Pagamento na API do MP
        if (!isMercadoPagoConfigured()) {
            throw new AppError("SDK MP não configurado.", 500);
        }
        const payment = new Payment(mpClient);
        const paymentDetails = await payment.get({ id: paymentId });
        console.log(
            `Webhook MP: Detalhes do pagamento ${paymentId} obtidos. Status API MP: ${paymentDetails?.status}`
        );
        const finalPaymentStatus = paymentDetails?.status;
        const externalReference = paymentDetails?.external_reference; // Nosso Order ID
        if (!finalPaymentStatus || !externalReference) {
            throw new AppError(
                "Resposta inválida do MP ao buscar pagamento (sem status ou ref externa).",
                502
            );
        }

        // 4. Encontrar Pedido Correspondente
        const order = await Order.findById(externalReference);
        if (!order) {
            console.warn(
                `Webhook MP: Pedido não encontrado para external_reference (orderId): ${externalReference}.`
            );
            return res
                .status(200)
                .json({ received: true, message: "Order not found for this payment." });
        }
        console.log(
            `Webhook MP: Pedido ${order._id} encontrado. Status atual: ${order.orderStatus}.`
        );

        // 5. Atualizar Status do Pedido
        if (["pending_payment", "processing", "paid"].includes(order.orderStatus)) {
            let newStatus = order.orderStatus;
            let shouldUpdatePaymentResult = true;

            // Mapeamento de Status MP -> Status Pedido
            if (finalPaymentStatus === "approved") {
                // Só atualiza se estava pendente antes
                if (order.orderStatus === "pending_payment") {
                    newStatus = "processing";
                    order.paidAt = new Date();
                } else {
                    // Se já estava processing/paid, não muda o status, mas pode atualizar paymentResult
                    shouldUpdatePaymentResult = true;
                    console.log(
                        `Webhook MP: Recebido 'approved' para pedido ${order._id} que já estava ${order.orderStatus}. Atualizando apenas paymentResult.`
                    );
                }
            } else if (
                [
                    "rejected",
                    "cancelled",
                    "refunded",
                    "charged_back",
                    "failed",
                ].includes(finalPaymentStatus)
            ) {
                // Se falhou/cancelou/reembolsou, marca como 'failed' ou 'cancelled'
                // (mesmo que já estivesse 'processing' ou 'paid' no caso de chargeback/refund)
                newStatus =
                    finalPaymentStatus === "refunded"
                        ? "refunded"
                        : finalPaymentStatus === "cancelled"
                            ? "cancelled"
                            : "failed";
                shouldUpdatePaymentResult = true;
                // TODO: Retornar estoque se 'failed', 'cancelled', 'refunded', 'charged_back'?
            } else if (
                ["pending", "in_process", "authorized"].includes(finalPaymentStatus)
            ) {
                // Status intermediários do MP não alteram nosso status 'pending_payment'
                shouldUpdatePaymentResult = true;
                console.log(
                    `Webhook MP: Status MP intermediário (${finalPaymentStatus}) recebido para pedido ${order._id}. Mantendo status local.`
                );
            } else {
                // Status desconhecido do MP
                shouldUpdatePaymentResult = false;
                console.warn(
                    `Webhook MP: Status MP desconhecido (${finalPaymentStatus}) recebido para pedido ${order._id}.`
                );
            }

            // Atualiza o pedido se necessário
            if (newStatus !== order.orderStatus || shouldUpdatePaymentResult) {
                if (newStatus !== order.orderStatus) {
                    order.orderStatus = newStatus;
                }
                // Sempre atualiza paymentResult se shouldUpdatePaymentResult for true
                if (shouldUpdatePaymentResult) {
                    order.paymentResult = {
                        id: paymentId.toString(),
                        status: finalPaymentStatus,
                        update_time:
                            paymentDetails?.date_last_updated || new Date().toISOString(),
                        email_address: paymentDetails?.payer?.email || null,
                        // Adiciona dados do cartão se disponíveis na resposta da API MP
                        card_brand: paymentDetails?.payment_method_id, // ou paymentDetails?.card?.cardholder?.name?
                        card_last_four: paymentDetails?.card?.last_four_digits,
                    };
                }
                await order.save();
                console.log(
                    `Webhook MP: Pedido ${order._id} atualizado (Status: ${order.orderStatus}).`
                );
            } else {
                console.log(
                    `Webhook MP: Nenhuma atualização necessária para pedido ${order._id}.`
                );
            }
        } else {
            console.log(
                `Webhook MP: Pedido ${order._id} não está em estado atualizável (${order.orderStatus}), ignorando webhook.`
            );
        }

        // 6. Responder 200 OK ao Mercado Pago
        console.log(
            `Webhook MP: Processamento do evento para Pedido ${order._id} concluído.`
        );
        res.status(200).json({ received: true });
    } catch (err) {
        console.error(
            `Webhook MP: Erro GERAL ao processar notificação (Payment ID: ${initialPaymentIdLog || "N/A"
            }):`,
            err
        );
        processingError = err; // Guarda erro para log, mas responde 200 OK
    }

    // Resposta final - Prioriza 200 OK para evitar retentativas do MP por erros internos nossos
    if (!res.headersSent) {
        if (processingError) {
            console.error(
                "Webhook MP: Erro interno ocorreu, respondendo 200 OK ao MP."
            );
            res
                .status(200)
                .json({
                    received: true,
                    processed: false,
                    error: "Internal processing error occurred.",
                });
        } else {
            res.status(200).json({ received: true });
        }
    }
    console.log("---- FIM: Processamento de Webhook Mercado Pago ----");
};
