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
import { _mockPaymentGet } from "mercadopago";
import { connectDB } from "../config/db.js";

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

// --- Variáveis Globais ---
let mongoServer;
let server;
let requestInstance;
let productIdWebhook;
let baseUserId;
let webhookSecret = "TEST_WEBHOOK_SECRET_123";
const paymentId = "PAYMENT_ID_WEBHOOK_TEST";

// --- Helper para gerar assinatura (simula o MP) ---
function generateSignature(payloadId, timestamp, secret) {
  const templateParts = [];
  templateParts.push(`id:${payloadId}`);
  templateParts.push(`ts:${timestamp}`);
  const template = templateParts.join(";");
  const hmac = crypto.createHmac("sha256", Buffer.from(secret, "utf-8"));
  const signature = hmac.update(template, "utf-8").digest("hex");
  return `ts=${timestamp},v1=${signature}`;
}

// --- Setup e Teardown ---
beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const mongoUri = mongoServer.getUri();
  process.env.MONGODB_URI = mongoUri;
  process.env.MP_WEBHOOK_SECRET = webhookSecret;
  process.env.PORT = 0;

  await connectDB();

  // Inicia o servidor HTTP real
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
  await new Promise((resolve) => server.close(resolve));
});

beforeEach(async () => {
  // Limpeza
  await User.deleteMany({});
  await Category.deleteMany({});
  await Product.deleteMany({});
  await Order.deleteMany({});
  jest.clearAllMocks();

  // Criação de dados base
  const category = await Category.create({
    name: "Cat Webhook Test",
  });

  const product = await Product.create({
    name: "Prod Webhook Test",
    price: 50,
    category: category._id,
    image: "wh.jpg",
    stock: 5,
  });

  productIdWebhook = product._id;

  const user = await User.create({
    name: "Webhook User Test",
    email: "webhook@test.com",
    password: "password123",
  });

  baseUserId = user._id;
});

