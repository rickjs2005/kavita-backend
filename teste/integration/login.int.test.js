const request = require('supertest');
const jwt = require('jsonwebtoken');

jest.mock('../../config/pool', () => require('../mocks/pool.mock'));
jest.mock('bcryptjs', () => ({
  compare: jest.fn(),
}));

const pool = require('../mocks/pool.mock');
const bcrypt = require('bcryptjs');

const app = require('../../server');

describe('INT /api/login', () => {
  beforeEach(() => {
    pool.query.mockReset();
    bcrypt.compare.mockReset();
  });

  test('200 - login OK retorna token e usuário', async () => {
    pool.query.mockResolvedValueOnce([
      [{ id: 1, email: 'admin@kavita.com', senha_hash: '$2b$10$hash', role: 'admin', nome: 'Admin' }],
      [],
    ]);

    bcrypt.compare.mockResolvedValue(true);

    const res = await request(app)
      .post('/api/login')
      .send({ email: 'admin@kavita.com', senha: '123456' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, error: null });
    expect(res.body.data).toMatchObject({
      message: 'Login bem-sucedido!',
      user: { id: 1, email: 'admin@kavita.com', nome: 'Admin', role: 'admin' },
    });
    expect(typeof res.body.data.token).toBe('string');
    expect(() => jwt.verify(res.body.data.token, process.env.JWT_SECRET)).not.toThrow();
  });

  test('401 - senha inválida', async () => {
    pool.query.mockResolvedValueOnce([
      [{ id: 1, email: 'admin@kavita.com', senha_hash: '$2b$10$hash', role: 'admin' }],
      [],
    ]);

    bcrypt.compare.mockResolvedValue(false);

    const res = await request(app)
      .post('/api/login')
      .send({ email: 'admin@kavita.com', senha: 'errada' });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatchObject({ message: 'Senha incorreta' });
  });

  test('404 - usuário inexistente', async () => {
    pool.query.mockResolvedValueOnce([[], []]);

    const res = await request(app)
      .post('/api/login')
      .send({ email: 'x@x.com', senha: 'qualquer' });

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatchObject({ message: 'Usuário não encontrado' });
  });
});
