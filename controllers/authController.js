const passwords = require('../utils/passwords');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const pool = require('../config/pool');
const { sendResetPasswordEmail } = require('../services/mailService');

const JWT_SECRET = process.env.JWT_SECRET || 'test_secret';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '1h';
const RESET_TOKEN_TTL_MS = Number(process.env.RESET_TOKEN_TTL_MS || 60 * 60 * 1000);

function buildUsuarioPayload(userRow) {
  if (!userRow) return null;
  return {
    id: userRow.id,
    nome: userRow.nome,
    email: userRow.email,
    role: userRow.role || userRow.tipo || 'user',
  };
}

async function login(req, res) {
  const { email, senha, password } = req.body || {};
  const senhaClaro = senha || password;

  if (!email || !senhaClaro) {
    return res.status(400).json({ message: 'Email e senha são obrigatórios.' });
  }

  try {
    const [rows] = await pool.query('SELECT * FROM usuarios WHERE email = ?', [email]);
    if (!rows || rows.length === 0) {
      return res.status(404).json({ message: 'Usuário não encontrado.' });
    }

    const usuarioBanco = rows[0];
    const senhaValida = await passwords.compare(senhaClaro, usuarioBanco.senha);
    if (!senhaValida) {
      return res.status(401).json({ message: 'Credenciais inválidas.' });
    }

    const token = jwt.sign(
      { id: usuarioBanco.id, role: usuarioBanco.role || 'user' },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    return res.status(200).json({
      message: 'Login bem-sucedido!',
      token,
      usuario: buildUsuarioPayload(usuarioBanco),
    });
  } catch (error) {
    console.error('[authController.login] erro:', error);
    return res.status(500).json({ message: 'Erro no servidor. Tente novamente.' });
  }
}

async function register(req, res) {
  const { nome, email, senha } = req.body || {};

  if (!nome || !email || !senha) {
    return res.status(400).json({ mensagem: 'Nome, email e senha são obrigatórios.' });
  }

  try {
    const [exists] = await pool.execute('SELECT id FROM usuarios WHERE email = ?', [email]);
    if (exists.length > 0) {
      return res.status(400).json({ mensagem: 'Este e-mail já está cadastrado. Tente outro ou faça login.' });
    }

    const hash = await passwords.hash(senha, 10);
    await pool.execute(
      'INSERT INTO usuarios (nome, email, senha) VALUES (?, ?, ?)',
      [nome, email, hash]
    );

    return res.status(201).json({ mensagem: 'Conta criada com sucesso! Faça login para continuar.' });
  } catch (error) {
    console.error('[authController.register] erro:', error);
    return res.status(500).json({ mensagem: 'Erro interno no servidor. Tente novamente mais tarde.' });
  }
}

async function forgotPassword(req, res) {
  const { email } = req.body || {};

  if (!email) {
    return res.status(400).json({ mensagem: 'Email é obrigatório.' });
  }

  try {
    const [rows] = await pool.execute('SELECT id FROM usuarios WHERE email = ?', [email]);
    if (!rows || rows.length === 0) {
      return res.status(200).json({
        mensagem: 'Se este e-mail estiver cadastrado, enviaremos um link para redefinir a senha.',
      });
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);

    await pool.execute(
      'UPDATE usuarios SET resetToken = ?, resetTokenExpires = ? WHERE id = ?',
      [token, expiresAt, rows[0].id]
    );

    await sendResetPasswordEmail(email, token);

    return res.status(200).json({
      mensagem: 'Se este e-mail estiver cadastrado, enviaremos um link para redefinir a senha.',
    });
  } catch (error) {
    console.error('[authController.forgotPassword] erro:', error);
    return res.status(500).json({ mensagem: 'Erro no servidor. Tente novamente mais tarde.' });
  }
}

async function resetPassword(req, res) {
  const { token, novaSenha } = req.body || {};

  if (!token || !novaSenha) {
    return res.status(400).json({ mensagem: 'Token e nova senha são obrigatórios.' });
  }

  try {
    const [rows] = await pool.execute(
      'SELECT id FROM usuarios WHERE resetToken = ? AND resetTokenExpires > NOW()',
      [token]
    );

    if (!rows || rows.length === 0) {
      return res.status(400).json({ mensagem: 'Token inválido ou expirado.' });
    }

    const hash = await passwords.hash(novaSenha, 10);
    await pool.execute(
      'UPDATE usuarios SET senha = ?, resetToken = NULL, resetTokenExpires = NULL WHERE id = ?',
      [hash, rows[0].id]
    );

    return res.status(200).json({ mensagem: 'Senha redefinida com sucesso!' });
  } catch (error) {
    console.error('[authController.resetPassword] erro:', error);
    return res.status(500).json({ mensagem: 'Erro no servidor. Tente novamente mais tarde.' });
  }
}

async function logout(_req, res) {
  return res.status(200).json({ message: 'Logout bem-sucedido!' });
}

module.exports = {
  login,
  register,
  forgotPassword,
  resetPassword,
  logout,
  buildUsuarioPayload,
};
