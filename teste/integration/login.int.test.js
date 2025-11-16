const request = require('supertest');

jest.mock('../../config/pool', () => require('../mocks/pool.mock'));
const pool = require('../mocks/pool.mock');

jest.mock('bcrypt', () => ({
  compare: jest.fn(),
  hash: jest.fn(),
}));
const bcrypt = require('bcrypt');

describe('INT /api/login', () => {
  beforeEach(() => {
    pool.query.mockReset();
    bcrypt.compare.mockReset();
  });

  test('200 - login OK retorna token e usuário', async () => {
    pool.query.mockResolvedValueOnce([
      [{ id: 1, email: 'admin@kavita.com', senha: 'hash', nome: 'Admin' }],
      [],
    ]);
    bcrypt.compare.mockResolvedValueOnce(true);

    const app = require('../../server');

    const res = await request(app)
      .post('/api/login')
      .send({ email: 'admin@kavita.com', senha: '123456' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
    expect(res.body).toHaveProperty('user');
    expect(res.body.user).toMatchObject({ id: 1, email: 'admin@kavita.com' });
  });

  test('401 - senha inválida incrementa rate limit', async () => {
    pool.query.mockResolvedValue([
      [{ id: 1, email: 'admin@kavita.com', senha: 'hash', nome: 'Admin' }],
      [],
    ]);
    bcrypt.compare.mockResolvedValue(false);

    const app = require('../../server');

    const first = await request(app)
      .post('/api/login')
      .send({ email: 'admin@kavita.com', senha: 'errada' });
    expect(first.status).toBe(400);

    const second = await request(app)
      .post('/api/login')
      .send({ email: 'admin@kavita.com', senha: 'errada' });
    expect(second.status).toBe(400);

    const third = await request(app)
      .post('/api/login')
      .send({ email: 'admin@kavita.com', senha: 'errada' });
    expect(third.status).toBe(429);
    expect(third.body).toHaveProperty('retryAfter');
  });

  test('404 - usuário inexistente bloqueia após tentativas', async () => {
    pool.query.mockResolvedValue([[/* vazio */], []]);

    const app = require('../../server');

    await request(app).post('/api/login').send({ email: 'x@x.com', senha: 'qualquer' });
    await request(app).post('/api/login').send({ email: 'x@x.com', senha: 'qualquer' });
    const res = await request(app)
      .post('/api/login')
      .send({ email: 'x@x.com', senha: 'qualquer' });

    expect(res.status).toBe(429);
  });
});
