const authService = require('../services/authService');

async function login(req, res, next) {
  const { email, senha, password } = req.body;
  const plainPassword = senha ?? password;

  try {
    const result = await authService.login(email, plainPassword);
    res.status(200).json(result);
  } catch (error) {
    if (typeof next === 'function') {
      next(error);
    } else {
      throw error;
    }
  }
}

async function register(req, res, next) {
  const { nome, email, senha } = req.body;

  try {
    const result = await authService.register({ nome, email, senha });
    res.status(201).json(result);
  } catch (error) {
    if (typeof next === 'function') {
      next(error);
    } else {
      throw error;
    }
  }
}

async function logout(_req, res) {
  const result = authService.logout();
  res.status(200).json(result);
}

async function forgotPassword(req, res, next) {
  const { email } = req.body;

  try {
    const result = await authService.forgotPassword(email);
    res.status(200).json(result);
  } catch (error) {
    if (typeof next === 'function') {
      next(error);
    } else {
      throw error;
    }
  }
}

async function resetPassword(req, res, next) {
  const { token, novaSenha } = req.body;

  try {
    const result = await authService.resetPassword(token, novaSenha);
    res.status(200).json(result);
  } catch (error) {
    if (typeof next === 'function') {
      next(error);
    } else {
      throw error;
    }
  }
}

module.exports = {
  login,
  register,
  logout,
  forgotPassword,
  resetPassword,
};
