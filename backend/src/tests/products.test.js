// src/tests/products.test.js
// ===== IMPORTS PADRÃO PRIMEIRO =====
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import jwt from 'jsonwebtoken';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import app from '../app.js';
import Product from '../models/Product.js';
import Category from '../models/Category.js';
import User from '../models/User.js';

// ===== Mocking Simples (Recomendado com Babel) =====
// 1. Mock o módulo. Jest substituirá exports por jest.fn() automaticamente.
jest.mock('../utils/cloudinary.js');

// 2. Importe as funções MOCKADAS.
import { uploadImage, deleteImage } from '../utils/cloudinary.js';
// ===================================================

// Variáveis globais
let mongoServer;
let categoryId;
let adminToken;
let userToken;


// --- Obter Caminho & Arquivo Dummy ---
const uploadsDir = path.join(__dirname, 'test-uploads');
const dummyImagePath = path.join(uploadsDir, 'dummy.jpg');


// --- Setup e Teardown ---
beforeAll(async () => {

    if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir);
    }
    if (!fs.existsSync(dummyImagePath)) {
        fs.writeFileSync(dummyImagePath, 'dummy image content');
    }
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    await mongoose.connect(mongoUri);
    await User.deleteMany({});
    await Product.deleteMany({});
    await Category.deleteMany({});

    const testCategory = await Category.create({ name: 'Categoria Teste 1' });
    categoryId = testCategory._id;
    const adminData = { name: 'Admin ProdTest', email: 'admin.prod@test.com', password: 'password123', role: 'admin' };
    const userData = { name: 'User ProdTest', email: 'user.prod@test.com', password: 'password123', role: 'user' };
    const adminUser = await User.create(adminData);
    const normalUser = await User.create(userData);
    adminToken = jwt.sign({ id: adminUser._id, role: adminUser.role }, process.env.JWT_SECRET, { expiresIn: '1h' });
    userToken = jwt.sign({ id: normalUser._id, role: normalUser.role }, process.env.JWT_SECRET, { expiresIn: '1h' });
});

beforeEach(async () => {
    uploadImage.mockClear();
    deleteImage.mockClear();
    uploadImage.mockResolvedValue({
        secure_url: 'http://fake.cloudinary.com/image.jpg',
        public_id: 'fake_public_id'
    });
    deleteImage.mockResolvedValue({ result: 'ok' });
});

afterEach(async () => {
    await Product.deleteMany({});
});

afterAll(async () => {
    await User.deleteMany({});
    await Category.deleteMany({});
    await Product.deleteMany({});
    await mongoose.disconnect();
    await mongoServer.stop();
    if (fs.existsSync(dummyImagePath)) {
        fs.unlinkSync(dummyImagePath);
    }
    if (fs.existsSync(uploadsDir)) {
        fs.rmdirSync(uploadsDir);
    }
});

// --- Testes GET / ---
describe('/api/products', () => {
    describe('GET /', () => {
        it('deve retornar uma lista vazia se não houver produtos', async () => {
            const res = await request(app)
                .get('/api/products')
                .expect('Content-Type', /json/)
                .expect(200);

            expect(res.body).toHaveProperty('status', 'success');
            expect(res.body.results).toBe(0);
            expect(Array.isArray(res.body.products)).toBe(true);
            expect(res.body.products).toHaveLength(0);
        });

        it('deve retornar uma lista de produtos existentes', async () => {
            await Product.create([
                { name: 'Produto Teste 1', price: 100, category: categoryId, image: 'test1.jpg' },
                { name: 'Produto Teste 2', price: 200, category: categoryId, image: 'test2.jpg' },
            ]);

            const res = await request(app)
                .get('/api/products')
                .expect('Content-Type', /json/)
                .expect(200);

            expect(res.body.status).toBe('success');
            expect(res.body.results).toBe(2);
            expect(res.body.products).toHaveLength(2);

            const productNames = res.body.products.map(p => p.name);

            expect(productNames).toContain('Produto Teste 1');
            expect(productNames).toContain('Produto Teste 2');
            expect(res.body.products[0].category).toHaveProperty('name', 'Categoria Teste 1');
            expect(res.body.products[0].category).toHaveProperty('slug', 'categoria-teste-1');
        });

        it('deve filtrar produtos por categoria (usando ID)', async () => {
            const otherCategory = await Category.create({ name: 'Categoria Teste 2' });
            await Product.create({ name: 'Produto Teste 3', price: 300, category: otherCategory._id, image: 'teste3.jpg' });
            await Product.create({ name: 'Produto Teste 4', price: 400, category: categoryId, image: 'test4.jpg' });

            const res = await request(app)
                .get(`/api/products?category=${categoryId}`)
                .expect(200);

            expect(res.body.results).toBe(1);
            expect(res.body.products).toHaveLength(1);
            expect(res.body.products[0].name).toBe('Produto Teste 4');
            expect(res.body.products[0].category._id.toString()).toBe(categoryId.toString());
        });

        it('deve retornar vazio e mensagem apropriada se a categoria do filtro não existir', async () => {
            const nonExistentId = new mongoose.Types.ObjectId();
            const res = await request(app)
                .get(`/api/products?category=${nonExistentId}`)
                .expect(200);

            expect(res.body).toHaveProperty('status', 'success');
            expect(res.body).toHaveProperty('results', 0);
            expect(Array.isArray(res.body.products)).toBe(true);
            expect(res.body.products).toHaveLength(0);
            expect(res.body).toHaveProperty('message', 'Categoria não encontrada');
        });

        it('deve suportar paginação (limit)', async () => {
            await Product.create([
                { name: 'Produto 1', price: 10, category: categoryId, image: '1.jpg' },
                { name: 'Produto 2', price: 20, category: categoryId, image: '2.jpg' },
                { name: 'Produto 3', price: 30, category: categoryId, image: '3.jpg' },
            ]);

            const res = await request(app)
                .get(`/api/products?limit=2`)
                .expect(200);

            expect(res.body.results).toBe(2);
            expect(res.body.products).toHaveLength(2);
        });

    });

});

