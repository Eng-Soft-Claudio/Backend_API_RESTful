// src/tests/address.test.js
import request from "supertest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import jwt from "jsonwebtoken";
import app from "../app.js";
import Address from "../models/Address.js";
import User from "../models/User.js";

let mongoServer;
let testUserToken;
let testUserId;

// --- Dados de Endereço Válidos para Teste ---
const validAddressData = {
  label: "Casa Teste",
  street: "Rua Teste",
  number: "123",
  complement: "Apto 1",
  neighborhood: "Bairro Teste",
  city: "Cidade Teste",
  state: "TS",
  postalCode: "12345-678",
  country: "Paisteste",
  phone: "11999998888",
  isDefault: false,
};

// --- Dados do Usuário Válidos para Teste ---
const testUserData = {
  name: "Address User",
  email: "address.user@test.com",
  password: "password123",
  cpf: "97968082005",
  birthDate: "1994-04-04",
};

// --- Bloco de Setup e Teardown ---
beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const mongoUri = mongoServer.getUri();
  await mongoose.connect(mongoUri);

  // Garantir JWT_SECRET
  if (!process.env.JWT_SECRET) {
    process.env.JWT_SECRET = "test-secret-address";
    console.warn(
      "JWT_SECRET não definido, usando valor padrão para testes de address."
    );
  }

  // Limpar coleções antes de começar
  await User.deleteMany({});
  await Address.deleteMany({});

  // Criar um usuário de teste COM CPF E BIRTHDATE
  const testUser = await User.create(testUserData);
  testUserId = testUser._id;

  // Gerar token para o usuário de teste
  testUserToken = jwt.sign(
    { id: testUserId, role: testUser.role },
    process.env.JWT_SECRET,
    { expiresIn: "1h" }
  );
});

// Limpar endereços após cada teste para garantir isolamento
afterEach(async () => {
  await Address.deleteMany({});
});

// Desconectar e parar o servidor no final
afterAll(async () => {
  await User.deleteMany({});
  await mongoose.disconnect();
  await mongoServer.stop();
});

