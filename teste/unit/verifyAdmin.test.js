const verifyAdmin = require('../../middleware/verifyAdmin');
const auth = require('../../config/auth');

describe('verifyAdmin middleware', () => {
  test('rejeita token expirado', async () => {
    const expiredToken = auth.sign({ id: 1 }, { expiresIn: '1ms' });
    await new Promise((resolve) => setTimeout(resolve, 5));

    const req = { headers: { authorization: `Bearer ${expiredToken}` }, log: { warn: jest.fn() } };
    const status = jest.fn().mockReturnThis();
    const json = jest.fn();
    const res = { status, json, headers: {} };

    verifyAdmin(req, res, jest.fn());

    expect(status).toHaveBeenCalledWith(401);
    expect(json).toHaveBeenCalledWith({ message: 'Token inválido ou expirado' });
  });
});
