// src/tests/auth.test.js
import request from "supertest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import app from "../app.js";
import User from "../models/User.js";
import jwt from "jsonwebtoken";

let mongoServer;

// --- Bloco de Setup e Teardown ---
beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const mongoUri = mongoServer.getUri();
  await mongoose.connect(mongoUri);
  if (!process.env.JWT_SECRET) {
    process.env.JWT_SECRET = "test-secret-for-auth-please-replace";
    console.warn(
      "JWT_SECRET não definido, usando valor padrão para testes de auth."
    );
  }
  await User.deleteMany({});
});

afterEach(async () => {
  await User.deleteMany({});
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

// --- Bloco de Testes para Autenticação ---
describe("/api/auth", () => {
  // --- Testes de Registro ---
  describe("POST /register", () => {
    const validUserData = {
      name: "Test User Register",
      email: "register@test.com",
      password: "password123",
      passwordConfirm: "password123",
      cpf: "09453681008",
      birthDate: "1990-01-15",
    };

    const existingUserCPF = "09453681008";
    const otherValidCPF = "79785836002";

    it("deve registrar um novo usuário com sucesso e retornar um token", async () => {
      const res = await request(app)
        .post("/api/auth/register")
        .send(validUserData)
        .expect("Content-Type", /json/)
        .expect(201);

      expect(res.body).toHaveProperty("status", "success");
      expect(res.body).toHaveProperty("token");
      expect(res.body.token).toEqual(expect.any(String));
      expect(res.body.data.user).toBeDefined();
      expect(res.body.data.user.name).toBe(validUserData.name);
      expect(res.body.data.user.email).toBe(validUserData.email);
      expect(res.body.data.user.role).toBe("user");
      expect(res.body.data.user.password).toBeUndefined();

      const decoded = jwt.verify(res.body.token, process.env.JWT_SECRET);
      expect(decoded.id).toBeDefined();
      expect(decoded.role).toBe("user");

      const dbUser = await User.findOne({ email: validUserData.email }).select(
        "+cpf +birthDate +password"
      );
      expect(dbUser).not.toBeNull();
      expect(dbUser.email).toBe(validUserData.email);
      expect(dbUser.password).not.toBe("password123");
      expect(await dbUser.correctPassword("password123", dbUser.password)).toBe(
        true
      );
      expect(dbUser.cpf).toBe(validUserData.cpf.replace(/\D/g, ""));
      expect(dbUser.birthDate).toEqual(
        new Date(validUserData.birthDate + "T00:00:00.000Z")
      );
    });

    it("deve retornar erro 400 se o email já estiver registrado", async () => {
      await User.create({
        name: "Existing User",
        email: "duplicate@test.com",
        password: "password123",
        cpf: otherValidCPF,
        birthDate: "1985-03-20",
      });

      const duplicateEmailData = {
        ...validUserData,
        email: "duplicate@test.com",
        cpf: existingUserCPF,
      };

      const res = await request(app)
        .post("/api/auth/register")
        .send(duplicateEmailData)
        .expect("Content-Type", /json/)
        .expect(400);

        expect(res.body.status).toBe('fail');
      const emailError = res.body.errors.find((err) => err.path === "email");
      expect(emailError).toBeDefined();
      expect(emailError.msg).toContain("Este E-mail já está registrado");
    });

    it("deve retornar erro 400 se o CPF já estiver registrado", async () => {
      await User.create({
        name: "Existing User CPF",
        email: "other@email.com",
        password: "password123",
        cpf:existingUserCPF,
        birthDate: "1985-03-20",
      });

      const duplicateCPFData = {
        ...validUserData,
        email: "register@test.com",
        cpf: existingUserCPF,
      };

      const res = await request(app)
        .post("/api/auth/register")
        .send(duplicateCPFData)
        .expect("Content-Type", /json/)
        .expect(400);

        expect(res.body.status).toBe('fail');
        const cpfError = res.body.errors.find(err => err.path === 'cpf');
      expect(cpfError).toBeDefined();
      expect(cpfError.msg).toContain("Este CPF já está registrado");
    });

    it("deve retornar erro 400 se passwordConfirm não coincidir", async () => {
      const mismatchPasswordData = {
        ...validUserData,
        passwordConfirm: "differentpassword",
        cpf: otherValidCPF,
      };

      const res = await request(app)
        .post("/api/auth/register")
        .send(mismatchPasswordData)
        .expect("Content-Type", /json/)
        .expect(400);

      expect(res.body).toHaveProperty("status", "fail");
      expect(res.body).toHaveProperty("errors");
      const passwordConfirmError = res.body.errors.find(
        (err) => err.path === "passwordConfirm"
      );
      expect(passwordConfirmError).toBeDefined();
      expect(passwordConfirmError.msg).toContain("As senhas não coincidem");
    });

    it("deve retornar erro 400 se o nome estiver faltando", async () => {
      const { name, ...dataWithoutName } = validUserData;
      dataWithoutName.cpf = otherValidCPF;
      const res = await request(app)
        .post("/api/auth/register")
        .send(dataWithoutName)
        .expect(400);
      expect(res.body.status).toBe("fail");
      const nameError = res.body.errors.find((err) => err.path === "name");
      expect(nameError).toBeDefined();
      expect(nameError.msg).toContain("Nome é obrigatório");
    });

    it("deve retornar erro 400 se o CPF estiver faltando", async () => {
      const { cpf, ...dataWithoutCPF } = validUserData;
      const res = await request(app)
        .post("/api/auth/register")
        .send(dataWithoutCPF)
        .expect(400);
      expect(res.body.status).toBe("fail");
      const cpfError = res.body.errors.find((err) => err.path === "cpf");
      expect(cpfError).toBeDefined();
      expect(cpfError.msg).toContain("CPF é obrigatório");
    });

    it("deve retornar erro 400 se o CPF for inválido (formato ou dígito verificador)", async () => {
      const invalidCPFData = { ...validUserData, cpf: "11111111111" };
      const res = await request(app)
        .post("/api/auth/register")
        .send(invalidCPFData)
        .expect(400);
      expect(res.body.status).toBe("fail");
      const cpfError = res.body.errors.find((err) => err.path === "cpf");
      expect(cpfError).toBeDefined();
      expect(cpfError.msg).toContain('CPF inválido (formato ou dígito verificador)');
    });

    it("deve retornar erro 400 se a Data de Nascimento estiver faltando", async () => {
      const { birthDate, ...dataWithoutBirthDate } = validUserData;
      const res = await request(app)
        .post("/api/auth/register")
        .send(dataWithoutBirthDate)
        .expect(400);
      expect(res.body.status).toBe("fail");
      const birthDateError = res.body.errors.find(
        (err) => err.path === "birthDate"
      );
      expect(birthDateError).toBeDefined();
      expect(birthDateError.msg).toContain("Data de nascimento é obrigatória");
    });

    it("deve retornar erro 400 se a Data de Nascimento for inválida (formato)", async () => {
      const invalidBirthDateData = {
        ...validUserData,
        birthDate: "15-01-1990",
      };
      const res = await request(app)
        .post("/api/auth/register")
        .send(invalidBirthDateData)
        .expect(400);
      expect(res.body.status).toBe("fail");
      const birthDateError = res.body.errors.find(
        (err) => err.path === "birthDate"
      );
      expect(birthDateError).toBeDefined();
    });

    it("deve retornar erro 400 se a Data de Nascimento indicar idade < 16", async () => {
      const today = new Date();
      const youngBirthDate = `${today.getFullYear() - 15}-01-01`;
      const youngUserData = { ...validUserData, birthDate: youngBirthDate };
      const res = await request(app)
        .post("/api/auth/register")
        .send(youngUserData)
        .expect(400);
      expect(res.body.status).toBe("fail");
      const birthDateError = res.body.errors.find(
        (err) => err.path === "birthDate"
      );
      expect(birthDateError).toBeDefined();
      expect(birthDateError.msg).toContain("pelo menos 16 anos");
    });

    it("deve retornar erro 400 se a senha for muito curta", async () => {
      const shortPasswordData = {
        ...validUserData,
        password: "123",
        passwordConfirm: "123",
      };
      const res = await request(app)
        .post("/api/auth/register")
        .send(shortPasswordData)
        .expect(400);
      expect(res.body.status).toBe("fail");
      const passwordError = res.body.errors.find(
        (err) => err.path === "password"
      );
      expect(passwordError).toBeDefined();
      expect(passwordError.msg).toContain("mínimo 8 caracteres");
    });
  });

  // --- Testes de Login ---
  describe("POST /login", () => {
    const userCredentials = {
      email: "login@test.com",
      password: "password123",
    };
    const loginUserData = {
      name: "Login User",
      email: userCredentials.email,
      password: userCredentials.password,
      cpf: "47483321075",
      birthDate: "1988-11-11",
    };

    // Cria um usuário VÁLIDO antes de cada teste de login
    beforeEach(async () => {
      await User.create(loginUserData);
    });

    it("deve logar um usuário existente com sucesso e retornar um token", async () => {
      const res = await request(app)
        .post("/api/auth/login")
        .send(userCredentials)
        .expect("Content-Type", /json/)
        .expect(200);

      expect(res.body).toHaveProperty("status", "success");
      expect(res.body).toHaveProperty("token");
      expect(res.body.token).toEqual(expect.any(String));

      const decoded = jwt.verify(res.body.token, process.env.JWT_SECRET);
      const dbUser = await User.findOne({ email: userCredentials.email });
      expect(decoded.id).toBe(dbUser._id.toString());
      expect(decoded.role).toBe(dbUser.role);
    });

    it("deve retornar erro 401 com senha incorreta", async () => {
      const wrongPasswordData = {
        email: userCredentials.email,
        password: "wrongpassword",
      };

      const res = await request(app)
        .post("/api/auth/login")
        .send(wrongPasswordData)
        .expect("Content-Type", /json/)
        .expect(401);

      // A resposta de erro 401 vem do errorHandler agora
      expect(res.body).toHaveProperty("status", "fail");
      expect(res.body).toHaveProperty("message", "Credenciais inválidas");
    });

    it("deve retornar erro 401 com email não registrado", async () => {
      const nonExistentEmailData = {
        email: "notfound@test.com",
        password: userCredentials.password,
      };

      const res = await request(app)
        .post("/api/auth/login")
        .send(nonExistentEmailData)
        .expect("Content-Type", /json/)
        .expect(401);

      expect(res.body).toHaveProperty("status", "fail");
      expect(res.body).toHaveProperty("message", "Credenciais inválidas");
    });

    it("deve retornar erro 400 se o email estiver faltando", async () => {
      const { email, ...dataWithoutEmail } = userCredentials;
      const res = await request(app)
        .post("/api/auth/login")
        .send(dataWithoutEmail)
        .expect("Content-Type", /json/)
        .expect(400);

      expect(res.body).toHaveProperty("status", "fail");
      expect(res.body).toHaveProperty("errors");
      const emailError = res.body.errors.find((err) => err.path === "email");
      expect(emailError).toBeDefined();
    });

    it("deve retornar erro 400 se a senha estiver faltando", async () => {
      const { password, ...dataWithoutPassword } = userCredentials;
      const res = await request(app)
        .post("/api/auth/login")
        .send(dataWithoutPassword)
        .expect("Content-Type", /json/)
        .expect(400);

      expect(res.body).toHaveProperty("status", "fail");
      expect(res.body).toHaveProperty("errors");
      const passwordError = res.body.errors.find(
        (err) => err.path === "password"
      );
      expect(passwordError).toBeDefined();
    });

    it('deve permitir acesso a rota protegida logo após o login (antes da mudança de senha)', async () => {
      const loginRes = await request(app)
          .post('/api/auth/login')
          .send(userCredentials)
          .expect(200);
      const token = loginRes.body.token;
  
      await request(app)
          .get('/api/auth/me')
          .set('Authorization', `Bearer ${token}`)
          .expect(200); 
  });
  });
});
