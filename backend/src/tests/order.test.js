// src/tests/order.test.js
import request from "supertest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import jwt from "jsonwebtoken";
import app from "../app.js";
import Order from "../models/Order.js";
import Cart from "../models/Cart.js";
import Product from "../models/Product.js";
import Category from "../models/Category.js";
import User from "../models/User.js";
import Address from "../models/Address.js";

// Mock para teste com Mercado Pago
jest.mock("mercadopago", () => {
  const mockPaymentCreate = jest.fn();
  const mockPaymentGet = jest.fn();
  const MockPayment = jest.fn().mockImplementation(() => ({
    create: mockPaymentCreate,
    get: mockPaymentGet,
  }));
  const MockMercadoPagoConfig = jest.fn();

  // Exporta as mocks DENTRO do objeto retornado pelo jest.mock
  return {
    MercadoPagoConfig: MockMercadoPagoConfig,
    Payment: MockPayment,
    __esModule: true,
    _mockPaymentCreateInternal: mockPaymentCreate,
    _mockPaymentGetInternal: mockPaymentGet,
  };
});

// Acessa as mocks diretamente do módulo mockado usando require
const mercadopago = require("mercadopago");
const _mockPaymentCreate = mercadopago._mockPaymentCreateInternal;
const _mockPaymentGet = mercadopago._mockPaymentGetInternal;

// --- Variáveis Globais de Teste ---
let mongoServer;
let testUserToken, adminUserToken;
let testUserId, adminUserId;
let product1Id, product2Id;
let testCategoryId;
let userAddressId;
const initialStockProd1 = 15;
const initialStockProd2 = 3;

// --- Dados de Usuário Válidos para Teste ---
const testUserData = {
  name: "Order User",
  email: "order.user@test.com",
  password: "password123",
  cpf: "78090921035",
  birthDate: "1999-09-09",
};
const adminUserData = {
  name: "Order Admin",
  email: "order.admin@test.com",
  password: "password123",
  cpf: "97519502015",
  birthDate: "1980-01-01",
  role: "admin",
};

// --- Bloco de Setup e Teardown ---
beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const mongoUri = mongoServer.getUri();
  await mongoose.connect(mongoUri);

  // Garantir JWT_SECRET
  if (!process.env.JWT_SECRET) {
    process.env.JWT_SECRET = "test-secret-for-order-please-replace";
  }

  // Limpar tudo antes de começar
  await Promise.all([
    User.deleteMany({}),
    Category.deleteMany({}),
    Product.deleteMany({}),
    Cart.deleteMany({}),
    Address.deleteMany({}),
    Order.deleteMany({}),
  ]);

  // Criar Dados Essenciais
  const category = await Category.create({ name: "Categoria Pedidos Final" });
  testCategoryId = category._id;

  const [user, admin] = await Promise.all([
    User.create(testUserData),
    User.create(adminUserData),
  ]);
  testUserId = user._id;
  adminUserId = admin._id;

  testUserToken = jwt.sign(
    { id: testUserId, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: "1h" }
  );
  adminUserToken = jwt.sign(
    { id: adminUserId, role: admin.role },
    process.env.JWT_SECRET,
    { expiresIn: "1h" }
  );

  const address = await Address.create({
    user: testUserId,
    label: "Casa Final",
    street: "Rua Pedido",
    number: "100F",
    neighborhood: "Bairro Ordem",
    city: "Cidade Order",
    state: "OF",
    postalCode: "98765-432",
    country: "Orderland",
  });
  userAddressId = address._id;
});

