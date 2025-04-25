// src/tests/webhooks.test.js
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import crypto from 'crypto';
import app from '../src/app.js';
import Order from '../src/models/Order.js';
import User from '../src/models/User.js';
import Category from '../src/models/Category.js';
import Product from '../src/models/Product.js';
import { _mockPaymentGet } from 'mercadopago';

// --- Mocking do Mercado Pago ---
jest.mock('mercadopago', () => {
    const mockPaymentGet = jest.fn();
    const MockPayment = jest.fn().mockImplementation(() => ({ get: mockPaymentGet }));
    const MockMercadoPagoConfig = jest.fn();
    return {
        MercadoPagoConfig: MockMercadoPagoConfig,
        Payment: MockPayment,
        __esModule: true,
        _mockPaymentGet: mockPaymentGet
    };
});


// --- Variáveis Globais ---
let mongoServer;
let testOrder;
let productIdWebhook;
let paymentId = 'PAYMENT_ID_WEBHOOK_TEST';
let webhookSecret = 'TEST_WEBHOOK_SECRET_123';

// --- Helper para gerar assinatura (simula o MP) ---
function generateSignature(payloadId, timestamp, secret) {
    const templateParts = [];
    templateParts.push(`id:${payloadId}`);
    templateParts.push(`ts:${timestamp}`);
    const template = templateParts.join(";");
    const hmac = crypto.createHmac('sha256', Buffer.from(secret, 'utf-8'));
    const signature = hmac.update(template, 'utf-8').digest('hex');
    return `ts=${timestamp},v1=${signature}`;
}

// --- Setup e Teardown ---
beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    await mongoose.connect(mongoUri);

    // Define o segredo no ambiente DESTE teste
    process.env.MP_WEBHOOK_SECRET = webhookSecret;
});

beforeEach(async () => {
    // Limpeza e Criação de Dados Base antes de CADA teste de webhook
    await User.deleteMany({});
    await Category.deleteMany({});
    await Product.deleteMany({});
    await Order.deleteMany({});
    _mockPaymentGet.mockClear();

    const category = await Category.create({ name: 'Cat Webhook Test' });
    const product = await Product.create({ name: 'Prod Webhook Test', price: 50, category: category._id, image: 'wh.jpg', stock: 5 });
    productIdWebhook = product._id;
    const user = await User.create({ name: 'Webhook User Test', email: 'webhook@test.com', password: 'password123' });

    // Cria um pedido pendente com ID de pagamento conhecido
    const orderData = {
        user: user._id,
        orderItems: [{ productId: product._id, name: product.name, quantity: 1, price: product.price, image: product.image }],
        shippingAddress: { street: 'WH St', number: '1', neighborhood: 'WH', city: 'WH', state: 'WH', postalCode: '11111-000', country: 'WH' },
        paymentMethod: 'WebhookPay', itemsPrice: 50, shippingPrice: 0, totalPrice: 50,
        orderStatus: 'pending_payment',
        mercadopagoPaymentId: paymentId
    };
    testOrder = await Order.create(orderData);
    // Ajusta estoque como se o pedido tivesse sido criado
    await Product.findByIdAndUpdate(productIdWebhook, { $inc: { stock: -1 } });
});

afterAll(async () => {
    // Limpeza final
    await User.deleteMany({});
    await Category.deleteMany({});
    await Product.deleteMany({});
    await Order.deleteMany({});
    await mongoose.disconnect();
    await mongoServer.stop();
    delete process.env.MP_WEBHOOK_SECRET;
});

