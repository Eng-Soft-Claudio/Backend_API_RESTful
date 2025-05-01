// src/tests/webhooks.test.js
import http from "http";
import request from "supertest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import crypto from "crypto";
import app from "../app.js";
import Order from "../models/Order.js";
import User from "../models/User.js";
import Category from "../models/Category.js";
import Product from "../models/Product.js";

// --- Mocking do Mercado Pago ---
jest.mock("mercadopago", () => {
  const mockPaymentGet = jest.fn(); 
  return {
    MercadoPagoConfig: jest.fn(),
    Payment: jest.fn(() => ({ get: mockPaymentGet })),
    __esModule: true, 
    _mockPaymentGet: mockPaymentGet,
  };
});

// Importa a função mockada individual para usar nos testes
const { _mockPaymentGet } = require("mercadopago");

// --- Variáveis Globais ---
let mongoServer;
let server; 
let requestInstance; 
let productIdWebhook;
let baseUserId;
let webhookSecret = "TEST_WEBHOOK_SECRET_123"; 
const paymentId = "PAYMENT_ID_WEBHOOK_TEST"; 
const initialStock = 5; 

// --- Dados de Usuário Válidos para Teste ---
const testUserData = {
  name: "Webhook User Test",
  email: "webhook@test.com",
  password: "password123",
  cpf: "88120874005", 
  birthDate: "1998-02-15",
};

// --- Helper para gerar assinatura (simula o MP) ---
// Baseado na documentação do MP: https://www.mercadopago.com.br/developers/pt/docs/notifications/webhooks#--validar-assinaturas
function generateSignature(payloadId, timestamp, secret) {
  const templateParts = [];
  templateParts.push(`id:${payloadId}`);
  templateParts.push(`ts:${timestamp}`);
  const template = templateParts.join(";");
  const hmac = crypto.createHmac("sha256", secret); 
  const signature = hmac.update(template, "utf-8").digest("hex");
  return `ts=${timestamp},v1=${signature}`;
}

// --- Setup e Teardown ---
beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const mongoUri = mongoServer.getUri();
  process.env.MONGODB_URI = mongoUri;
  process.env.MP_WEBHOOK_SECRET = webhookSecret;
  process.env.PORT = "0"; 

  // Garantir JWT_SECRET 
  if (!process.env.JWT_SECRET) {
    process.env.JWT_SECRET = "webhook-secret-placeholder";
    console.warn("JWT_SECRET não definido para testes de webhook.");
  }

  // Conecta ao banco ANTES de iniciar o servidor
  await mongoose.connect(mongoUri);

  // Inicia o servidor HTTP real para receber webhooks
  const httpServer = http.createServer(app);
  await new Promise((resolve) => {
    server = httpServer.listen(0, "localhost", () => {
      const { port } = server.address();
      requestInstance = request(`http://localhost:${port}`);
      resolve();
    });
  });
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
  delete process.env.MP_WEBHOOK_SECRET; 
  await new Promise((resolve, reject) => {
    if (server) {
      server.close((err) => {
        if (err) return reject(err);
        resolve();
      });
    } else {
      resolve();
    }
  });
});

beforeEach(async () => {
  // Limpeza de dados antes de cada teste
  await Promise.all([
    User.deleteMany({}),
    Category.deleteMany({}),
    Product.deleteMany({}),
    Order.deleteMany({}),
  ]);
  jest.clearAllMocks();

  // Criação de dados base para cada teste
  const category = await Category.create({ name: "Cat Webhook Test" });
  const product = await Product.create({
    name: "Prod Webhook Test",
    price: 50,
    category: category._id,
    image: "wh.jpg",
    stock: initialStock, 
  });
  productIdWebhook = product._id;

  const user = await User.create(testUserData);
  baseUserId = user._id;
});

