// src/tests/auth.test.js
import request from 'supertest'; 
import mongoose from 'mongoose'; 
import { MongoMemoryServer } from 'mongodb-memory-server';
import app from '../app'; 
import User from '../models/User';

let mongoServer; 

// --- Bloco de Setup e Teardown ---

beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    await mongoose.connect(mongoUri);
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

describe('/api/auth', () => {

    describe('POST /register', () => {

        const validUserData = {
            name: 'Test User',
            email: 'test@example.com',
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

            const dbUser = await User.findOne({ email: validUserData.email });
            expect(dbUser).not.toBeNull();
            expect(dbUser.email).toBe(validUserData.email);
            expect(dbUser.password).not.toBe(validUserData.password);
        });

        it('deve retornar erro 400 se o email já estiver registrado', async () => {
            await User.create({
                name: 'Existing User',
                email: 'duplicate@example.com',
                password: 'password123',
            });

            const duplicateUserData = {
                name: 'Another User',
                email: 'duplicate@example.com',
                password: 'newpassword',
                passwordConfirm: 'newpassword',
            };

            const res = await request(app)
                .post('/api/auth/register')
                .send(duplicateUserData)
                .expect('Content-Type', /json/)
                .expect(400); 

            expect(res.body).toHaveProperty('errors');
            expect(Array.isArray(res.body.errors)).toBe(true);
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

    }); 

}); 