// --- Bloco de Testes para Webhook ---
describe('/api/webhooks/handler', () => {
    const paymentId = 'PAYMENT_ID_WEBHOOK_TEST';
    const webhookSecret = process.env.MP_WEBHOOK_SECRET;
    const timestamp = Date.now();


    // Função Helper (VERIFICAR LÓGICA COMPARANDO COM CONTROLLER)
    function generateSignature(payloadId, timestamp, secret) {
        const templateParts = [];
        templateParts.push(`id:${payloadId}`);
        templateParts.push(`ts:${timestamp}`);
        const template = templateParts.join(";");
        console.log(`[TESTE] generateSignature - Template: ${template}`);
        const hmac = crypto.createHmac('sha256', Buffer.from(secret, 'utf-8'));
        const signature = hmac.update(template, 'utf-8').digest('hex');
        console.log(`[TESTE] generateSignature - Calculada: ${signature}`);
        return `ts=${timestamp},v1=${signature}`;
    }

    it('deve retornar 400 se a assinatura X-Signature estiver faltando', async () => {
        const payloadBase = { type: "payment", action: "payment.updated", data: { id: paymentId } };
        const payloadBuffer = Buffer.from(JSON.stringify(payloadBase));
        const res = await request(app)
            .post('/api/webhooks/handler')
            .query({ 'data.id': paymentId, type: 'payment' })
            .set('Content-Type', 'application/json')
            .send(payloadBuffer)
            .expect('Content-Type', /json/)
            .expect(400);
        // Verifica o corpo JSON
        expect(res.body.status).toBe('fail');
        expect(res.body.message).toBe('Webhook Error: Header \'x-signature\' ausente.');
    });

    it('deve retornar 400 se a assinatura for inválida', async () => {
        const invalidSignature = `ts=${timestamp},v1=invalidsignaturehex`;
        await request(app)
            .post('/api/webhooks/handler')
            .query({ 'data.id': paymentId, type: 'payment' })
            .set('Content-Type', 'application/json')
            .set('x-signature', invalidSignature)
            .send(payloadBuffer)
            .expect('Content-Type', /json/)
            .expect(400)
    });

    it('deve processar webhook com assinatura válida e pagamento APROVADO', async () => {
        // Gera assinatura válida para o teste
        const currentTimestamp = Date.now();
        const payloadId = paymentId;
        const payloadBase = { type: "payment", action: "payment.updated", data: { id: payloadId } };
        const payloadBuffer = Buffer.from(JSON.stringify(payloadBase));
        const validSignature = generateSignature(paymentId, currentTimestamp, webhookSecret);

        // Configura o mock do MP para retornar 'approved' QUANDO BUSCADO
        _mockPaymentGet.mockResolvedValueOnce({
            id: paymentId, status: 'approved', external_reference: testOrder._id.toString(),
            date_last_updated: new Date().toISOString(), payer: { email: 'approve@webhook.test' },
            payment_method_id: 'visa', card: { last_four_digits: '4321' }
        });

        // Envia a requisição com assinatura válida e corpo como Buffer
        const res = await request(app)
            .post('/api/webhooks/handler')
            .query({ 'data.id': paymentId, type: 'payment' })
            .set('Content-Type', 'application/json')
            .set('x-signature', validSignature)
            .send(payloadBuffer)
            .expect('Content-Type', /json/)
            .expect(200);

        expect(res.body.received).toBe(true);
        // Verifica se a API do MP foi chamada para obter detalhes
        expect(_mockPaymentGet).toHaveBeenCalledTimes(1);
        expect(_mockPaymentGet).toHaveBeenCalledWith({ id: paymentId });

        // Verifica se o pedido foi atualizado no DB
        const dbOrder = await Order.findById(testOrder._id);
        expect(dbOrder.orderStatus).toBe('processing');
        expect(dbOrder.paidAt).toBeDefined();
        expect(dbOrder.paymentResult.status).toBe('approved');
        expect(dbOrder.paymentResult.card_last_four).toBe('4321');

        // Verifica se o estoque NÃO foi retornado
        const dbProduct = await Product.findById(productIdWebhook);
        expect(dbProduct.stock).toBe(4);
    });

    it('deve processar webhook com assinatura válida e pagamento REJEITADO e retornar estoque', async () => {
        const currentTimestamp = Date.now();
        const payloadBase = { type: "payment", action: "payment.updated", data: { id: paymentId } };
        const payloadBuffer = Buffer.from(JSON.stringify(payloadBase));
        const validSignature = generateSignature(paymentId, currentTimestamp, webhookSecret);

        // Configura mock para retornar 'rejected'
        _mockPaymentGet.mockResolvedValueOnce({
            id: paymentId, status: 'rejected', external_reference: testOrder._id.toString(),
            date_last_updated: new Date().toISOString(), payer: { email: 'reject@webhook.test' }
        });

        const res = await request(app)
            .post('/api/webhooks/handler')
            .query({ 'data.id': paymentId, type: 'payment' })
            .set('Content-Type', 'application/json')
            .set('x-signature', validSignature)
            .send(payloadBuffer)
            .expect('Content-Type', /json/)
            .expect(200);

        expect(res.body.received).toBe(true);
        expect(_mockPaymentGet).toHaveBeenCalledTimes(1);

        // Verifica se o pedido foi atualizado para 'failed'
        const dbOrder = await Order.findById(testOrder._id);
        expect(dbOrder.orderStatus).toBe('failed');
        expect(dbOrder.paidAt).toBeUndefined();
        expect(dbOrder.paymentResult.status).toBe('rejected');

        // Verifica se o estoque FOI retornado
        const dbProduct = await Product.findById(productIdWebhook);
        expect(dbProduct.stock).toBe(5);
    });

    it('deve retornar 200 OK (sem erro) se o pedido não for encontrado pela external_reference', async () => {
        const validSignature = generateSignature(paymentId, timestamp, webhookSecret);
        // Mock retorna uma external_reference que não existe no nosso DB
        _mockPaymentGet.mockResolvedValueOnce({
            id: paymentId, status: 'approved', external_reference: new mongoose.Types.ObjectId().toString(),
        });

        await request(app)
            .post('/api/webhooks/handler')
            .query({ 'data.id': paymentId, type: 'payment' })
            .set('Content-Type', 'application/json')
            .set('x-signature', validSignature)
            .send(payloadBuffer)
            .expect(200);
    });

    it('deve retornar 200 OK se o tipo de evento for ignorado (não "payment")', async () => {
        const otherTypeId = 'OTHER_ID_123';
        const otherTypePayload = { type: "merchant_order", data: { id: otherTypeId } };
        const otherTypeBuffer = Buffer.from(JSON.stringify(otherTypePayload));
        const signatureForOther = generateSignature(otherTypeId, timestamp, webhookSecret);

        await request(app)
            .post('/api/webhooks/handler')
            .query({ 'data.id': otherTypeId, type: 'merchant_order' })
            .set('Content-Type', 'application/json')
            .set('x-signature', signatureForOther)
            .send(otherTypeBuffer)
            .expect(200);

        expect(_mockPaymentGet).not.toHaveBeenCalled();
    });

    // Teste para simular falha interna APÓS a validação da assinatura
    it('deve retornar 200 OK (com erro interno) se a busca na API MP falhar', async () => {
        const currentTimestamp = Date.now();
        const payloadBase = { type: "payment", action: "payment.updated", data: { id: paymentId } };
        const payloadBuffer = Buffer.from(JSON.stringify(payloadBase));
        const validSignature = generateSignature(paymentId, currentTimestamp, webhookSecret);
        // Configura mock para REJEITAR a chamada ao MP
        _mockPaymentGet.mockRejectedValue(new Error('Falha simulada ao buscar MP API'));

        const res = await request(app)
            .post('/api/webhooks/handler')
            .query({ 'data.id': paymentId, type: 'payment' })
            .set('Content-Type', 'application/json')
            .set('x-signature', validSignature)
            .send(payloadBuffer)
            .expect('Content-Type', /json/)
            .expect(200);

        expect(res.body.received).toBe(true);
        expect(res.body.processed).toBe(false);
        expect(res.body.error).toContain("Internal processing error");
        expect(_mockPaymentGet).toHaveBeenCalledTimes(1);

        // Verifica se o pedido NÃO foi alterado
        const dbOrder = await Order.findById(testOrder._id);
        expect(dbOrder.orderStatus).toBe('pending_payment');
    });

}); 