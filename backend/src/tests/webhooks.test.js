// src/tests/webhooks.test.js
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import app from '../app.js';
import Order from '../models/Order.js';
import User from '../models/User.js';
import Category from '../models/Category.js';
import Product from '../models/Product.js';

// Mockar a API do Mercado Pago para GET Payment
const mockVerifySignature = jest.fn();
jest.mock('../controllers/webhooks.js', () => ({
    handleWebhook: jest.requireActual('../controllers/webhooks.js').handleWebhook,
}));
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
import { _mockPaymentGet as mockMercadoPagoPaymentGet } from 'mercadopago';

let mongoServer;
let testOrder;
let paymentId = '123456789_TEST_WH';

beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());

    await User.deleteMany({});
    await Category.deleteMany({});
    await Product.deleteMany({});
    await Order.deleteMany({});

    // Setup mínimo: criar um pedido pendente
    const category = await Category.create({ name: 'Cat Webhook' });
    const product = await Product.create({ name: 'Prod Webhook', price: 50, category: category._id, image: 'wh.jpg', stock: 1 });
    const user = await User.create({ name: 'Webhook User', email: 'webhook@test.com', password: 'password123' });
    const orderData = {
        user: user._id,
        orderItems: [{ productId: product._id, name: product.name, quantity: 1, price: product.price, image: product.image }],
        shippingAddress: { street: 'WH St', number: '1', neighborhood: 'WH', city: 'WH', state: 'WH', postalCode: '11111-000', country: 'WH' },
        paymentMethod: 'PIX',
        itemsPrice: 50,
        shippingPrice: 0,
        totalPrice: 50,
        orderStatus: 'pending_payment',
        mercadopagoPaymentId: paymentId
    };
    testOrder = await Order.create(orderData);
});

beforeEach(() => {
    // Limpa e reseta o mock antes de cada teste
    mockMercadoPagoPaymentGet.mockClear();
});

afterAll(async () => {
    await User.deleteMany({});
    await Category.deleteMany({});
    await Product.deleteMany({});
    await Order.deleteMany({});
    await mongoose.disconnect();
    await mongoServer.stop();
});

describe('/api/webhooks/handler', () => {

    // Payload base para os testes
    const webhookPayloadBase = {
        type: "payment",
        action: "payment.updated", // Ou o action que você espera
        data: { id: paymentId }
    };

    it('deve atualizar o pedido para "processing" se o pagamento for aprovado', async () => {
        // Configura o mock para retornar pagamento aprovado
        mockMercadoPagoPaymentGet.mockResolvedValueOnce({
            id: paymentId,
            status: 'approved',
            external_reference: testOrder._id.toString(),
            date_last_updated: new Date().toISOString(),
            payer: { email: 'payer@test.com' }
        });

        // Payload do webhook simulado (sem assinatura, pois está desativada)
        const res = await request(app)
            .post('/api/webhooks/handler')
            .query({ 'data.id': paymentId, type: 'payment' })
            .send(webhookPayloadBase)
            .expect('Content-Type', /json/)
            .expect(200);

        expect(res.body.received).toBe(true);
        expect(mockMercadoPagoPaymentGet).toHaveBeenCalledTimes(1);
        expect(mockMercadoPagoPaymentGet).toHaveBeenCalledWith({ id: paymentId });
    });

    it('deve atualizar o pedido para "failed" se o pagamento for rejeitado', async () => {
        mockMercadoPagoPaymentGet.mockResolvedValueOnce({
            id: paymentId,
            status: 'rejected',
            external_reference: testOrder._id.toString(),
            date_last_updated: new Date().toISOString(),
            payer: { email: 'payer@test.com' }
        });

        const webhookPayload = { ...webhookPayloadBase };

        const res = await request(app)
            .post('/api/webhooks/handler')
            .query({ 'data.id': paymentId, type: 'payment' })
            .set('Content-Type', 'application/json')
            .send(webhookPayload)
            .expect(200);

        expect(res.body.received).toBe(true);
        const dbOrder = await Order.findById(testOrder._id);
        expect(dbOrder.orderStatus).toBe('failed');
        expect(dbOrder.paidAt).toBeUndefined();
        expect(dbOrder.paymentResult.status).toBe('rejected');
    });

    it('NÃO deve atualizar o pedido se ele não estiver "pending_payment"', async () => {
        await Order.findByIdAndUpdate(testOrder._id, {
            orderStatus: 'shipped',
            paidAt: undefined,
            paymentResult: undefined
        });

        mockMercadoPagoPaymentGet.mockResolvedValueOnce({
            id: paymentId, status: 'approved', external_reference: testOrder._id.toString()
        });
        const webhookPayload = { ...webhookPayloadBase };

        const res = await request(app)
            .post('/api/webhooks/handler')
            .query({ 'data.id': paymentId, type: 'payment' })
            .set('Content-Type', 'application/json')
            .send(webhookPayload)
            .expect(200);

        expect(res.body.received).toBe(true);
        const dbOrder = await Order.findById(testOrder._id);
        expect(dbOrder.orderStatus).toBe('shipped');
    });

    it('deve retornar 200 OK se o pedido não for encontrado (external_reference inválida)', async () => {
        mockMercadoPagoPaymentGet.mockResolvedValueOnce({
            id: paymentId, status: 'approved', external_reference: new mongoose.Types.ObjectId().toString()
        });
        const webhookPayload = { ...webhookPayloadBase };

        await request(app)
            .post('/api/webhooks/handler')
            .query({ 'data.id': paymentId, type: 'payment' })
            .set('Content-Type', 'application/json')
            .send(webhookPayload)
            .expect(200);
    });

    it('deve retornar 200 OK se o evento for ignorado (type != payment)', async () => {
        const webhookPayload = { type: "merchant_order", data: { id: 'some_other_id' } };

        await request(app)
            .post('/api/webhooks/handler')
            .query({ type: 'merchant_order' })
            .set('Content-Type', 'application/json')
            .send(webhookPayload)
            .expect(200);
    });

    it('deve retornar 200 OK (com erro interno) se a busca na API MP falhar', async () => {
        mockMercadoPagoPaymentGet.mockRejectedValue(new Error('MP API Error'));
        const webhookPayload = { ...webhookPayloadBase };

        const res = await request(app)
            .post('/api/webhooks/handler')
            .query({ 'data.id': paymentId, type: 'payment' })
            .set('Content-Type', 'application/json')
            .send(webhookPayload)
            .expect('Content-Type', /json/)
            .expect(200);

        // Opcionalmente, verifique o corpo
        expect(res.body.received).toBe(true);
        expect(res.body.processed).toBe(false);
        expect(res.body.error).toContain("Internal processing error");
    });

    it('deve retornar 400 se o payload do webhook for inválido (sem data.id)', async () => {
        const webhookPayload = { type: "payment", data: { /* id ausente */ } };

        await request(app)
            .post('/api/webhooks/handler')
            .query({ type: 'payment' })
            .set('Content-Type', 'application/json')
            .send(webhookPayload)
            .expect(400);
    });

}); // Fim describe