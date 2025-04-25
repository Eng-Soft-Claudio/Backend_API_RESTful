// src/tests/review.test.js
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import jwt from 'jsonwebtoken';
import app from '../app.js';
import Review from '../models/Review.js';
import Product from '../models/Product.js';
import Category from '../models/Category.js';
import User from '../models/User.js';

let mongoServer;
let userToken, adminToken;
let userId, adminUserId;
let productId, categoryId;

// --- Setup e Teardown ---
beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    await mongoose.connect(mongoUri);

    // Garantir JWT_SECRET
    if (!process.env.JWT_SECRET) {
        process.env.JWT_SECRET = 'test-secret-for-review-please-replace';
        console.warn('JWT_SECRET não definido, usando valor padrão para testes de review.');
    }

    // Limpeza inicial
    await User.deleteMany({});
    await Category.deleteMany({});
    await Product.deleteMany({});
    await Review.deleteMany({});

    // Criar dados base
    const category = await Category.create({ name: 'Categoria Review' });
    categoryId = category._id;
    const product = await Product.create({ name: 'Produto para Avaliar', price: 10, category: categoryId, image: 'review.jpg', stock: 10 });
    productId = product._id;
    const user = await User.create({ name: 'Review User', email: 'review.user@test.com', password: 'password123' });
    userId = user._id;
    // Inclui 'name' no payload do token se o controller o usa (como no createReview)
    userToken = jwt.sign({ id: userId, role: user.role, name: user.name }, process.env.JWT_SECRET);
    const admin = await User.create({ name: 'Review Admin', email: 'review.admin@test.com', password: 'password123', role: 'admin' });
    adminUserId = admin._id;
    adminToken = jwt.sign({ id: adminUserId, role: admin.role, name: admin.name }, process.env.JWT_SECRET);
});

afterEach(async () => {
    await Review.deleteMany({});
    // Resetar rating do produto
    await Product.findByIdAndUpdate(productId, { rating: 0, numReviews: 0 });
});

afterAll(async () => {
    await User.deleteMany({});
    await Category.deleteMany({});
    await Product.deleteMany({});
    await Review.deleteMany({});
    await mongoose.disconnect();
    await mongoServer.stop();
});

