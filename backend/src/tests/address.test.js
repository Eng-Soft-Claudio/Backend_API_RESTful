import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import jwt from 'jsonwebtoken';
import app from '../app.js';
import Address from '../models/Address.js';
import User from '../models/User.js';

let mongoServer;
let testUserToken;
let testUserId;

// --- Dados de Endereço Válidos para Teste ---
const validAddressData = {
    label: 'Casa Teste',
    street: 'Rua Teste',
    number: '123',
    complement: 'Apto 1',
    neighborhood: 'Bairro Teste',
    city: 'Cidade Teste',
    state: 'TS',
    postalCode: '12345-678',
    country: 'Paisteste',
    phone: '11999998888',
    isDefault: false
};

// --- Bloco de Setup e Teardown ---
beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    await mongoose.connect(mongoUri);

    // Limpar coleções antes de começar
    await User.deleteMany({});
    await Address.deleteMany({});

    // Criar um usuário de teste
    const userData = { name: 'Address User', email: 'address.user@test.com', password: 'password123' };
    const testUser = await User.create(userData);
    testUserId = testUser._id;

    // Gerar token para o usuário de teste
    testUserToken = jwt.sign({ id: testUserId, role: testUser.role }, process.env.JWT_SECRET, { expiresIn: '1h' });
});

// Limpar endereços após cada teste para garantir isolamento
afterEach(async () => {
    await Address.deleteMany({});
});

// Desconectar e parar o servidor no final
afterAll(async () => {
    await User.deleteMany({}); // Limpa usuário também
    await Address.deleteMany({});
    await mongoose.disconnect();
    await mongoServer.stop();
});

