// src/tests/auth.test.js
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import app from '../app.js'; 
import User from '../models/User.js';
import jwt from 'jsonwebtoken'; 

let mongoServer;

// --- Bloco de Setup e Teardown ---
beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    await mongoose.connect(mongoUri);
    // Garanta que JWT_SECRET está definido para testes
    if (!process.env.JWT_SECRET) {
        process.env.JWT_SECRET = 'test-secret-for-auth-please-replace';
        console.warn('JWT_SECRET não definido, usando valor padrão para testes de auth.');
    }
    await User.deleteMany({});
});

// Limpar usuários após cada teste para isolamento
afterEach(async () => {
    await User.deleteMany({});
});

afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
});


// --- Bloco de Testes para Autenticação ---
describe('/api/auth', () => {

    // --- Testes de Registro ---
    describe('POST /register', () => {
        const validUserData = {
            name: 'Test User Register',
            email: 'register@test.com',
            password: 'password123',
            passwordConfirm: 'password123',
        };

        it('deve registrar um novo usuário com sucesso e retornar um token', async () => {
            const res = await request(app)
                .post('/api/auth/register')
                .send(validUserData)
                .expect('Content-Type', /json/)
                .expect(201);

            expect(res.body).toHaveProperty('status', 'success');
            expect(res.body).toHaveProperty('token');
            expect(res.body.token).toEqual(expect.any(String));
            expect(res.body.data.user).toBeDefined();
            expect(res.body.data.user.name).toBe(validUserData.name);
            expect(res.body.data.user.email).toBe(validUserData.email);
            expect(res.body.data.user.role).toBe('user');
            expect(res.body.data.user.password).toBeUndefined();

            // Verifica se o token é válido
            const decoded = jwt.verify(res.body.token, process.env.JWT_SECRET);
            expect(decoded.id).toBeDefined();
            expect(decoded.role).toBe('user');

            // Verifica no DB
            const dbUser = await User.findOne({ email: validUserData.email });
            expect(dbUser).not.toBeNull();
            expect(dbUser.email).toBe(validUserData.email);
            expect(dbUser.password).not.toBe(validUserData.password); 
        });

        it('deve retornar erro 400 se o email já estiver registrado', async () => {
            // Cria usuário existente
            await User.create({
                name: 'Existing User',
                email: 'duplicate@test.com',
                password: 'password123',
            });

            // Tenta registrar com o mesmo email
            const duplicateUserData = {
                ...validUserData,
                email: 'duplicate@test.com',
            };

            const res = await request(app)
                .post('/api/auth/register')
                .send(duplicateUserData)
                .expect('Content-Type', /json/)
                .expect(400);

            expect(res.body).toHaveProperty('errors');
            const emailError = res.body.errors.find(err => err.path === 'email');
            expect(emailError).toBeDefined();
            expect(emailError.msg).toContain('E-mail já está registrado');
        });

        it('deve retornar erro 400 se passwordConfirm não coincidir', async () => {
            const mismatchPasswordData = {
                ...validUserData,
                passwordConfirm: 'differentpassword',
            };

            const res = await request(app)
                .post('/api/auth/register')
                .send(mismatchPasswordData)
                .expect('Content-Type', /json/)
                .expect(400);

            const passwordConfirmError = res.body.errors.find(err => err.path === 'passwordConfirm');
            expect(passwordConfirmError).toBeDefined();
            expect(passwordConfirmError.msg).toContain('As senhas não coincidem');
        });

        it('deve retornar erro 400 se o nome estiver faltando', async () => {
             const { name, ...dataWithoutName } = validUserData;
             const res = await request(app)
                 .post('/api/auth/register')
                 .send(dataWithoutName)
                 .expect(400);
             const nameError = res.body.errors.find(err => err.path === 'name');
             expect(nameError).toBeDefined();
             expect(nameError.msg).toContain('Nome é obrigatório');
        });

         it('deve retornar erro 400 se a senha for muito curta', async () => {
             const shortPasswordData = { ...validUserData, password: '123', passwordConfirm: '123'};
             const res = await request(app)
                 .post('/api/auth/register')
                 .send(shortPasswordData)
                 .expect(400);
             const passwordError = res.body.errors.find(err => err.path === 'password');
             expect(passwordError).toBeDefined();
             expect(passwordError.msg).toContain('mínimo 8 caracteres');
        });

    }); // Fim describe POST /register

    // --- Testes de Login (ADICIONADO) ---
    describe('POST /login', () => {
        const userCredentials = {
            email: 'login@test.com',
            password: 'password123',
        };

        // Cria um usuário antes dos testes de login
        beforeEach(async () => {
            await User.create({
                name: 'Login User',
                email: userCredentials.email,
                password: userCredentials.password, 
            });
        });

        it('deve logar um usuário existente com sucesso e retornar um token', async () => {
            const res = await request(app)
                .post('/api/auth/login')
                .send(userCredentials)
                .expect('Content-Type', /json/)
                .expect(200);

            expect(res.body).toHaveProperty('status', 'success');
            expect(res.body).toHaveProperty('token');
            expect(res.body.token).toEqual(expect.any(String));

            // Verifica se o token é válido e contém os dados esperados
            const decoded = jwt.verify(res.body.token, process.env.JWT_SECRET);
            const dbUser = await User.findOne({ email: userCredentials.email });
            expect(decoded.id).toBe(dbUser._id.toString());
            expect(decoded.role).toBe(dbUser.role);
        });

        it('deve retornar erro 401 com senha incorreta', async () => {
            const wrongPasswordData = {
                email: userCredentials.email,
                password: 'wrongpassword',
            };

            const res = await request(app)
                .post('/api/auth/login')
                .send(wrongPasswordData)
                .expect('Content-Type', /json/)
                .expect(401);

            expect(res.body).toHaveProperty('status', 'fail'); 
            expect(res.body).toHaveProperty('message', 'Credenciais inválidas');
        });

        it('deve retornar erro 401 com email não registrado', async () => {
            const nonExistentEmailData = {
                email: 'notfound@test.com',
                password: userCredentials.password,
            };

            const res = await request(app)
                .post('/api/auth/login')
                .send(nonExistentEmailData)
                .expect('Content-Type', /json/)
                .expect(401);

            expect(res.body).toHaveProperty('status', 'fail'); 
            expect(res.body).toHaveProperty('message', 'Credenciais inválidas');
        });

        it('deve retornar erro 400 se o email estiver faltando', async () => {
            const { email, ...dataWithoutEmail } = userCredentials;
            const res = await request(app)
                .post('/api/auth/login')
                .send(dataWithoutEmail)
                .expect('Content-Type', /json/)
                .expect(400);

            expect(res.body).toHaveProperty('errors');
            const emailError = res.body.errors.find(err => err.path === 'email');
            expect(emailError).toBeDefined();
        });

        it('deve retornar erro 400 se a senha estiver faltando', async () => {
            const { password, ...dataWithoutPassword } = userCredentials;
            const res = await request(app)
                .post('/api/auth/login')
                .send(dataWithoutPassword)
                .expect('Content-Type', /json/)
                .expect(400);

            expect(res.body).toHaveProperty('errors');
            const passwordError = res.body.errors.find(err => err.path === 'password');
            expect(passwordError).toBeDefined();
        });

    });

}); 