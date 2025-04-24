// src/tests/category.test.js
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import jwt from 'jsonwebtoken';
import app from '../app.js';
import Category from '../models/Category.js';
import Product from '../models/Product.js'; // Necessário para testar deleção
import User from '../models/User.js';

let mongoServer;
let adminToken, userToken; // Tokens para admin e usuário normal
let categoryId; // ID de uma categoria de teste

beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());

    await User.deleteMany({});
    await Category.deleteMany({});
    await Product.deleteMany({});

    // Criar usuários
    const adminData = { name: 'Category Admin', email: 'cat.admin@test.com', password: 'password123', role: 'admin' };
    const userData = { name: 'Category User', email: 'cat.user@test.com', password: 'password123' };
    const adminUser = await User.create(adminData);
    const normalUser = await User.create(userData);
    adminToken = jwt.sign({ id: adminUser._id, role: adminUser.role }, process.env.JWT_SECRET);
    userToken = jwt.sign({ id: normalUser._id, role: normalUser.role }, process.env.JWT_SECRET);
});

afterEach(async () => {
    // Limpa categorias e produtos após cada teste
    await Category.deleteMany({});
    await Product.deleteMany({});
});

afterAll(async () => {
    await User.deleteMany({});
    await Category.deleteMany({});
    await Product.deleteMany({});
    await mongoose.disconnect();
    await mongoServer.stop();
});

