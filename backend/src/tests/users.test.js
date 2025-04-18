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
});

beforeEach(async () => {
    await User.deleteMany({});

    const adminData = { name: 'Admin Test', email: 'admin@test.com', password: 'password123', role: 'admin' };
    const userData = { name: 'User Test', email: 'user@test.com', password: 'password123', role: 'user' };

    const adminUser = await User.create(adminData);
    const normalUser = await User.create(userData);

    adminToken = jwt.sign({ id: adminUser._id, role: adminUser.role }, process.env.JWT_SECRET, { expiresIn: '1h' });
    userToken = jwt.sign({ id: normalUser._id, role: normalUser.role }, process.env.JWT_SECRET, { expiresIn: '1h' });

    adminId = adminUser._id;
    userId = normalUser._id;
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
        const newUserAdminData = {
            name: 'New Admin By Admin',
            email: 'newadmin@test.com',
            password: 'password123',
            role: 'admin', 
        };
        const newUserUserData = {
            name: 'New User By Admin',
            email: 'newuser@test.com',
            password: 'password123',
            role: 'user', 
        };

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
    });

    describe('[Admin] GET /', () => {
         it('Admin deve conseguir listar todos os usuários', async () => {
             const res = await request(app)
                 .get('/api/users')
                 .set('Authorization', `Bearer ${adminToken}`)
                 .expect(200);

             expect(res.body.status).toBe('success');
             expect(res.body.results).toBeGreaterThanOrEqual(2);
             expect(res.body.data.users.length).toBeGreaterThanOrEqual(2);
             expect(res.body.data.users[0].password).toBeUndefined();
         });

         it('Usuário normal NÃO deve conseguir listar todos os usuários', async () => {
            await request(app)
                 .get('/api/users')
                 .set('Authorization', `Bearer ${userToken}`)
                 .expect(403);
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
                 .expect(200);

             expect(res.body.status).toBe('success');
             expect(res.body.data.user.name).toBe(updates.name);
             expect(res.body.data.user.email).toBe(updates.email);
             expect(res.body.data.user.role).toBe(updates.role);
         });

         it('Admin NÃO deve conseguir atualizar senha por esta rota', async () => {
            const updates = { password: 'newpassword' };
            const res = await request(app)
                 .patch(`/api/users/${userId}`)
                 .set('Authorization', `Bearer ${adminToken}`)
                 .send(updates)
                 .expect(200); 

             const dbUser = await User.findById(userId).select('+password');
             expect(dbUser.passwordChangedAt).toBeUndefined(); 
         });

         it('Usuário normal NÃO deve conseguir atualizar outro usuário', async () => {
             await request(app)
                 .patch(`/api/users/${adminId}`)
                 .set('Authorization', `Bearer ${userToken}`)
                 .send({ name: 'Attempt update' })
                 .expect(403);
         });
     });

      describe('[Admin] DELETE /:id', () => {
          it('Admin deve conseguir deletar um usuário', async () => {
              const tempUser = await User.create({ name: 'To Delete', email: 'todelete@test.com', password: 'password123' });

              await request(app)
                  .delete(`/api/users/${tempUser._id}`)
                  .set('Authorization', `Bearer ${adminToken}`)
                  .expect(204); 

              const dbUser = await User.findById(tempUser._id);
              expect(dbUser).toBeNull();
          });

           it('Usuário normal NÃO deve conseguir deletar outro usuário', async () => {
                await request(app)
                 .delete(`/api/users/${adminId}`)
                 .set('Authorization', `Bearer ${userToken}`)
                 .expect(403);
           });

           it('Admin deve receber 404 ao tentar deletar ID não existente', async () => {
                 const nonExistentId = new mongoose.Types.ObjectId();
                 await request(app)
                     .delete(`/api/users/${nonExistentId}`)
                     .set('Authorization', `Bearer ${adminToken}`)
                     .expect(404);
           });
      });


    // === Testes de Rotas do Usuário Logado ===

    describe('[User] GET /me', () => {
        it('Usuário logado deve conseguir obter seu próprio perfil', async () => {
            const res = await request(app)
                .get('/api/users/me')
                .set('Authorization', `Bearer ${userToken}`) 
                .expect(200);

            expect(res.body.status).toBe('success');
            expect(res.body.data.user._id).toBe(userId.toString());
            expect(res.body.data.user.email).toBe('user@test.com');
        });

         it('Deve retornar 401 se não estiver logado', async () => {
             await request(app)
                 .get('/api/users/me')
                 .expect(401);
         });
    });

    describe('[User] PATCH /me', () => {
        it('Usuário logado deve conseguir atualizar seu nome e email', async () => {
            const updates = { name: 'User Updated Name', email: 'user.new.email@test.com' };
            const res = await request(app)
                 .patch('/api/users/me')
                 .set('Authorization', `Bearer ${userToken}`)
                 .send(updates)
                 .expect(200);

            expect(res.body.data.user.name).toBe(updates.name);
            expect(res.body.data.user.email).toBe(updates.email);
        });

        it('Usuário logado NÃO deve conseguir atualizar sua role ou senha por esta rota', async () => {
            const updates = { role: 'admin', password: 'newpassword' };
            const res = await request(app)
                 .patch('/api/users/me')
                 .set('Authorization', `Bearer ${userToken}`)
                 .send(updates)
                 .expect(200);

            expect(res.body.data.user.role).toBe('user');
            const dbUser = await User.findById(userId);
            expect(dbUser.passwordChangedAt).toBeUndefined(); 
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
                 .expect(200);

            expect(res.body.status).toBe('success');
            expect(res.body.token).toBeDefined(); 

            await request(app)
                .post('/api/auth/login')
                .send({ email: 'user@test.com', password: 'password123' })
                .expect(401); 

             const loginRes = await request(app)
                .post('/api/auth/login')
                .send({ email: 'user@test.com', password: 'newpassword123' })
                .expect(200); 
             expect(loginRes.body.token).toBeDefined();
         });

          it('Deve retornar 401 se a senha atual estiver incorreta', async () => {
                const passwordData = {
                     currentPassword: 'WRONGpassword123',
                     password: 'newpassword123',
                     passwordConfirm: 'newpassword123',
                 };
                await request(app)
                     .patch('/api/users/updateMyPassword')
                     .set('Authorization', `Bearer ${userToken}`)
                     .send(passwordData)
                     .expect(401); 
          });

           it('Deve retornar 400 se a nova senha e a confirmação não coincidirem', async () => {
                const passwordData = {
                     currentPassword: 'password123', 
                     password: 'newpassword123',
                     passwordConfirm: 'MISMATCHEDnewpassword123', 
                 };
                await request(app)
                     .patch('/api/users/updateMyPassword')
                     .set('Authorization', `Bearer ${userToken}`)
                     .send(passwordData)
                     .expect(400); 
           });
     });

      describe('[User] DELETE /me', () => {
         it('Usuário logado deve conseguir deletar sua própria conta', async () => {
                const tempUserData = {
                   name: 'Temporary Delete User',
                   email: 'tempdelete@test.com',
                   password: 'password123',
              };

                const tempUser = await User.create(tempUserData);
                
                const tempToken = jwt.sign({ id: tempUser._id, role: tempUser.role }, process.env.JWT_SECRET, { expiresIn: '1h' });

              await request(app)
                 .delete('/api/users/me')
                 .set('Authorization', `Bearer ${tempToken}`)
                 .expect(204); 

              const dbUser = await User.findById(tempUser._id);
              expect(dbUser).toBeNull();
         });
     });

}); 