// --- Testes POST / ---
describe('POST /', () => {

    it('Admin deve criar um produto com sucesso', async () => {
        const productData = {
            name: 'Produto Teste POST',
            price: '99.99',
            category: categoryId.toString(),
            description: 'Descrição Teste',
            stock: '10',
        };

        const res = await request(app)
            .post('/api/products')
            .set('Authorization', `Bearer ${adminToken}`)
            .field('name', productData.name)
            .field('price', productData.price)
            .field('category', productData.category)
            .field('description', productData.description)
            .field('stock', productData.stock)
            .attach('image', dummyImagePath)
            .expect('Content-Type', /json/)
            .expect(201);


        expect(res.body.name).toBe(productData.name);
        expect(res.body.price).toBe(Number(productData.price));
        expect(res.body.stock).toBe(Number(productData.stock));
        expect(res.body.category.name).toBe('Categoria Teste 1');
        expect(res.body.image).toBe('http://fake.cloudinary.com/image.jpg');
        expect(res.body.imagePublicId).toBe('fake_public_id');

        expect(uploadImage).toHaveBeenCalledTimes(1);

        const dbProduct = await Product.findById(res.body._id);
        expect(dbProduct).not.toBeNull();
        expect(dbProduct.name).toBe(productData.name);
        expect(dbProduct.imagePublicId).toBe('fake_public_id');
    });

    it('Deve retornar 400 se a imagem estiver faltando', async () => {
        await request(app)
            .post('/api/products')
            .set('Authorization', `Bearer ${adminToken}`)
            .field('name', 'Teste Sem Imagem')
            .field('price', '10.00')
            .field('category', categoryId.toString())
            .expect(400);
        expect(uploadImage).not.toHaveBeenCalled();
    });

    it('Deve retornar 400 se o nome estiver faltando', async () => {
        await request(app)
            .post('/api/products')
            .set('Authorization', `Bearer ${adminToken}`)
            .field('price', '20.00')
            .field('category', categoryId.toString())
            .attach('image', dummyImagePath)
            .expect(400);
        expect(uploadImage).not.toHaveBeenCalled();
    });

    it('Deve retornar 400 se a categoria for inválida', async () => {
        await request(app)
            .post('/api/products')
            .set('Authorization', `Bearer ${adminToken}`)
            .field('name', 'Teste Categoria Inválida')
            .field('price', '30.00')
            .field('category', 'invalid-id')
            .attach('image', dummyImagePath)
            .expect(400);
    });

    it('Usuário normal NÃO deve conseguir criar produto (403)', async () => {
        await request(app)
            .post('/api/products')
            .set('Authorization', `Bearer ${userToken}`)
            .field('name', 'Tentativa User')
            .field('price', '40.00')
            .field('category', categoryId.toString())
            .attach('image', dummyImagePath)
            .expect(403);
    });

    it('Deve retornar 401 se não houver token', async () => {
        await request(app)
            .post('/api/products')
            .field('name', 'Tentativa Sem Token')
            .field('price', '50.00')
            .field('category', categoryId.toString())
            .attach('image', dummyImagePath)
            .expect(401);
    });
});