// --- Testes ---
describe('/api/reviews', () => {

    // --- Testes POST /product/:productId ---
    describe('POST /product/:productId', () => {
        const reviewData = { rating: 5, comment: 'Ótimo produto!' };

        it('usuário logado deve criar uma avaliação com sucesso', async () => {
            const res = await request(app)
                .post(`/api/reviews/product/${productId}`)
                .set('Authorization', `Bearer ${userToken}`)
                .send(reviewData)
                .expect('Content-Type', /json/)
                .expect(201);

            expect(res.body.status).toBe('success');
            expect(res.body.data.review.rating).toBe(reviewData.rating);
            expect(res.body.data.review.comment).toBe(reviewData.comment);
            expect(res.body.data.review.user.toString()).toBe(userId.toString());
            expect(res.body.data.review.product.toString()).toBe(productId.toString());
            expect(res.body.data.review.name).toBe('Review User');

            // Verifica se o rating no produto foi atualizado
            const product = await Product.findById(productId);
            expect(product.numReviews).toBe(1);
            expect(product.rating).toBe(5);
        });

        it('deve retornar 400 se tentar avaliar o mesmo produto duas vezes', async () => {
            // Cria a primeira avaliação
            await request(app)
                .post(`/api/reviews/product/${productId}`)
                .set('Authorization', `Bearer ${userToken}`)
                .send(reviewData)
                .expect(201);

            // Tenta criar a segunda
            const res = await request(app)
                .post(`/api/reviews/product/${productId}`)
                .set('Authorization', `Bearer ${userToken}`)
                .send({ rating: 4, comment: 'Segunda avaliação' })
                .expect(400);
            expect(res.body.message).toMatch(/Você já avaliou este produto/i);

            // Verifica se o rating no produto NÃO mudou (continua 5 da primeira)
            const product = await Product.findById(productId);
            expect(product.numReviews).toBe(1);
            expect(product.rating).toBe(5);
        });

        it('deve retornar 400 se a nota (rating) estiver faltando ou for inválida', async () => {
            // Sem rating
            await request(app)
                .post(`/api/reviews/product/${productId}`)
                .set('Authorization', `Bearer ${userToken}`)
                .send({ comment: 'Sem nota' })
                .expect(400);

            // Rating inválido
            await request(app)
                .post(`/api/reviews/product/${productId}`)
                .set('Authorization', `Bearer ${userToken}`)
                .send({ rating: 6, comment: 'Nota > 5' })
                .expect(400);

            await request(app)
                .post(`/api/reviews/product/${productId}`)
                .set('Authorization', `Bearer ${userToken}`)
                .send({ rating: 0, comment: 'Nota < 1' })
                .expect(400);
        });

        it('deve retornar 401 se não estiver autenticado', async () => {
            await request(app)
                .post(`/api/reviews/product/${productId}`)
                .send(reviewData)
                .expect(401);
        });

        it('deve retornar 404 se o produto não existir', async () => {
            const nonExistentId = new mongoose.Types.ObjectId();
            await request(app)
                .post(`/api/reviews/product/${nonExistentId}`)
                .set('Authorization', `Bearer ${userToken}`)
                .send(reviewData)
                .expect(404);
        });
    });

    // --- Testes GET /product/:productId ---
    describe('GET /product/:productId', () => {
        let review1, review2;
        beforeEach(async () => {
            // Cria 2 reviews para o produto
            review1 = await Review.create({ user: userId, name: 'User 1', product: productId, rating: 5, comment: 'Review 1' });
            review2 = await Review.create({ user: adminUserId, name: 'Admin User', product: productId, rating: 3, comment: 'Review 2' });
            // Atualiza produto (hooks devem ter rodado, mas forçamos aqui para garantir)
            await Product.findByIdAndUpdate(productId, { rating: 4, numReviews: 2 });
        });

        it('deve retornar a lista de avaliações de um produto', async () => {
            const res = await request(app)
                .get(`/api/reviews/product/${productId}`)
                .expect('Content-Type', /json/)
                .expect(200);

            expect(res.body.status).toBe('success');
            expect(res.body.results).toBe(2);
            expect(res.body.data.reviews).toHaveLength(2);
            expect(res.body.pagination.totalReviews).toBe(2);
            // Verifica se os IDs estão lá (ordem padrão é createdAt DESC)
            const reviewIds = res.body.data.reviews.map(r => r._id.toString());
            // A ordem depende de qual foi criado por último no beforeEach
             expect(reviewIds).toEqual([review2._id.toString(), review1._id.toString()]);
        });

        it('deve suportar paginação (limit)', async () => {
            const res = await request(app)
                .get(`/api/reviews/product/${productId}?limit=1`)
                .expect(200);
            expect(res.body.results).toBe(1);
            expect(res.body.data.reviews).toHaveLength(1);
            expect(res.body.pagination.totalPages).toBe(2);
             expect(res.body.data.reviews[0]._id.toString()).toBe(review2._id.toString()); // Mais recente
        });

        it('deve suportar paginação (page)', async () => {
            const res = await request(app)
                .get(`/api/reviews/product/${productId}?limit=1&page=2`)
                .expect(200);
            expect(res.body.results).toBe(1);
            expect(res.body.data.reviews).toHaveLength(1);
            expect(res.body.pagination.currentPage).toBe(2);
            expect(res.body.data.reviews[0]._id.toString()).toBe(review1._id.toString()); // Segunda mais recente
        });

        it('deve retornar 404 se o produto não existir', async () => {
            const nonExistentId = new mongoose.Types.ObjectId();
            await request(app)
                .get(`/api/reviews/product/${nonExistentId}`)
                .expect(404);
        });

        it('deve retornar 400 se ID produto for inválido', async () => {
            await request(app)
                .get(`/api/reviews/product/invalid-id`)
                .expect(400);
        });
    });

    // --- Testes DELETE /:reviewId ---
    describe('DELETE /:reviewId', () => {
        let userReview, adminReview;
        beforeEach(async () => {
            userReview = await Review.create({ user: userId, name: 'User 1', product: productId, rating: 5, comment: 'Minha Review' });
            adminReview = await Review.create({ user: adminUserId, name: 'Admin User', product: productId, rating: 3, comment: 'Review do Admin' });
            await Product.findByIdAndUpdate(productId, { rating: 4, numReviews: 2 });
        });

        it('usuário deve conseguir deletar sua própria avaliação', async () => {
            await request(app)
                .delete(`/api/reviews/${userReview._id}`)
                .set('Authorization', `Bearer ${userToken}`)
                .expect(204);

            // Verifica se foi deletada do DB
            const deleted = await Review.findById(userReview._id);
            expect(deleted).toBeNull();

            // Verifica se o rating do produto foi recalculado
            const product = await Product.findById(productId);
            expect(product.numReviews).toBe(1);
            expect(product.rating).toBe(3);
        });

        it('usuário NÃO deve conseguir deletar avaliação de outro usuário', async () => {
            await request(app)
                .delete(`/api/reviews/${adminReview._id}`)
                .set('Authorization', `Bearer ${userToken}`)
                .expect(404);
            // Verifica se a review do admin ainda existe
            const notDeleted = await Review.findById(adminReview._id);
            expect(notDeleted).not.toBeNull();
            // Verifica se o rating não foi alterado indevidamente
            const product = await Product.findById(productId);
            expect(product.numReviews).toBe(2);
            expect(product.rating).toBe(4);
        });

        it('admin deve conseguir deletar qualquer avaliação', async () => {
            await request(app)
                .delete(`/api/reviews/${userReview._id}`) 
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(204);

            // Verifica se foi deletada do DB
            const deleted = await Review.findById(userReview._id);
            expect(deleted).toBeNull();

            // Verifica se o rating do produto foi recalculado
            const product = await Product.findById(productId);
            expect(product.numReviews).toBe(1);
            expect(product.rating).toBe(3); 
        });

        it('deve retornar 404 se a avaliação não existir', async () => {
            const nonExistentId = new mongoose.Types.ObjectId();
            await request(app)
                .delete(`/api/reviews/${nonExistentId}`)
                .set('Authorization', `Bearer ${userToken}`)
                .expect(404);
        });

        it('deve retornar 401 se não estiver autenticado', async () => {
            await request(app)
                .delete(`/api/reviews/${userReview._id}`)
                .expect(401);
        });

        it('deve retornar 400 se ID da review for inválido', async () => {
           await request(app)
                .delete(`/api/reviews/invalid-review-id`)
                .set('Authorization', `Bearer ${userToken}`)
                .expect(400);
       });
    });

}); // Fim describe principal