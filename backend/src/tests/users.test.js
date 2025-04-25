// src/tests/users.test.js
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import app from '../app';
import User from '../models/User';
import jwt from 'jsonwebtoken';


let mongoServer;
let adminToken;
let userToken;
let userId;
let adminId;


// --- Bloco de Setup e Teardown ---

beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    await mongoose.connect(mongoUri);
    // Garantir JWT_SECRET
    if (!process.env.JWT_SECRET) {
        process.env.JWT_SECRET = 'test-secret-for-user-please-replace';
        console.warn('JWT_SECRET não definido, usando valor padrão para testes de user.');
    }
});

beforeEach(async () => {
    await User.deleteMany({});

    const adminData = { name: 'Admin Test', email: 'admin@test.com', password: 'password123', role: 'admin' };
    const userData = { name: 'User Test', email: 'user@test.com', password: 'password123', role: 'user' };

    const adminUser = await User.create(adminData);
    const normalUser = await User.create(userData);

    adminId = adminUser._id;
    userId = normalUser._id;

    adminToken = jwt.sign({ id: adminUser._id, role: adminUser.role }, process.env.JWT_SECRET, { expiresIn: '1h' });
    userToken = jwt.sign({ id: normalUser._id, role: normalUser.role }, process.env.JWT_SECRET, { expiresIn: '1h' });
});


afterAll(async () => {
    await User.deleteMany({});
    await mongoose.disconnect();
    await mongoServer.stop();
});


// --- Bloco de Testes para Usuários ---

