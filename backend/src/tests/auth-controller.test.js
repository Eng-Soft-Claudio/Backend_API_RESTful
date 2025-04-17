import request from 'supertest';
import app from '../app.js';

describe('POST /api/auth/login', () => {
  it('deve retornar um token JWT válido', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@exemplo.com', password: 'senha_segura' });
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty('token');
  });
});