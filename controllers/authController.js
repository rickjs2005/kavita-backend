const bcrypt = require('bcrypt');
const pool = require('../config/pool');
const authConfig = require('../config/auth');
const passwordResetTokens = require('../services/passwordResetTokenService');
const { sendResetPasswordEmail } = require('../services/mailService');

function ensureRateLimit(req) {
  if (!req.rateLimit) {
    req.rateLimit = {
      fail: () => {},
      reset: () => {},
    };
  }
}

const AuthController = {
  async login(req, res) {
    const { email, senha } = req.body;

    try {
      const [users] = await pool.query('SELECT * FROM usuarios WHERE email = ?', [email]);

      if (users.length === 0) {
        req.rateLimit?.fail?.();
        return res.status(400).json({ message: 'Usuário não encontrado.' });
      }

      const user = users[0];

      const isPasswordValid = await bcrypt.compare(senha, user.senha);
      if (!isPasswordValid) {
        req.rateLimit?.fail?.();
        return res.status(400).json({ message: 'Credenciais inválidas.' });
      }

      const token = authConfig.sign({ id: user.id });
      req.rateLimit?.reset?.();

      res.status(200).json({
        message: 'Login bem-sucedido!',
        token,
        user: {
          id: user.id,
          nome: user.nome,
          email: user.email,
        },
      });
    } catch (error) {
      console.error('Erro no login:', error);
      res.status(500).json({ message: 'Erro no servidor. Tente novamente mais tarde.' });
    }
  },

  async register(req, res) {
    const { nome, email, senha } = req.body;

    try {
      const [users] = await pool.query('SELECT id FROM usuarios WHERE email = ?', [email]);

      if (users.length > 0) {
        return res.status(400).json({ message: 'Este email já está cadastrado.' });
      }

      const hashedPassword = await bcrypt.hash(senha, 10);

      await pool.query(
        'INSERT INTO usuarios (nome, email, senha) VALUES (?, ?, ?)',
        [nome, email, hashedPassword]
      );

      res.status(201).json({ message: 'Usuário cadastrado com sucesso!' });
    } catch (error) {
      console.error('Erro no registro:', error);
      res.status(500).json({ message: 'Erro no servidor. Tente novamente mais tarde.' });
    }
  },

  async logout(_req, res) {
    res.status(200).json({ message: 'Logout bem-sucedido!' });
  },

  async forgotPassword(req, res) {
    ensureRateLimit(req);

    try {
      const { email } = req.body;

      if (!email) {
        req.rateLimit.fail();
        return res.status(400).json({ mensagem: 'Email é obrigatório.' });
      }

      const [rows] = await pool.execute('SELECT id FROM usuarios WHERE email = ?', [email]);
      if (!rows || rows.length === 0) {
        req.rateLimit.reset();
        return res.status(200).json({
          mensagem: 'Se este e-mail estiver cadastrado, enviaremos um link para redefinir a senha.',
        });
      }

      const user = rows[0];
      const token = passwordResetTokens.generateToken();
      const expires = new Date(Date.now() + 3600000);

      await passwordResetTokens.revokeAllForUser(user.id);
      await passwordResetTokens.storeToken(user.id, token, expires);
      await sendResetPasswordEmail(email, token);

      req.rateLimit.reset();

      return res.status(200).json({
        mensagem: 'Se este e-mail estiver cadastrado, enviaremos um link para redefinir a senha.',
      });
    } catch (error) {
      console.error('Erro em forgot-password:', error);
      req.rateLimit.fail();
      return res.status(500).json({
        mensagem: 'Erro no servidor. Tente novamente mais tarde.',
      });
    }
  },

  async resetPassword(req, res) {
    ensureRateLimit(req);

    try {
      const { token, novaSenha } = req.body;

      if (!token || !novaSenha) {
        req.rateLimit.fail();
        return res.status(400).json({ mensagem: 'Token e nova senha são obrigatórios.' });
      }

      const record = await passwordResetTokens.findValidToken(token);

      if (!record) {
        req.rateLimit.fail();
        return res.status(400).json({ mensagem: 'Token inválido ou expirado.' });
      }

      const novaSenhaHash = await bcrypt.hash(novaSenha, 10);

      await pool.execute('UPDATE usuarios SET senha = ? WHERE id = ?', [
        novaSenhaHash,
        record.user_id,
      ]);

      await passwordResetTokens.revokeToken(record.id);
      await passwordResetTokens.revokeAllForUser(record.user_id);

      req.rateLimit.reset();

      return res.status(200).json({ mensagem: 'Senha redefinida com sucesso!' });
    } catch (error) {
      console.error('Erro em reset-password:', error);
      req.rateLimit.fail();
      return res.status(500).json({
        mensagem: 'Erro no servidor. Tente novamente mais tarde.',
      });
    }
  },
};

module.exports = AuthController;