describe('/api/users', () => {

    // === Testes de Rotas de Admin ===

    describe('[Admin] POST /', () => {
        const newUserAdminData = { name: 'New Admin By Admin', email: 'newadmin@test.com', password: 'password123', role: 'admin' };
        const newUserUserData = { name: 'New User By Admin', email: 'newuser@test.com', password: 'password123', role: 'user' };
        const newUserDefaultRoleData = { name: 'New User Default', email: 'newuserdefault@test.com', password: 'password123' };

        it('Admin deve conseguir criar um novo usuário com role user', async () => {
            const res = await request(app)
                .post('/api/users')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(newUserUserData)
                .expect('Content-Type', /json/)
                .expect(201);

            expect(res.body.status).toBe('success');
            expect(res.body.data.user.name).toBe(newUserUserData.name);
            expect(res.body.data.user.email).toBe(newUserUserData.email);
            expect(res.body.data.user.role).toBe('user');
            expect(res.body.data.user.password).toBeUndefined();

            const dbUser = await User.findOne({ email: newUserUserData.email });
            expect(dbUser).not.toBeNull();
            expect(dbUser.role).toBe('user');
        });

        it('Admin deve conseguir criar um novo usuário com role admin', async () => {
            const res = await request(app)
                .post('/api/users')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(newUserAdminData)
                .expect(201);

            expect(res.body.data.user.role).toBe('admin');
            const dbUser = await User.findOne({ email: newUserAdminData.email });
            expect(dbUser).not.toBeNull();
            expect(dbUser.role).toBe('admin');
        });

        it('Admin deve criar usuário com role user se nenhuma role for especificada', async () => {
            const res = await request(app)
                .post('/api/users')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(newUserDefaultRoleData)
                .expect(201);

            expect(res.body.data.user.role).toBe('user');
            const dbUser = await User.findOne({ email: newUserDefaultRoleData.email });
            expect(dbUser).not.toBeNull();
            expect(dbUser.role).toBe('user');
        });

        it('Usuário normal NÃO deve conseguir criar usuário', async () => {
            await request(app)
                .post('/api/users')
                .set('Authorization', `Bearer ${userToken}`)
                .send(newUserUserData)
                .expect(403);
        });

        it('Admin deve receber erro 400 ao tentar criar com email duplicado', async () => {
            await request(app)
                .post('/api/users')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ ...newUserUserData, email: 'user@test.com' })
                .expect(400);
        });

        it('Admin deve receber erro 400 se campos obrigatórios (nome, email, senha) faltarem', async () => {
            // Sem nome
            await request(app).post('/api/users').set('Authorization', `Bearer ${adminToken}`).send({ email: 'no@name.com', password: 'p' }).expect(400);
            // Sem email
            await request(app).post('/api/users').set('Authorization', `Bearer ${adminToken}`).send({ name: 'No Email', password: 'p' }).expect(400);
            // Sem senha
            await request(app).post('/api/users').set('Authorization', `Bearer ${adminToken}`).send({ name: 'No Pass', email: 'no@pass.com' }).expect(400);
        });
    });

    describe('[Admin] GET /', () => {
        it('Admin deve conseguir listar todos os usuários', async () => {
            await User.create({ name: 'Third User', email: 'third@test.com', password: 'password123' });

            const res = await request(app)
                .get('/api/users')
                .set('Authorization', `Bearer ${adminToken}`)
                .expect('Content-Type', /json/)
                .expect(200);

            expect(res.body.status).toBe('success');
            expect(res.body.results).toBeGreaterThanOrEqual(3);
            expect(res.body.data.users.length).toBeGreaterThanOrEqual(3);
            expect(res.body.data.users[0].password).toBeUndefined();

            const emails = res.body.data.users.map(u => u.email);
            expect(emails).toEqual(expect.arrayContaining(['admin@test.com', 'user@test.com', 'third@test.com']));
        });

        it('Usuário normal NÃO deve conseguir listar todos os usuários', async () => {
            await request(app)
                .get('/api/users')
                .set('Authorization', `Bearer ${userToken}`)
                .expect(403);
        });

        it('Deve retornar 401 sem token', async () => {
            await request(app)
                .get('/api/users')
                .expect(401);
        });
    });

    describe('[Admin] GET /:id', () => {
        it('Admin deve conseguir obter um usuário por ID', async () => {
            const res = await request(app)
                .get(`/api/users/${userId}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(200);

            expect(res.body.status).toBe('success');
            expect(res.body.data.user._id).toBe(userId.toString());
            expect(res.body.data.user.email).toBe('user@test.com');
            expect(res.body.data.user.password).toBeUndefined();
        });

        it('Usuário normal NÃO deve conseguir obter outro usuário por ID', async () => {
            await request(app)
                .get(`/api/users/${adminId}`)
                .set('Authorization', `Bearer ${userToken}`)
                .expect(403);
        });

        it('Admin deve receber 404 para ID não existente', async () => {
            const nonExistentId = new mongoose.Types.ObjectId();
            await request(app)
                .get(`/api/users/${nonExistentId}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(404);
        });

        it('Admin deve receber 400 para ID mal formatado', async () => {
            await request(app)
                .get(`/api/users/invalidid`)
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(400);
        });
    });

    describe('[Admin] PATCH /:id', () => {
        it('Admin deve conseguir atualizar nome, email e role de um usuário', async () => {
            const updates = {
                name: 'User Test Updated',
                email: 'user.updated@test.com',
                role: 'admin',
            };
            const res = await request(app)
                .patch(`/api/users/${userId}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send(updates)
                .expect('Content-Type', /json/)
                .expect(200);

            expect(res.body.status).toBe('success');
            expect(res.body.data.user.name).toBe(updates.name);
            expect(res.body.data.user.email).toBe(updates.email);
            expect(res.body.data.user.role).toBe(updates.role);

            const dbUser = await User.findById(userId);
            expect(dbUser.name).toBe(updates.name);
            expect(dbUser.email).toBe(updates.email);
            expect(dbUser.role).toBe(updates.role);
        });

        it('Admin NÃO deve conseguir rebaixar outro admin por esta rota', async () => {
            const updates = { role: 'user' };
            const res = await request(app)
                .patch(`/api/users/${adminId}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send(updates)
                .expect(400);

            expect(res.body.message).toMatch(/Não é permitido rebaixar um administrador/i);
            const dbUser = await User.findById(adminId);
            expect(dbUser.role).toBe('admin');
        });

        it('Admin NÃO deve conseguir atualizar senha por esta rota', async () => {
            const initialUser = await User.findById(userId).select('+password');
            const initialPasswordHash = initialUser.password;

            const updates = { password: 'newpassword123' };
            await request(app)
                .patch(`/api/users/${userId}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send(updates)
                .expect(200);

            const dbUser = await User.findById(userId).select('+password');
            expect(dbUser.password).toBe(initialPasswordHash);
            expect(dbUser.passwordChangedAt).toBeUndefined();
        });

        it('Usuário normal NÃO deve conseguir atualizar outro usuário (403)', async () => {
            await request(app)
                .patch(`/api/users/${adminId}`)
                .set('Authorization', `Bearer ${userToken}`)
                .send({ name: 'Attempt update' })
                .expect(403);
        });

        it('Admin deve receber 400 ao tentar atualizar para email duplicado', async () => {
            await request(app)
                .patch(`/api/users/${userId}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ email: 'admin@test.com' })
                .expect(400);
        });
    });

    describe('[Admin] DELETE /:id', () => {
        it('Admin deve conseguir deletar um usuário', async () => {
            await request(app)
                .delete(`/api/users/${userId}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(204);

            const dbUser = await User.findById(userId);
            expect(dbUser).toBeNull();
        });

        it('Usuário normal NÃO deve conseguir deletar outro usuário (403)', async () => {
            await request(app)
                .delete(`/api/users/${adminId}`)
                .set('Authorization', `Bearer ${userToken}`)
                .expect(403);

            const dbAdmin = await User.findById(adminId);
            expect(dbAdmin).not.toBeNull();
        });

        it('Admin deve receber 404 ao tentar deletar ID não existente', async () => {
            const nonExistentId = new mongoose.Types.ObjectId();
            await request(app)
                .delete(`/api/users/${nonExistentId}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(404);
        });

        it('Admin deve receber 400 ao tentar deletar ID inválido', async () => {
            await request(app)
                .delete(`/api/users/invalid-user-id`)
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(400);
        });
    });

    // === Testes de Rotas do Usuário Logado ===

    describe('[User] GET /me', () => {
        it('Usuário logado deve conseguir obter seu próprio perfil', async () => {
            const res = await request(app)
                .get('/api/users/me')
                .set('Authorization', `Bearer ${userToken}`)
                .expect('Content-Type', /json/)
                .expect(200);

            expect(res.body.status).toBe('success');
            expect(res.body.data.user._id).toBe(userId.toString());
            expect(res.body.data.user.email).toBe('user@test.com');
            expect(res.body.data.user.password).toBeUndefined();
        });

        it('Deve retornar 401 se não estiver logado', async () => {
            await request(app)
                .get('/api/users/me')
                .expect(401);
        });
    });

    describe('[User] PATCH /me', () => {
        it('Usuário logado deve conseguir atualizar seu nome e email', async () => {
            const updates = { name: 'User Updated Name Self', email: 'user.new.self.email@test.com' };
            const res = await request(app)
                .patch('/api/users/me')
                .set('Authorization', `Bearer ${userToken}`)
                .send(updates)
                .expect('Content-Type', /json/)
                .expect(200);

            expect(res.body.data.user.name).toBe(updates.name);
            expect(res.body.data.user.email).toBe(updates.email);
            expect(res.body.data.user.role).toBe('user');
            expect(res.body.data.user.password).toBeUndefined();

            const dbUser = await User.findById(userId);
            expect(dbUser.name).toBe(updates.name);
            expect(dbUser.email).toBe(updates.email);
        });

        it('Usuário logado NÃO deve conseguir atualizar sua role ou senha por esta rota', async () => {
            const updates = { role: 'admin', password: 'newpassword' };
            const res = await request(app)
                .patch('/api/users/me')
                .set('Authorization', `Bearer ${userToken}`)
                .send(updates)
                .expect(200);

            expect(res.body.data.user.role).toBe('user');

            const dbUser = await User.findById(userId).select('+password');
            expect(dbUser.role).toBe('user');
            expect(dbUser.passwordChangedAt).toBeUndefined();
        });

        it('Deve retornar 400 se tentar atualizar para email duplicado (de outro usuário)', async () => {
            const updates = { email: 'admin@test.com' };
            await request(app)
                .patch('/api/users/me')
                .set('Authorization', `Bearer ${userToken}`)
                .send(updates)
                .expect(400);
        });

        it('Deve retornar 401 se não estiver logado', async () => {
            const updates = { name: 'Update no Auth' };
            await request(app)
                .patch('/api/users/me')
                .send(updates)
                .expect(401);
        });
    });

    describe('[User] PATCH /updateMyPassword', () => {
        it('Usuário logado deve conseguir atualizar sua senha com dados corretos', async () => {
            const passwordData = {
                currentPassword: 'password123',
                password: 'newpassword123',
                passwordConfirm: 'newpassword123',
            };
            const res = await request(app)
                .patch('/api/users/updateMyPassword')
                .set('Authorization', `Bearer ${userToken}`)
                .send(passwordData)
                .expect('Content-Type', /json/)
                .expect(200);

            expect(res.body.status).toBe('success');
            expect(res.body.token).toBeDefined();

            // Tenta logar com a senha ANTIGA (deve falhar)
            await request(app)
                .post('/api/auth/login')
                .send({ email: 'user@test.com', password: 'password123' })
                .expect(401);

            // Tenta logar com a senha NOVA (deve funcionar)
            const loginRes = await request(app)
                .post('/api/auth/login')
                .send({ email: 'user@test.com', password: 'newpassword123' })
                .expect(200);
            expect(loginRes.body.token).toBeDefined();

            // Verifica se passwordChangedAt foi definido no DB
            const dbUser = await User.findById(userId);
            expect(dbUser.passwordChangedAt).toBeDefined();
        });

        it('Deve retornar 401 se a senha atual estiver incorreta', async () => {
            const passwordData = { currentPassword: 'WRONGpassword123', password: 'newpassword123', passwordConfirm: 'newpassword123', };
            const res = await request(app)
                .patch('/api/users/updateMyPassword')
                .set('Authorization', `Bearer ${userToken}`)
                .send(passwordData)
                .expect(401);
        });

        it('Deve retornar 400 se a nova senha e a confirmação não coincidirem', async () => {
            const passwordData = { currentPassword: 'password123', password: 'new', passwordConfirm: 'mismatch' };
            await request(app)
                .patch('/api/users/updateMyPassword')
                .set('Authorization', `Bearer ${userToken}`)
                .send(passwordData)
                .expect(400);
        });

        it('Deve retornar 400 se a nova senha for muito curta', async () => {
            const passwordData = { currentPassword: 'password123', password: 'short', passwordConfirm: 'short' };
            await request(app)
                .patch('/api/users/updateMyPassword')
                .set('Authorization', `Bearer ${userToken}`)
                .send(passwordData)
                .expect(400);
        });

        it('Deve retornar 401 se não estiver logado', async () => {
            const passwordData = { currentPassword: 'p', password: 'new', passwordConfirm: 'new' };
            await request(app)
                .patch('/api/users/updateMyPassword')
                .send(passwordData)
                .expect(401);
        });
    });

    describe('[User] DELETE /me', () => {
        it('Usuário logado deve conseguir deletar sua própria conta', async () => {
            // Usa o userToken/userId do beforeEach

            await request(app)
                .delete('/api/users/me')
                .set('Authorization', `Bearer ${userToken}`)
                .expect(204);

            // Verifica no DB
            const dbUser = await User.findById(userId);
            expect(dbUser).toBeNull();
        });

        it('Deve retornar 401 se não estiver logado', async () => {
            await request(app)
                .delete('/api/users/me')
                .expect(401);
        });
    });

}); 