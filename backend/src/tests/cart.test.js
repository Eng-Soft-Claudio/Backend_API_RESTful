//src/tests/cart.test.js
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import jwt from 'jsonwebtoken';
import app from '../app.js'; 
import Cart from '../models/Cart.js';
import Product from '../models/Product.js'; 
import Category from '../models/Category.js'; 
import User from '../models/User.js'; 

let mongoServer;
let testUserToken; 
let testUserId;
let product1Id; 
let product2Id; 
let testCategoryId;

// --- Setup e Teardown ---
beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    await mongoose.connect(mongoUri);

    // Limpar tudo antes de começar
    await User.deleteMany({});
    await Category.deleteMany({});
    await Product.deleteMany({});
    await Cart.deleteMany({});

    // Criar Categoria
    const category = await Category.create({ name: 'Categoria Carrinho' });
    testCategoryId = category._id;

    // Criar Usuário de Teste
    const userData = { name: 'Cart User', email: 'cart.user@test.com', password: 'password123' };
    const testUser = await User.create(userData);
    testUserId = testUser._id;
    testUserToken = jwt.sign({ id: testUserId, role: testUser.role }, process.env.JWT_SECRET, { expiresIn: '1h' });

    // Criar Produtos de Teste
    const prod1 = await Product.create({ name: 'Produto Carrinho 1', price: 10.50, category: testCategoryId, image: 'cart1.jpg', stock: 10 });
    const prod2 = await Product.create({ name: 'Produto Carrinho 2', price: 5.00, category: testCategoryId, image: 'cart2.jpg', stock: 5 });
    product1Id = prod1._id;
    product2Id = prod2._id;
});

// Limpar Carrinhos após cada teste
afterEach(async () => {
    await Cart.deleteMany({});
});

// Limpeza final
afterAll(async () => {
    await User.deleteMany({});
    await Category.deleteMany({});
    await Product.deleteMany({});
    await Cart.deleteMany({});
    await mongoose.disconnect();
    await mongoServer.stop();
});

