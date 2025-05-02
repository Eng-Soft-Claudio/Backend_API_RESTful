// src/tests/config.test.js
import request from "supertest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import app from "../app.js"; // Ajuste o caminho

let mongoServer;
let originalMpPublicKey;

// --- Setup e Teardown ---
beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const mongoUri = mongoServer.getUri();
  await mongoose.connect(mongoUri);

  originalMpPublicKey = process.env.MP_PUBLIC_KEY;

  // Garantir JWT_SECRET
  if (!process.env.JWT_SECRET) {
    process.env.JWT_SECRET = "test-secret-for-config";
  }
});

afterEach(() => {
  if (originalMpPublicKey !== undefined) {
    process.env.MP_PUBLIC_KEY = originalMpPublicKey;
  } else {
    delete process.env.MP_PUBLIC_KEY;
  }
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
  if (originalMpPublicKey !== undefined) {
    process.env.MP_PUBLIC_KEY = originalMpPublicKey;
  } else {
    delete process.env.MP_PUBLIC_KEY;
  }
});

// --- Testes para Config ---
describe("/api/config", () => {
  describe("GET /mp-public-key", () => {
    it("deve retornar a chave pública do Mercado Pago se configurada", async () => {
      const testPublicKey = "TEST-PUB-12345-KEY";
      process.env.MP_PUBLIC_KEY = testPublicKey;

      const res = await request(app)
        .get("/api/config/mp-public-key")
        .expect("Content-Type", /json/)
        .expect(200);

      expect(res.body).toBeDefined();
      expect(res.body.publicKey).toBe(testPublicKey);

      delete process.env.MP_PUBLIC_KEY;
    });

    it("deve retornar erro 503 se a chave pública não estiver configurada", async () => {
      delete process.env.MP_PUBLIC_KEY;

      const res = await request(app)
        .get("/api/config/mp-public-key")
        .expect("Content-Type", /json/)
        .expect(503);

      expect(res.body).toBeDefined();
      expect(res.body.status).toBe("error");
      expect(res.body.message).toMatch(
        /Configuração de pagamento indisponível/i
      );
    });

    it("deve retornar erro 503 se a chave pública estiver configurada como string vazia", async () => {
      process.env.MP_PUBLIC_KEY = "";

      const res = await request(app)
        .get("/api/config/mp-public-key")
        .expect("Content-Type", /json/)
        .expect(503);

      expect(res.body).toBeDefined();
      expect(res.body.status).toBe("error");
      expect(res.body.message).toMatch(
        /Configuração de pagamento indisponível/i
      );
    });
  });
});
