// src/tests/category.test.js
import request from "supertest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import jwt from "jsonwebtoken";
import app from "../app.js"; // Ajuste o caminho se necessário
import Category from "../models/Category.js"; // Ajuste o caminho se necessário
import Product from "../models/Product.js"; // Ajuste o caminho se necessário
import User from "../models/User.js"; // Ajuste o caminho se necessário

let mongoServer;
let adminToken, userToken;
let adminUserId;
let normalUserId;

// --- Dados de Usuário Válidos para Teste ---
const adminUserData = {
  name: "Category Admin",
  email: "cat.admin@test.com",
  password: "password123",
  cpf: "90450332080",
  birthDate: "1980-01-01",
  role: "admin",
};
const normalUserData = {
  name: "Category User",
  email: "cat.user@test.com",
  password: "password123",
  cpf: "59111802006",
  birthDate: "1995-05-05",
  role: "user",
};

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const mongoUri = mongoServer.getUri();
  await mongoose.connect(mongoUri);

  if (!process.env.JWT_SECRET) {
    process.env.JWT_SECRET = "test-secret-for-category-please-replace";
    logger.warn(
      "JWT_SECRET não definido, usando valor padrão para testes de category."
    );
  }

  await User.deleteMany({});
  await Category.deleteMany({});
  await Product.deleteMany({});

  const adminUser = await User.create(adminUserData);
  const normalUser = await User.create(normalUserData);
  adminUserId = adminUser._id;
  normalUserId = normalUser._id;

  adminToken = jwt.sign(
    { id: adminUser._id, role: adminUser.role },
    process.env.JWT_SECRET,
    { expiresIn: "1h" }
  );
  userToken = jwt.sign(
    { id: normalUser._id, role: normalUser.role },
    process.env.JWT_SECRET,
    { expiresIn: "1h" }
  );
});

afterEach(async () => {
  await Category.deleteMany({});
  await Product.deleteMany({});
});

afterAll(async () => {
  await User.deleteMany({});
  await Category.deleteMany({});
  await Product.deleteMany({});
  await mongoose.disconnect();
  await mongoServer.stop();
});

