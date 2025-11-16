const request = require('supertest');

jest.mock('../../config/pool', () => require('../mocks/pool.mock'));
const pool = require('../mocks/pool.mock');

let sentToken = null;
jest.mock('../../services/mailService', () => ({
  sendResetPasswordEmail: jest.fn((_email, token) => {
    sentToken = token;
    return Promise.resolve();
  }),
}));

jest.mock('bcrypt', () => ({
  compare: jest.fn(),
  hash: jest.fn((value) => Promise.resolve(`hashed:${value}`)),
}));
const bcrypt = require('bcrypt');

describe('Fluxo de reset de senha', () => {
  beforeEach(() => {
    pool.query.mockReset();
    pool.execute.mockReset();
    sentToken = null;
  });

  test('gera token hashado, envia email e redefine senha', async () => {
    let insertedHash;
    let updatedPassword;

    pool.query.mockResolvedValue([[]]);
    pool.execute.mockImplementation((sql, params) => {
      if (sql.includes('SELECT id FROM usuarios WHERE email = ?')) {
        return Promise.resolve([[{ id: 1, email: params[0] }], []]);
      }
      if (sql.startsWith('UPDATE password_reset_tokens SET revoked_at')) {
        return Promise.resolve([{ affectedRows: 1 }]);
      }
      if (sql.startsWith('INSERT INTO password_reset_tokens')) {
        insertedHash = params[1];
        return Promise.resolve([{ insertId: 99 }]);
      }
      if (sql.includes('SELECT * FROM password_reset_tokens WHERE token_hash = ?')) {
        return Promise.resolve([
          [
            {
              id: 99,
              user_id: 1,
              token_hash: insertedHash,
              expires_at: new Date(Date.now() + 3600000),
            },
          ],
          [],
        ]);
      }
      if (sql.startsWith('UPDATE usuarios SET senha = ?')) {
        updatedPassword = params[0];
        return Promise.resolve([{ affectedRows: 1 }]);
      }
      return Promise.resolve([[], []]);
    });

    const app = require('../../server');

    const forgot = await request(app)
      .post('/api/users/forgot-password')
      .send({ email: 'usuario@email.com' });

    expect(forgot.status).toBe(200);
    expect(sentToken).toBeTruthy();
    expect(insertedHash).toBeDefined();
    expect(insertedHash).not.toEqual(sentToken);
    expect(insertedHash).toHaveLength(64);

    const reset = await request(app)
      .post('/api/users/reset-password')
      .send({ token: sentToken, novaSenha: 'NovaSenha123' });

    expect(reset.status).toBe(200);
    expect(bcrypt.hash).toHaveBeenCalledWith('NovaSenha123', 10);
    expect(updatedPassword).toBe('hashed:NovaSenha123');
  });

  test('falha com token expirado ou revogado', async () => {
    pool.query.mockResolvedValue([[]]);
    pool.execute.mockImplementation((sql, params) => {
      if (sql.includes('SELECT id FROM usuarios WHERE email = ?')) {
        return Promise.resolve([[{ id: 1 }], []]);
      }
      if (sql.includes('SELECT * FROM password_reset_tokens WHERE token_hash = ?')) {
        return Promise.resolve([[], []]);
      }
      return Promise.resolve([[], []]);
    });

    const app = require('../../server');

    const res = await request(app)
      .post('/api/users/reset-password')
      .send({ token: 'naoexiste', novaSenha: 'Nova' });

    expect(res.status).toBe(400);
  });

  test('aplica rate limiting em tentativas inválidas de reset', async () => {
    pool.query.mockResolvedValue([[]]);
    pool.execute.mockImplementation(() => Promise.resolve([[], []]));

    const app = require('../../server');

    await request(app)
      .post('/api/users/reset-password')
      .send({ token: 'x', novaSenha: 'nova' });

    await request(app)
      .post('/api/users/reset-password')
      .send({ token: 'x', novaSenha: 'nova' });

    const blocked = await request(app)
      .post('/api/users/reset-password')
      .send({ token: 'x', novaSenha: 'nova' });

    expect(blocked.status).toBe(429);
    expect(blocked.body).toHaveProperty('retryAfter');
  });
});
