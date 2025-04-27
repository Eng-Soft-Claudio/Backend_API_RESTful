//src/controllers/webhooks.js
import mongoose from "mongoose";
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
    const hmac = crypto.createHmac("sha256", webhookSecret);
    const calculatedSignature = hmac.update(template).digest("hex");

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

  const externalReference = req.query["data.id"]; // Pegar da query só pra simplificar
  if (!externalReference)
    return res.status(400).send("Missing data.id in query");

  try {
    // --- 1. VERIFICAÇÃO DE ASSINATURA ---
    const webhookSecret = process.env.MP_WEBHOOK_SECRET;

    if (webhookSecret) {
      if (!Buffer.isBuffer(req.body)) {
        return res.status(400).send("Webhook Error: Invalid body type...");
      }
      const verificationResult = verifyMercadoPagoSignature(
        req,
        req.body,
        webhookSecret
      );

      if (!verificationResult.isValid) {
        return res.status(400).json({
          status: "fail",
          message: `Webhook Error: ${verificationResult.message}`,
        }); // Removido processed: true daqui
      }
      notificationPayload = verificationResult.notificationPayload;
    } else {
      // Lógica para quando não há secret (parse JSON normal)
      try {
        if (typeof req.body === "object" && req.body !== null) {
          notificationPayload = req.body;
        } else {
          notificationPayload = JSON.parse(req.body.toString());
        }
      } catch (e) {
        return res.status(400).send("Invalid request body (no secret).");
      }
    }

    // --- 2. Processamento do Evento ---
    if (!notificationPayload) {
      throw new Error("Falha crítica ao obter payload da notificação.");
    }

    const eventType = notificationPayload?.type;
    const paymentIdFromBody = notificationPayload?.data?.id;

    if (eventType !== "payment" || !paymentIdFromBody) {
      return res.status(200).json({
        received: true,
        processed: false,
        message: "Event type ignored or data ID missing in payload.",
      });
    }

    // --- 3. Buscar Detalhes do Pagamento na API do MP ---
    if (!isMercadoPagoConfigured()) {
      throw new AppError("SDK MP não configurado.", 500);
    }
    const payment = new Payment(mpClient);
    const paymentDetails = await payment.get({ id: paymentIdFromBody });
    const finalPaymentStatus = paymentDetails?.status;
    const externalReference = paymentDetails?.external_reference;
    if (!finalPaymentStatus || !externalReference) {
      throw new AppError(
        "Resposta inválida do MP (sem status ou ref externa).",
        502
      );
    }

    // --- 4. Encontrar Pedido Correspondente ---

    const order = await Order.findById(externalReference);

    if (!order) {
      // Nota: Retornar 200 OK para MP, mesmo que o pedido não exista do nosso lado.
      // Não incluir 'error' aqui, pois não é um erro interno do *nosso* processamento.
      return res.status(200).json({
        received: true,
        processed: false,
        message: "Order not found for this payment.",
      });
    }

    // --- 5. Atualizar Status do Pedido ---
    const updatableStatus = [
      "pending_payment",
      "processing" /* ... outros se necessário */,
    ];
    if (updatableStatus.includes(order.orderStatus)) {
      let originalStatus = order.orderStatus;
      let newStatus = originalStatus;
      let needsStockReturn = false;

      // --- Lógica de mapeamento de status ---
      if (finalPaymentStatus === "approved") {
        if (order.orderStatus === "pending_payment") {
          newStatus = "processing";
          order.paidAt = new Date();
        }
      } else if (
        [
          "rejected",
          "cancelled",
          "failed",
          "refunded",
          "charged_back",
        ].includes(finalPaymentStatus)
      ) {
        const previousStatus = order.orderStatus;
        newStatus =
          finalPaymentStatus === "refunded"
            ? "refunded"
            : finalPaymentStatus === "cancelled"
            ? "cancelled"
            : "failed";
        if (
          ["pending_payment", "processing", "paid", "shipped"].includes(
            previousStatus
          ) &&
          !["failed", "cancelled", "refunded"].includes(newStatus)
        ) {
          needsStockReturn = true;
        }
      }

      // Atualiza paymentResult independentemente da mudança de status principal
      order.paymentResult = {
        id: paymentDetails.id?.toString() || null,
        status: finalPaymentStatus || null,
        update_time:
          paymentDetails.date_last_updated ||
          paymentDetails.date_created ||
          new Date().toISOString(),
        email_address: paymentDetails.payer?.email || null,
        card_brand: paymentDetails.payment_method_id || null,
        card_last_four: paymentDetails.card?.last_four_digits || null,
      };

      if (newStatus !== originalStatus) {
        order.orderStatus = newStatus;

        try {
          const savedOrder = await order.save(); // Salva status e paymentResult

          if (savedOrder.orderStatus !== newStatus) {
            
            throw new Error("Database save failed to persist status update.");
          }

          const responseToSend = { received: true, processed: true };

          if (res.headersSent) {
            return;
          }
          res.status(200).json(responseToSend);

          if (needsStockReturn) {
            await returnStockForOrderItems(order.orderItems);
          }
          return;
        } catch (saveError) {
          const errorResponse = {
            received: true,
            processed: false, // Falhou ao salvar
            error: `Internal processing error during save: ${
              saveError.message || saveError.toString()
            }`,
          };
          if (res.headersSent) {
            
            return;
          }

          // Retornar 500 aqui é mais apropriado, indica falha nossa ao processar
          return res.status(500).json(errorResponse);
        }
      } else {
        // Status não mudou, mas paymentResult foi atualizado
        try {
          const savedOrderElse = await order.save();

          const responseToSend = { received: true, processed: true };

          if (res.headersSent) {
            
            return;
          }
          return res.status(200).json(responseToSend);
        } catch (saveErrorElse) {
          const errorResponse = {
            received: true,
            processed: false, // Falhou ao salvar
            error: `Internal processing error during save (else): ${
              saveErrorElse.message || saveErrorElse.toString()
            }`, // <-- Usa saveErrorElse
          };
          if (res.headersSent) {
            
            return;
          }

          return res.status(500).json(errorResponse); // 500 aqui também
        }
      }
    } else {
      // Status do pedido não é atualizável por webhook (ex: delivered)

      return res.status(200).json({
        received: true,
        processed: false, // Não processamos mudança de status
        message: "Order status not updatable.",
      });
    }
  } catch (err) {
    // <-- CATCH PRINCIPAL PEGA ERROS ANTERIORES (assinatura, parse, findById, payment.get)
    const errorResponse = {
      received: true,
      processed: false,
      error: `Internal processing error: ${err.message || err.toString()}`,
    };
    if (res.headersSent) {
      return;
    }
    // Retornar 200 OK para MP é seguro, evita retentativas por falha nossa
    return res.status(200).json(errorResponse);
  }
};
