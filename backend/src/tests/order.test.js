//src/tests/order.test.js
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import jwt from 'jsonwebtoken';
import app from '../app.js';
import Order from '../models/Order.js';
import Cart from '../models/Cart.js';
import Product from '../models/Product.js';
import Category from '../models/Category.js';
import User from '../models/User.js';
import Address from '../models/Address.js';

// Mock para teste com Mercado Pago
jest.mock('mercadopago', () => {
    const mockPaymentCreate = jest.fn();
    const mockPaymentGet = jest.fn();
    const MockPayment = jest.fn().mockImplementation(() => ({
        create: mockPaymentCreate,
        get: mockPaymentGet
    }));
    const MockMercadoPagoConfig = jest.fn();

    return {
        MercadoPagoConfig: MockMercadoPagoConfig,
        Payment: MockPayment,
        __esModule: true,
        _mockPaymentCreate: mockPaymentCreate,
        _mockPaymentGet: mockPaymentGet
    };
});

// Importa as funções mockadas individuais
import { _mockPaymentCreate, _mockPaymentGet } from 'mercadopago';

// --- Variáveis ---
let mongoServer;
let testUserToken;
let testUserId;
let adminUserToken;
let adminUserId;
let product1Id;
let product2Id;
let testCategoryId;
let userAddressId;

// --- Setup e Teardown ---
beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    await mongoose.connect(mongoUri);

    // Garantir JWT_SECRET
    if (!process.env.JWT_SECRET) {
        process.env.JWT_SECRET = 'test-secret-for-order-please-replace';
        console.warn('JWT_SECRET não definido, usando valor padrão para testes de order.');
    }

    // Limpar tudo antes de começar
    await User.deleteMany({});
    await Category.deleteMany({});
    await Product.deleteMany({});
    await Cart.deleteMany({});
    await Address.deleteMany({});
    await Order.deleteMany({});

    // Criar Categoria
    const category = await Category.create({ name: 'Categoria Pedidos' });
    testCategoryId = category._id;

    // Criar Usuário de Teste e Admin
    const userData = { name: 'Order User', email: 'order.user@test.com', password: 'password123' };
    const adminData = { name: 'Order Admin', email: 'order.admin@test.com', password: 'password123', role: 'admin' };
    const testUser = await User.create(userData);
    const adminUser = await User.create(adminData);
    testUserId = testUser._id;
    adminUserId = adminUser._id;
    testUserToken = jwt.sign({ id: testUserId, role: testUser.role }, process.env.JWT_SECRET, { expiresIn: '1h' });
    adminUserToken = jwt.sign({ id: adminUserId, role: adminUser.role }, process.env.JWT_SECRET, { expiresIn: '1h' });

    // Criar Produtos de Teste
    const prod1 = await Product.create({ name: 'Produto Pedido 1', price: 25.00, category: testCategoryId, image: 'order1.jpg', stock: 15 });
    const prod2 = await Product.create({ name: 'Produto Pedido 2', price: 100.00, category: testCategoryId, image: 'order2.jpg', stock: 3 });
    product1Id = prod1._id;
    product2Id = prod2._id;

    // Criar Endereço para o Usuário de Teste
    const address = await Address.create({
        user: testUserId,
        label: 'Casa Principal',
        street: 'Rua Pedido',
        number: '100',
        neighborhood: 'Bairro Ordem',
        city: 'Cidade Order',
        state: 'OR',
        postalCode: '98765-432',
        country: 'Orderland'
    });
    userAddressId = address._id;
});