// --- Bloco Principal de Testes para Endereços ---
describe('/api/addresses', () => {

    // --- Testes para POST / (Adicionar Endereço) ---
    describe('POST /', () => {
        it('deve adicionar um novo endereço com sucesso para usuário logado', async () => {
            const res = await request(app)
                .post('/api/addresses')
                .set('Authorization', `Bearer ${testUserToken}`)
                .send(validAddressData)
                .expect('Content-Type', /json/)
                .expect(201);

            expect(res.body.status).toBe('success');
            expect(res.body.data.address).toBeDefined();
            expect(res.body.data.address.street).toBe(validAddressData.street);
            expect(res.body.data.address.user.toString()).toBe(testUserId.toString());

            // Verifica no DB
            const dbAddress = await Address.findById(res.body.data.address._id);
            expect(dbAddress).not.toBeNull();
            expect(dbAddress.city).toBe(validAddressData.city);
            expect(dbAddress.user.toString()).toBe(testUserId.toString());
        });

        it('deve retornar erro 400 se dados obrigatórios faltarem', async () => {
            const { street, ...invalidData } = validAddressData; // Remove 'street'
            await request(app)
                .post('/api/addresses')
                .set('Authorization', `Bearer ${testUserToken}`)
                .send(invalidData)
                .expect(400);
        });

        it('deve retornar erro 401 se não estiver autenticado', async () => {
            await request(app)
                .post('/api/addresses')
                .send(validAddressData)
                .expect(401);
        });

         it('deve definir o endereço como padrão se isDefault=true e desmarcar outros', async () => {
            // Cria um endereço padrão primeiro
            await Address.create({ ...validAddressData, user: testUserId, label: 'Padrão Antigo', isDefault: true });

             // Cria o novo endereço como padrão
             const res = await request(app)
                .post('/api/addresses')
                .set('Authorization', `Bearer ${testUserToken}`)
                .send({ ...validAddressData, label: 'Novo Padrão', isDefault: true })
                .expect(201);

             expect(res.body.data.address.isDefault).toBe(true);
             expect(res.body.data.address.label).toBe('Novo Padrão');

             // Verifica se o endereço antigo foi desmarcado
             const oldDefault = await Address.findOne({ user: testUserId, label: 'Padrão Antigo' });
             expect(oldDefault).not.toBeNull();
             expect(oldDefault.isDefault).toBe(false);

             // Verifica se o novo é o único padrão
             const defaultCount = await Address.countDocuments({ user: testUserId, isDefault: true });
             expect(defaultCount).toBe(1);
         });
    });

    // --- Testes para GET / (Listar Endereços) ---
    describe('GET /', () => {
        it('deve retornar uma lista vazia se o usuário não tiver endereços', async () => {
            const res = await request(app)
                .get('/api/addresses')
                .set('Authorization', `Bearer ${testUserToken}`)
                .expect(200);

            expect(res.body.status).toBe('success');
            expect(res.body.results).toBe(0);
            expect(res.body.data.addresses).toHaveLength(0);
        });

        it('deve retornar a lista de endereços do usuário logado', async () => {
            // Criar 2 endereços para o usuário
            await Address.create({ ...validAddressData, user: testUserId, label: 'Casa' });
            await Address.create({ ...validAddressData, user: testUserId, label: 'Trabalho', street: 'Av. Teste' });

            const res = await request(app)
                .get('/api/addresses')
                .set('Authorization', `Bearer ${testUserToken}`)
                .expect(200);

            expect(res.body.status).toBe('success');
            expect(res.body.results).toBe(2);
            expect(res.body.data.addresses).toHaveLength(2);
            expect(res.body.data.addresses.map(a => a.label)).toEqual(expect.arrayContaining(['Casa', 'Trabalho']));
        });

        it('deve retornar erro 401 se não estiver autenticado', async () => {
            await request(app)
                .get('/api/addresses')
                .expect(401);
        });
    });

    // --- Testes para GET /:id (Obter Endereço por ID) ---
    describe('GET /:id', () => {
        let createdAddress;

        beforeEach(async () => {
            // Cria um endereço antes de cada teste deste bloco
            createdAddress = await Address.create({ ...validAddressData, user: testUserId });
        });

        it('deve retornar um endereço específico pelo ID', async () => {
            const res = await request(app)
                .get(`/api/addresses/${createdAddress._id}`)
                .set('Authorization', `Bearer ${testUserToken}`)
                .expect(200);

            expect(res.body.status).toBe('success');
            expect(res.body.data.address._id.toString()).toBe(createdAddress._id.toString());
            expect(res.body.data.address.street).toBe(validAddressData.street);
        });

        it('deve retornar erro 404 se o ID não existir', async () => {
            const nonExistentId = new mongoose.Types.ObjectId();
            await request(app)
                .get(`/api/addresses/${nonExistentId}`)
                .set('Authorization', `Bearer ${testUserToken}`)
                .expect(404);
        });

        it('deve retornar erro 400 se o ID for inválido', async () => {
            await request(app)
                .get('/api/addresses/invalid-id-format')
                .set('Authorization', `Bearer ${testUserToken}`)
                .expect(400);
        });

        it('deve retornar erro 401 se não estiver autenticado', async () => {
            await request(app)
                .get(`/api/addresses/${createdAddress._id}`)
                .expect(401);
        });

        // Teste de segurança: tentar pegar endereço de outro usuário (simulado)
        it('deve retornar erro 404 ao tentar pegar endereço de outro usuário', async () => {
            // Simula a criação de um endereço para um usuário diferente
            const otherUserId = new mongoose.Types.ObjectId();
            const otherAddress = await Address.create({ ...validAddressData, user: otherUserId, label: 'Other User Address' });

            // Tenta buscar o endereço do outro usuário com o token do testUser
            await request(app)
                .get(`/api/addresses/${otherAddress._id}`)
                .set('Authorization', `Bearer ${testUserToken}`) // Usa token do testUser
                .expect(404); // Espera 404 porque o controller não encontra { _id: otherAddress._id, user: testUserId }
        });
    });

    // --- Testes para PUT /:id (Atualizar Endereço) ---
    describe('PUT /:id', () => {
        let addressToUpdate;
        const updateData = {
            street: 'Rua Atualizada',
            city: 'Cidade Nova'
        };

        beforeEach(async () => {
            addressToUpdate = await Address.create({ ...validAddressData, user: testUserId });
        });

        it('deve atualizar um endereço existente com sucesso', async () => {
            const res = await request(app)
                .put(`/api/addresses/${addressToUpdate._id}`)
                .set('Authorization', `Bearer ${testUserToken}`)
                .send(updateData)
                .expect(200);

            expect(res.body.status).toBe('success');
            expect(res.body.data.address.street).toBe(updateData.street);
            expect(res.body.data.address.city).toBe(updateData.city);
            expect(res.body.data.address.number).toBe(validAddressData.number); // Campo não atualizado permanece

            // Verifica no DB
            const dbAddress = await Address.findById(addressToUpdate._id);
            expect(dbAddress.street).toBe(updateData.street);
        });

        it('deve retornar erro 400 se a validação falhar (ex: estado inválido)', async () => {
            await request(app)
                .put(`/api/addresses/${addressToUpdate._id}`)
                .set('Authorization', `Bearer ${testUserToken}`)
                .send({ state: 'INVALID' }) // Estado inválido
                .expect(400);
        });

        it('deve retornar erro 404 se o ID não existir', async () => {
            const nonExistentId = new mongoose.Types.ObjectId();
            await request(app)
                .put(`/api/addresses/${nonExistentId}`)
                .set('Authorization', `Bearer ${testUserToken}`)
                .send(updateData)
                .expect(404);
        });

        it('deve retornar erro 401 se não estiver autenticado', async () => {
            await request(app)
                .put(`/api/addresses/${addressToUpdate._id}`)
                .send(updateData)
                .expect(401);
        });
    });

     // --- Testes para DELETE /:id (Deletar Endereço) ---
    describe('DELETE /:id', () => {
        let addressToDelete;

        beforeEach(async () => {
            addressToDelete = await Address.create({ ...validAddressData, user: testUserId });
        });

        it('deve deletar um endereço existente com sucesso', async () => {
            await request(app)
                .delete(`/api/addresses/${addressToDelete._id}`)
                .set('Authorization', `Bearer ${testUserToken}`)
                .expect(204); // Espera No Content

            // Verifica no DB
            const dbAddress = await Address.findById(addressToDelete._id);
            expect(dbAddress).toBeNull();
        });

        it('deve retornar erro 404 se o ID não existir', async () => {
            const nonExistentId = new mongoose.Types.ObjectId();
            await request(app)
                .delete(`/api/addresses/${nonExistentId}`)
                .set('Authorization', `Bearer ${testUserToken}`)
                .expect(404);
        });

        it('deve retornar erro 400 se o ID for inválido', async () => {
            await request(app)
                .delete('/api/addresses/invalid-id-format')
                .set('Authorization', `Bearer ${testUserToken}`)
                .expect(400);
        });

        it('deve retornar erro 401 se não estiver autenticado', async () => {
            await request(app)
                .delete(`/api/addresses/${addressToDelete._id}`)
                .expect(401);
        });
    });

     // --- Testes para PATCH /:id/default (Definir como Padrão) ---
    describe('PATCH /:id/default', () => {
        let address1, address2;

        beforeEach(async () => {
            // Cria dois endereços, nenhum padrão inicialmente
            address1 = await Address.create({ ...validAddressData, user: testUserId, label: 'Addr 1', isDefault: false });
            address2 = await Address.create({ ...validAddressData, user: testUserId, label: 'Addr 2', street: 'Rua B', isDefault: false });
        });

        it('deve definir um endereço como padrão com sucesso', async () => {
            const res = await request(app)
                .patch(`/api/addresses/${address1._id}/default`)
                .set('Authorization', `Bearer ${testUserToken}`)
                .expect(200);

            expect(res.body.status).toBe('success');
            expect(res.body.data.address._id.toString()).toBe(address1._id.toString());
            expect(res.body.data.address.isDefault).toBe(true);

            // Verifica no DB
            const dbAddr1 = await Address.findById(address1._id);
            const dbAddr2 = await Address.findById(address2._id);
            expect(dbAddr1.isDefault).toBe(true);
            expect(dbAddr2.isDefault).toBe(false); // Garante que o outro não foi afetado ainda
        });

        it('deve definir outro endereço como padrão e desmarcar o anterior', async () => {
            // Primeiro define address1 como padrão
            await request(app)
                .patch(`/api/addresses/${address1._id}/default`)
                .set('Authorization', `Bearer ${testUserToken}`)
                .expect(200);

            // Agora define address2 como padrão
            const res = await request(app)
                .patch(`/api/addresses/${address2._id}/default`)
                .set('Authorization', `Bearer ${testUserToken}`)
                .expect(200);

            expect(res.body.data.address._id.toString()).toBe(address2._id.toString());
            expect(res.body.data.address.isDefault).toBe(true);

            // Verifica no DB
            const dbAddr1 = await Address.findById(address1._id);
            const dbAddr2 = await Address.findById(address2._id);
            expect(dbAddr1.isDefault).toBe(false); // Antigo foi desmarcado pelo hook
            expect(dbAddr2.isDefault).toBe(true);
        });

        it('deve retornar erro 404 se o ID não existir', async () => {
            const nonExistentId = new mongoose.Types.ObjectId();
            await request(app)
                .patch(`/api/addresses/${nonExistentId}/default`)
                .set('Authorization', `Bearer ${testUserToken}`)
                .expect(404);
        });

        it('deve retornar erro 401 se não estiver autenticado', async () => {
             await request(app)
                .patch(`/api/addresses/${address1._id}/default`)
                .expect(401);
        });
    });

}); // Fim do describe principal