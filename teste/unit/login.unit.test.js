jest.mock('../../config/pool', () => require('../mocks/pool.mock'));
const pool = require('../mocks/pool.mock');

jest.mock('bcrypt', () => ({ compare: jest.fn().mockResolvedValue(true) }));
const bcrypt = require('bcrypt');

const jwt = require('jsonwebtoken');
// ajuste este import para o que você tiver de verdade:
const authController = require('../../controllers/authController');


function mockRes() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn()
  };
}

describe('UNIT authController.login', () => {
  test('gera token quando credenciais corretas', async () => {
    const req = { body: { email: 'admin@kavita.com', senha: '123456' } };
    const res = mockRes();

    pool.query.mockResolvedValueOnce([
      [{ id: 1, email: 'admin@kavita.com', senha_hash: 'hash' }],
      []
    ]);

    await authController.login(req, res);

    expect(bcrypt.compare).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    const payload = res.json.mock.calls[0][0];
    expect(payload).toHaveProperty('token');
    expect(() => jwt.verify(payload.token, process.env.JWT_SECRET)).not.toThrow();
  });
});