describe("/api/categories", () => {
  // --- Testes POST / ---
  describe("POST /", () => {
    const categoryData = {
      name: "Eletrônicos Novos",
      description: "Desc Eletrônicos",
    };

    it("Admin deve criar categoria com sucesso", async () => {
      const res = await request(app)
        .post("/api/categories")
        .set("Authorization", `Bearer ${adminToken}`)
        .send(categoryData)
        .expect("Content-Type", /json/)
        .expect(201);

      expect(res.body.name).toBe(categoryData.name);
      expect(res.body.description).toBe(categoryData.description);
      expect(res.body.slug).toBe("eletronicos-novos");
      expect(res.body._id).toBeDefined();

      // Verifica no DB
      const dbCat = await Category.findById(res.body._id);
      expect(dbCat).not.toBeNull();
      expect(dbCat.name).toBe(categoryData.name);
      expect(dbCat.slug).toBe("eletronicos-novos");
    });

    it("Deve retornar 409 se tentar criar categoria com nome duplicado", async () => {
      await Category.create(categoryData);

      const res = await request(app)
        .post("/api/categories")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ name: "eletrônicos novos" })
        .expect("Content-Type", /json/)
        .expect(409);
      expect(res.body.message).toMatch(/Categoria com nome.*já existe/i);
    });

    it("Deve retornar 400 se o nome estiver faltando", async () => {
      const res = await request(app)
        .post("/api/categories")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ description: "Sem nome" })
        .expect("Content-Type", /json/)
        .expect(400);
      expect(res.body.errors).toBeInstanceOf(Array);
      const nameError = res.body.errors.find((err) => err.path === "name");
      expect(nameError).toBeDefined();
      expect(nameError.msg).toContain("obrigatório");
    });

    it("Usuário normal NÃO deve criar categoria (403)", async () => {
      await request(app)
        .post("/api/categories")
        .set("Authorization", `Bearer ${userToken}`)
        .send(categoryData)
        .expect(403);
    });

    it("Deve retornar 401 sem token", async () => {
      await request(app).post("/api/categories").send(categoryData).expect(401);
    });
  });

  // --- Testes GET / ---
  describe("GET /", () => {
    it("Deve retornar lista de categorias ordenada por nome", async () => {
      await Category.create({ name: "Roupas" });
      await Category.create({ name: "Acessórios" });
      await Category.create({ name: "Calçados" });

      const res = await request(app)
        .get("/api/categories")
        .expect("Content-Type", /json/)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body).toHaveLength(3);
      const names = res.body.map((c) => c.name);
      expect(names).toEqual(["Acessórios", "Calçados", "Roupas"]); // Verifica ordem
    });

    it("Deve retornar lista vazia se não houver categorias", async () => {
      const res = await request(app).get("/api/categories").expect(200);
      expect(res.body).toHaveLength(0);
    });
  });

  // --- Testes GET /:id ---
  describe("GET /:id", () => {
    let testCat;
    beforeEach(async () => {
      testCat = await Category.create({
        name: "Teste Get ID",
        description: "Desc Get ID",
      });
    });

    it("Deve retornar uma categoria específica por ID", async () => {
      const res = await request(app)
        .get(`/api/categories/${testCat._id}`)
        .expect("Content-Type", /json/)
        .expect(200);
      expect(res.body.name).toBe("Teste Get ID");
      expect(res.body._id.toString()).toBe(testCat._id.toString());
      expect(res.body.slug).toBe("teste-get-id");
    });

    it("Deve retornar 404 se ID não existir", async () => {
      const nonExistentId = new mongoose.Types.ObjectId();
      const res = await request(app)
        .get(`/api/categories/${nonExistentId}`)
        .expect("Content-Type", /json/)
        .expect(404);
      expect(res.body.message).toMatch(/Categoria não encontrada/i);
    });

    it("Deve retornar 400 se ID for inválido", async () => {
      const res = await request(app)
        .get("/api/categories/invalid-id")
        .expect("Content-Type", /json/)
        .expect(400);
      expect(res.body.errors).toBeInstanceOf(Array);
      expect(res.body.errors[0].msg).toMatch(/ID de categoria inválido/i);
    });
  });

  // --- Testes PUT /:id ---
  describe("PUT /:id", () => {
    let testCat;
    const updateData = {
      name: "Categoria Editada PUT",
      description: "Nova Desc PUT",
    };
    beforeEach(async () => {
      testCat = await Category.create({
        name: "Original",
        description: "Orig Desc",
      });
    });

    it("Admin deve atualizar categoria com sucesso", async () => {
      const res = await request(app)
        .put(`/api/categories/${testCat._id}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send(updateData)
        .expect("Content-Type", /json/)
        .expect(200);

      expect(res.body.name).toBe(updateData.name);
      expect(res.body.description).toBe(updateData.description);
      expect(res.body.slug).toBe("categoria-editada-put");

      // Verifica DB
      const dbCat = await Category.findById(testCat._id);
      expect(dbCat.name).toBe(updateData.name);
      expect(dbCat.slug).toBe("categoria-editada-put");
    });

    it("Usuário normal NÃO deve atualizar categoria (403)", async () => {
      await request(app)
        .put(`/api/categories/${testCat._id}`)
        .set("Authorization", `Bearer ${userToken}`)
        .send(updateData)
        .expect(403);
    });

    it("Deve retornar 404 se ID não existir", async () => {
      const nonExistentId = new mongoose.Types.ObjectId();
      const res = await request(app)
        .put(`/api/categories/${nonExistentId}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send(updateData)
        .expect("Content-Type", /json/)
        .expect(404);
      expect(res.body.message).toMatch(/Categoria não encontrada/i);
    });

    it("Deve retornar 400 se ID for inválido", async () => {
      const res = await request(app)
        .put("/api/categories/invalid-id")
        .set("Authorization", `Bearer ${adminToken}`)
        .send(updateData)
        .expect("Content-Type", /json/)
        .expect(400);
      expect(res.body.errors).toBeInstanceOf(Array);
      expect(res.body.errors[0].msg).toMatch(/ID de categoria inválido/i);
    });

    it("Deve retornar 400 se dados forem inválidos (nome vazio)", async () => {
      const res = await request(app)
        .put(`/api/categories/${testCat._id}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ name: "" })
        .expect("Content-Type", /json/)
        .expect(400);
      expect(res.body.errors).toBeInstanceOf(Array);
      expect(res.body.errors[0].msg).toMatch(/obrigatório/i);
    });

    it("Deve retornar 409 se tentar atualizar para nome duplicado", async () => {
      await Category.create({ name: "Nome Existente PUT" });
      const res = await request(app)
        .put(`/api/categories/${testCat._id}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ name: "Nome Existente PUT" })
        .expect("Content-Type", /json/)
        .expect(409);

      expect(res.body.message).toMatch(
        /Já existe uma categoria com nome\/slug similar/i
      );
    });

    it("Deve retornar 401 sem token", async () => {
      await request(app)
        .put(`/api/categories/${testCat._id}`)
        .send(updateData)
        .expect(401);
    });
  });

  // --- Testes DELETE /:id ---
  describe("DELETE /:id", () => {
    let catToDelete;
    let catWithProduct;
    let productInCategory;
    let testCategoryIdForProduct;

    beforeEach(async () => {
      catToDelete = await Category.create({ name: "Para Deletar" });
      catWithProduct = await Category.create({ name: "Com Produto" });
      testCategoryIdForProduct = catWithProduct._id;
      productInCategory = await Product.create({
        name: "Produto Associado",
        price: 10,
        category: testCategoryIdForProduct,
        image: "assoc.jpg",
        stock: 1,
      });
    });

    it("Admin deve deletar categoria VAZIA com sucesso", async () => {
      const res = await request(app)
        .delete(`/api/categories/${catToDelete._id}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.message).toMatch(/Categoria removida com sucesso/i);

      const deleted = await Category.findById(catToDelete._id);
      expect(deleted).toBeNull();
    });

    it("Admin NÃO deve conseguir deletar categoria COM produtos associados (400)", async () => {
      const res = await request(app)
        .delete(`/api/categories/${catWithProduct._id}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .expect("Content-Type", /json/)
        .expect(400);

      expect(res.body.message).toMatch(
        /Não é possível deletar. Existem 1 produto\(s\) nesta categoria/i
      );

      const notDeleted = await Category.findById(catWithProduct._id);
      expect(notDeleted).not.toBeNull();
      const prodExists = await Product.findById(productInCategory._id);
      expect(prodExists).not.toBeNull();
    });

    it("Usuário normal NÃO deve deletar categoria (403)", async () => {
      await request(app)
        .delete(`/api/categories/${catToDelete._id}`)
        .set("Authorization", `Bearer ${userToken}`)
        .expect(403);
    });

    it("Deve retornar 404 se ID não existir", async () => {
      const nonExistentId = new mongoose.Types.ObjectId();
      const res = await request(app)
        .delete(`/api/categories/${nonExistentId}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .expect("Content-Type", /json/)
        .expect(404);
      expect(res.body.message).toMatch(/Categoria não encontrada/i);
    });

    it("Deve retornar 400 se ID for inválido", async () => {
      const res = await request(app)
        .delete("/api/categories/invalid-id")
        .set("Authorization", `Bearer ${adminToken}`)
        .expect("Content-Type", /json/)
        .expect(400);
      expect(res.body.errors).toBeInstanceOf(Array);
      expect(res.body.errors[0].msg).toMatch(/ID de categoria inválido/i);
    });

    it("Deve retornar 401 sem token", async () => {
      await request(app)
        .delete(`/api/categories/${catToDelete._id}`)
        .expect(401);
    });
  });
});