// --- Bloco de Testes para Webhook ---
describe("/api/webhooks/handler", () => { 

  it("deve retornar 400 se a assinatura X-Signature estiver faltando", async () => {
    const currentPayloadId = paymentId + "-missing"; 
    const currentPayloadBase = {
      type: "payment",
      action: "payment.updated",
      data: { id: currentPayloadId },
    };

    const res = await requestInstance 
      .post("/api/webhooks/handler")
      .query({ "data.id": currentPayloadId, type: "payment" })
      .set("Content-Type", "application/json")
      .send(currentPayloadBase)
      .expect("Content-Type", /json/)
      .expect(400);

    expect(res.body.status).toBe("fail");
    expect(res.body.message).toBe(
      "Webhook Error: Header 'x-signature' ausente."
    );
  });

  it("deve retornar 400 se a assinatura for inválida", async () => {
    const currentPayloadId = paymentId + "-invalid-sig";
    const currentTimestamp = Date.now();
    const invalidSignature = generateSignature(
      currentPayloadId,
      currentTimestamp,
      "WRONG_SECRET"
    );
    const currentPayloadBase = {
      type: "payment",
      action: "payment.updated",
      data: { id: currentPayloadId },
    };

    const res = await requestInstance
      .post("/api/webhooks/handler")
      .query({ "data.id": currentPayloadId, type: "payment" }) 
      .set("Content-Type", "application/json")
      .set("x-signature", invalidSignature) 
      .send(currentPayloadBase)
      .expect("Content-Type", /json/)
      .expect(400);

    expect(res.body.status).toBe("fail");
    expect(res.body.message).toBe("Webhook Error: Assinatura inválida.");
  });

  it("deve processar webhook com assinatura válida e pagamento APROVADO", async () => {
    // 1. Cria um pedido pendente com ID de pagamento conhecido
    const orderDataApproved = {
      user: baseUserId,
      orderItems: [
        {
          productId: productIdWebhook,
          name: "Prod Webhook Test",
          quantity: 1,
          price: 50,
          image: "wh.jpg",
        },
      ],
      shippingAddress: {
        street: "WH St",
        number: "1",
        neighborhood: "WH",
        city: "WH",
        state: "WH",
        postalCode: "11111-000",
        country: "WH",
      },
      paymentMethod: "WebhookPayApproved",
      itemsPrice: 50,
      shippingPrice: 0,
      totalPrice: 50,
      orderStatus: "pending_payment",
      mercadopagoPaymentId: paymentId, 
    };
    const currentTestOrder = await Order.create(orderDataApproved);
    const stockBeforeWebhook = initialStock;

    // 2. Configura o mock do MP para retornar pagamento 'approved'
    _mockPaymentGet.mockResolvedValueOnce({
      id: paymentId,
      status: "approved",
      external_reference: currentTestOrder._id.toString(), 
      date_last_updated: new Date().toISOString(),
      payer: { email: "approve@webhook.test" },
      payment_method_id: "visa",
      card: { last_four_digits: "4321" },
    });

    // 3. Gera dados e assinatura válidos para o webhook
    const currentTimestamp = Date.now();
    const currentPayloadId = paymentId; 
    const currentPayloadBase = {
      type: "payment",
      action: "payment.updated",
      data: { id: currentPayloadId },
    };
    const validSignature = generateSignature(
      currentPayloadId,
      currentTimestamp,
      webhookSecret
    );

    // 4. Envia a requisição do webhook
    const res = await requestInstance
      .post("/api/webhooks/handler")
      .query({ "data.id": currentPayloadId, type: "payment" }) 
      .set("Content-Type", "application/json")
      .set("x-signature", validSignature)
      .send(currentPayloadBase)
      .expect("Content-Type", /json/)
      .expect(200); 

    // 5. Verifica a resposta do webhook
    expect(res.body.received).toBe(true);
    expect(res.body.processed).toBe(true); 

    // 6. Verifica se a API do MP foi chamada corretamente
    expect(_mockPaymentGet).toHaveBeenCalledTimes(1);
    expect(_mockPaymentGet).toHaveBeenCalledWith({ id: currentPayloadId });

    // 7. Verifica se o pedido foi atualizado no DB
    const dbOrder = await Order.findById(currentTestOrder._id);
    expect(dbOrder).toBeDefined();
    expect(dbOrder.orderStatus).toBe("processing"); 
    expect(dbOrder.paidAt).toBeInstanceOf(Date); 
    expect(dbOrder.paymentResult).toBeDefined();
    expect(dbOrder.paymentResult.status).toBe("approved");
    expect(dbOrder.paymentResult.card_last_four).toBe("4321");

    // 8. Verifica se o estoque NÃO foi retornado
    const dbProduct = await Product.findById(productIdWebhook);
    expect(dbProduct.stock).toBe(stockBeforeWebhook); 
  });

  it("deve processar webhook com assinatura válida e pagamento REJEITADO e retornar estoque", async () => {
    // 1. Cria pedido pendente
    const orderDataRejected = {
      user: baseUserId,
      orderItems: [
        {
          productId: productIdWebhook,
          name: "Prod Webhook Test",
          quantity: 1,
          price: 50,
          image: "wh.jpg",
        },
      ],
      shippingAddress: {
        street: "WH St R",
        number: "2",
        neighborhood: "WHR",
        city: "WHR",
        state: "WR",
        postalCode: "22222-000",
        country: "WHR",
      },
      paymentMethod: "WebhookPayRejected",
      itemsPrice: 50,
      shippingPrice: 0,
      totalPrice: 50,
      orderStatus: "pending_payment",
      mercadopagoPaymentId: paymentId, 
    };
    const currentTestOrder = await Order.create(orderDataRejected);
    const stockBeforeWebhook = initialStock - 1;

    // 2. Configura mock do MP
    _mockPaymentGet.mockResolvedValueOnce({
      id: paymentId,
      status: "rejected", 
      external_reference: currentTestOrder._id.toString(),
      date_last_updated: new Date().toISOString(),
      payer: { email: "reject@webhook.test" },
    });

    // 3. Gera dados e assinatura válidos
    const currentTimestamp = Date.now();
    const currentPayloadId = paymentId;
    const currentPayloadBase = {
      type: "payment",
      action: "payment.updated",
      data: { id: currentPayloadId },
    };
    const validSignature = generateSignature(
      currentPayloadId,
      currentTimestamp,
      webhookSecret
    );

    // 4. Envia requisição
    const res = await requestInstance
      .post("/api/webhooks/handler")
      .query({ "data.id": currentPayloadId, type: "payment" })
      .set("Content-Type", "application/json")
      .set("x-signature", validSignature)
      .send(currentPayloadBase)
      .expect("Content-Type", /json/)
      .expect(200);

    // 5. Verifica resposta
    expect(res.body.received).toBe(true);
    expect(res.body.processed).toBe(true);
    expect(_mockPaymentGet).toHaveBeenCalledTimes(1);

    // 6. Verifica pedido atualizado para 'failed'
    const dbOrder = await Order.findById(currentTestOrder._id);
    expect(dbOrder).toBeDefined();
    expect(dbOrder.orderStatus).toBe("failed");
    expect(dbOrder.paidAt).toBeUndefined(); 
    expect(dbOrder.paymentResult).toBeDefined();
    expect(dbOrder.paymentResult.status).toBe("rejected");

    // 7. Verifica se o estoque FOI retornado (voltou ao inicial)
    await new Promise((resolve) => setTimeout(resolve, 50));
    const dbProduct = await Product.findById(productIdWebhook);
    expect(dbProduct.stock).toBe(initialStock); 
  });

  it("deve retornar 200 OK (sem erro, não processado) se o pedido não for encontrado pela external_reference", async () => {
    const nonExistentOrderId = new mongoose.Types.ObjectId().toString();
    _mockPaymentGet.mockResolvedValueOnce({
      id: paymentId,
      status: "approved", 
      external_reference: nonExistentOrderId, 
    });

    const currentTimestamp = Date.now();
    const currentPayloadId = paymentId;
    const currentPayloadBase = {
      type: "payment",
      action: "payment.updated",
      data: { id: currentPayloadId },
    };
    const validSignature = generateSignature(
      currentPayloadId,
      currentTimestamp,
      webhookSecret
    );

    const res = await requestInstance
      .post("/api/webhooks/handler")
      .query({ "data.id": currentPayloadId, type: "payment" })
      .set("Content-Type", "application/json")
      .set("x-signature", validSignature)
      .send(currentPayloadBase)
      .expect(200); 

    expect(res.body.received).toBe(true);
    expect(res.body.processed).toBe(false);
    expect(res.body.message).toBe("Order not found for this payment.");
    expect(_mockPaymentGet).toHaveBeenCalledTimes(1); 
  });

  it('deve retornar 200 OK se o tipo de evento for ignorado (não "payment")', async () => {
    const otherTypeId = "merchant_order_123"; 
    const otherTypePayload = {
      type: "merchant_order",
      action: "order.updated",
      data: { id: otherTypeId },
    };
    const currentTimestamp = Date.now();
    const signatureForOther = generateSignature(
      otherTypeId,
      currentTimestamp,
      webhookSecret
    ); 

    const res = await requestInstance
      .post("/api/webhooks/handler")
      .query({ "data.id": otherTypeId, type: "merchant_order" })
      .set("Content-Type", "application/json")
      .set("x-signature", signatureForOther)
      .send(otherTypePayload)
      .expect(200);

    expect(res.body.received).toBe(true);
    expect(res.body.processed).toBe(false);
    expect(res.body.message).toBe(
      "Event type ignored or data ID missing in payload."
    );
    expect(_mockPaymentGet).not.toHaveBeenCalled(); 
  });

  it("deve retornar 200 OK (com erro interno logado) se a busca na API MP falhar", async () => {
    // 1. Cria pedido pendente
    const orderDataFail = {
      user: baseUserId,
      orderItems: [
        {
          productId: productIdWebhook,
          name: "Prod WH Fail",
          quantity: 1,
          price: 50,
          image: "whf.jpg",
        },
      ],
      shippingAddress: {
        street: "WHF St",
        number: "3",
        neighborhood: "WHF",
        city: "WHF",
        state: "WF",
        postalCode: "33333-000",
        country: "WHF",
      },
      paymentMethod: "WebhookPayFailMP",
      itemsPrice: 50,
      shippingPrice: 0,
      totalPrice: 50,
      orderStatus: "pending_payment",
      mercadopagoPaymentId: paymentId, 
    };
    const testOrderFail = await Order.create(orderDataFail);
    await Product.findByIdAndUpdate(productIdWebhook, { $inc: { stock: -1 } });

    // 2. Configura mock do MP para REJEITAR a chamada .get()
    const mockError = new Error(
      "Falha simulada ao buscar MP API (ex: 404 no MP)"
    );
    mockError.statusCode = 404; 
    _mockPaymentGet.mockRejectedValueOnce(mockError);

    // 3. Gera dados e assinatura válidos
    const currentTimestamp = Date.now();
    const currentPayloadId = paymentId;
    const currentPayloadBase = {
      type: "payment",
      action: "payment.updated",
      data: { id: currentPayloadId },
    };
    const validSignature = generateSignature(
      currentPayloadId,
      currentTimestamp,
      webhookSecret
    );

    // 4. Envia requisição
    const res = await requestInstance
      .post("/api/webhooks/handler")
      .query({ "data.id": currentPayloadId, type: "payment" })
      .set("Content-Type", "application/json")
      .set("x-signature", validSignature)
      .send(currentPayloadBase)
      .expect("Content-Type", /json/)
      .expect(200); 

    // 5. Verifica resposta indicando falha interna
    expect(res.body.received).toBe(true);
    expect(res.body.processed).toBe(false); 
    expect(res.body.error).toContain(
      `Internal processing error: Falha simulada`
    );

    expect(_mockPaymentGet).toHaveBeenCalledTimes(1);

    // 6. Verifica se o pedido NÃO foi alterado
    const dbOrder = await Order.findById(testOrderFail._id);
    expect(dbOrder.orderStatus).toBe("pending_payment");
  });

  it("deve retornar 200 OK (sem erro, não processado) se o status do pedido não for atualizável", async () => {
    // 1. Cria pedido já entregue
    const orderDataDelivered = {
      user: baseUserId,
      orderItems: [
        {
          productId: productIdWebhook,
          name: "Prod WH Delivered",
          quantity: 1,
          price: 50,
          image: "whd.jpg",
        },
      ],
      shippingAddress: {
        street: "WHD St",
        number: "4",
        neighborhood: "WHD",
        city: "WHD",
        state: "WD",
        postalCode: "44444-000",
        country: "WHD",
      },
      paymentMethod: "WebhookPayDelivered",
      itemsPrice: 50,
      shippingPrice: 0,
      totalPrice: 50,
      orderStatus: "delivered",
      mercadopagoPaymentId: paymentId,
    };
    const testOrderDelivered = await Order.create(orderDataDelivered);
    await Product.findByIdAndUpdate(productIdWebhook, { $inc: { stock: -1 } }); 

    // 2. Configura mock do MP 
    _mockPaymentGet.mockResolvedValueOnce({
      id: paymentId,
      status: "approved",
      external_reference: testOrderDelivered._id.toString(),
      date_last_updated: new Date().toISOString(),
    });

    // 3. Gera dados e assinatura válidos
    const currentTimestamp = Date.now();
    const currentPayloadId = paymentId;
    const currentPayloadBase = {
      type: "payment",
      action: "payment.updated",
      data: { id: currentPayloadId },
    };
    const validSignature = generateSignature(
      currentPayloadId,
      currentTimestamp,
      webhookSecret
    );

    // 4. Envia requisição
    const res = await requestInstance
      .post("/api/webhooks/handler")
      .query({ "data.id": currentPayloadId, type: "payment" })
      .set("Content-Type", "application/json")
      .set("x-signature", validSignature)
      .send(currentPayloadBase)
      .expect(200);

    // 5. Verifica resposta
    expect(res.body.received).toBe(true);
    expect(res.body.processed).toBe(false); 
    expect(res.body.message).toBe("Order status not updatable.");
    expect(_mockPaymentGet).toHaveBeenCalledTimes(1);

    // 6. Verifica que o pedido continua 'delivered'
    const dbOrder = await Order.findById(testOrderDelivered._id);
    expect(dbOrder.orderStatus).toBe("delivered");
  });
});
