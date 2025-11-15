jest.mock('../../config/pool', () => require('../mocks/pool.mock'));
const pool = require('../mocks/pool.mock');

jest.mock('../../utils/passwords', () => ({
  compare: jest.fn(),
  hash: jest.fn(),
}));
const passwords = require('../../utils/passwords');

jest.mock('jsonwebtoken', () => ({ sign: jest.fn(() => 'signed-token') }));
const jwt = require('jsonwebtoken');

jest.mock('../../services/mailService', () => ({
  sendResetPasswordEmail: jest.fn(),
}));
const { sendResetPasswordEmail } = require('../../services/mailService');

const {
  login,
  register,
  forgotPassword,
  resetPassword,
  buildUsuarioPayload,
} = require('../../controllers/authController');

function createRes() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
}

describe('AuthController helpers', () => {
  test('buildUsuarioPayload extrai campos básicos', () => {
    const payload = buildUsuarioPayload({ id: 1, nome: 'Ana', email: 'ana@acme.com', role: 'admin' });
    expect(payload).toEqual({ id: 1, nome: 'Ana', email: 'ana@acme.com', role: 'admin' });
  });
});

describe('AuthController.login', () => {
  beforeEach(() => {
    pool.query.mockReset();
    passwords.compare.mockReset();
    jwt.sign.mockClear();
  });

  test('retorna token e usuário quando credenciais válidas', async () => {
    const req = { body: { email: 'admin@kavita.com', senha: '123456' } };
    const res = createRes();

    pool.query.mockResolvedValueOnce([[{ id: 10, nome: 'Admin', email: req.body.email, senha: 'hash', role: 'admin' }], []]);
    passwords.compare.mockResolvedValueOnce(true);

    await login(req, res);

    expect(pool.query).toHaveBeenCalledWith('SELECT * FROM usuarios WHERE email = ?', [req.body.email]);
    expect(passwords.compare).toHaveBeenCalledWith('123456', 'hash');
    expect(jwt.sign).toHaveBeenCalledWith({ id: 10, role: 'admin' }, expect.any(String), expect.objectContaining({ expiresIn: expect.any(String) }));
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      message: 'Login bem-sucedido!',
      token: 'signed-token',
      usuario: { id: 10, nome: 'Admin', email: req.body.email, role: 'admin' },
    });
  });

  test('retorna 401 quando senha inválida', async () => {
    const req = { body: { email: 'admin@kavita.com', senha: 'errada' } };
    const res = createRes();

    pool.query.mockResolvedValueOnce([[{ id: 10, nome: 'Admin', email: req.body.email, senha: 'hash' }], []]);
    passwords.compare.mockResolvedValueOnce(false);

    await login(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ message: 'Credenciais inválidas.' });
  });

  test('retorna 404 quando usuário não existe', async () => {
    const req = { body: { email: 'admin@kavita.com', senha: '123' } };
    const res = createRes();

    pool.query.mockResolvedValueOnce([[], []]);

    await login(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ message: 'Usuário não encontrado.' });
  });
});

describe('AuthController.register', () => {
  beforeEach(() => {
    pool.execute.mockReset();
    passwords.hash.mockReset();
  });

  test('cria usuário quando email novo', async () => {
    const req = { body: { nome: 'Ana', email: 'ana@acme.com', senha: '123456' } };
    const res = createRes();

    pool.execute
      .mockResolvedValueOnce([[]]) // SELECT
      .mockResolvedValueOnce([{ insertId: 42 }]);
    passwords.hash.mockResolvedValueOnce('hashed');

    await register(req, res);

    expect(pool.execute).toHaveBeenNthCalledWith(1, 'SELECT id FROM usuarios WHERE email = ?', [req.body.email]);
    expect(pool.execute).toHaveBeenNthCalledWith(2, 'INSERT INTO usuarios (nome, email, senha) VALUES (?, ?, ?)', [req.body.nome, req.body.email, 'hashed']);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({ mensagem: 'Conta criada com sucesso! Faça login para continuar.' });
  });

  test('retorna 400 quando email duplicado', async () => {
    const req = { body: { nome: 'Ana', email: 'ana@acme.com', senha: '123456' } };
    const res = createRes();

    pool.execute.mockResolvedValueOnce([[{ id: 1 }]]);

    await register(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ mensagem: 'Este e-mail já está cadastrado. Tente outro ou faça login.' });
  });
});

describe('AuthController.forgotPassword', () => {
  beforeEach(() => {
    pool.execute.mockReset();
    sendResetPasswordEmail.mockReset();
  });

  test('retorna 400 quando email ausente', async () => {
    const req = { body: {} };
    const res = createRes();

    await forgotPassword(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ mensagem: 'Email é obrigatório.' });
  });

  test('gera token e envia email quando usuário encontrado', async () => {
    const req = { body: { email: 'ana@acme.com' } };
    const res = createRes();

    pool.execute
      .mockResolvedValueOnce([[{ id: 1 }]])
      .mockResolvedValueOnce([{}]);

    await forgotPassword(req, res);

    expect(pool.execute).toHaveBeenNthCalledWith(1, 'SELECT id FROM usuarios WHERE email = ?', [req.body.email]);
    expect(pool.execute).toHaveBeenNthCalledWith(2, expect.stringContaining('UPDATE usuarios SET resetToken'), expect.any(Array));
    expect(sendResetPasswordEmail).toHaveBeenCalledWith(req.body.email, expect.any(String));
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

describe('AuthController.resetPassword', () => {
  beforeEach(() => {
    pool.execute.mockReset();
    passwords.hash.mockReset();
  });

  test('retorna 400 quando token inválido', async () => {
    const req = { body: { token: 'abc', novaSenha: '123456' } };
    const res = createRes();

    pool.execute.mockResolvedValueOnce([[]]);

    await resetPassword(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ mensagem: 'Token inválido ou expirado.' });
  });

  test('atualiza senha quando token válido', async () => {
    const req = { body: { token: 'abc', novaSenha: '123456' } };
    const res = createRes();

    pool.execute
      .mockResolvedValueOnce([[{ id: 5 }]])
      .mockResolvedValueOnce([{}]);
    passwords.hash.mockResolvedValueOnce('hashed');

    await resetPassword(req, res);

    expect(pool.execute).toHaveBeenNthCalledWith(1, 'SELECT id FROM usuarios WHERE resetToken = ? AND resetTokenExpires > NOW()', [req.body.token]);
    expect(pool.execute).toHaveBeenNthCalledWith(2, 'UPDATE usuarios SET senha = ?, resetToken = NULL, resetTokenExpires = NULL WHERE id = ?', ['hashed', 5]);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ mensagem: 'Senha redefinida com sucesso!' });
  });
});