// --- Testes PUT /:id ---
describe('PUT /:id', () => {
    let testProductId;
    let initialPublicId = 'initial_public_id';

    beforeEach(async () => {
        const product = await Product.create({
            name: 'Produto Original',
            price: 50,
            category: categoryId,
            image: 'http://original.com/image.jpg',
            imagePublicId: initialPublicId,
            stock: 20
        });
        testProductId = product._id;
    });

    it('Admin deve atualizar campos e imagem com sucesso', async () => {
        const updates = {
            name: 'Produto Atualizado PUT',
            price: '120.50',
            stock: '5'
        };
        uploadImage.mockResolvedValueOnce({
            secure_url: 'http://new.cloudinary.com/new_image.jpg',
            public_id: 'new_public_id'
        });

        const res = await request(app)
            .put(`/api/products/${testProductId}`)
            .set('Authorization', `Bearer ${adminToken}`)
            .field('name', updates.name)
            .field('price', updates.price)
            .field('stock', updates.stock)
            .attach('image', dummyImagePath)
            .expect('Content-Type', /json/)
            .expect(200);

        expect(res.body.name).toBe(updates.name);
        expect(res.body.price).toBe(Number(updates.price));
        expect(res.body.stock).toBe(Number(updates.stock));
        expect(res.body.image).toBe('http://new.cloudinary.com/new_image.jpg');
        expect(res.body.imagePublicId).toBe('new_public_id');

        expect(deleteImage).toHaveBeenCalledTimes(1);
        expect(deleteImage).toHaveBeenCalledWith(initialPublicId);
        expect(uploadImage).toHaveBeenCalledTimes(1);

        const dbProduct = await Product.findById(testProductId);
        expect(dbProduct.name).toBe(updates.name);
        expect(dbProduct.imagePublicId).toBe('new_public_id');
    });

    it('Admin deve atualizar apenas campos (sem nova imagem) com sucesso', async () => {
        const updates = { description: 'Nova Descrição' };

        const res = await request(app)
            .put(`/api/products/${testProductId}`)
            .set('Authorization', `Bearer ${adminToken}`)
            .field('description', updates.description)
            .expect(200);

        expect(deleteImage).not.toHaveBeenCalled();
        expect(uploadImage).not.toHaveBeenCalled();
        expect(res.body.description).toBe(updates.description);
        expect(res.body.image).toBe('http://original.com/image.jpg');
        expect(res.body.imagePublicId).toBe(initialPublicId);

        const dbProduct = await Product.findById(testProductId);
        expect(dbProduct.description).toBe(updates.description);
        expect(dbProduct.imagePublicId).toBe(initialPublicId);
    });

    it('Deve retornar 404 se o ID do produto não existir', async () => {
        const nonExistentId = new mongoose.Types.ObjectId();
        await request(app)
            .put(`/api/products/${nonExistentId}`)
            .set('Authorization', `Bearer ${adminToken}`)
            .field('name', 'Tentativa Update')
            .attach('image', dummyImagePath)
            .expect(404);
    });

    it('Usuário normal NÃO deve conseguir atualizar produto (403)', async () => {
        await request(app)
            .put(`/api/products/${testProductId}`)
            .set('Authorization', `Bearer ${userToken}`)
            .field('name', 'Tentativa Update User')
            .attach('image', dummyImagePath)
            .expect(403);
    });
});

// --- Testes DELETE /:id ---
describe('DELETE /:id', () => {
    let testProductId;
    let publicIdToDelete = 'public_id_to_delete';

    beforeEach(async () => {
        const product = await Product.create({
            name: 'Produto para Deletar',
            price: 10,
            category: categoryId,
            image: 'http://delete.me/image.jpg',
            imagePublicId: publicIdToDelete
        });
        testProductId = product._id;
    });

    it('Admin deve deletar produto com sucesso', async () => {
        await request(app)
            .delete(`/api/products/${testProductId}`)
            .set('Authorization', `Bearer ${adminToken}`)
            .expect(200);

        expect(deleteImage).toHaveBeenCalledTimes(1);
        expect(deleteImage).toHaveBeenCalledWith(publicIdToDelete);

        const dbProduct = await Product.findById(testProductId);
        expect(dbProduct).toBeNull();
    });

    it('Deve retornar 404 se o ID do produto não existir', async () => {
        const nonExistentId = new mongoose.Types.ObjectId();
        await request(app)
            .delete(`/api/products/${nonExistentId}`)
            .set('Authorization', `Bearer ${adminToken}`)
            .expect(404);
        expect(deleteImage).not.toHaveBeenCalled();
    });

    it('Usuário normal NÃO deve conseguir deletar produto (403)', async () => {
        await request(app)
            .delete(`/api/products/${testProductId}`)
            .set('Authorization', `Bearer ${userToken}`)
            .expect(403);
        expect(deleteImage).not.toHaveBeenCalled();
    });

    it('Deve funcionar mesmo se produto não tiver publicId (apenas loga warn)', async () => {
        const productNoPublicId = await Product.create({
            name: 'Sem Public ID', price: 5, category: categoryId, image: 'no_id.jpg'
        });

        await request(app)
            .delete(`/api/products/${productNoPublicId._id}`)
            .set('Authorization', `Bearer ${adminToken}`)
            .expect(200);

        expect(deleteImage).not.toHaveBeenCalled();
        const dbProduct = await Product.findById(productNoPublicId._id);
        expect(dbProduct).toBeNull();
    });
});
