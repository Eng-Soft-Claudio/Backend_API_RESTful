//src/tests/order.test.js
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

// ---> Importar a função que queremos espiar/verificar <---
import * as orderController from '../controllers/orderController.js'; // Importa tudo como um objeto

// ...


// Mock para teste com Mercado Pago
jest.mock("mercadopago", () => {
  const mockPaymentCreate = jest.fn();
  const mockPaymentGet = jest.fn();
  const MockPayment = jest.fn().mockImplementation(() => ({
    create: mockPaymentCreate,
    get: mockPaymentGet,
  }));
  const MockMercadoPagoConfig = jest.fn();

  return {
    MercadoPagoConfig: MockMercadoPagoConfig,
    Payment: MockPayment,
    __esModule: true,
    _mockPaymentCreate: mockPaymentCreate,
    _mockPaymentGet: mockPaymentGet,
  };
});

// Importa as funções mockadas individuais
import { _mockPaymentCreate, _mockPaymentGet } from "mercadopago";

// --- Variáveis ---
let mongoServer;
let testUserToken, adminUserToken;
let testUserId, adminUserId;
let product1Id, product2Id;
let testCategoryId;
let userAddressId;
let initialStockProd1 = 15;
let initialStockProd2 = 3;

// --- Setup e Teardown ---
beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
  if (!process.env.JWT_SECRET)
    process.env.JWT_SECRET = "test-secret-for-order-final";
  // Garantir JWT_SECRET
  if (!process.env.JWT_SECRET) {
    process.env.JWT_SECRET = "test-secret-for-order-please-replace";
  }

  // Limpar tudo antes de começar
  await User.deleteMany({});
  await Category.deleteMany({});
  await Product.deleteMany({});
  await Cart.deleteMany({});
  await Address.deleteMany({});
  await Order.deleteMany({});

  // Criar Categoria
  const category = await Category.create({ name: "Categoria Pedidos Final" });
  testCategoryId = category._id;

  // Criar Usuário de Teste e Admin
  const user = await User.create({
    name: "Order User",
    email: "order.user@test.com",
    password: "password123",
  });
  testUserId = user._id;
  const admin = await User.create({
    name: "Order Admin",
    email: "order.admin@test.com",
    password: "password123",
    role: "admin",
  });
  adminUserId = admin._id;
  testUserToken = jwt.sign(
    { id: testUserId, role: user.role },
    process.env.JWT_SECRET
  );
  adminUserToken = jwt.sign(
    { id: adminUserId, role: admin.role },
    process.env.JWT_SECRET
  );

  // Criar Produtos de Teste
  const prod1 = await Product.create({
    name: "Produto Pedido 1",
    price: 25.0,
    category: testCategoryId,
    image: "order1.jpg",
    stock: 15,
  });
  const prod2 = await Product.create({
    name: "Produto Pedido 2",
    price: 100.0,
    category: testCategoryId,
    image: "order2.jpg",
    stock: 3,
  });
  product1Id = prod1._id;
  product2Id = prod2._id;

  // Criar Endereço para o Usuário de Teste
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
  // Limpeza geral ANTES de cada teste
  await Cart.deleteMany({});
  await Order.deleteMany({});
  await Product.deleteMany({});

  // Recriando os produtos
  const prod1 = await Product.create({
    _id: new mongoose.Types.ObjectId(),
    name: "Produto Pedido 1",
    price: 25.0,
    category: testCategoryId,
    image: "order1.jpg",
    stock: initialStockProd1,
  });
  const prod2 = await Product.create({
    _id: new mongoose.Types.ObjectId(),
    name: "Produto Pedido 2",
    price: 100.0,
    category: testCategoryId,
    image: "order2.jpg",
    stock: initialStockProd2,
  });
  product1Id = prod1._id;
  product2Id = prod2._id;

  // Limpa e reseta mocks
  _mockPaymentCreate.mockClear();
  _mockPaymentGet.mockClear();
  _mockPaymentCreate.mockResolvedValue({
    id: 1234567890,
    status: "pending",
    date_created: new Date().toISOString(),
    date_last_updated: new Date().toISOString(),
    payment_method_id: "visa",
    installments: 1,
    payer: { email: "payer@test.com" },
    card: { last_four_digits: "1234" },
    external_reference: null,
  });
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
describe("/api/orders", () => {
  // --- Testes POST / ---
  describe("POST /", () => {
    beforeEach(async () => {
      // Cria carrinho ANTES de cada teste POST
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

      // Verifica dados básicos
      expect(order.user.toString()).toBe(testUserId.toString());
      expect(order.paymentMethod).toBe(orderData.paymentMethod);
      expect(order.orderStatus).toBe("pending_payment");

      // Verifica endereço copiado
      expect(order.shippingAddress.street).toBe("Rua Pedido");
      expect(order.shippingAddress.city).toBe("Cidade Order");
      expect(order.shippingAddress.country).toBe("Orderland");

      // Verifica itens copiados
      expect(order.orderItems).toHaveLength(2);
      expect(order.orderItems[0].name).toBe("Produto Pedido 1");
      expect(order.orderItems[0].quantity).toBe(2);
      expect(order.orderItems[0].price).toBe(25.0);
      expect(order.orderItems[1].name).toBe("Produto Pedido 2");
      expect(order.orderItems[1].quantity).toBe(1);
      expect(order.orderItems[1].price).toBe(100.0);

      // Verifica totais calculados
      const expectedItemsPrice = 150.0;
      const expectedShipping = 0.0;
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
      expect(dbProd1.stock).toBe(initialStockProd1 - 2);
      expect(dbProd2.stock).toBe(initialStockProd2 - 1);
    });

    it("deve retornar erro 404 se o carrinho não existir", async () => {
      // Limpa o carrinho criado no beforeEach
      await Cart.deleteMany({ user: testUserId });

      const orderData = {
        shippingAddressId: userAddressId.toString(),
        paymentMethod: "Sem Carrinho",
      };
      await request(app)
        .post("/api/orders")
        .set("Authorization", `Bearer ${testUserToken}`)
        .send(orderData)
        .expect(404);
    });

    it("deve retornar erro 400 se o carrinho estiver vazio", async () => {
      // Limpa o carrinho criado no beforeEach
      await Cart.findOneAndUpdate({ user: testUserId }, { items: [] });

      const orderData = {
        shippingAddressId: userAddressId.toString(),
        paymentMethod: "Carrinho Vazio",
      };
      await request(app)
        .post("/api/orders")
        .set("Authorization", `Bearer ${testUserToken}`)
        .send(orderData)
        .expect(400);
    });

    it("deve retornar erro 400 se o endereço de entrega for inválido", async () => {
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
      expect(res.body.errors).toBeDefined();
    });

    it("deve retornar erro 400 se o estoque for insuficiente", async () => {
      // Atualiza o carrinho para pedir mais do que o estoque
      await Cart.findOneAndUpdate(
        { user: testUserId },
        {
          items: [{ product: product1Id, quantity: 20 }],
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
      expect(res.body.message).toMatch(
        /Problemas de estoque: Estoque insuficiente para Produto Pedido 1 \(Disponível: 15, Solicitado: 20\)/i
      );

      // Verifica mensagem de erro específica
      expect(res.body.message).toContain("Problemas de estoque:");
      expect(res.body.message).toContain(
        "Estoque insuficiente para Produto Pedido 1"
      );
      expect(res.body.message).toContain("(Disponível: 15, Solicitado: 20)");

      // Garante que o estoque não foi alterado e carrinho não foi limpo
      const dbProd1 = await Product.findById(product1Id);
      expect(dbProd1.stock).toBe(initialStockProd1);
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
      // Criar dois pedidos para o usuário de teste
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
          { productId: product1Id, name: "Prod 1", quantity: 1, price: 25 },
        ],
        shippingAddress: {
          street: "Rua A",
          number: "1",
          neighborhood: "A",
          city: "A",
          state: "AA",
          postalCode: "11111-111",
          country: "A",
        },
        paymentMethod: "Teste",
        itemsPrice: 25,
        shippingPrice: 5,
        totalPrice: 30,
        orderStatus: "processing",
      };
      order1 = await Order.create(orderData);
      order2 = await Order.create({
        ...orderData,
        totalPrice: 40,
        orderStatus: "shipped",
      });
      await Order.create({ ...orderData, user: adminUserId });
    });

    it("deve retornar a lista de pedidos do usuário logado", async () => {
      const res = await request(app)
        .get("/api/orders/my")
        .set("Authorization", `Bearer ${testUserToken}`)
        .expect("Content-Type", /json/)
        .expect(200);

      expect(res.body.status).toBe("success");
      expect(res.body.results).toBe(2);
      expect(res.body.data.orders).toHaveLength(2);
      // Verifica se os IDs correspondem
      const orderIds = res.body.data.orders.map((o) => o._id.toString());
      expect(orderIds).toEqual(
        expect.arrayContaining([order1._id.toString(), order2._id.toString()])
      );
    });

    it("deve retornar lista vazia se usuário não tiver pedidos", async () => {
      // Cria um usuário sem pedidos
      const newUser = await User.create({
        name: "No Orders",
        email: "noorders@test.com",
        password: "password123",
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

    it("usuário deve obter seu próprio pedido por ID", async () => {
      const res = await request(app)
        .get(`/api/orders/${userOrder._id}`)
        .set("Authorization", `Bearer ${testUserToken}`)
        .expect("Content-Type", /json/)
        .expect(200);

      expect(res.body.status).toBe("success");
      expect(res.body.data.order._id.toString()).toBe(userOrder._id.toString());
      expect(res.body.data.order.user).toBeDefined();
      expect(res.body.data.order.user.name).toBe("Order User");
    });

    it("usuário NÃO deve obter pedido de outro usuário por ID (retorna 404)", async () => {
      await request(app)
        .get(`/api/orders/${adminOrder._id}`)
        .set("Authorization", `Bearer ${testUserToken}`)
        .expect(404);
    });

    it("admin deve obter qualquer pedido por ID", async () => {
      // Admin pegando pedido do usuário normal
      const res1 = await request(app)
        .get(`/api/orders/${userOrder._id}`)
        .set("Authorization", `Bearer ${adminUserToken}`)
        .expect(200);
      expect(res1.body.data.order._id.toString()).toBe(
        userOrder._id.toString()
      );
      expect(res1.body.data.order.user.email).toBe("order.user@test.com");

      // Admin pegando seu próprio pedido
      const res2 = await request(app)
        .get(`/api/orders/${adminOrder._id}`)
        .set("Authorization", `Bearer ${adminUserToken}`)
        .expect(200);
      expect(res2.body.data.order._id.toString()).toBe(
        adminOrder._id.toString()
      );
      expect(res2.body.data.order.user.email).toBe("order.admin@test.com");
    });

    it("deve retornar 404 se o ID do pedido não existir", async () => {
      const nonExistentId = new mongoose.Types.ObjectId();
      await request(app)
        .get(`/api/orders/${nonExistentId}`)
        .set("Authorization", `Bearer ${testUserToken}`)
        .expect(404);
    });

    it("deve retornar 400 se o ID do pedido for inválido", async () => {
      await request(app)
        .get("/api/orders/invalid-id")
        .set("Authorization", `Bearer ${testUserToken}`)
        .expect(400);
    });

    it("deve retornar 401 se não estiver autenticado", async () => {
      await request(app).get(`/api/orders/${userOrder._id}`).expect(401);
    });
  });

  // --- Testes POST /:id/pay ---
  describe("POST /:id/pay", () => {
    let testOrder;
    const stockConsumedByOrder = 1;
    const expectedStockAfterCreation = initialStockProd1 - stockConsumedByOrder;

    // Cria um pedido PENDENTE antes de cada teste deste bloco
    beforeEach(async () => {
      // Limpar pedidos específicos deste describe
      await Order.deleteMany({ user: testUserId });
      // Resetar estoque específico
      await Product.findByIdAndUpdate(product1Id, { stock: initialStockProd1 });

      const orderData = {
        user: testUserId,
        orderItems: [
          {
            productId: product1Id,
            name: "Prod 1 Pay",
            quantity: 1,
            price: 25,
            image: "p1.jpg",
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
        itemsPrice: 25,
        shippingPrice: 10,
        totalPrice: 35,
        orderStatus: "pending_payment",
        installments: 1,
      };
      testOrder = await Order.create(orderData);

      await Product.findByIdAndUpdate(product1Id, {
        $inc: { stock: -stockConsumedByOrder },
      });

      // Log para confirmar o estado ANTES de cada teste 'it'
      const updatedProduct = await Product.findById(product1Id).lean();
      if (
        !updatedProduct ||
        updatedProduct.stock !== expectedStockAfterCreation
      ) {
        // Lançar erro aqui pode ser melhor para parar os testes
        throw new Error(
          "Falha ao preparar o estoque inicial para os testes de pagamento."
        );
      }
    });

    it("deve processar um pagamento com sucesso (MP retorna approved)", async () => {
      _mockPaymentCreate.mockResolvedValueOnce({
        id: 987654321,
        status: "approved",
        date_last_updated: new Date().toISOString(),
        payer: { email: "test@test.com" },
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
      expect(_mockPaymentCreate).toHaveBeenCalledTimes(1);

      const stockAfterPaySuccess = await Product.findById(product1Id);
      expect(stockAfterPaySuccess.stock).toBe(expectedStockAfterCreation);
    });

    it("deve marcar pedido como falho e retornar estoque se MP retornar rejected", async () => {
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

      
    });

    it("deve retornar 400 se o Mercado Pago retornar erro na chamada (erro de validação/negócio do MP)", async () => {
      const mpClientError = new Error("invalid card token");
      mpClientError.statusCode = 400;
      _mockPaymentCreate.mockRejectedValue(mpClientError);

      const validBody = {
        token: "VALID_CARD_TOKEN_PLACEHOLDER",
        payment_method_id: "visa",
        installments: 1,
        payer: { email: "test@test.com" },
      };

      await request(app)
        .post(`/api/orders/${testOrder._id}/pay`)
        .set("Authorization", `Bearer ${testUserToken}`)
        .send(validBody)
        .expect(400);

      expect(_mockPaymentCreate).toHaveBeenCalledTimes(1);

      const dbOrder = await Order.findById(testOrder._id);
      expect(dbOrder.orderStatus).toBe("pending_payment");

      const stockAfterPayMpError = await Product.findById(product1Id);
  
      expect(stockAfterPayMpError.stock).toBe(initialStockProd1 - stockConsumedByOrder);
    });

    it("deve retornar 500 se ocorrer um erro interno inesperado (não do MP)", async () => {
      _mockPaymentCreate.mockResolvedValueOnce({
        id: 987654321,
        status: "approved",
        date_last_updated: new Date().toISOString(),
        payer: { email: "test@test.com" },
        payment_method_id: "visa",
        card: { last_four_digits: "1234" },
        installments: 1,
        external_reference: testOrder._id.toString(),
      });

      const saveMock = jest
        .spyOn(Order.prototype, "save")
        .mockRejectedValueOnce(new Error("DB error"));

      const validBody = {
        token: "VALID_CARD_TOKEN_PLACEHOLDER",
        payment_method_id: "visa",
        installments: 1,
        payer: { email: "test@test.com" },
      };

      await request(app)
        .post(`/api/orders/${testOrder._id}/pay`)
        .set("Authorization", `Bearer ${testUserToken}`)
        .send(validBody)
        .expect(500);

      saveMock.mockRestore();

      const stockAfterPayInternalError = await Product.findById(product1Id);
      
      expect(stockAfterPayInternalError.stock).toBe(expectedStockAfterCreation);
    });

    it("deve retornar 401 se não estiver autenticado", async () => {
      const validBody = {
        token: "VALID_CARD_TOKEN_PLACEHOLDER",
        payment_method_id: "visa",
        installments: 1,
        payer: { email: "test@test.com" },
      };

      await request(app)
        .post(`/api/orders/${testOrder._id}/pay`)
        .send(validBody)
        .expect(401);
    });

    it("deve retornar 404 se o pedido não for encontrado", async () => {
      const nonExistentId = new mongoose.Types.ObjectId();

      const validBody = {
        token: "VALID_CARD_TOKEN_PLACEHOLDER",
        payment_method_id: "visa",
        installments: 1,
        payer: { email: "test@test.com" },
      };

      await request(app)
        .post(`/api/orders/${nonExistentId}/pay`)
        .set("Authorization", `Bearer ${testUserToken}`)
        .send(validBody)
        .expect(404);
      expect(_mockPaymentCreate).not.toHaveBeenCalled();
    });

    it("deve retornar 400 se o pedido não estiver pendente de pagamento", async () => {
      // Mudar status do pedido para 'processing'
      await Order.findByIdAndUpdate(testOrder._id, {
        orderStatus: "processing",
      });

      const validBody = {
        token: "VALID_CARD_TOKEN_PLACEHOLDER",
        payment_method_id: "visa",
        installments: 1,
        payer: { email: "test@test.com" },
      };

      await request(app)
        .post(`/api/orders/${testOrder._id}/pay`)
        .set("Authorization", `Bearer ${testUserToken}`)
        .send(validBody)
        .expect(400);
      expect(_mockPaymentCreate).not.toHaveBeenCalled();
    });

    it("deve retornar 400 se o pedido já tiver um ID de pagamento MP (lógica no payOrder)", async () => {
      // Adicionar um ID de pagamento ao pedido
      await Order.findByIdAndUpdate(testOrder._id, {
        mercadopagoPaymentId: "EXISTING_MP_ID",
      });

      const validBody = {
        token: "VALID_CARD_TOKEN_PLACEHOLDER",
        payment_method_id: "visa",
        installments: 1,
        payer: { email: "test@test.com" },
      };

      const res = await request(app)
        .post(`/api/orders/${testOrder._id}/pay`)
        .set("Authorization", `Bearer ${testUserToken}`)
        .send(validBody)
        .expect(400);
      expect(res.body).toBeDefined();
      expect(_mockPaymentCreate).not.toHaveBeenCalled();
    });
  });
});
