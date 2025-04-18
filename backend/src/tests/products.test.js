// src/tests/products.test.js
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import app from '../app'; 
import Product from '../models/Product'; 
import Category from '../models/Category'; 

let mongoServer;
let categoryId; 

beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    await mongoose.connect(mongoUri);
    await Product.deleteMany({});
    await Category.deleteMany({});

    const testCategory = await Category.create({ name: 'Eletrônicos Teste' });
    categoryId = testCategory._id;
});

afterEach(async () => {
    await Product.deleteMany({});
});

afterAll(async () => {
    await Category.deleteMany({}); 
    await mongoose.disconnect();
    await mongoServer.stop();
});

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
                { name: 'Laptop Teste', price: 1500, category: categoryId, image: 'test.jpg' },
                { name: 'Mouse Teste', price: 50, category: categoryId, image: 'test2.jpg' },
            ]);

            const res = await request(app)
                .get('/api/products')
                .expect('Content-Type', /json/)
                .expect(200);

            expect(res.body.status).toBe('success');
            expect(res.body.results).toBe(2);
            expect(res.body.products).toHaveLength(2);

            const productNames = res.body.products.map(p => p.name);

            expect(productNames).toContain('Laptop Teste');
            expect(productNames).toContain('Mouse Teste');
            expect(res.body.products[0].category).toHaveProperty('name', 'Eletrônicos Teste');
            expect(res.body.products[0].category).toHaveProperty('slug', 'eletronicos-teste');
        });

        it('deve filtrar produtos por categoria (usando ID)', async () => {
             const otherCategory = await Category.create({ name: 'Roupas Teste' });
             await Product.create({ name: 'Camisa Teste', price: 80, category: otherCategory._id, image: 'shirt.jpg' });
             await Product.create({ name: 'Laptop Teste', price: 1500, category: categoryId, image: 'test.jpg' });

             const res = await request(app)
                 .get(`/api/products?category=${categoryId}`)
                 .expect(200);

             expect(res.body.results).toBe(1);
             expect(res.body.products).toHaveLength(1);
             expect(res.body.products[0].name).toBe('Laptop Teste');
             expect(res.body.products[0].category._id.toString()).toBe(categoryId.toString());
        });

        it('deve retornar vazio e mensagem apropriada se a categoria do filtro não existir', async () => {
            const nonExistentId = new mongoose.Types.ObjectId(); 
             const res = await request(app)
                 .get(`/api/products?category=${nonExistentId}`)
                 .expect(200); 

                 expect(res.body).not.toHaveProperty('status'); 
                 expect(res.body).not.toHaveProperty('results'); 
                 expect(Array.isArray(res.body.products)).toBe(true); 
                 expect(res.body.products).toHaveLength(0); 
                 expect(res.body.message).toBe('Categoria não encontrada'); 
        });

         it('deve suportar paginação (limit)', async () => {
             await Product.create([
                 { name: 'Prod 1', price: 10, category: categoryId, image: '1.jpg' },
                 { name: 'Prod 2', price: 20, category: categoryId, image: '2.jpg' },
                 { name: 'Prod 3', price: 30, category: categoryId, image: '3.jpg' },
             ]);

             const res = await request(app)
                 .get(`/api/products?limit=2`) 
                 .expect(200);

             expect(res.body.results).toBe(2);
             expect(res.body.products).toHaveLength(2);
         });

    });

});