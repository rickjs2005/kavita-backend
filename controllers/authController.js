// controllers/authController.js
const bcrypt = require("bcrypt");
const pool = require("../config/pool");
const authConfig = require("../config/auth");
const passwordResetTokens = require("../services/passwordResetTokenService");
const { sendResetPasswordEmail } = require("../services/mailService");

const AppError = require("../errors/AppError");
const ERROR_CODES = require("../constants/ErrorCodes");

function getAuthCookieOptions() {
  const isProduction = process.env.NODE_ENV === "production";
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? "strict" : "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: "/",
  };
}

function buildSafeUserResponse(user) {
  return { id: user.id, nome: user.nome, email: user.email };
}

const AuthController = {
  async login(req, res, next) {
    const { email, senha } = req.body;

    try {
      const [users] = await pool.query("SELECT * FROM usuarios WHERE email = ?", [email]);

      if (users.length === 0) {
        req.rateLimit?.fail?.();
        return next(new AppError("Credenciais inválidas.", ERROR_CODES.AUTH_ERROR, 401));
      }

      const user = users[0];

      const ok = await bcrypt.compare(senha, user.senha);
      if (!ok) {
        req.rateLimit?.fail?.();
        return next(new AppError("Credenciais inválidas.", ERROR_CODES.AUTH_ERROR, 401));
      }

      const token = authConfig.sign({ id: user.id });
      req.rateLimit?.reset?.();

      res.cookie("auth_token", token, getAuthCookieOptions());

      return res.status(200).json({
        message: "Login bem-sucedido!",
        user: buildSafeUserResponse(user),
      });
    } catch (error) {
      return next(new AppError("Erro no servidor. Tente novamente mais tarde.", ERROR_CODES.SERVER_ERROR, 500));
    }
  },

  async register(req, res, next) {
    const { nome, email, senha } = req.body;

    try {
      const [users] = await pool.query("SELECT id FROM usuarios WHERE email = ?", [email]);
      if (users.length > 0) {
        return next(new AppError("Este email já está cadastrado.", ERROR_CODES.VALIDATION_ERROR, 400));
      }

      const hashed = await bcrypt.hash(senha, 10);
      await pool.query("INSERT INTO usuarios (nome, email, senha) VALUES (?, ?, ?)", [nome, email, hashed]);

      return res.status(201).json({ message: "Usuário cadastrado com sucesso!" });
    } catch (error) {
      return next(new AppError("Erro no servidor. Tente novamente mais tarde.", ERROR_CODES.SERVER_ERROR, 500));
    }
  },

  async logout(_req, res, next) {
    try {
      res.clearCookie("auth_token", getAuthCookieOptions());
      return res.status(200).json({ message: "Logout bem-sucedido!" });
    } catch (error) {
      return next(new AppError("Erro no servidor ao fazer logout.", ERROR_CODES.SERVER_ERROR, 500));
    }
  },

  async forgotPassword(req, res, next) {
    try {
      const { email } = req.body;
      if (!email) {
        req.rateLimit?.fail?.();
        return next(new AppError("Email é obrigatório.", ERROR_CODES.VALIDATION_ERROR, 400));
      }

      const [rows] = await pool.execute("SELECT id FROM usuarios WHERE email = ?", [email]);

      // segurança: resposta neutra
      if (!rows || rows.length === 0) {
        req.rateLimit?.reset?.();
        return res.status(200).json({
          mensagem: "Se este e-mail estiver cadastrado, enviaremos um link para redefinir a senha.",
        });
      }

      const user = rows[0];
      const token = passwordResetTokens.generateToken();
      const expires = new Date(Date.now() + 3600000);

      await passwordResetTokens.revokeAllForUser(user.id);
      await passwordResetTokens.storeToken(user.id, token, expires);
      await sendResetPasswordEmail(email, token);

      req.rateLimit?.reset?.();

      return res.status(200).json({
        mensagem: "Se este e-mail estiver cadastrado, enviaremos um link para redefinir a senha.",
      });
    } catch (error) {
      req.rateLimit?.fail?.();
      return next(new AppError("Erro no servidor. Tente novamente mais tarde.", ERROR_CODES.SERVER_ERROR, 500));
    }
  },

  async resetPassword(req, res, next) {
    try {
      const { token, novaSenha } = req.body;
      if (!token || !novaSenha) {
        req.rateLimit?.fail?.();
        return next(new AppError("Token e nova senha são obrigatórios.", ERROR_CODES.VALIDATION_ERROR, 400));
      }

      const record = await passwordResetTokens.findValidToken(token);
      if (!record) {
        req.rateLimit?.fail?.();
        return next(new AppError("Token inválido ou expirado.", ERROR_CODES.AUTH_ERROR, 401));
      }

      const novaSenhaHash = await bcrypt.hash(novaSenha, 10);
      await pool.execute("UPDATE usuarios SET senha = ? WHERE id = ?", [novaSenhaHash, record.user_id]);

      await passwordResetTokens.revokeToken(record.id);
      await passwordResetTokens.revokeAllForUser(record.user_id);

      req.rateLimit?.reset?.();

      return res.status(200).json({ mensagem: "Senha redefinida com sucesso!" });
    } catch (error) {
      req.rateLimit?.fail?.();
      return next(new AppError("Erro no servidor. Tente novamente mais tarde.", ERROR_CODES.SERVER_ERROR, 500));
    }
  },
};

module.exports = AuthController;