// --- Bloco Principal de Testes para Carrinho ---
describe('/api/cart', () => {

    // --- Testes GET / ---
    describe('GET /', () => {
        it('deve retornar um carrinho vazio se o usuário não tiver carrinho', async () => {
            const res = await request(app)
                .get('/api/cart')
                .set('Authorization', `Bearer ${testUserToken}`)
                .expect('Content-Type', /json/)
                .expect(200);

            expect(res.body.status).toBe('success');
            expect(res.body.data.cart).toBeDefined();
            expect(res.body.data.cart._id).toBeNull(); 
            expect(res.body.data.cart.user.toString()).toBe(testUserId.toString());
            expect(res.body.data.cart.items).toEqual([]);
        });

        it('deve retornar o carrinho populado do usuário se ele existir', async () => {
            // Adiciona um item manualmente para criar o carrinho
            await Cart.create({
                user: testUserId,
                items: [{ product: product1Id, quantity: 2 }]
            });

            const res = await request(app)
                .get('/api/cart')
                .set('Authorization', `Bearer ${testUserToken}`)
                .expect(200);

            expect(res.body.status).toBe('success');
            expect(res.body.data.cart).toBeDefined();
            expect(res.body.data.cart._id).not.toBeNull();
            expect(res.body.data.cart.items).toHaveLength(1);
            expect(res.body.data.cart.items[0].product.name).toBe('Produto Carrinho 1');
            expect(res.body.data.cart.items[0].product.price).toBe(10.50);
            expect(res.body.data.cart.items[0].quantity).toBe(2);
            expect(res.body.data.cart.items[0].subtotal).toBeCloseTo(21.00);
        });

        it('deve retornar 401 se não estiver autenticado', async () => {
            await request(app)
                .get('/api/cart')
                .expect(401);
        });
    });

    // --- Testes POST /items ---
    describe('POST /items', () => {
        it('deve adicionar um novo item ao carrinho inexistente', async () => {
            const newItem = { productId: product1Id.toString(), quantity: 3 };

            const res = await request(app)
                .post('/api/cart/items')
                .set('Authorization', `Bearer ${testUserToken}`)
                .send(newItem)
                .expect(200);

            expect(res.body.status).toBe('success');
            expect(res.body.message).toContain('adicionado/atualizado');
            expect(res.body.data.cart.items).toHaveLength(1);
            expect(res.body.data.cart.items[0].product._id.toString()).toBe(product1Id.toString());
            expect(res.body.data.cart.items[0].quantity).toBe(3);

            // Verifica no DB
            const dbCart = await Cart.findOne({ user: testUserId });
            expect(dbCart).not.toBeNull();
            expect(dbCart.items).toHaveLength(1);
            expect(dbCart.items[0].product.toString()).toBe(product1Id.toString());
            expect(dbCart.items[0].quantity).toBe(3);
        });

        it('deve adicionar um segundo item diferente ao carrinho existente', async () => {
            // Cria carrinho com item 1
            await Cart.create({ user: testUserId, items: [{ product: product1Id, quantity: 1 }] });

            const newItem = { productId: product2Id.toString(), quantity: 1 };

            const res = await request(app)
                .post('/api/cart/items')
                .set('Authorization', `Bearer ${testUserToken}`)
                .send(newItem)
                .expect(200);

            expect(res.body.data.cart.items).toHaveLength(2);
            const productIdsInCart = res.body.data.cart.items.map(item => item.product._id.toString());
            expect(productIdsInCart).toEqual(expect.arrayContaining([product1Id.toString(), product2Id.toString()]));
        });

        it('deve incrementar a quantidade de um item existente no carrinho', async () => {
            // Cria carrinho com item 1, quantidade 2
            await Cart.create({ user: testUserId, items: [{ product: product1Id, quantity: 2 }] });

            const itemToAdd = { productId: product1Id.toString(), quantity: 3 };

            const res = await request(app)
                .post('/api/cart/items')
                .set('Authorization', `Bearer ${testUserToken}`)
                .send(itemToAdd)
                .expect(200);

            expect(res.body.data.cart.items).toHaveLength(1);
            expect(res.body.data.cart.items[0].product._id.toString()).toBe(product1Id.toString());
            expect(res.body.data.cart.items[0].quantity).toBe(5);

             // Verifica no DB
             const dbCart = await Cart.findOne({ user: testUserId });
             expect(dbCart.items[0].quantity).toBe(5);
        });

        it('deve retornar 400 se a quantidade for inválida', async () => {
            const invalidItem = { productId: product1Id.toString(), quantity: 0 };
            await request(app)
                .post('/api/cart/items')
                .set('Authorization', `Bearer ${testUserToken}`)
                .send(invalidItem)
                .expect(400);
        });

        it('deve retornar 404 se o productId não existir', async () => {
            const nonExistentId = new mongoose.Types.ObjectId();
            const invalidItem = { productId: nonExistentId.toString(), quantity: 1 };
            await request(app)
                .post('/api/cart/items')
                .set('Authorization', `Bearer ${testUserToken}`)
                .send(invalidItem)
                .expect(404);
        });

        it('deve retornar 401 se não estiver autenticado', async () => {
             const newItem = { productId: product1Id.toString(), quantity: 1 };
             await request(app)
                .post('/api/cart/items')
                .send(newItem)
                .expect(401);
        });
    });

    // --- Testes PUT /items/:productId ---
    describe('PUT /items/:productId', () => {
        let cartWithItem;

        beforeEach(async () => {
            // Cria carrinho com 2 itens antes de cada teste PUT
            cartWithItem = await Cart.create({ user: testUserId, items: [
                { product: product1Id, quantity: 1 },
                { product: product2Id, quantity: 5 }
            ]});
        });

        it('deve atualizar a quantidade de um item existente', async () => {
            const updateData = { quantity: 3 }; 

            const res = await request(app)
                .put(`/api/cart/items/${product1Id}`)
                .set('Authorization', `Bearer ${testUserToken}`)
                .send(updateData)
                .expect(200);

            expect(res.body.status).toBe('success');
            expect(res.body.message).toContain('Quantidade do item atualizada');
            expect(res.body.data.cart.items).toHaveLength(2);

            const updatedItem = res.body.data.cart.items.find(item => item.product._id.toString() === product1Id.toString());
            const otherItem = res.body.data.cart.items.find(item => item.product._id.toString() === product2Id.toString());

            expect(updatedItem).toBeDefined();
            expect(updatedItem.quantity).toBe(3);
            expect(otherItem.quantity).toBe(5); 

             // Verifica DB
             const dbCart = await Cart.findById(cartWithItem._id);
             const dbItem = dbCart.items.find(item => item.product.toString() === product1Id.toString());
             expect(dbItem.quantity).toBe(3);
        });

        it('deve retornar 400 se a quantidade for menor que 1', async () => {
            await request(app)
                .put(`/api/cart/items/${product1Id}`)
                .set('Authorization', `Bearer ${testUserToken}`)
                .send({ quantity: 0 })
                .expect(400);
        });

        it('deve retornar 404 se o productId não existir no carrinho', async () => {
            const nonExistentInCartId = new mongoose.Types.ObjectId();
            await request(app)
                .put(`/api/cart/items/${nonExistentInCartId}`)
                .set('Authorization', `Bearer ${testUserToken}`)
                .send({ quantity: 2 })
                .expect(404);
        });

         it('deve retornar 404 se o carrinho não existir (usuário sem carrinho)', async () => {
             // Deleta o carrinho criado no beforeEach
             await Cart.findByIdAndDelete(cartWithItem._id);

             await request(app)
                .put(`/api/cart/items/${product1Id}`)
                .set('Authorization', `Bearer ${testUserToken}`)
                .send({ quantity: 2 })
                .expect(404); 
         });

        it('deve retornar 401 se não estiver autenticado', async () => {
             await request(app)
                .put(`/api/cart/items/${product1Id}`)
                .send({ quantity: 2 })
                .expect(401);
        });
    });

    // --- Testes DELETE /items/:productId ---
    describe('DELETE /items/:productId', () => {
        let cartWithItems;

        beforeEach(async () => {
            cartWithItems = await Cart.create({ user: testUserId, items: [
                { product: product1Id, quantity: 1 },
                { product: product2Id, quantity: 2 }
            ]});
            console.log('Carrinho criado no beforeEach DELETE:', JSON.stringify(cartWithItems, null, 2));
            console.log('Tentando deletar productId:', product1Id);
        });

        it('deve remover um item existente do carrinho', async () => {
            const res = await request(app)
                .delete(`/api/cart/items/${product1Id}`) 
                .set('Authorization', `Bearer ${testUserToken}`)
                .expect(200);

            expect(res.body.status).toBe('success');
            expect(res.body.message).toContain('Item removido');
            expect(res.body.data.cart.items).toHaveLength(1);
            expect(res.body.data.cart.items[0].product._id.toString()).toBe(product2Id.toString()); 

            // Verifica DB
            const dbCart = await Cart.findById(cartWithItems._id);
            expect(dbCart.items).toHaveLength(1);
            expect(dbCart.items[0].product.toString()).toBe(product2Id.toString());
        });

        it('deve retornar 404 se o item a remover não estiver no carrinho', async () => {
            const nonExistentInCartId = new mongoose.Types.ObjectId();
            await request(app)
                .delete(`/api/cart/items/${nonExistentInCartId}`)
                .set('Authorization', `Bearer ${testUserToken}`)
                .expect(404);
        });

        it('deve retornar 404 se o carrinho não existir', async () => {
            await Cart.findByIdAndDelete(cartWithItems._id); 
            await request(app)
                .delete(`/api/cart/items/${product1Id}`)
                .set('Authorization', `Bearer ${testUserToken}`)
                .expect(404);
        });

        it('deve retornar 401 se não estiver autenticado', async () => {
            await request(app)
                .delete(`/api/cart/items/${product1Id}`)
                .expect(401);
        });
    });

    // --- Testes DELETE / (Limpar Carrinho) ---
    describe('DELETE /', () => {
         it('deve remover todos os itens de um carrinho existente', async () => {
            // Cria carrinho com itens
            await Cart.create({ user: testUserId, items: [
                { product: product1Id, quantity: 1 },
                { product: product2Id, quantity: 2 }
            ]});

            const res = await request(app)
                .delete('/api/cart')
                .set('Authorization', `Bearer ${testUserToken}`)
                .expect(200);

            expect(res.body.status).toBe('success');
            expect(res.body.message).toContain('Carrinho limpo');
            expect(res.body.data.cart.items).toEqual([]);

            // Verifica DB
            const dbCart = await Cart.findOne({ user: testUserId });
            expect(dbCart).not.toBeNull();
            expect(dbCart.items).toHaveLength(0);
         });

         it('deve retornar sucesso mesmo se o carrinho já estiver vazio', async () => {
            // Garante que não há carrinho
            await Cart.deleteMany({ user: testUserId });

            const res = await request(app)
                .delete('/api/cart')
                .set('Authorization', `Bearer ${testUserToken}`)
                .expect(200);

            expect(res.body.status).toBe('success');
            expect(res.body.message).toContain('Carrinho já está vazio');
            expect(res.body.data.cart.items).toEqual([]);
         });

         it('deve retornar 401 se não estiver autenticado', async () => {
            await request(app)
                .delete('/api/cart')
                .expect(401);
        });
    });

}); 