beforeEach(async () => {
    // Limpar mocks antes de cada teste
    _mockPaymentCreate.mockClear();
    // Configurar retorno PADRÃO bem-sucedido para o mock do MP
    _mockPaymentCreate.mockResolvedValue({
        id: 1234567890,
        status: 'pending',
        date_created: new Date().toISOString(),
        date_last_updated: new Date().toISOString(),
        payment_method_id: 'visa',
        installments: 1,
        payer: { email: 'payer@test.com' },
        card: { last_four_digits: '1234' },
        external_reference: null,
    });
    // Limpar Carrinhos e Pedidos
    await Cart.deleteMany({});
    await Order.deleteMany({});
    // Resetar estoque
    await Product.findByIdAndUpdate(product1Id, { stock: 15 });
    await Product.findByIdAndUpdate(product2Id, { stock: 3 });
});


// --- Limpeza final ---
afterAll(async () => {
    await User.deleteMany({});
    await Category.deleteMany({});
    await Product.deleteMany({});
    await Cart.deleteMany({});
    await Address.deleteMany({});
    await Order.deleteMany({});
    await mongoose.disconnect();
    await mongoServer.stop();
});

// --- Bloco Principal de Testes para Pedidos ---
describe('/api/orders', () => {

    // --- Testes POST / ---
    describe('POST /', () => {
        beforeEach(async () => {
            // Garante limpeza do carrinho
            await Cart.deleteMany({ user: testUserId });
            // Garante que o usuário tenha um carrinho com itens antes de cada teste POST
            await Cart.create({
                user: testUserId, items: [
                    { product: product1Id, quantity: 2 },
                    { product: product2Id, quantity: 1 }
                ]
            });
            const cartCreated = await Cart.findOne({ user: testUserId });
        });


        it('deve criar um pedido com sucesso com carrinho e endereço válidos', async () => {
            const orderData = {
                shippingAddressId: userAddressId.toString(),
                paymentMethod: 'PIX Teste'
            };

            const res = await request(app)
                .post('/api/orders')
                .set('Authorization', `Bearer ${testUserToken}`)
                .send(orderData)
                .expect('Content-Type', /json/)
                .expect(201);

            expect(res.body.status).toBe('success');
            expect(res.body.data.order).toBeDefined();
            const order = res.body.data.order;

            // Verifica dados básicos
            expect(order.user.toString()).toBe(testUserId.toString());
            expect(order.paymentMethod).toBe(orderData.paymentMethod);
            expect(order.orderStatus).toBe('pending_payment');

            // Verifica endereço copiado
            expect(order.shippingAddress.street).toBe('Rua Pedido');
            expect(order.shippingAddress.city).toBe('Cidade Order');
            expect(order.shippingAddress.country).toBe('Orderland');

            // Verifica itens copiados
            expect(order.orderItems).toHaveLength(2);
            expect(order.orderItems[0].name).toBe('Produto Pedido 1');
            expect(order.orderItems[0].quantity).toBe(2);
            expect(order.orderItems[0].price).toBe(25.00);
            expect(order.orderItems[1].name).toBe('Produto Pedido 2');
            expect(order.orderItems[1].quantity).toBe(1);
            expect(order.orderItems[1].price).toBe(100.00);

            // Verifica totais calculados 
            const expectedItemsPrice = 150.00;
            const expectedShipping = 0.00;
            const expectedTotal = expectedItemsPrice + expectedShipping;
            expect(order.itemsPrice).toBeCloseTo(expectedItemsPrice);
            expect(order.shippingPrice).toBeCloseTo(expectedShipping);
            expect(order.totalPrice).toBeCloseTo(expectedTotal);

            // Verifica se o carrinho foi limpo no DB
            const dbCart = await Cart.findOne({ user: testUserId });
            expect(dbCart).not.toBeNull();
            expect(dbCart.items).toHaveLength(0);

            // Verifica se o estoque foi decrementado no DB
            const dbProd1 = await Product.findById(product1Id);
            const dbProd2 = await Product.findById(product2Id);
            expect(dbProd1.stock).toBe(13);
            expect(dbProd2.stock).toBe(2);
        });

        it('deve retornar erro 404 se o carrinho não existir', async () => {
            // Limpa o carrinho criado no beforeEach
            await Cart.deleteMany({ user: testUserId });

            const orderData = { shippingAddressId: userAddressId.toString(), paymentMethod: 'Sem Carrinho' };
            await request(app)
                .post('/api/orders')
                .set('Authorization', `Bearer ${testUserToken}`)
                .send(orderData)
                .expect(404);
        });

        it('deve retornar erro 400 se o carrinho estiver vazio', async () => {
            // Limpa o carrinho criado no beforeEach
            await Cart.findOneAndUpdate({ user: testUserId }, { items: [] });

            const orderData = {
                shippingAddressId: userAddressId.toString(),
                paymentMethod: 'Carrinho Vazio'
            };
            await request(app)
                .post('/api/orders')
                .set('Authorization', `Bearer ${testUserToken}`)
                .send(orderData)
                .expect(400);
        });

        it('deve retornar erro 400 se o endereço de entrega for inválido', async () => {
            const nonExistentAddressId = new mongoose.Types.ObjectId();
            const orderData = {
                shippingAddressId: nonExistentAddressId.toString(),
                paymentMethod: 'Endereço Inválido'
            };
            const res = await request(app)
                .post('/api/orders')
                .set('Authorization', `Bearer ${testUserToken}`)
                .send(orderData)
                .expect(400);
            expect(res.body.errors).toBeDefined();
        });

        it('deve retornar erro 400 se o estoque for insuficiente', async () => {
            // Atualiza o carrinho para pedir mais do que o estoque
            await Cart.findOneAndUpdate({ user: testUserId }, {
                items: [{ product: product1Id, quantity: 20 }]
            });

            const orderData = {
                shippingAddressId: userAddressId.toString(),
                paymentMethod: 'Sem Estoque'
            };
            const res = await request(app)
                .post('/api/orders')
                .set('Authorization', `Bearer ${testUserToken}`)
                .send(orderData)
                .expect(400);
            expect(res.body.message).toMatch(/Problemas de estoque: Estoque insuficiente para Produto Pedido 1 \(Disponível: 15, Solicitado: 20\)/i);

            // Verifica mensagem de erro específica
            expect(res.body.message).toContain('Problemas de estoque:');
            expect(res.body.message).toContain('Estoque insuficiente para Produto Pedido 1');
            expect(res.body.message).toContain('(Disponível: 15, Solicitado: 20)');

            // Garante que o estoque não foi alterado e carrinho não foi limpo
            const dbProd1 = await Product.findById(product1Id);
            const dbCart = await Cart.findOne({ user: testUserId });
            expect(dbProd1.stock).toBe(15);
            expect(dbCart.items).toHaveLength(1);
        });

        it('deve retornar 401 se não estiver autenticado', async () => {
            const orderData = {
                shippingAddressId: userAddressId.toString(),
                paymentMethod: 'Não Logado'
            };
            await request(app)
                .post('/api/orders')
                .send(orderData)
                .expect(401);
        });
    });

    // --- Testes GET /my ---
    describe('GET /my', () => {
        let order1, order2;

        beforeEach(async () => {
            // Criar dois pedidos para o usuário de teste
            const commonAddress = { street: 'Rua A', number: '1', neighborhood: 'A', city: 'A', state: 'AA', postalCode: '11111-111', country: 'A' };
            const orderData = {
                user: testUserId,
                orderItems: [{ productId: product1Id, name: 'Prod 1', quantity: 1, price: 25 }],
                shippingAddress: { street: 'Rua A', number: '1', neighborhood: 'A', city: 'A', state: 'AA', postalCode: '11111-111', country: 'A' },
                paymentMethod: 'Teste',
                itemsPrice: 25,
                shippingPrice: 5,
                totalPrice: 30,
                orderStatus: 'processing'
            };
            order1 = await Order.create(orderData);
            order2 = await Order.create({ ...orderData, totalPrice: 40, orderStatus: 'shipped' });
            await Order.create({ ...orderData, user: adminUserId });
        });

        it('deve retornar a lista de pedidos do usuário logado', async () => {
            const res = await request(app)
                .get('/api/orders/my')
                .set('Authorization', `Bearer ${testUserToken}`)
                .expect('Content-Type', /json/)
                .expect(200);

            expect(res.body.status).toBe('success');
            expect(res.body.results).toBe(2);
            expect(res.body.data.orders).toHaveLength(2);
            // Verifica se os IDs correspondem
            const orderIds = res.body.data.orders.map(o => o._id.toString());
            expect(orderIds).toEqual(expect.arrayContaining([order1._id.toString(), order2._id.toString()]));
        });

        it('deve retornar lista vazia se usuário não tiver pedidos', async () => {
            // Cria um usuário sem pedidos
            const newUser = await User.create({
                name: 'No Orders',
                email: 'noorders@test.com',
                password: 'password123'
            });
            const newToken = jwt.sign({ id: newUser._id, role: newUser.role }, process.env.JWT_SECRET);

            const res = await request(app)
                .get('/api/orders/my')
                .set('Authorization', `Bearer ${newToken}`)
                .expect(200);

            expect(res.body.results).toBe(0);
            expect(res.body.data.orders).toHaveLength(0);
        });

        it('deve retornar 401 se não estiver autenticado', async () => {
            await request(app)
                .get('/api/orders/my')
                .expect(401);
        });
    });

    // --- Testes GET /:id ---
    describe('GET /:id', () => {
        let userOrder;
        let adminOrder;

        beforeEach(async () => {
            const commonAddress = { street: 'A', number: '1', neighborhood: 'A', city: 'A', state: 'AA', postalCode: '11111-111', country: 'A' };
            const orderDataUser = { user: testUserId, orderItems: [], shippingAddress: commonAddress, paymentMethod: 'U', totalPrice: 10 };
            const orderDataAdmin = { user: adminUserId, orderItems: [], shippingAddress: commonAddress, paymentMethod: 'A', totalPrice: 20 };
            userOrder = await Order.create(orderDataUser);
            adminOrder = await Order.create(orderDataAdmin);
        });

        it('usuário deve obter seu próprio pedido por ID', async () => {
            const res = await request(app)
                .get(`/api/orders/${userOrder._id}`)
                .set('Authorization', `Bearer ${testUserToken}`)
                .expect('Content-Type', /json/)
                .expect(200);

            expect(res.body.status).toBe('success');
            expect(res.body.data.order._id.toString()).toBe(userOrder._id.toString());
            expect(res.body.data.order.user).toBeDefined();
            expect(res.body.data.order.user.name).toBe('Order User');
        });

        it('usuário NÃO deve obter pedido de outro usuário por ID (retorna 404)', async () => {
            await request(app)
                .get(`/api/orders/${adminOrder._id}`)
                .set('Authorization', `Bearer ${testUserToken}`)
                .expect(404);
        });

        it('admin deve obter qualquer pedido por ID', async () => {
            // Admin pegando pedido do usuário normal
            const res1 = await request(app)
                .get(`/api/orders/${userOrder._id}`)
                .set('Authorization', `Bearer ${adminUserToken}`)
                .expect(200);
            expect(res1.body.data.order._id.toString()).toBe(userOrder._id.toString());
            expect(res1.body.data.order.user.email).toBe('order.user@test.com');

            // Admin pegando seu próprio pedido
            const res2 = await request(app)
                .get(`/api/orders/${adminOrder._id}`)
                .set('Authorization', `Bearer ${adminUserToken}`)
                .expect(200);
            expect(res2.body.data.order._id.toString()).toBe(adminOrder._id.toString());
            expect(res2.body.data.order.user.email).toBe('order.admin@test.com');
        });

        it('deve retornar 404 se o ID do pedido não existir', async () => {
            const nonExistentId = new mongoose.Types.ObjectId();
            await request(app)
                .get(`/api/orders/${nonExistentId}`)
                .set('Authorization', `Bearer ${testUserToken}`)
                .expect(404);
        });

        it('deve retornar 400 se o ID do pedido for inválido', async () => {
            await request(app)
                .get('/api/orders/invalid-id')
                .set('Authorization', `Bearer ${testUserToken}`)
                .expect(400);
        });

        it('deve retornar 401 se não estiver autenticado', async () => {
            await request(app)
                .get(`/api/orders/${userOrder._id}`)
                .expect(401);
        });
    });

    // --- Testes POST /:id/pay ---
    describe('POST /:id/pay', () => {
        let testOrder;

        // Cria um pedido PENDENTE antes de cada teste deste bloco
        beforeEach(async () => {
            const orderData = {
                user: testUserId,
                orderItems: [{
                    productId: product1Id,
                    name: 'Prod 1 Pay',
                    quantity: 1,
                    price: 25,
                    image: 'p1.jpg'
                }],
                shippingAddress: {
                    label: 'P',
                    street: 'Pay St',
                    number: '1',
                    neighborhood: 'Pay',
                    city: 'Pay', state: 'PY',
                    postalCode: '11111-111',
                    country: 'Payland'
                },
                paymentMethod: 'visa',
                itemsPrice: 25,
                shippingPrice: 10,
                totalPrice: 35,
                orderStatus: 'pending_payment',
                installments: 1,
            };
            testOrder = await Order.create(orderData);
            // Resetar estoque que foi decrementado na criação do pedido
            await Product.findByIdAndUpdate(product1Id, { $inc: { stock: 1 } });
        });

        it('deve processar um pagamento com cartão simulado com sucesso (MP retorna approved)', async () => {
            // Configura mock para retornar 'approved'
            _mockPaymentCreate.mockResolvedValueOnce({
                id: 987654321,
                status: 'approved',
                date_last_updated: new Date().toISOString(),
                payer: { email: 'test@test.com' },
                payment_method_id: 'visa',
                card: { last_four_digits: '1234' },
                installments: 1,
                external_reference: testOrder._id.toString()
            });

            const paymentBody = {
                token: "valid_token",
                payment_method_id: "visa",
                installments: 1,
                payer: { email: "payer.approve@test.com" }
            };

            const res = await request(app)
                .post(`/api/orders/${testOrder._id}/pay`)
                .set('Authorization', `Bearer ${testUserToken}`)
                .send(paymentBody)
                .expect('Content-Type', /json/)
                .expect(200);

            expect(res.body.status).toBe('success');
            expect(res.body.message).toContain('Pagamento processado com status: approved');
            expect(res.body.data.order.orderStatus).toBe('processing');
            expect(res.body.data.order.paidAt).toBeDefined();
            expect(res.body.data.order.mercadopagoPaymentId).toBe('987654321');
            expect(_mockPaymentCreate).toHaveBeenCalledTimes(1);
            const dbProd1 = await Product.findById(product1Id);
            expect(dbProd1.stock).toBe(14);
        });

        it('deve marcar pedido como falho e retornar estoque se MP retornar rejected', async () => {
            // Configura mock para retornar 'rejected'
            _mockPaymentCreate.mockResolvedValueOnce({
                id: 111222333, status: 'rejected', date_last_updated: new Date().toISOString(),
                payer: { email: 'payer.reject@test.com' }, payment_method_id: 'master', card: null,
                installments: 1, external_reference: testOrder._id.toString()
            });

            const paymentBody = { token: "reject_token", payment_method_id: "master", installments: 1, payer: { email: "payer.reject@test.com" } };

            const res = await request(app)
                .post(`/api/orders/${testOrder._id}/pay`)
                .set('Authorization', `Bearer ${testUserToken}`)
                .send(paymentBody)
                .expect('Content-Type', /json/)
                .expect(200);

            expect(res.body.status).toBe('success');
            expect(res.body.message).toContain('Pagamento processado com status: rejected');
            expect(res.body.data.order.orderStatus).toBe('failed');
            expect(res.body.data.order.paidAt).toBeUndefined();
            expect(res.body.data.order.mercadopagoPaymentId).toBe('111222333');
            expect(res.body.data.order.paymentResult.status).toBe('rejected');
            expect(_mockPaymentCreate).toHaveBeenCalledTimes(1);

            // Verifica se o estoque FOI retornado
            const dbProd1 = await Product.findById(product1Id);
            expect(dbProd1.stock).toBe(15); // Voltou para 15
        });

        it('deve retornar 404 se o pedido não for encontrado', async () => {
            const nonExistentId = new mongoose.Types.ObjectId();
            const validBody = {
                token: "VALID_CARD_TOKEN_PLACEHOLDER",
                payment_method_id: "visa",
                installments: 1,
                payer: { email: "e" }
            };
            await request(app)
                .post(`/api/orders/${nonExistentId}/pay`)
                .set('Authorization', `Bearer ${testUserToken}`)
                .send(validBody)
                .expect(404);
            expect(_mockPaymentCreate).not.toHaveBeenCalled();
        });

        it('deve retornar 400 se o pedido não estiver pendente de pagamento', async () => {
            // Mudar status do pedido para 'processing'
            await Order.findByIdAndUpdate(testOrder._id, { orderStatus: 'processing' });

            const validBody = { token: "t", payment_method_id: "v", installments: 1, payer: { email: "e" } };

            await request(app)
                .post(`/api/orders/${testOrder._id}/pay`)
                .set('Authorization', `Bearer ${testUserToken}`)
                .send(validBody)
                .expect(400);
            expect(_mockPaymentCreate).not.toHaveBeenCalled();
        });

        it('deve retornar 400 se o pedido já tiver um ID de pagamento MP (lógica no payOrder)', async () => {
            // Adicionar um ID de pagamento ao pedido
            await Order.findByIdAndUpdate(testOrder._id, { mercadopagoPaymentId: 'EXISTING_MP_ID' });

            const validBody = {
                token: "t",
                payment_method_id: "v",
                installments: 1,
                payer: { email: "e" }
            };
            const res = await request(app)
                .post(`/api/orders/${testOrder._id}/pay`)
                .set('Authorization', `Bearer ${testUserToken}`)
                .send(validBody)
                .expect(400);
            expect(res.body).toBeDefined();
            expect(_mockPaymentCreate).not.toHaveBeenCalled();
        });

        it('deve retornar 500 (AppError) se o Mercado Pago retornar erro', async () => {
            // Configura o mock para REJEITAR a promessa
            const mpError = new Error('Erro de conexão simulado do MP');
            _mockPaymentCreate.mockRejectedValue(mpError);

            const validBody = {
                token: "VALID_CARD_TOKEN_PLACEHOLDER",
                payment_method_id: "visa",
                installments: 1,
                payer: { email: "test@test.com" }
            };
            await request(app)
                .post(`/api/orders/${testOrder._id}/pay`)
                .set('Authorization', `Bearer ${testUserToken}`)
                .send(validBody)
                .expect(500);
            expect(_mockPaymentCreate).toHaveBeenCalledTimes(1);
            const dbOrder = await Order.findById(testOrder._id);
            const dbProd1 = await Product.findById(product1Id);
            expect(dbOrder.orderStatus).toBe('pending_payment');
            expect(dbProd1.stock).toBe(14);
        });

        it('deve retornar 401 se não estiver autenticado', async () => {
            const validBody = { token: "t", payment_method_id: "v", installments: 1, payer: { email: "e" } };
            await request(app).post(`/api/orders/${testOrder._id}/pay`)
            await request(app)
                .post(`/api/orders/${testOrder._id}/pay`)
                .send(validBody)
                .expect(401);
        });
    });
});