describe('/api/categories', () => {

    // --- Testes POST / ---
    describe('POST /', () => {
        const categoryData = { name: 'Eletrônicos Novos', description: 'Desc Eletrônicos' };

        it('Admin deve criar categoria com sucesso', async () => {
            const res = await request(app)
                .post('/api/categories')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(categoryData)
                .expect('Content-Type', /json/)
                .expect(201);

            expect(res.body.name).toBe(categoryData.name);
            expect(res.body.description).toBe(categoryData.description);
            expect(res.body.slug).toBe('eletronicos-novos'); 
            categoryId = res.body._id; 
        });

        it('Deve retornar 409 se tentar criar categoria com nome duplicado', async () => {
            // Cria a primeira
            await request(app)
                .post('/api/categories')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(categoryData)
                .expect(201);
            // Tenta criar a segunda com mesmo nome
            await request(app)
                .post('/api/categories')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ name: categoryData.name }) 
                .expect(409);
        });

        it('Deve retornar 400 se o nome estiver faltando', async () => {
             await request(app)
                .post('/api/categories')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ description: 'Sem nome' }) 
                .expect(400);
        });

         it('Usuário normal NÃO deve criar categoria (403)', async () => {
             await request(app)
                .post('/api/categories')
                .set('Authorization', `Bearer ${userToken}`)
                .send(categoryData)
                .expect(403);
         });

          it('Deve retornar 401 sem token', async () => {
             await request(app)
                .post('/api/categories')
                .send(categoryData)
                .expect(401);
         });
    });

     // --- Testes GET / ---
     describe('GET /', () => {
        it('Deve retornar lista de categorias', async () => {
             await Category.create({ name: 'Roupas' });
             await Category.create({ name: 'Calçados' });

             const res = await request(app)
                .get('/api/categories')
                .expect('Content-Type', /json/)
                .expect(200);

            expect(Array.isArray(res.body)).toBe(true);
            expect(res.body).toHaveLength(2);
            const names = res.body.map(c => c.name);
            expect(names).toEqual(expect.arrayContaining(['Roupas', 'Calçados']));
        });

         it('Deve retornar lista vazia se não houver categorias', async () => {
             const res = await request(app).get('/api/categories').expect(200);
             expect(res.body).toHaveLength(0);
         });
         // Rota pública, não precisa testar 401/403 a menos que mude
     });

      // --- Testes GET /:id ---
      describe('GET /:id', () => {
          let testCat;
          beforeEach(async () => {
              testCat = await Category.create({ name: 'Teste Get ID' });
          });

          it('Deve retornar uma categoria específica por ID', async () => {
             const res = await request(app)
                .get(`/api/categories/${testCat._id}`)
                .expect(200);
             expect(res.body.name).toBe('Teste Get ID');
             expect(res.body._id.toString()).toBe(testCat._id.toString());
          });

          it('Deve retornar 404 se ID não existir', async () => {
              const nonExistentId = new mongoose.Types.ObjectId();
              await request(app).get(`/api/categories/${nonExistentId}`).expect(404);
          });

          it('Deve retornar 400 se ID for inválido', async () => {
              await request(app).get('/api/categories/invalid-id').expect(400);
          });
      });

      // --- Testes PUT /:id ---
      describe('PUT /:id', () => {
          let testCat;
          const updateData = { name: 'Categoria Editada', description: 'Nova Desc' };
          beforeEach(async () => {
              testCat = await Category.create({ name: 'Original', description: 'Orig Desc' });
          });

           it('Admin deve atualizar categoria com sucesso', async () => {
               const res = await request(app)
                    .put(`/api/categories/${testCat._id}`)
                    .set('Authorization', `Bearer ${adminToken}`)
                    .send(updateData)
                    .expect(200);
                expect(res.body.name).toBe(updateData.name);
                expect(res.body.description).toBe(updateData.description);
                expect(res.body.slug).toBe('categoria-editada'); 
           });

            it('Usuário normal NÃO deve atualizar categoria (403)', async () => {
               await request(app)
                    .put(`/api/categories/${testCat._id}`)
                    .set('Authorization', `Bearer ${userToken}`)
                    .send(updateData)
                    .expect(403);
           });

            it('Deve retornar 404 se ID não existir', async () => {
               const nonExistentId = new mongoose.Types.ObjectId();
               await request(app)
                    .put(`/api/categories/${nonExistentId}`)
                    .set('Authorization', `Bearer ${adminToken}`)
                    .send(updateData)
                    .expect(404);
           });

             it('Deve retornar 400 se ID for inválido', async () => {
               await request(app)
                    .put('/api/categories/invalid-id')
                     .set('Authorization', `Bearer ${adminToken}`)
                    .send(updateData)
                    .expect(400);
           });

            it('Deve retornar 400 se dados forem inválidos (nome vazio)', async () => {
                 await request(app)
                    .put(`/api/categories/${testCat._id}`)
                     .set('Authorization', `Bearer ${adminToken}`)
                    .send({ name: '' }) 
                    .expect(400);
            });
      });

      // --- Testes DELETE /:id ---
      describe('DELETE /:id', () => {
           let catToDelete, catWithProduct;
           let productInCategory;

           beforeEach(async () => {
               catToDelete = await Category.create({ name: 'Para Deletar' });
               catWithProduct = await Category.create({ name: 'Com Produto' });
               productInCategory = await Product.create({
                   name: 'Produto Associado',
                   price: 10,
                   category: catWithProduct._id, 
                   image: 'assoc.jpg',
                   stock: 1
               });
           });

            it('Admin deve deletar categoria VAZIA com sucesso', async () => {
                 await request(app)
                    .delete(`/api/categories/${catToDelete._id}`)
                    .set('Authorization', `Bearer ${adminToken}`)
                    .expect(200); 

                const deleted = await Category.findById(catToDelete._id);
                expect(deleted).toBeNull();
            });

             it('Admin NÃO deve conseguir deletar categoria COM produtos associados (400)', async () => {
                 const res = await request(app)
                    .delete(`/api/categories/${catWithProduct._id}`)
                    .set('Authorization', `Bearer ${adminToken}`)
                    .expect(400);
                 expect(res.body.message).toMatch(/Não é possível deletar. Existem \d+ produto\(s\) nesta categoria/i);

                 // Verifica se a categoria ainda existe
                 const notDeleted = await Category.findById(catWithProduct._id);
                 expect(notDeleted).not.toBeNull();
            });

             it('Usuário normal NÃO deve deletar categoria (403)', async () => {
                await request(app)
                    .delete(`/api/categories/${catToDelete._id}`)
                    .set('Authorization', `Bearer ${userToken}`)
                    .expect(403);
            });

             it('Deve retornar 404 se ID não existir', async () => {
                const nonExistentId = new mongoose.Types.ObjectId();
                await request(app)
                     .delete(`/api/categories/${nonExistentId}`)
                     .set('Authorization', `Bearer ${adminToken}`)
                     .expect(404);
            });

              it('Deve retornar 400 se ID for inválido', async () => {
                await request(app)
                     .delete('/api/categories/invalid-id')
                      .set('Authorization', `Bearer ${adminToken}`)
                     .expect(400);
            });
      });

});