beforeEach(async () => {
  // Limpeza antes de cada teste 'it'
  await Cart.deleteMany({ user: testUserId });
  await Order.deleteMany({}); // Limpa todos os pedidos para isolar testes de admin/user
  await Product.deleteMany({}); // Limpa todos os produtos

  // Recriando os produtos com estoque inicial
  const [prod1, prod2] = await Promise.all([
    Product.create({
      name: "Produto Pedido 1",
      price: 25.0,
      category: testCategoryId,
      image: "order1.jpg",
      stock: initialStockProd1,
    }),
    Product.create({
      name: "Produto Pedido 2",
      price: 100.0,
      category: testCategoryId,
      image: "order2.jpg",
      stock: initialStockProd2,
    }),
  ]);
  product1Id = prod1._id;
  product2Id = prod2._id;

  // Limpa e reseta mocks
  jest.clearAllMocks();

  // Define um mock padrão de sucesso para create (pode ser sobrescrito nos testes)
  _mockPaymentCreate.mockResolvedValue({
    id: 1234567890,
    status: "pending",
    date_created: new Date().toISOString(),
    date_last_updated: new Date().toISOString(),
    payment_method_id: "visa",
    installments: 1,
    payer: { email: "payer@test.com" },
    card: { last_four_digits: "1234" },
    transaction_details: {
      net_received_amount: 34.0,
      total_paid_amount: 35.0,
      installment_amount: 35.0,
    },
    point_of_interaction: {
      transaction_data: {
        qr_code_base64: "BASE64_EXAMPLE",
        qr_code: "PIX_KEY_EXAMPLE",
      },
    },
    external_reference: null,
  });
});

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
describe("/api/orders", () => {
  // --- Testes POST / ---
  describe("POST /", () => {
    beforeEach(async () => {
      await Cart.create({
        user: testUserId,
        items: [
          { product: product1Id, quantity: 2 },
          { product: product2Id, quantity: 1 },
        ],
      });
    });

    it("deve criar um pedido com sucesso com carrinho e endereço válidos", async () => {
      const orderData = {
        shippingAddressId: userAddressId.toString(),
        paymentMethod: "PIX Teste",
      };

      const res = await request(app)
        .post("/api/orders")
        .set("Authorization", `Bearer ${testUserToken}`)
        .send(orderData)
        .expect("Content-Type", /json/)
        .expect(201);

      expect(res.body.status).toBe("success");
      expect(res.body.data.order).toBeDefined();
      const order = res.body.data.order;

      expect(order.user.toString()).toBe(testUserId.toString());
      expect(order.paymentMethod).toBe(orderData.paymentMethod);
      expect(order.orderStatus).toBe("pending_payment");
      expect(order.shippingAddress.street).toBe("Rua Pedido");
      expect(order.shippingAddress.city).toBe("Cidade Order");
      expect(order.shippingAddress.country).toBe("Orderland");
      expect(order.orderItems).toHaveLength(2);
      const item1 = order.orderItems.find(
        (item) => item.productId === product1Id.toString()
      );
      const item2 = order.orderItems.find(
        (item) => item.productId === product2Id.toString()
      );
      expect(item1).toBeDefined();
      expect(item1.name).toBe("Produto Pedido 1");
      expect(item1.quantity).toBe(2);
      expect(item1.price).toBe(25.0);
      expect(item2).toBeDefined();
      expect(item2.name).toBe("Produto Pedido 2");
      expect(item2.quantity).toBe(1);
      expect(item2.price).toBe(100.0);
      const expectedItemsPrice = 150.0;
      const expectedShipping = 0.0;
      const expectedTotal = expectedItemsPrice + expectedShipping;
      expect(order.itemsPrice).toBeCloseTo(expectedItemsPrice);
      expect(order.shippingPrice).toBeCloseTo(expectedShipping);
      expect(order.totalPrice).toBeCloseTo(expectedTotal);

      const dbCart = await Cart.findOne({ user: testUserId });
      expect(dbCart).not.toBeNull();
      expect(dbCart.items).toHaveLength(0);

      const dbProd1 = await Product.findById(product1Id);
      const dbProd2 = await Product.findById(product2Id);
      expect(dbProd1.stock).toBe(initialStockProd1 - 2);
      expect(dbProd2.stock).toBe(initialStockProd2 - 1);
    });

    it("deve calcular frete se itemsPrice <= 100", async () => {
      await Cart.findOneAndUpdate(
        { user: testUserId },
        {
          $set: { items: [{ product: product1Id, quantity: 1 }] }, // itemsPrice = 25
        },
        { upsert: true, new: true }
      );

      const orderData = {
        shippingAddressId: userAddressId.toString(),
        paymentMethod: "Frete Teste",
      };

      const res = await request(app)
        .post("/api/orders")
        .set("Authorization", `Bearer ${testUserToken}`)
        .send(orderData)
        .expect(201);

      const order = res.body.data.order;
      const expectedItemsPrice = 25.0;
      const expectedShipping = 10.0; // Deve cobrar frete
      const expectedTotal = expectedItemsPrice + expectedShipping;
      expect(order.itemsPrice).toBeCloseTo(expectedItemsPrice);
      expect(order.shippingPrice).toBeCloseTo(expectedShipping);
      expect(order.totalPrice).toBeCloseTo(expectedTotal);
    });

    it("deve retornar erro 404 se o carrinho não existir", async () => {
      await Cart.deleteMany({ user: testUserId });
      const orderData = {
        shippingAddressId: userAddressId.toString(),
        paymentMethod: "Sem Carrinho",
      };
      const res = await request(app)
        .post("/api/orders")
        .set("Authorization", `Bearer ${testUserToken}`)
        .send(orderData)
        .expect(404);
      expect(res.body.message).toMatch(/Carrinho não encontrado/i);
    });

    it("deve retornar erro 400 se o carrinho estiver vazio", async () => {
      await Cart.findOneAndUpdate({ user: testUserId }, { items: [] });
      const orderData = {
        shippingAddressId: userAddressId.toString(),
        paymentMethod: "Carrinho Vazio",
      };
      const res = await request(app)
        .post("/api/orders")
        .set("Authorization", `Bearer ${testUserToken}`)
        .send(orderData)
        .expect(400);
      expect(res.body.message).toMatch(/Seu carrinho está vazio/i);
    });

    it("deve retornar erro 400 se o endereço de entrega for inválido ou não pertencer ao usuário", async () => {
      const nonExistentAddressId = new mongoose.Types.ObjectId();
      const orderData = {
        shippingAddressId: nonExistentAddressId.toString(),
        paymentMethod: "Endereço Inválido",
      };
      const res = await request(app)
        .post("/api/orders")
        .set("Authorization", `Bearer ${testUserToken}`)
        .send(orderData)
        .expect(400);
      expect(res.body.errors).toBeInstanceOf(Array);
      expect(res.body.errors[0].path).toBe("shippingAddressId");
      expect(res.body.errors[0].msg).toMatch(/Endereço de entrega inválido/i);
    });

    it("deve retornar erro 400 se o estoque for insuficiente para um dos itens", async () => {
      await Cart.findOneAndUpdate(
        { user: testUserId },
        {
          items: [
            { product: product1Id, quantity: initialStockProd1 + 1 },
            { product: product2Id, quantity: 1 },
          ],
        }
      );
      const orderData = {
        shippingAddressId: userAddressId.toString(),
        paymentMethod: "Sem Estoque",
      };

      const res = await request(app)
        .post("/api/orders")
        .set("Authorization", `Bearer ${testUserToken}`)
        .send(orderData)
        .expect(400);

      expect(res.body.message).toMatch(/Problemas de estoque:/i);
      expect(res.body.message).toMatch(
        /Estoque insuficiente para Produto Pedido 1/i
      );
      expect(res.body.message).toMatch(
        `(Disponível: ${initialStockProd1}, Solicitado: ${
          initialStockProd1 + 1
        })`
      );

      const dbProd1 = await Product.findById(product1Id);
      const dbProd2 = await Product.findById(product2Id);
      expect(dbProd1.stock).toBe(initialStockProd1);
      expect(dbProd2.stock).toBe(initialStockProd2);
      const dbCart = await Cart.findOne({ user: testUserId });
      expect(dbCart.items.length).toBeGreaterThan(0);
    });

    it("deve retornar erro 400 se o estoque for insuficiente para MÚLTIPLOS itens", async () => {
      await Cart.findOneAndUpdate(
        { user: testUserId },
        {
          items: [
            { product: product1Id, quantity: initialStockProd1 + 1 },
            { product: product2Id, quantity: initialStockProd2 + 1 },
          ],
        }
      );
      const orderData = {
        shippingAddressId: userAddressId.toString(),
        paymentMethod: "Multi Sem Estoque",
      };

      const res = await request(app)
        .post("/api/orders")
        .set("Authorization", `Bearer ${testUserToken}`)
        .send(orderData)
        .expect(400);

      expect(res.body.message).toMatch(/Problemas de estoque:/i);
      expect(res.body.message).toMatch(
        /Estoque insuficiente para Produto Pedido 1/i
      );
      expect(res.body.message).toMatch(
        /Estoque insuficiente para Produto Pedido 2/i
      );
      expect(res.body.message).toMatch(
        `(Disponível: ${initialStockProd1}, Solicitado: ${
          initialStockProd1 + 1
        })`
      );
      expect(res.body.message).toMatch(
        `(Disponível: ${initialStockProd2}, Solicitado: ${
          initialStockProd2 + 1
        })`
      );
    });

    it("deve retornar 401 se não estiver autenticado", async () => {
      const orderData = {
        shippingAddressId: userAddressId.toString(),
        paymentMethod: "Não Logado",
      };
      await request(app).post("/api/orders").send(orderData).expect(401);
    });
  });

  // --- Testes GET /my ---
  describe("GET /my", () => {
    let order1, order2;

    beforeEach(async () => {
      const commonAddress = {
        street: "Rua A",
        number: "1",
        neighborhood: "A",
        city: "A",
        state: "AA",
        postalCode: "11111-111",
        country: "A",
      };
      const orderData = {
        user: testUserId,
        orderItems: [
          {
            productId: product1Id,
            name: "Prod 1",
            quantity: 1,
            price: 25,
            image: "p1.jpg",
          },
        ],
        shippingAddress: commonAddress,
        paymentMethod: "Teste",
        itemsPrice: 25,
        shippingPrice: 5,
        totalPrice: 30,
        orderStatus: "processing",
      };
      order1 = await Order.create(orderData);
      await new Promise((res) => setTimeout(res, 10));
      order2 = await Order.create({
        ...orderData,
        totalPrice: 40,
        orderStatus: "shipped",
      });
      await Order.create({ ...orderData, user: adminUserId });
    });

    it("deve retornar a lista de pedidos do usuário logado (mais recentes primeiro)", async () => {
      const res = await request(app)
        .get("/api/orders/my")
        .set("Authorization", `Bearer ${testUserToken}`)
        .expect("Content-Type", /json/)
        .expect(200);

      expect(res.body.status).toBe("success");
      expect(res.body.results).toBe(2);
      expect(res.body.data.orders).toHaveLength(2);
      const orderIds = res.body.data.orders.map((o) => o._id.toString());
      expect(orderIds[0]).toBe(order2._id.toString());
      expect(orderIds[1]).toBe(order1._id.toString());
    });

    it("deve retornar lista vazia se usuário não tiver pedidos", async () => {
      const newUser = await User.create({
        name: "No Orders",
        email: "noorders@test.com",
        password: "password123",
        cpf: "10101010101",
        birthDate: "2000-01-01",
      });
      const newToken = jwt.sign(
        { id: newUser._id, role: newUser.role },
        process.env.JWT_SECRET
      );

      const res = await request(app)
        .get("/api/orders/my")
        .set("Authorization", `Bearer ${newToken}`)
        .expect(200);

      expect(res.body.results).toBe(0);
      expect(res.body.data.orders).toHaveLength(0);
    });

    it("deve retornar 401 se não estiver autenticado", async () => {
      await request(app).get("/api/orders/my").expect(401);
    });
  });

  // --- Testes GET /:id ---
  describe("GET /:id", () => {
    let userOrder;
    let adminOrder;

    beforeEach(async () => {
      const commonAddress = {
        street: "A",
        number: "1",
        neighborhood: "A",
        city: "A",
        state: "AA",
        postalCode: "11111-111",
        country: "A",
      };
      const orderDataUser = {
        user: testUserId,
        orderItems: [],
        shippingAddress: commonAddress,
        paymentMethod: "U",
        totalPrice: 10,
      };
      const orderDataAdmin = {
        user: adminUserId,
        orderItems: [],
        shippingAddress: commonAddress,
        paymentMethod: "A",
        totalPrice: 20,
      };
      userOrder = await Order.create(orderDataUser);
      adminOrder = await Order.create(orderDataAdmin);
    });

    it("usuário deve obter seu próprio pedido por ID com dados do usuário populados", async () => {
      const res = await request(app)
        .get(`/api/orders/${userOrder._id}`)
        .set("Authorization", `Bearer ${testUserToken}`)
        .expect("Content-Type", /json/)
        .expect(200);

      expect(res.body.status).toBe("success");
      expect(res.body.data.order._id.toString()).toBe(userOrder._id.toString());
      expect(res.body.data.order.user).toBeDefined();
      expect(res.body.data.order.user._id.toString()).toBe(
        testUserId.toString()
      );
      expect(res.body.data.order.user.name).toBe(testUserData.name);
      expect(res.body.data.order.user.email).toBe(testUserData.email);
    });

    it("usuário NÃO deve obter pedido de outro usuário por ID (retorna 404)", async () => {
      const res = await request(app)
        .get(`/api/orders/${adminOrder._id}`)
        .set("Authorization", `Bearer ${testUserToken}`)
        .expect(404);
      expect(res.body.message).toMatch(/Pedido não encontrado/i);
    });

    it("admin deve obter qualquer pedido por ID com dados do usuário populados", async () => {
      const res1 = await request(app)
        .get(`/api/orders/${userOrder._id}`)
        .set("Authorization", `Bearer ${adminUserToken}`)
        .expect(200);
      expect(res1.body.data.order._id.toString()).toBe(
        userOrder._id.toString()
      );
      expect(res1.body.data.order.user).toBeDefined();
      expect(res1.body.data.order.user.email).toBe(testUserData.email);

      const res2 = await request(app)
        .get(`/api/orders/${adminOrder._id}`)
        .set("Authorization", `Bearer ${adminUserToken}`)
        .expect(200);
      expect(res2.body.data.order._id.toString()).toBe(
        adminOrder._id.toString()
      );
      expect(res2.body.data.order.user).toBeDefined();
      expect(res2.body.data.order.user.email).toBe(adminUserData.email);
    });

    it("deve retornar 404 se o ID do pedido não existir", async () => {
      const nonExistentId = new mongoose.Types.ObjectId();
      const res = await request(app)
        .get(`/api/orders/${nonExistentId}`)
        .set("Authorization", `Bearer ${testUserToken}`)
        .expect(404);
      expect(res.body.message).toMatch(/Pedido não encontrado/i);
    });

    it("deve retornar 400 se o ID do pedido for inválido", async () => {
      const res = await request(app)
        .get("/api/orders/invalid-id")
        .set("Authorization", `Bearer ${testUserToken}`)
        .expect(400);
      expect(res.body.errors).toBeInstanceOf(Array);
      expect(res.body.errors[0].msg).toMatch(/ID do pedido inválido/i);
    });

    it("deve retornar 401 se não estiver autenticado", async () => {
      await request(app).get(`/api/orders/${userOrder._id}`).expect(401);
    });
  });

  // --- Testes POST /:id/pay ---
  describe("POST /:id/pay", () => {
    let testOrder;
    const quantityInOrder = 1;
    let expectedStockAfterCreation;

    beforeEach(async () => {
      await Product.findByIdAndUpdate(product1Id, { stock: initialStockProd1 });
      await Product.findByIdAndUpdate(product2Id, { stock: initialStockProd2 });

      const orderData = {
        user: testUserId,
        orderItems: [
          {
            productId: product1Id,
            name: "Prod 1 Pay",
            quantity: quantityInOrder,
            price: 25,
            image: "p1.jpg",
          },
          {
            productId: product2Id,
            name: "Prod 2 Pay",
            quantity: 1,
            price: 100,
            image: "p2.jpg",
          },
        ],
        shippingAddress: {
          label: "P",
          street: "Pay St",
          number: "1",
          neighborhood: "Pay",
          city: "Pay",
          state: "PY",
          postalCode: "11111-111",
          country: "Payland",
        },
        paymentMethod: "visa",
        itemsPrice: 125,
        shippingPrice: 0,
        totalPrice: 125,
        orderStatus: "pending_payment",
        installments: 1,
      };
      testOrder = await Order.create(orderData);

      await Product.findByIdAndUpdate(product1Id, {
        $inc: { stock: -quantityInOrder },
      });
      await Product.findByIdAndUpdate(product2Id, { $inc: { stock: -1 } });

      expectedStockAfterCreation = initialStockProd1 - quantityInOrder;
      const prod1Check = await Product.findById(product1Id);
      if (prod1Check.stock !== expectedStockAfterCreation) {
        throw new Error("Falha no setup do estoque");
      }
    });

    it("deve processar um pagamento com sucesso (MP retorna approved)", async () => {
      _mockPaymentCreate.mockResolvedValueOnce({
        id: 987654321,
        status: "approved",
        date_last_updated: new Date().toISOString(),
        payer: { email: "payer.approve@test.com" },
        payment_method_id: "visa",
        card: { last_four_digits: "1234" },
        installments: 1,
        external_reference: testOrder._id.toString(),
      });

      const paymentBody = {
        token: "valid_token",
        payment_method_id: "visa",
        installments: 1,
        payer: { email: "payer.approve@test.com" },
      };

      const res = await request(app)
        .post(`/api/orders/${testOrder._id}/pay`)
        .set("Authorization", `Bearer ${testUserToken}`)
        .send(paymentBody)
        .expect("Content-Type", /json/)
        .expect(200);

      expect(res.body.status).toBe("success");
      expect(res.body.message).toContain(
        "Pagamento processado com status inicial: approved"
      );
      expect(res.body.data.order.orderStatus).toBe("processing");
      expect(res.body.data.order.paidAt).toBeDefined();
      expect(res.body.data.order.mercadopagoPaymentId).toBe("987654321");
      expect(res.body.data.order.paymentResult.status).toBe("approved");
      expect(_mockPaymentCreate).toHaveBeenCalledTimes(1);
      expect(_mockPaymentCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.objectContaining({
            transaction_amount: testOrder.totalPrice,
            token: paymentBody.token,
            external_reference: testOrder._id.toString(),
          }),
        })
      );

      const stockAfterPaySuccess = await Product.findById(product1Id);
      expect(stockAfterPaySuccess.stock).toBe(expectedStockAfterCreation);
    });

    it("deve marcar pedido como falho e retornar estoque se MP retornar rejected", async () => {
      const stockProd1Before = (await Product.findById(product1Id)).stock;
      const stockProd2Before = (await Product.findById(product2Id)).stock;
      const orderItem1Qty = testOrder.orderItems.find((i) =>
        i.productId.equals(product1Id)
      ).quantity;
      const orderItem2Qty = testOrder.orderItems.find((i) =>
        i.productId.equals(product2Id)
      ).quantity;

      _mockPaymentCreate.mockResolvedValueOnce({
        id: 111222333,
        status: "rejected",
        date_last_updated: new Date().toISOString(),
        payer: { email: "payer.reject@test.com" },
        payment_method_id: "master",
        card: null,
        installments: 1,
        external_reference: testOrder._id.toString(),
      });

      const paymentBody = {
        token: "reject_token",
        payment_method_id: "master",
        installments: 1,
        payer: { email: "payer.reject@test.com" },
      };

      const res = await request(app)
        .post(`/api/orders/${testOrder._id}/pay`)
        .set("Authorization", `Bearer ${testUserToken}`)
        .send(paymentBody)
        .expect("Content-Type", /json/)
        .expect(200);

      expect(res.body.status).toBe("success");
      expect(res.body.message).toContain(
        "Pagamento processado com status inicial: rejected"
      );
      expect(res.body.data.order.orderStatus).toBe("failed");
      expect(res.body.data.order.paidAt).toBeUndefined();
      expect(res.body.data.order.mercadopagoPaymentId).toBe("111222333");
      expect(res.body.data.order.paymentResult.status).toBe("rejected");
      expect(_mockPaymentCreate).toHaveBeenCalledTimes(1);

      const stockProd1After = (await Product.findById(product1Id)).stock;
      const stockProd2After = (await Product.findById(product2Id)).stock;
      expect(stockProd1After).toBe(stockProd1Before + orderItem1Qty);
      expect(stockProd2After).toBe(stockProd2Before + orderItem2Qty);
    });

    it("deve retornar erro 400 se o corpo do pagamento for inválido (ex: sem payer.email)", async () => {
      const invalidPaymentBody = {
        token: "some_token",
        payment_method_id: "visa",
        installments: 1,
        payer: {
          /* email: "missing@test.com" */
        },
      };

      const res = await request(app)
        .post(`/api/orders/${testOrder._id}/pay`)
        .set("Authorization", `Bearer ${testUserToken}`)
        .send(invalidPaymentBody)
        .expect(400);

      expect(res.body.errors).toBeInstanceOf(Array);
      expect(res.body.errors[0].path).toBe("payer.email");
      expect(_mockPaymentCreate).not.toHaveBeenCalled();
    });

    it("deve retornar 400 se o Mercado Pago retornar erro na chamada (erro de validação/negócio do MP)", async () => {
      const mpClientError = new Error("invalid card token");
      mpClientError.statusCode = 400;
      _mockPaymentCreate.mockRejectedValueOnce(mpClientError);

      const paymentBody = {
        token: "invalid_token",
        payment_method_id: "visa",
        installments: 1,
        payer: { email: "test@test.com" },
      };

      const res = await request(app)
        .post(`/api/orders/${testOrder._id}/pay`)
        .set("Authorization", `Bearer ${testUserToken}`)
        .send(paymentBody)
        .expect("Content-Type", /json/)
        .expect(400);

      expect(res.body.message).toMatch(
        /Erro do Gateway de Pagamento: invalid card token/i
      );
      expect(_mockPaymentCreate).toHaveBeenCalledTimes(1);

      const dbOrder = await Order.findById(testOrder._id);
      expect(dbOrder.orderStatus).toBe("pending_payment");
      const stockAfterPayMpError = await Product.findById(product1Id);
      expect(stockAfterPayMpError.stock).toBe(expectedStockAfterCreation);
    });

    it("deve retornar 500 se ocorrer um erro interno inesperado após a chamada ao MP", async () => {
      _mockPaymentCreate.mockResolvedValueOnce({
        id: 12345,
        status: "approved",
        external_reference: testOrder._id.toString(),
        date_last_updated: new Date().toISOString(),
        payer: { email: "test@test.com" },
        payment_method_id: "visa",
        card: { last_four_digits: "1234" },
        installments: 1,
      });

      const saveMock = jest
        .spyOn(Order.prototype, "save")
        .mockRejectedValueOnce(new Error("DB connection lost"));

      const paymentBody = {
        token: "ok_token",
        payment_method_id: "visa",
        installments: 1,
        payer: { email: "test@test.com" },
      };

      const res = await request(app)
        .post(`/api/orders/${testOrder._id}/pay`)
        .set("Authorization", `Bearer ${testUserToken}`)
        .send(paymentBody)
        .expect(500);

      expect(res.body.message).toMatch(
        /Falha interna ao processar o pagamento/i
      );
      expect(_mockPaymentCreate).toHaveBeenCalledTimes(1);
      const stockAfterPayInternalError = await Product.findById(product1Id);
      expect(stockAfterPayInternalError.stock).toBe(expectedStockAfterCreation);

      saveMock.mockRestore();
    });

    it("deve retornar 401 se não estiver autenticado", async () => {
      const paymentBody = {
        token: "any_token",
        payment_method_id: "visa",
        installments: 1,
        payer: { email: "test@test.com" },
      };
      await request(app)
        .post(`/api/orders/${testOrder._id}/pay`)
        .send(paymentBody)
        .expect(401);
      expect(_mockPaymentCreate).not.toHaveBeenCalled();
    });

    it("deve retornar 404 se o pedido não for encontrado", async () => {
      const nonExistentId = new mongoose.Types.ObjectId();
      const paymentBody = {
        token: "any_token",
        payment_method_id: "visa",
        installments: 1,
        payer: { email: "test@test.com" },
      };

      const res = await request(app)
        .post(`/api/orders/${nonExistentId}/pay`)
        .set("Authorization", `Bearer ${testUserToken}`)
        .send(paymentBody)
        .expect(404);
      expect(res.body.message).toMatch(/Pedido não encontrado/i);
      expect(_mockPaymentCreate).not.toHaveBeenCalled();
    });

    it("deve retornar 400 se o pedido não estiver pendente de pagamento", async () => {
      await Order.findByIdAndUpdate(testOrder._id, {
        orderStatus: "processing",
        paidAt: new Date(),
      });
      const paymentBody = {
        token: "any_token",
        payment_method_id: "visa",
        installments: 1,
        payer: { email: "test@test.com" },
      };

      const res = await request(app)
        .post(`/api/orders/${testOrder._id}/pay`)
        .set("Authorization", `Bearer ${testUserToken}`)
        .send(paymentBody)
        .expect(400);
      expect(res.body.message).toMatch(/não está mais pendente de pagamento/i);
      expect(_mockPaymentCreate).not.toHaveBeenCalled();
    });

    it("deve retornar 400 se o pedido já tiver um ID de pagamento MP", async () => {
      await Order.findByIdAndUpdate(testOrder._id, {
        mercadopagoPaymentId: "EXISTING_MP_ID",
      });
      const paymentBody = {
        token: "any_token",
        payment_method_id: "visa",
        installments: 1,
        payer: { email: "test@test.com" },
      };

      const res = await request(app)
        .post(`/api/orders/${testOrder._id}/pay`)
        .set("Authorization", `Bearer ${testUserToken}`)
        .send(paymentBody)
        .expect(400);
      expect(res.body.message).toMatch(
        /Pagamento para este pedido .* já foi iniciado/i
      );
      expect(_mockPaymentCreate).not.toHaveBeenCalled();
    });

    it("deve retornar 503 se o SDK do Mercado Pago não estiver configurado", async () => {
      const isConfiguredOriginal = (await import("../config/mercadopago.js"))
        .isMercadoPagoConfigured;
      const isConfiguredMock = jest
        .spyOn(
          await import("../config/mercadopago.js"),
          "isMercadoPagoConfigured"
        )
        .mockReturnValueOnce(false);

      const paymentBody = {
        token: "any_token",
        payment_method_id: "visa",
        installments: 1,
        payer: { email: "test@test.com" },
      };

      const res = await request(app)
        .post(`/api/orders/${testOrder._id}/pay`)
        .set("Authorization", `Bearer ${testUserToken}`)
        .send(paymentBody)
        .expect(503);

      expect(res.body.message).toMatch(
        /Configuração do gateway de pagamento indisponível/i
      );
      expect(_mockPaymentCreate).not.toHaveBeenCalled();

      isConfiguredMock.mockRestore();
    });
  });

  // --- Testes GET / (Admin) ---
  describe("GET / (Admin)", () => {
    let orderUser, orderAdmin, orderUser2;
    beforeEach(async () => {
      const commonAddress = {
        street: "Rua Ord",
        number: "2",
        neighborhood: "Ord",
        city: "Ord",
        state: "OR",
        postalCode: "22222-222",
        country: "Ord",
      };
      orderUser = await Order.create({
        user: testUserId,
        orderItems: [],
        shippingAddress: commonAddress,
        paymentMethod: "Admin Test U",
        totalPrice: 5,
      });
      orderAdmin = await Order.create({
        user: adminUserId,
        orderItems: [],
        shippingAddress: commonAddress,
        paymentMethod: "Admin Test A",
        totalPrice: 15,
      });
      await new Promise((res) => setTimeout(res, 10));
      orderUser2 = await Order.create({
        user: testUserId,
        orderItems: [],
        shippingAddress: commonAddress,
        paymentMethod: "Admin Test U2",
        totalPrice: 25,
      });
    });

    it("admin deve listar todos os pedidos com paginação padrão", async () => {
      const res = await request(app)
        .get("/api/orders")
        .set("Authorization", `Bearer ${adminUserToken}`)
        .expect(200);

      expect(res.body.status).toBe("success");
      expect(res.body.results).toBe(3);
      expect(res.body.totalOrders).toBe(3);
      expect(res.body.totalPages).toBe(1);
      expect(res.body.currentPage).toBe(1);
      expect(res.body.data.orders).toHaveLength(3);
      const userIdsInResponse = res.body.data.orders.map((o) =>
        o.user._id.toString()
      );
      expect(userIdsInResponse).toEqual(
        expect.arrayContaining([testUserId.toString(), adminUserId.toString()])
      );
      expect(res.body.data.orders[0]._id.toString()).toBe(
        orderUser2._id.toString()
      );
    });

    it("admin deve listar pedidos com paginação e ordenação customizadas", async () => {
      const res = await request(app)
        .get("/api/orders?page=1&limit=2&sort=totalPrice")
        .set("Authorization", `Bearer ${adminUserToken}`)
        .expect(200);

      expect(res.body.results).toBe(2);
      expect(res.body.totalOrders).toBe(3);
      expect(res.body.totalPages).toBe(2);
      expect(res.body.currentPage).toBe(1);
      expect(res.body.data.orders).toHaveLength(2);
      expect(res.body.data.orders[0].totalPrice).toBe(5);
      expect(res.body.data.orders[1].totalPrice).toBe(15);
    });

    it("usuário normal NÃO deve listar todos os pedidos (403)", async () => {
      await request(app)
        .get("/api/orders")
        .set("Authorization", `Bearer ${testUserToken}`)
        .expect(403);
    });

    it("deve retornar 401 se não for admin e sem token", async () => {
      await request(app).get("/api/orders").expect(401);
    });
  });

  // --- Testes PUT /:id/ship (Admin) ---
  describe("PUT /:id/ship (Admin)", () => {
    let orderProcessing;
    let orderPending;
    let orderShipped;
    let orderPaid;

    beforeEach(async () => {
      const commonAddress = {
        street: "S",
        number: "1",
        neighborhood: "S",
        city: "S",
        state: "SS",
        postalCode: "33333-333",
        country: "S",
      };
      const orderData = {
        user: testUserId,
        orderItems: [],
        shippingAddress: commonAddress,
        paymentMethod: "Ship",
        totalPrice: 10,
      };
      orderProcessing = await Order.create({
        ...orderData,
        orderStatus: "processing",
      });
      orderPending = await Order.create({
        ...orderData,
        orderStatus: "pending_payment",
        totalPrice: 20,
      });
      orderShipped = await Order.create({
        ...orderData,
        orderStatus: "shipped",
        totalPrice: 30,
      });
      orderPaid = await Order.create({
        ...orderData,
        orderStatus: "paid",
        totalPrice: 40,
      });
    });

    it('admin deve marcar pedido "processing" como enviado', async () => {
      const res = await request(app)
        .put(`/api/orders/${orderProcessing._id}/ship`)
        .set("Authorization", `Bearer ${adminUserToken}`)
        .expect(200);

      expect(res.body.status).toBe("success");
      expect(res.body.data.order.orderStatus).toBe("shipped");
      const dbOrder = await Order.findById(orderProcessing._id);
      expect(dbOrder.orderStatus).toBe("shipped");
    });

    it('admin deve marcar pedido "paid" como enviado', async () => {
      const res = await request(app)
        .put(`/api/orders/${orderPaid._id}/ship`)
        .set("Authorization", `Bearer ${adminUserToken}`)
        .expect(200);
      expect(res.body.data.order.orderStatus).toBe("shipped");
      const dbOrder = await Order.findById(orderPaid._id);
      expect(dbOrder.orderStatus).toBe("shipped");
    });

    it('admin NÃO deve marcar pedido "pending_payment" como enviado (400)', async () => {
      const res = await request(app)
        .put(`/api/orders/${orderPending._id}/ship`)
        .set("Authorization", `Bearer ${adminUserToken}`)
        .expect(400);
      expect(res.body.message).toMatch(/Não é possível marcar como enviado/i);
    });

    it('admin NÃO deve marcar pedido já "shipped" como enviado (400)', async () => {
      const res = await request(app)
        .put(`/api/orders/${orderShipped._id}/ship`)
        .set("Authorization", `Bearer ${adminUserToken}`)
        .expect(400);
      expect(res.body.message).toMatch(/Não é possível marcar como enviado/i);
    });

    it("deve retornar 404 se pedido não existir", async () => {
      const nonExistentId = new mongoose.Types.ObjectId();
      const res = await request(app)
        .put(`/api/orders/${nonExistentId}/ship`)
        .set("Authorization", `Bearer ${adminUserToken}`)
        .expect(404);
      expect(res.body.message).toMatch(/Pedido não encontrado/i);
    });

    it("usuário normal NÃO deve marcar como enviado (403)", async () => {
      await request(app)
        .put(`/api/orders/${orderProcessing._id}/ship`)
        .set("Authorization", `Bearer ${testUserToken}`)
        .expect(403);
    });
  });

  // --- Testes PUT /:id/deliver (Admin) ---
  describe("PUT /:id/deliver (Admin)", () => {
    let orderShipped;
    let orderProcessing;

    beforeEach(async () => {
      const commonAddress = {
        street: "D",
        number: "1",
        neighborhood: "D",
        city: "D",
        state: "DD",
        postalCode: "44444-444",
        country: "D",
      };
      const orderData = {
        user: testUserId,
        orderItems: [],
        shippingAddress: commonAddress,
        paymentMethod: "Deliver",
        totalPrice: 10,
      };
      orderShipped = await Order.create({
        ...orderData,
        orderStatus: "shipped",
      });
      orderProcessing = await Order.create({
        ...orderData,
        orderStatus: "processing",
        totalPrice: 20,
      });
    });

    it('admin deve marcar pedido "shipped" como entregue', async () => {
      const res = await request(app)
        .put(`/api/orders/${orderShipped._id}/deliver`)
        .set("Authorization", `Bearer ${adminUserToken}`)
        .expect(200);

      expect(res.body.status).toBe("success");
      expect(res.body.data.order.orderStatus).toBe("delivered");
      expect(res.body.data.order.deliveredAt).toBeDefined();
      const dbOrder = await Order.findById(orderShipped._id);
      expect(dbOrder.orderStatus).toBe("delivered");
      expect(dbOrder.deliveredAt).toBeInstanceOf(Date);
    });

    it('admin NÃO deve marcar pedido "processing" como entregue (400)', async () => {
      const res = await request(app)
        .put(`/api/orders/${orderProcessing._id}/deliver`)
        .set("Authorization", `Bearer ${adminUserToken}`)
        .expect(400);
      expect(res.body.message).toMatch(
        /Só é possível marcar como entregue um pedido com status 'shipped'/i
      );
    });

    it("deve retornar 404 se pedido não existir", async () => {
      const nonExistentId = new mongoose.Types.ObjectId();
      const res = await request(app)
        .put(`/api/orders/${nonExistentId}/deliver`)
        .set("Authorization", `Bearer ${adminUserToken}`)
        .expect(404);
      expect(res.body.message).toMatch(/Pedido não encontrado/i);
    });

    it("usuário normal NÃO deve marcar como entregue (403)", async () => {
      await request(app)
        .put(`/api/orders/${orderShipped._id}/deliver`)
        .set("Authorization", `Bearer ${testUserToken}`)
        .expect(403);
    });
  });
}); // Fim describe /api/orders
