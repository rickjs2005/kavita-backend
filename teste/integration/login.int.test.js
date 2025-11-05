const request = require('supertest');

jest.mock('../../config/pool', () => require('../mocks/pool.mock'));
const pool = require('../mocks/pool.mock');

const app = require('../../server');



describe('INT /api/login', () => {
  test('200 - login OK retorna token e usuário', async () => {
    // Simula SELECT do usuário e verificação de senha
    pool.query.mockResolvedValueOnce([
      [{ id: 1, email: 'admin@kavita.com', senha_hash: '$2b$10$hash', role: 'admin' }],
      []
    ]);

    // Se você usa bcrypt.compare em runtime, pode mockar bcrypt:
    jest.mock('bcrypt', () => ({
      compare: jest.fn().mockResolvedValue(true)
    }));

    const res = await request(app)
      .post('/api/login')
      .send({ email: 'admin@kavita.com', senha: '123456' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
    expect(res.body).toHaveProperty('usuario');
    expect(res.body.usuario).toMatchObject({ id: 1, email: 'admin@kavita.com' });
  });

  test('401 - senha inválida', async () => {
    pool.query.mockResolvedValueOnce([
      [{ id: 1, email: 'admin@kavita.com', senha_hash: '$2b$10$hash', role: 'admin' }],
      []
    ]);

    jest.mock('bcrypt', () => ({
      compare: jest.fn().mockResolvedValue(false)
    }));

    const res = await request(app)
      .post('/api/login')
      .send({ email: 'admin@kavita.com', senha: 'errada' });

    expect(res.status).toBe(401);
  });

  test('404 - usuário inexistente', async () => {
    pool.query.mockResolvedValueOnce([[], []]);

    const res = await request(app)
      .post('/api/login')
      .send({ email: 'x@x.com', senha: 'qualquer' });

    expect(res.status).toBe(404);
  });
});