// --- Bloco Principal de Testes para Endereços ---
describe("/api/addresses", () => {
  // --- Testes para POST / (Adicionar Endereço) ---
  describe("POST /", () => {
    it("deve adicionar um novo endereço com sucesso para usuário logado", async () => {
      const res = await request(app)
        .post("/api/addresses")
        .set("Authorization", `Bearer ${testUserToken}`)
        .send(validAddressData)
        .expect("Content-Type", /json/)
        .expect(201);

      expect(res.body.status).toBe("success");
      expect(res.body.data.address).toBeDefined();
      expect(res.body.data.address.street).toBe(validAddressData.street);
      expect(res.body.data.address.user.toString()).toBe(testUserId.toString());
      expect(res.body.data.address.isDefault).toBe(false);

      // Verifica no DB
      const dbAddress = await Address.findById(res.body.data.address._id);
      expect(dbAddress).not.toBeNull();
      expect(dbAddress.city).toBe(validAddressData.city);
      expect(dbAddress.user.toString()).toBe(testUserId.toString());
      expect(dbAddress.isDefault).toBe(false);
    });

    it("deve retornar erro 400 se dados obrigatórios faltarem (ex: street)", async () => {
      const { street, ...invalidData } = validAddressData;
      const res = await request(app)
        .post("/api/addresses")
        .set("Authorization", `Bearer ${testUserToken}`)
        .send(invalidData)
        .expect(400);

      expect(res.body.errors).toBeInstanceOf(Array);
      const streetError = res.body.errors.find((err) => err.path === "street");
      expect(streetError).toBeDefined();
      expect(streetError.msg).toContain("obrigatório");
    });

    it("deve retornar erro 400 se o formato do CEP for inválido", async () => {
      const invalidPostalCode = { ...validAddressData, postalCode: "1234-567" };
      const res = await request(app)
        .post("/api/addresses")
        .set("Authorization", `Bearer ${testUserToken}`)
        .send(invalidPostalCode)
        .expect(400);

      expect(res.body.errors).toBeInstanceOf(Array);
      const postalCodeError = res.body.errors.find(
        (err) => err.path === "postalCode"
      );
      expect(postalCodeError).toBeDefined();
      expect(postalCodeError.msg).toContain("CEP inválido");
    });

    it("deve retornar erro 400 se o estado (UF) não tiver 2 caracteres", async () => {
      const invalidState = { ...validAddressData, state: "SPA" };
      const res = await request(app)
        .post("/api/addresses")
        .set("Authorization", `Bearer ${testUserToken}`)
        .send(invalidState)
        .expect(400);

      expect(res.body.errors).toBeInstanceOf(Array);
      const stateError = res.body.errors.find((err) => err.path === "state");
      expect(stateError).toBeDefined();
      expect(stateError.msg).toContain("2 caracteres");
    });

    it("deve retornar erro 401 se não estiver autenticado", async () => {
      await request(app)
        .post("/api/addresses")
        .send(validAddressData)
        .expect(401);
    });

    it("deve definir o endereço como padrão se isDefault=true e desmarcar outros", async () => {
      const oldDefaultData = {
        ...validAddressData,
        user: testUserId,
        label: "Padrão Antigo",
        isDefault: true,
      };
      const oldDefaultAddress = await Address.create(oldDefaultData);
      const newDefaultData = {
        ...validAddressData,
        street: "Rua Nova Padrão",
        label: "Novo Padrão",
        isDefault: true,
      };
      const res = await request(app)
        .post("/api/addresses")
        .set("Authorization", `Bearer ${testUserToken}`)
        .send(newDefaultData)
        .expect(201);

      expect(res.body.data.address.isDefault).toBe(true);
      expect(res.body.data.address.label).toBe("Novo Padrão");

      const oldDefault = await Address.findById(oldDefaultAddress._id);
      expect(oldDefault).not.toBeNull();
      expect(oldDefault.isDefault).toBe(false);

      const defaultCount = await Address.countDocuments({
        user: testUserId,
        isDefault: true,
      });
      expect(defaultCount).toBe(1);
      const newDefaultDb = await Address.findById(res.body.data.address._id);
      expect(newDefaultDb.isDefault).toBe(true);
    });
  });

  // --- Testes para GET / (Listar Endereços) ---
  describe("GET /", () => {
    it("deve retornar uma lista vazia se o usuário não tiver endereços", async () => {
      const res = await request(app)
        .get("/api/addresses")
        .set("Authorization", `Bearer ${testUserToken}`)
        .expect(200);

      expect(res.body.status).toBe("success");
      expect(res.body.results).toBe(0);
      expect(res.body.data.addresses).toHaveLength(0);
    });

    it("deve retornar a lista de endereços do usuário logado, ordenados por padrão e data", async () => {
      const addrData1 = {
        ...validAddressData,
        user: testUserId,
        label: "Trabalho",
        street: "Av. Teste",
        isDefault: false,
      };
      const addrData2 = {
        ...validAddressData,
        user: testUserId,
        label: "Casa",
        isDefault: false,
      };
      const addrData3 = {
        ...validAddressData,
        user: testUserId,
        label: "Antigo",
        street: "Rua Velha",
        isDefault: false,
      };

      await Address.create(addrData1);
      const defaultAddr = await Address.create(addrData2);
      await Address.create(addrData3);

      await Address.findByIdAndUpdate(defaultAddr._id, { isDefault: true });

      const res = await request(app)
        .get("/api/addresses")
        .set("Authorization", `Bearer ${testUserToken}`)
        .expect(200);

      expect(res.body.status).toBe("success");
      expect(res.body.results).toBe(3);
      expect(res.body.data.addresses).toHaveLength(3);
      expect(res.body.data.addresses[0].label).toBe("Casa");
      expect(res.body.data.addresses[0].isDefault).toBe(true);
      expect(res.body.data.addresses.map((a) => a.label)).toEqual(
        expect.arrayContaining(["Casa", "Antigo", "Trabalho"])
      );
    });

    it("deve retornar erro 401 se não estiver autenticado", async () => {
      await request(app).get("/api/addresses").expect(401);
    });
  });

  // --- Testes para GET /:id (Obter Endereço por ID) ---
  describe("GET /:id", () => {
    let createdAddress;

    beforeEach(async () => {
      createdAddress = await Address.create({
        ...validAddressData,
        user: testUserId,
      });
    });

    it("deve retornar um endereço específico pelo ID se pertence ao usuário", async () => {
      const res = await request(app)
        .get(`/api/addresses/${createdAddress._id}`)
        .set("Authorization", `Bearer ${testUserToken}`)
        .expect(200);

      expect(res.body.status).toBe("success");
      expect(res.body.data.address._id.toString()).toBe(
        createdAddress._id.toString()
      );
      expect(res.body.data.address.street).toBe(validAddressData.street);
    });

    it("deve retornar erro 404 se o ID não existir", async () => {
      const nonExistentId = new mongoose.Types.ObjectId();
      const res = await request(app)
        .get(`/api/addresses/${nonExistentId}`)
        .set("Authorization", `Bearer ${testUserToken}`)
        .expect(404);

      expect(res.body.message).toMatch(/Endereço não encontrado/i);
    });

    it("deve retornar erro 400 se o ID for inválido", async () => {
      const res = await request(app)
        .get("/api/addresses/invalid-id-format")
        .set("Authorization", `Bearer ${testUserToken}`)
        .expect(400);
      expect(res.body.errors).toBeInstanceOf(Array);
      expect(res.body.errors[0].msg).toMatch(/ID inválido/i);
    });

    it("deve retornar erro 401 se não estiver autenticado", async () => {
      await request(app)
        .get(`/api/addresses/${createdAddress._id}`)
        .expect(401);
    });

    it("deve retornar erro 404 ao tentar pegar endereço de outro usuário", async () => {
      const otherUserId = new mongoose.Types.ObjectId();
      const otherAddress = await Address.create({
        ...validAddressData,
        user: otherUserId,
        label: "Other User Address",
      });

      const res = await request(app)
        .get(`/api/addresses/${otherAddress._id}`)
        .set("Authorization", `Bearer ${testUserToken}`)
        .expect(404);

      expect(res.body.message).toMatch(/Endereço não encontrado/i);
    });
  });

  // --- Testes para PUT /:id (Atualizar Endereço) ---
  describe("PUT /:id", () => {
    let addressToUpdate;
    const updateData = {
      street: "Rua Atualizada",
      city: "Cidade Nova",
      isDefault: true,
    };

    beforeEach(async () => {
      addressToUpdate = await Address.create({
        ...validAddressData,
        user: testUserId,
      });
    });

    it("deve atualizar um endereço existente com sucesso (sem alterar isDefault se enviado)", async () => {
      const res = await request(app)
        .put(`/api/addresses/${addressToUpdate._id}`)
        .set("Authorization", `Bearer ${testUserToken}`)
        .send(updateData)
        .expect(200);

      expect(res.body.status).toBe("success");
      expect(res.body.data.address.street).toBe(updateData.street);
      expect(res.body.data.address.city).toBe(updateData.city);
      expect(res.body.data.address.isDefault).toBe(false);

      const dbAddress = await Address.findById(addressToUpdate._id);
      expect(dbAddress.street).toBe(updateData.street);
      expect(dbAddress.isDefault).toBe(false);
    });

    it("deve retornar erro 400 se a validação falhar (ex: estado inválido)", async () => {
      const res = await request(app)
        .put(`/api/addresses/${addressToUpdate._id}`)
        .set("Authorization", `Bearer ${testUserToken}`)
        .send({ state: "INVALID STATE" })
        .expect(400);

      expect(res.body.errors).toBeInstanceOf(Array);
      expect(res.body.errors[0].path).toBe("state");
      expect(res.body.errors[0].msg).toContain("2 caracteres");
    });

    it("deve retornar erro 404 se o ID não existir", async () => {
      const nonExistentId = new mongoose.Types.ObjectId();
      const res = await request(app)
        .put(`/api/addresses/${nonExistentId}`)
        .set("Authorization", `Bearer ${testUserToken}`)
        .send(updateData)
        .expect(404);
      expect(res.body.message).toMatch(/Endereço não encontrado/i);
    });

    it("deve retornar erro 404 ao tentar atualizar endereço de outro usuário", async () => {
      const otherUserId = new mongoose.Types.ObjectId();
      const otherAddress = await Address.create({
        ...validAddressData,
        user: otherUserId,
      });

      const res = await request(app)
        .put(`/api/addresses/${otherAddress._id}`)
        .set("Authorization", `Bearer ${testUserToken}`)
        .send(updateData)
        .expect(404);
      expect(res.body.message).toMatch(/Endereço não encontrado/i);
    });

    it("deve retornar erro 401 se não estiver autenticado", async () => {
      await request(app)
        .put(`/api/addresses/${addressToUpdate._id}`)
        .send(updateData)
        .expect(401);
    });
  });

  // --- Testes para DELETE /:id (Deletar Endereço) ---
  describe("DELETE /:id", () => {
    let addressToDelete;

    beforeEach(async () => {
      addressToDelete = await Address.create({
        ...validAddressData,
        user: testUserId,
      });
    });

    it("deve deletar um endereço existente com sucesso", async () => {
      await request(app)
        .delete(`/api/addresses/${addressToDelete._id}`)
        .set("Authorization", `Bearer ${testUserToken}`)
        .expect(204);

      const dbAddress = await Address.findById(addressToDelete._id);
      expect(dbAddress).toBeNull();
    });

    it("deve retornar erro 404 se o ID não existir", async () => {
      const nonExistentId = new mongoose.Types.ObjectId();
      const res = await request(app)
        .delete(`/api/addresses/${nonExistentId}`)
        .set("Authorization", `Bearer ${testUserToken}`)
        .expect(404);
      expect(res.body.message).toMatch(/Endereço não encontrado/i);
    });

    it("deve retornar erro 400 se o ID for inválido", async () => {
      const res = await request(app)
        .delete("/api/addresses/invalid-id-format")
        .set("Authorization", `Bearer ${testUserToken}`)
        .expect(400);
      expect(res.body.errors).toBeInstanceOf(Array);
      expect(res.body.errors[0].msg).toMatch(/ID inválido/i);
    });

    it("deve retornar erro 404 ao tentar deletar endereço de outro usuário", async () => {
      const otherUserId = new mongoose.Types.ObjectId();
      const otherAddress = await Address.create({
        ...validAddressData,
        user: otherUserId,
      });

      const res = await request(app)
        .delete(`/api/addresses/${otherAddress._id}`)
        .set("Authorization", `Bearer ${testUserToken}`)
        .expect(404);
      expect(res.body.message).toMatch(/Endereço não encontrado/i);
    });

    it("deve retornar erro 401 se não estiver autenticado", async () => {
      await request(app)
        .delete(`/api/addresses/${addressToDelete._id}`)
        .expect(401);
    });
  });

  // --- Testes para PATCH /:id/default (Definir como Padrão) ---
  describe("PATCH /:id/default", () => {
    let address1, address2;

    beforeEach(async () => {
      address1 = await Address.create({
        ...validAddressData,
        user: testUserId,
        label: "Addr 1",
        isDefault: false,
      });
      address2 = await Address.create({
        ...validAddressData,
        user: testUserId,
        label: "Addr 2",
        street: "Rua B",
        isDefault: false,
      });
    });

    it("deve definir um endereço como padrão com sucesso", async () => {
      const res = await request(app)
        .patch(`/api/addresses/${address1._id}/default`)
        .set("Authorization", `Bearer ${testUserToken}`)
        .expect(200);

      expect(res.body.status).toBe("success");
      expect(res.body.data.address._id.toString()).toBe(
        address1._id.toString()
      );
      expect(res.body.data.address.isDefault).toBe(true);

      const dbAddr1 = await Address.findById(address1._id);
      const dbAddr2 = await Address.findById(address2._id);
      expect(dbAddr1.isDefault).toBe(true);
      expect(dbAddr2.isDefault).toBe(false);
    });

    it("deve definir outro endereço como padrão e desmarcar o anterior", async () => {
      await Address.findByIdAndUpdate(address1._id, { isDefault: true });

      const res = await request(app)
        .patch(`/api/addresses/${address2._id}/default`)
        .set("Authorization", `Bearer ${testUserToken}`)
        .expect(200);

      expect(res.body.data.address._id.toString()).toBe(
        address2._id.toString()
      );
      expect(res.body.data.address.isDefault).toBe(true);

      const dbAddr1 = await Address.findById(address1._id);
      const dbAddr2 = await Address.findById(address2._id);
      expect(dbAddr1.isDefault).toBe(false);
      expect(dbAddr2.isDefault).toBe(true);
    });

    it("não deve fazer nada se tentar definir como padrão um endereço que JÁ É padrão", async () => {
      await Address.findByIdAndUpdate(address1._id, { isDefault: true });
      const initialAddress = await Address.findById(address1._id);
      const initialUpdatedAt = initialAddress.updatedAt;

      const res = await request(app)
        .patch(`/api/addresses/${address1._id}/default`)
        .set("Authorization", `Bearer ${testUserToken}`)
        .expect(200);

      expect(res.body.data.address._id.toString()).toBe(
        address1._id.toString()
      );
      expect(res.body.data.address.isDefault).toBe(true);

      const dbAddr1 = await Address.findById(address1._id);
      expect(dbAddr1.isDefault).toBe(true);
      expect(dbAddr1.updatedAt.toISOString()).toBe(
        initialUpdatedAt.toISOString()
      );
    });

    it("deve retornar erro 404 se o ID não existir", async () => {
      const nonExistentId = new mongoose.Types.ObjectId();
      const res = await request(app)
        .patch(`/api/addresses/${nonExistentId}/default`)
        .set("Authorization", `Bearer ${testUserToken}`)
        .expect(404);
      expect(res.body.message).toMatch(/Endereço não encontrado/i);
    });

    it("deve retornar erro 401 se não estiver autenticado", async () => {
      await request(app)
        .patch(`/api/addresses/${address1._id}/default`)
        .expect(401);
    });

    it("deve retornar erro 404 ao tentar definir como padrão endereço de outro usuário", async () => {
      const otherUserId = new mongoose.Types.ObjectId();
      const otherAddress = await Address.create({
        ...validAddressData,
        user: otherUserId,
      });

      const res = await request(app)
        .patch(`/api/addresses/${otherAddress._id}/default`)
        .set("Authorization", `Bearer ${testUserToken}`)
        .expect(404);
      expect(res.body.message).toMatch(/Endereço não encontrado/i);
    });
  }); 
}); 
