const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const userRepository = require('../repositories/userRepository');
const { sendResetPasswordEmail } = require('./mailService');

function createHttpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function buildPublicUser(user) {
  return {
    id: user.id,
    nome: user.nome,
    email: user.email,
  };
}

async function login(email, plainPassword) {
  if (!email || !plainPassword) {
    throw createHttpError(400, 'Email e senha são obrigatórios.');
  }

  const user = await userRepository.findByEmail(email);
  if (!user) {
    throw createHttpError(404, 'Usuário não encontrado.');
  }

  const hashedPassword = user.senha || user.senha_hash;
  if (!hashedPassword) {
    throw createHttpError(500, 'Credenciais do usuário estão incompletas.');
  }

  const passwordOk = await bcrypt.compare(plainPassword, hashedPassword);
  if (!passwordOk) {
    throw createHttpError(401, 'Credenciais inválidas.');
  }

  if (!process.env.JWT_SECRET) {
    throw createHttpError(500, 'JWT_SECRET não configurado.');
  }

  const payload = { id: user.id, email: user.email };
  const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1h' });

  const publicUser = buildPublicUser(user);

  return {
    message: 'Login bem-sucedido!',
    token,
    usuario: publicUser,
    user: publicUser,
  };
}

async function register({ nome, email, senha }) {
  if (!nome || !email || !senha) {
    throw createHttpError(400, 'Nome, email e senha são obrigatórios.');
  }

  const existingUser = await userRepository.findByEmail(email);
  if (existingUser) {
    throw createHttpError(400, 'Este email já está cadastrado.');
  }

  const hashedPassword = await bcrypt.hash(senha, 10);
  await userRepository.createUser({ nome, email, senha: hashedPassword });

  return { message: 'Usuário cadastrado com sucesso!' };
}

async function forgotPassword(email) {
  if (!email) {
    throw createHttpError(400, 'Email é obrigatório.');
  }

  const user = await userRepository.findByEmail(email);
  if (!user) {
    return {
      message: 'Se este e-mail estiver cadastrado, enviaremos um link para redefinir a senha.',
    };
  }

  const token = crypto.randomBytes(20).toString('hex');
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

  await userRepository.updateResetToken(user.id, token, expiresAt);
  await sendResetPasswordEmail(email, token);

  return {
    message: 'Se este e-mail estiver cadastrado, enviaremos um link para redefinir a senha.',
  };
}

async function resetPassword(token, novaSenha) {
  if (!token || !novaSenha) {
    throw createHttpError(400, 'Token e nova senha são obrigatórios.');
  }

  const user = await userRepository.findByResetToken(token);
  if (!user) {
    throw createHttpError(400, 'Token inválido ou expirado.');
  }

  const hashedPassword = await bcrypt.hash(novaSenha, 10);
  await userRepository.updatePasswordAndClearReset(user.id, hashedPassword);

  return { message: 'Senha redefinida com sucesso!' };
}

function logout() {
  return { message: 'Logout bem-sucedido!' };
}

module.exports = {
  login,
  register,
  forgotPassword,
  resetPassword,
  logout,
};