// --- Bloco de Testes para Webhook ---
describe("/api/webhooks/handler", () => {
  const timestamp = Date.now();

  it("deve retornar 400 se a assinatura X-Signature estiver faltando", async () => {
   
    const currentPayloadId = paymentId;

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
    const invalidSignature = `ts=${timestamp},v1=invalidsignaturehex`;
    const currentPayloadId = paymentId;

    const currentPayloadBase = {
      type: "payment",
      action: "payment.updated",
      data: { id: currentPayloadId },
    };

    await requestInstance
      .post("/api/webhooks/handler")
      .query({ "data.id": currentPayloadId, type: "payment" })
      .set("Content-Type", "application/json")
      .set("x-signature", invalidSignature)
      .send(currentPayloadBase)
      .expect("Content-Type", /json/)
      .expect(400);
  });

  it("deve processar webhook com assinatura válida e pagamento APROVADO", async () => {
    // Cria um pedido pendente com ID de pagamento conhecido
    const currentUser = await User.findOne({ email: "webhook@test.com" });
    const currentProduct = await Product.findById(productIdWebhook);
    const orderDataApproved = {
      user: currentUser._id,
      orderItems: [
        {
          productId: currentProduct._id,
          name: currentProduct.name,
          quantity: 1,
          price: currentProduct.price,
          image: currentProduct.image,
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
      paymentMethod: "WebhookPay",
      itemsPrice: 50,
      shippingPrice: 0,
      totalPrice: 50,
      orderStatus: "pending_payment",
      mercadopagoPaymentId: paymentId,
    };

    const currentTestOrder = await Order.create(orderDataApproved);

    // Ajusta estoque
    await Product.findByIdAndUpdate(productIdWebhook, { $inc: { stock: -1 } });
    
    _mockPaymentGet.mockResolvedValueOnce({
      id: paymentId,
      status: "approved",
      external_reference: currentTestOrder._id.toString(),
      date_last_updated: new Date().toISOString(),
      payer: { email: "approve@webhook.test" },
      payment_method_id: "visa",
      card: { last_four_digits: "4321" },
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

    // Envia a requisição com assinatura válida e corpo como Buffer
    const res = await requestInstance
      .post("/api/webhooks/handler")
      .query({ "data.id": currentPayloadId, type: "payment" })
      .set("Content-Type", "application/json")
      .set("x-signature", validSignature)
      .send(currentPayloadBase)
      .expect("Content-Type", /json/)
      .expect(200);

    expect(res.body.received).toBe(true);
    expect(res.body.processed).toBe(true);

    // Verifica se a API do MP foi chamada para obter detalhes
    expect(_mockPaymentGet).toHaveBeenCalledTimes(1);
    expect(_mockPaymentGet).toHaveBeenCalledWith({ id: currentPayloadId });

    // Verifica se o pedido foi atualizado no DB
    const dbOrder = await Order.findById(currentTestOrder._id);
    expect(dbOrder).toBeDefined();
    expect(dbOrder.orderStatus).toBe("processing");
    expect(dbOrder.paidAt).toBeDefined();
    expect(dbOrder.paymentResult.status).toBe("approved");
    expect(dbOrder.paymentResult.card_last_four).toBe("4321");

    // Verifica se o estoque NÃO foi retornado
    const dbProduct = await Product.findById(productIdWebhook);
    expect(dbProduct.stock).toBe(4);
  });

  it("deve processar webhook com assinatura válida e pagamento REJEITADO e retornar estoque", async () => {
    const currentUser = await User.findOne({ email: "webhook@test.com" });
    const currentProduct = await Product.findById(productIdWebhook);
    const orderDataRejected = {
      user: currentUser._id,
      orderItems: [
        {
          productId: currentProduct._id,
          name: currentProduct.name,
          quantity: 1,
          price: currentProduct.price,
          image: currentProduct.image,
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
      paymentMethod: "WebhookPay",
      itemsPrice: 50,
      shippingPrice: 0,
      totalPrice: 50,
      orderStatus: "pending_payment",
      mercadopagoPaymentId: paymentId,
    };

    const currentTestOrder = await Order.create(orderDataRejected);

    await Product.findByIdAndUpdate(productIdWebhook, { $inc: { stock: -1 } });
    
    _mockPaymentGet.mockResolvedValueOnce({
      id: paymentId,
      status: "rejected",
      external_reference: currentTestOrder._id.toString(),
      date_last_updated: new Date().toISOString(),
      payer: { email: "reject@webhook.test" },
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
      .expect("Content-Type", /json/)
      .expect(200);

    expect(res.body.received).toBe(true);
    expect(res.body.processed).toBe(true);

    expect(_mockPaymentGet).toHaveBeenCalledTimes(1);

    // Verifica se o pedido foi atualizado para 'failed'
    const dbOrder = await Order.findById(currentTestOrder._id);
    expect(dbOrder).toBeDefined();
    expect(dbOrder.orderStatus).toBe("failed");
    expect(dbOrder.paidAt).toBeUndefined();
    expect(dbOrder.paymentResult.status).toBe("rejected");

    // Verifica se o estoque FOI retornado
    const dbProduct = await Product.findById(productIdWebhook);
    expect(dbProduct.stock).toBe(4);
  });

  it("deve retornar 200 OK (sem erro) se o pedido não for encontrado pela external_reference", async () => {
    // *** DEFINA O MOCK RESOLVE AQUI ***
    _mockPaymentGet.mockResolvedValueOnce({
      id: paymentId,
      status: "approved",
      external_reference: new mongoose.Types.ObjectId().toString(), // ID diferente
    });

    const payloadId = paymentId;

    const validSignature = generateSignature(
      payloadId,
      timestamp,
      webhookSecret
    );

    const payloadBase = {
      type: "payment",
      action: "payment.updated",
      data: { id: payloadId },
    };

    await requestInstance
      .post("/api/webhooks/handler")
      .query({ "data.id": payloadId, type: "payment" })
      .set("Content-Type", "application/json")
      .set("x-signature", validSignature)
      .send(payloadBase)
      .expect(200);
  });

  it('deve retornar 200 OK se o tipo de evento for ignorado (não "payment")', async () => {
    const otherTypeId = "OTHER_ID_123";

    const otherTypePayload = {
      type: "merchant_order",
      data: { id: otherTypeId },
    };

    const signatureForOther = generateSignature(
      otherTypeId,
      timestamp,
      webhookSecret
    );

    await requestInstance
      .post("/api/webhooks/handler")
      .query({ "data.id": otherTypeId, type: "merchant_order" })
      .set("Content-Type", "application/json")
      .set("x-signature", signatureForOther)
      .send(otherTypePayload)
      .expect(200);

    expect(_mockPaymentGet).not.toHaveBeenCalled();
  });

  it("deve retornar 200 OK (com erro interno) se a busca na API MP falhar", async () => {
    const mockError = new Error("Falha simulada ao buscar MP API");

    const currentUser = await User.findOne({ email: "webhook@test.com" });
    const currentProduct = await Product.findById(productIdWebhook);
    const orderDataRejected = {
      user: currentUser._id,
      orderItems: [
        {
          productId: currentProduct._id,
          name: currentProduct.name,
          quantity: 1,
          price: currentProduct.price,
          image: currentProduct.image,
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
      paymentMethod: "WebhookPay",
      itemsPrice: 50,
      shippingPrice: 0,
      totalPrice: 50,
      orderStatus: "pending_payment",
      mercadopagoPaymentId: paymentId,
    };

    const currentTestOrder = await Order.create(orderDataRejected);

    await Product.findByIdAndUpdate(productIdWebhook, { $inc: { stock: -1 } });
    
    _mockPaymentGet.mockRejectedValueOnce(mockError);

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
      .expect("Content-Type", /json/)
      .expect(200);

    expect(res.body.received).toBe(true);
    expect(res.body.processed).toBe(false);

    expect(res.body.error).toContain(
      `Internal processing error: ${mockError.message}`
    );

    expect(_mockPaymentGet).toHaveBeenCalledTimes(1);

    // Verifica se o pedido NÃO foi alterado
    const dbOrder = await Order.findById(currentTestOrder._id);
    expect(dbOrder.orderStatus).toBe("pending_payment");
  });
});
