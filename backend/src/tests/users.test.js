// src/tests/users.test.js
import request from "supertest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import app from "../app";
import User from "../models/User";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";

let mongoServer;
let adminToken;
let userToken;
let userId;
let adminId;

// --- Dados de Teste Padrão ---
const defaultAdminData = {
  name: "Admin Test",
  email: "admin@test.com",
  password: "password123",
  cpf: "11122233344", // CPF Único
  birthDate: new Date("1990-01-01"),
  role: "admin",
};

const defaultUserData = {
  name: "User Test",
  email: "user@test.com",
  password: "password123",
  cpf: "55566677788", // CPF Único
  birthDate: new Date("1995-05-05"),
  role: "user",
};

// --- Bloco de Setup e Teardown ---

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const mongoUri = mongoServer.getUri();
  await mongoose.connect(mongoUri);
  // Garantir JWT_SECRET
  if (!process.env.JWT_SECRET) {
    process.env.JWT_SECRET = "test-secret-for-user-please-replace";
    console.warn(
      "JWT_SECRET não definido, usando valor padrão para testes de user."
    );
  }
});

beforeEach(async () => {
  await User.deleteMany({});

  const adminUser = await User.create(defaultAdminData);
  const normalUser = await User.create(defaultUserData);

  adminId = adminUser._id;
  userId = normalUser._id;

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

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

// --- Bloco de Testes para Usuários ---

describe("/api/users", () => {
  // === Testes de Rotas de Admin ===
  describe("[Admin] POST /", () => {
    const newUserAdminData = {
      name: "New Admin By Admin",
      email: "newadmin@test.com",
      password: "passwordValid8",
      cpf: "12345678901",
      birthDate: "1988-08-08",
      role: "admin",
    };
    const newUserUserData = {
      name: "New User By Admin",
      email: "newuser@test.com",
      password: "passwordValid8",
      cpf: "09876543210",
      birthDate: "1999-09-09",
      role: "user",
    };
    const newUserDefaultRoleData = {
      name: "New User Default",
      email: "newuserdefault@test.com",
      password: "passwordValid8",
      cpf: "11223344556",
      birthDate: "2000-10-10",
    };

    it("Admin deve conseguir criar um novo usuário (role user) com todos os campos", async () => {
      const res = await request(app)
        .post("/api/users")
        .set("Authorization", `Bearer ${adminToken}`)
        .send(newUserUserData)
        .expect("Content-Type", /json/)
        .expect(201);

      expect(res.body.status).toBe("success");
      expect(res.body.data.user.name).toBe(newUserUserData.name);
      expect(res.body.data.user.email).toBe(newUserUserData.email);
      expect(res.body.data.user.role).toBe("user");
      expect(res.body.data.user.password).toBeUndefined(); 
      expect(res.body.data.user.cpf).toBeUndefined(); 
      expect(res.body.data.user.birthDate).toBeUndefined();

      const dbUser = await User.findOne({
        email: newUserUserData.email,
      }).select("+cpf +birthDate +password");
      expect(dbUser).not.toBeNull();
      expect(dbUser.role).toBe("user");
      expect(dbUser.cpf).toBe(newUserUserData.cpf);
      expect(dbUser.birthDate).toEqual(new Date(newUserUserData.birthDate));
      expect(await bcrypt.compare("passwordValid8", dbUser.password)).toBe(
        true
      ); 
      expect(dbUser.passwordChangedAt).toBeUndefined(); 
    });

    it("Admin deve conseguir criar um novo usuário (role admin)", async () => {
      const res = await request(app)
        .post("/api/users")
        .set("Authorization", `Bearer ${adminToken}`)
        .send(newUserAdminData)
        .expect(201);

      expect(res.body.data.user.role).toBe("admin");
      const dbUser = await User.findOne({ email: newUserAdminData.email });
      expect(dbUser).not.toBeNull();
      expect(dbUser.role).toBe("admin");
    });

    it("Admin deve criar usuário com role user se nenhuma role for especificada", async () => {
      const res = await request(app)
        .post("/api/users")
        .set("Authorization", `Bearer ${adminToken}`)
        .send(newUserDefaultRoleData)
        .expect(201);

      expect(res.body.data.user.role).toBe("user");
      const dbUser = await User.findOne({
        email: newUserDefaultRoleData.email,
      });
      expect(dbUser.role).toBe("user");
    });

    it("Usuário normal NÃO deve conseguir criar usuário (403 Forbidden)", async () => {
      await request(app)
        .post("/api/users")
        .set("Authorization", `Bearer ${userToken}`)
        .send(newUserUserData)
        .expect(403); // Assumindo que a rota tem middleware restrictTo('admin')
    });

    it("Deve retornar erro 400 ao tentar criar com email duplicado", async () => {
      const res = await request(app)
        .post("/api/users")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ ...newUserUserData, email: defaultUserData.email })
        .expect(400);
      expect(res.body.status).toBe("fail");
      expect(res.body.errors).toBeInstanceOf(Array);
      expect(res.body.errors.length).toBeGreaterThanOrEqual(1);
      const emailError = res.body.errors.find((err) => err.path === "email");
      expect(emailError).toBeDefined();
      expect(emailError.msg).toMatch(/Este E-mail já está registrado/i);
    });

    it("Deve retornar erro 400 ao tentar criar com CPF duplicado", async () => {
      const res = await request(app)
        .post("/api/users")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ ...newUserUserData, cpf: defaultUserData.cpf })
        .expect(400);
      expect(res.body.status).toBe("fail");
      expect(res.body.errors).toBeInstanceOf(Array);
      expect(res.body.errors.length).toBeGreaterThanOrEqual(1);
      const cpfError = res.body.errors.find((err) => err.path === "cpf");
      expect(cpfError).toBeDefined();
      expect(cpfError.msg).toMatch(/Este CPF já está registrado/i);
    });

    it("Deve retornar erro 400 se campos obrigatórios faltarem (nome, email, senha, cpf, birthDate)", async () => {
      const baseData = {
        name: "Test Missing",
        email: "missing@test.com",
        password: "password123",
        cpf: "11111111111",
        birthDate: "2001-01-01",
      };

      // Sem nome
      const { name, ...noName } = baseData;
      await request(app)
        .post("/api/users")
        .set("Authorization", `Bearer ${adminToken}`)
        .send(noName)
        .expect(400);

      // Sem email
      const { email, ...noEmail } = baseData;
      await request(app)
        .post("/api/users")
        .set("Authorization", `Bearer ${adminToken}`)
        .send(noEmail)
        .expect(400);

      // Sem senha
      const { password, ...noPassword } = baseData;
      await request(app)
        .post("/api/users")
        .set("Authorization", `Bearer ${adminToken}`)
        .send(noPassword)
        .expect(400);

      // Sem CPF
      const { cpf, ...noCpf } = baseData;
      await request(app)
        .post("/api/users")
        .set("Authorization", `Bearer ${adminToken}`)
        .send(noCpf)
        .expect(400);

      // Sem birthDate
      const { birthDate, ...noBirthDate } = baseData;
      await request(app)
        .post("/api/users")
        .set("Authorization", `Bearer ${adminToken}`)
        .send(noBirthDate)
        .expect(400);
    });

    it("Deve retornar erro 400 se a senha for muito curta (menos de 8 caracteres)", async () => {
      const shortPasswordData = { ...newUserUserData, password: "short" };
      await request(app)
        .post("/api/users")
        .set("Authorization", `Bearer ${adminToken}`)
        .send(shortPasswordData)
        .expect(400);
      // A mensagem exata depende da validação do Mongoose ou express-validator
      // expect(res.body.message).toMatch(/password.*minimum allowed length.*8/i);
    });

    it("Deve retornar erro 401 se não autenticado", async () => {
      await request(app).post("/api/users").send(newUserUserData).expect(401);
    });
  });

  describe("[Admin] GET /", () => {
    it("Admin deve conseguir listar todos os usuários (sem senhas, cpfs, birthDates)", async () => {
      // Usuários já criados no beforeEach
      await User.create({
        name: "Third User",
        email: "third@test.com",
        password: "password123",
        cpf: "99988877766",
        birthDate: "2002-02-02",
      });

      const res = await request(app)
        .get("/api/users")
        .set("Authorization", `Bearer ${adminToken}`)
        .expect("Content-Type", /json/)
        .expect(200);

      expect(res.body.status).toBe("success");
      expect(res.body.results).toBe(3); // admin, user, third user
      expect(res.body.data.users.length).toBe(3);
      res.body.data.users.forEach((user) => {
        expect(user.password).toBeUndefined();
        expect(user.cpf).toBeUndefined();
        expect(user.birthDate).toBeUndefined();
        expect(user.passwordChangedAt).toBeUndefined();
      });

      const emails = res.body.data.users.map((u) => u.email);
      expect(emails).toEqual(
        expect.arrayContaining([
          defaultAdminData.email,
          defaultUserData.email,
          "third@test.com",
        ])
      );
    });

    it("Usuário normal NÃO deve conseguir listar todos os usuários (403 Forbidden)", async () => {
      await request(app)
        .get("/api/users")
        .set("Authorization", `Bearer ${userToken}`)
        .expect(403); // Assumindo middleware restrictTo('admin')
    });

    it("Deve retornar 401 se não autenticado", async () => {
      await request(app).get("/api/users").expect(401);
    });
  });

  describe("[Admin] GET /:id", () => {
    it("Admin deve conseguir obter um usuário por ID (sem senha/cpf/birthDate)", async () => {
      const res = await request(app)
        .get(`/api/users/${userId}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.status).toBe("success");
      expect(res.body.data.user._id).toBe(userId.toString());
      expect(res.body.data.user.email).toBe(defaultUserData.email);
      expect(res.body.data.user.password).toBeUndefined();
      expect(res.body.data.user.cpf).toBeUndefined();
      expect(res.body.data.user.birthDate).toBeUndefined();
    });

    it("Usuário normal NÃO deve conseguir obter outro usuário por ID (403 Forbidden)", async () => {
      await request(app)
        .get(`/api/users/${adminId}`)
        .set("Authorization", `Bearer ${userToken}`)
        .expect(403); // Assumindo middleware restrictTo('admin')
    });

    it("Deve retornar 404 para ID de usuário não existente", async () => {
      const nonExistentId = new mongoose.Types.ObjectId();
      await request(app)
        .get(`/api/users/${nonExistentId}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(404);
    });

    it("Deve retornar 400 para ID mal formatado (CastError)", async () => {
      const res = await request(app)
        .get(`/api/users/invalididformat`)
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(400);
      expect(res.body.status).toBe("fail");
      expect(res.body.errors).toBeInstanceOf(Array);
      expect(res.body.errors.length).toBeGreaterThanOrEqual(1);
      const idError = res.body.errors.find((err) => err.path === "id");
      expect(idError).toBeDefined();
      expect(idError.msg).toMatch(/ID inválido para id/i);
    });

    it("Deve retornar 401 se não autenticado", async () => {
      await request(app).get(`/api/users/${userId}`).expect(401);
    });
  });

  describe("[Admin] PATCH /:id", () => {
    const updateData = {
      name: "User Test Updated By Admin",
      email: "user.updated.admin@test.com",
      role: "admin",
    };

    it("Admin deve conseguir atualizar nome, email e role de um usuário (user -> admin)", async () => {
      const res = await request(app)
        .patch(`/api/users/${userId}`) // Atualiza o usuário normal
        .set("Authorization", `Bearer ${adminToken}`)
        .send(updateData)
        .expect("Content-Type", /json/)
        .expect(200);

      expect(res.body.status).toBe("success");
      expect(res.body.data.user.name).toBe(updateData.name);
      expect(res.body.data.user.email).toBe(updateData.email);
      expect(res.body.data.user.role).toBe(updateData.role);
      expect(res.body.data.user.password).toBeUndefined(); // Garante que senha não foi afetada/retornada

      const dbUser = await User.findById(userId);
      expect(dbUser.name).toBe(updateData.name);
      expect(dbUser.email).toBe(updateData.email);
      expect(dbUser.role).toBe(updateData.role);
    });

    it("Admin NÃO deve conseguir rebaixar outro admin por esta rota (400 Bad Request)", async () => {
      // Tenta rebaixar o admin criado no beforeEach
      const demoteData = { role: "user" };
      const res = await request(app)
        .patch(`/api/users/${adminId}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send(demoteData)
        .expect(400);

      expect(res.body.message).toMatch(
        /Não é permitido rebaixar um administrador/i
      );
      const dbUser = await User.findById(adminId);
      expect(dbUser.role).toBe("admin"); // Role não deve ter mudado
    });

    it("Admin NÃO deve conseguir atualizar senha por esta rota (PATCH /:id)", async () => {
      const initialUser = await User.findById(userId).select("+password");
      const initialPasswordHash = initialUser.password;

      const passwordUpdateAttempt = { password: "newpassword123" };
      await request(app)
        .patch(`/api/users/${userId}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send(passwordUpdateAttempt) // Envia a senha, mas deve ser filtrada pelo filterObj
        .expect(200); // A requisição em si pode ser ok, mas a senha não é atualizada

      const dbUser = await User.findById(userId).select("+password");
      expect(dbUser.password).toBe(initialPasswordHash); // Senha não deve ter mudado
      expect(dbUser.passwordChangedAt).toBeUndefined(); // Não deve ter sido definido
    });

    it("Admin NÃO deve conseguir atualizar CPF ou Data de Nascimento por esta rota", async () => {
      const initialUser = await User.findById(userId).select("+cpf +birthDate");
      const initialCpf = initialUser.cpf;
      const initialBirthDate = initialUser.birthDate;

      const sensitiveDataUpdate = {
        cpf: "00000000000",
        birthDate: "1900-01-01",
      };
      await request(app)
        .patch(`/api/users/${userId}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send(sensitiveDataUpdate) // Envia os campos, mas devem ser filtrados
        .expect(200);

      const dbUser = await User.findById(userId).select("+cpf +birthDate");
      expect(dbUser.cpf).toBe(initialCpf); // CPF não deve ter mudado
      expect(dbUser.birthDate).toEqual(initialBirthDate); // Data não deve ter mudado
    });

    it("Usuário normal NÃO deve conseguir atualizar outro usuário (403 Forbidden)", async () => {
      await request(app)
        .patch(`/api/users/${adminId}`)
        .set("Authorization", `Bearer ${userToken}`)
        .send({ name: "Attempt update by user" })
        .expect(403); // Assumindo middleware restrictTo('admin')
    });

    it("Deve retornar 400 ao tentar atualizar para email duplicado", async () => {
      const res = await request(app)
        .patch(`/api/users/${userId}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ email: defaultAdminData.email })
        .expect(400);
      expect(res.body.errors).toBeInstanceOf(Array);
      expect(res.body.errors.length).toBeGreaterThanOrEqual(1);
      const emailError = res.body.errors.find((err) => err.path === "email");
      expect(emailError).toBeDefined();
      expect(emailError.msg).toMatch(
        /Este E-mail já está registrado por outro usuário/i
      );
    });

    it("Deve retornar 404 ao tentar atualizar usuário não existente", async () => {
      const nonExistentId = new mongoose.Types.ObjectId();
      await request(app)
        .patch(`/api/users/${nonExistentId}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ name: "Update Non Existent" })
        .expect(404);
    });

    it("Deve retornar 400 ao tentar atualizar com ID mal formatado", async () => {
      const res = await request(app)
        .patch(`/api/users/invalididformat`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ name: "Update Invalid ID" })
        .expect(400);
      expect(res.body.errors).toBeInstanceOf(Array);
      expect(res.body.errors.length).toBeGreaterThanOrEqual(1);
      const idError = res.body.errors.find((err) => err.path === "id");
      expect(idError).toBeDefined();
      expect(idError.msg).toMatch(/ID inválido para id/i);
    });

    it("Deve retornar 401 se não autenticado", async () => {
      await request(app)
        .patch(`/api/users/${userId}`)
        .send(updateData)
        .expect(401);
    });

    it("Deve acionar validadores (runValidators: true) e falhar com dados inválidos", async () => {
      // Tentar atualizar com email inválido (exemplo)
      await request(app)
        .patch(`/api/users/${userId}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ email: "invalid-email" })
        .expect(400); // Espera erro de validação do Mongoose ou express-validator
    });
  });

  describe("[Admin] DELETE /:id", () => {
    it("Admin deve conseguir deletar um usuário", async () => {
      await request(app)
        .delete(`/api/users/${userId}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(204); // No Content

      const dbUser = await User.findById(userId);
      expect(dbUser).toBeNull(); // Verifica se foi removido do DB
    });

    it("Usuário normal NÃO deve conseguir deletar outro usuário (403 Forbidden)", async () => {
      await request(app)
        .delete(`/api/users/${adminId}`)
        .set("Authorization", `Bearer ${userToken}`)
        .expect(403); // Assumindo middleware restrictTo('admin')

      const dbAdmin = await User.findById(adminId);
      expect(dbAdmin).not.toBeNull(); // Verifica se NÃO foi removido
    });

    it("Deve retornar 404 ao tentar deletar ID de usuário não existente", async () => {
      const nonExistentId = new mongoose.Types.ObjectId();
      await request(app)
        .delete(`/api/users/${nonExistentId}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(404);
    });

    it("Deve retornar 400 ao tentar deletar com ID mal formatado", async () => {
      const res = await request(app)
        .delete(`/api/users/invalid-user-id-format`)
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(400);
      expect(res.body.status).toBe("fail");
      expect(res.body.errors).toBeInstanceOf(Array);
      expect(res.body.errors.length).toBeGreaterThanOrEqual(1);
      const idError = res.body.errors.find((err) => err.path === "id");
      expect(idError).toBeDefined();
      expect(idError.msg).toMatch(/ID inválido para id/i);
    });

    it("Deve retornar 401 se não autenticado", async () => {
      await request(app).delete(`/api/users/${userId}`).expect(401);
    });
  });

  // === Testes de Rotas do Usuário Logado ===

  describe("[User] GET /me", () => {
    it("Usuário logado deve conseguir obter seu próprio perfil (sem senha/cpf/birthDate)", async () => {
      const res = await request(app)
        .get("/api/users/me")
        .set("Authorization", `Bearer ${userToken}`)
        .expect("Content-Type", /json/)
        .expect(200);

      expect(res.body.status).toBe("success");
      expect(res.body.data.user._id).toBe(userId.toString());
      expect(res.body.data.user.email).toBe(defaultUserData.email);
      expect(res.body.data.user.password).toBeUndefined();
      expect(res.body.data.user.cpf).toBeUndefined();
      expect(res.body.data.user.birthDate).toBeUndefined();
    });

    it("Deve retornar 401 se o usuário associado ao token válido não existir mais", async () => {
      // Deleta o usuário do DB *depois* que o token foi gerado no beforeEach
      await User.findByIdAndDelete(userId);

      await request(app)
        .get("/api/users/me")
        .set("Authorization", `Bearer ${userToken}`)
        .expect(401);
    });

    it("Deve retornar 401 se não estiver logado", async () => {
      await request(app).get("/api/users/me").expect(401);
    });
  });

  describe("[User] PATCH /me", () => {
    const selfUpdateData = {
      name: "User Updated Name Self",
      email: "user.new.self.email@test.com",
    };
    const attemptSensitiveUpdate = {
      role: "admin",
      password: "newpasswordtryingtohack",
      cpf: "00000000000",
      birthDate: "1900-01-01",
    };

    it("Usuário logado deve conseguir atualizar seu nome e email", async () => {
      const originalUser = await User.findById(userId).select(
        "+password +passwordChangedAt"
      );

      const res = await request(app)
        .patch("/api/users/me")
        .set("Authorization", `Bearer ${userToken}`)
        .send(selfUpdateData)
        .expect("Content-Type", /json/)
        .expect(200);

      // Verifica a resposta
      expect(res.body.data.user.name).toBe(selfUpdateData.name);
      expect(res.body.data.user.email).toBe(selfUpdateData.email);
      expect(res.body.data.user.role).toBe(defaultUserData.role); // Role não deve mudar
      expect(res.body.data.user.password).toBeUndefined();

      // Verifica o DB
      const dbUser = await User.findById(userId).select(
        "+password +passwordChangedAt"
      );
      expect(dbUser.name).toBe(selfUpdateData.name);
      expect(dbUser.email).toBe(selfUpdateData.email);
      expect(dbUser.role).toBe(defaultUserData.role);

      // Verifica que a senha e passwordChangedAt não foram alterados (testa pre-save hook e filterObj)
      expect(dbUser.password).toBe(originalUser.password);
      expect(dbUser.passwordChangedAt).toBeUndefined(); // Não deve ser setado
    });

    it("Usuário logado NÃO deve conseguir atualizar role, senha, cpf ou birthDate por esta rota", async () => {
      const originalUser = await User.findById(userId).select(
        "+password +cpf +birthDate +role"
      );

      const res = await request(app)
        .patch("/api/users/me")
        .set("Authorization", `Bearer ${userToken}`)
        .send(attemptSensitiveUpdate) // Envia campos proibidos
        .expect(200); // A requisição é OK, mas os campos são filtrados

      // Verifica a resposta (deve retornar o usuário como estava, sem as atualizações proibidas)
      expect(res.body.data.user.role).toBe(originalUser.role);
      expect(res.body.data.user.cpf).toBeUndefined(); // Não retorna
      expect(res.body.data.user.birthDate).toBeUndefined(); // Não retorna

      // Verifica o DB
      const dbUser = await User.findById(userId).select(
        "+password +cpf +birthDate +role"
      );
      expect(dbUser.role).toBe(originalUser.role);
      expect(dbUser.password).toBe(originalUser.password);
      expect(dbUser.cpf).toBe(originalUser.cpf);
      expect(dbUser.birthDate).toEqual(originalUser.birthDate);
      expect(dbUser.passwordChangedAt).toBeUndefined();
    });

    it("Deve retornar 400 se tentar atualizar para email duplicado (de outro usuário)", async () => {
      const updateWithDuplicateEmail = { email: defaultAdminData.email };
      const res = await request(app)
        .patch("/api/users/me")
        .set("Authorization", `Bearer ${userToken}`)
        .send(updateWithDuplicateEmail)
        .expect(400);
      expect(res.body.status).toBe("fail");
      expect(res.body.errors).toBeInstanceOf(Array);
      expect(res.body.errors.length).toBeGreaterThanOrEqual(1);
      const emailError = res.body.errors.find((err) => err.path === "email");
      expect(emailError).toBeDefined();
      expect(emailError.msg).toMatch(
        /Este E-mail já está registrado por outro usuário/i
      );
    });

    it("Deve acionar validadores (save) e falhar com dados inválidos", async () => {
      await request(app)
        .patch("/api/users/me")
        .set("Authorization", `Bearer ${userToken}`)
        .send({ email: "invalid-email-format" })
        .expect(400);
    });

    it("Deve retornar 401 se o usuário associado ao token não existir mais", async () => {
      await User.findByIdAndDelete(userId);
      await request(app)
        .patch("/api/users/me")
        .set("Authorization", `Bearer ${userToken}`)
        .send(selfUpdateData)
        .expect(401);
    });

    it("Deve retornar 401 se não estiver logado", async () => {
      await request(app)
        .patch("/api/users/me")
        .send(selfUpdateData)
        .expect(401);
    });
  });

  describe("[User] PATCH /updateMyPassword", () => {
    const passwordData = {
      currentPassword: defaultUserData.password,
      password: "newValidPassword123",
      passwordConfirm: "newValidPassword123",
    };

    it("Usuário logado deve conseguir atualizar sua senha com dados corretos", async () => {
      const res = await request(app)
        .patch("/api/users/updateMyPassword")
        .set("Authorization", `Bearer ${userToken}`)
        .send(passwordData)
        .expect("Content-Type", /json/)
        .expect(200);

      expect(res.body.status).toBe("success");
      expect(res.body.token).toBeDefined();
      expect(res.body.message).toMatch(/Senha atualizada com sucesso/i);

      // Verifica se passwordChangedAt foi definido no DB
      const dbUser = await User.findById(userId).select(
        "+password +passwordChangedAt"
      );
      expect(dbUser.passwordChangedAt).toBeDefined();
      // Verifica se a senha no DB foi realmente alterada e hasheada
      expect(
        await bcrypt.compare(defaultUserData.password, dbUser.password)
      ).toBe(false);
      expect(await bcrypt.compare(passwordData.password, dbUser.password)).toBe(
        true
      );

      // Tenta logar com a senha ANTIGA (deve falhar - teste indireto de correctPassword e changedPasswordAfter)
      await request(app)
        .post("/api/auth/login")
        .send({
          email: defaultUserData.email,
          password: defaultUserData.password,
        })
        .expect(401);

      // Tenta logar com a senha NOVA (deve funcionar)
      const loginRes = await request(app)
        .post("/api/auth/login")
        .send({ email: defaultUserData.email, password: passwordData.password })
        .expect(200);
      expect(loginRes.body.token).toBeDefined();
    });

    it("Deve retornar 401 se a senha atual (currentPassword) estiver incorreta", async () => {
      const wrongCurrentPasswordData = {
        ...passwordData,
        currentPassword: "WRONGpassword123",
      };
      const res = await request(app)
        .patch("/api/users/updateMyPassword")
        .set("Authorization", `Bearer ${userToken}`)
        .send(wrongCurrentPasswordData)
        .expect(401);
      expect(res.body.message).toMatch(/senha atual está incorreta/i);
    });

    it("Deve retornar 400 se a nova senha e a confirmação não coincidirem", async () => {
      const mismatchPasswordData = {
        ...passwordData,
        passwordConfirm: "doesNotMatch123",
      };
      await request(app)
        .patch("/api/users/updateMyPassword")
        .set("Authorization", `Bearer ${userToken}`)
        .send(mismatchPasswordData)
        .expect(400);
    });

    it("Deve retornar 400 se a nova senha for muito curta (validação do model)", async () => {
      const shortPasswordData = {
        ...passwordData,
        password: "short",
        passwordConfirm: "short",
      };
      await request(app)
        .patch("/api/users/updateMyPassword")
        .set("Authorization", `Bearer ${userToken}`)
        .send(shortPasswordData)
        .expect(400);
    });

    it("Deve retornar 401 se não estiver logado", async () => {
      await request(app)
        .patch("/api/users/updateMyPassword")
        .send(passwordData)
        .expect(401);
    });
  });

  describe("[User] DELETE /me", () => {
    it("Usuário logado deve conseguir deletar sua própria conta", async () => {
      await request(app)
        .delete("/api/users/me")
        .set("Authorization", `Bearer ${userToken}`)
        .expect(204);

      // Verifica no DB
      const dbUser = await User.findById(userId);
      expect(dbUser).toBeNull();
    });

    it("Deve retornar 401 se o usuário associado ao token não existir mais", async () => {
      await User.findByIdAndDelete(userId);
      await request(app)
        .delete("/api/users/me")
        .set("Authorization", `Bearer ${userToken}`)
        .expect(401);
    });

    it("Deve retornar 401 se não estiver logado", async () => {
      await request(app).delete("/api/users/me").expect(401);
    });
  });
});
