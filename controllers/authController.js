// controllers/authController.js
const bcrypt = require("bcrypt");
const authConfig = require("../config/auth");
const jwt = require("jsonwebtoken");
const passwordResetTokens = require("../services/passwordResetTokenService");
const { sendResetPasswordEmail } = require("../services/mailService");
const { assertNotLocked, incrementFailure, resetFailures, syncFromRedis } = require("../security/accountLockout");
const userRepo = require("../repositories/userRepository");

const AppError = require("../errors/AppError");
const ERROR_CODES = require("../constants/ErrorCodes");
const { response } = require("../lib");

function getAuthCookieOptions() {
  const isProduction = process.env.NODE_ENV === "production";
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? "strict" : "lax",
    // ⛔ NÃO deixa fixo aqui se você quer alinhar com o JWT
    // maxAge: 7 * 24 * 60 * 60 * 1000,
    path: "/",
  };
}

/**
 * ✅ Retorna options do cookie com maxAge alinhado ao "exp" do JWT
 * (cookie e token expiram juntos)
 */
function getAuthCookieOptionsAlignedToToken(token) {
  const base = getAuthCookieOptions();

  // jwt.decode não valida assinatura, mas aqui o token acabou de ser gerado no servidor
  const decoded = jwt.decode(token); // { exp: seconds, iat: seconds, ... }

  const msToExpire =
    decoded?.exp ? decoded.exp * 1000 - Date.now() : 7 * 24 * 60 * 60 * 1000;

  return {
    ...base,
    maxAge: Math.max(0, msToExpire),
  };
}

function buildSafeUserResponse(user) {
  return { id: user.id, nome: user.nome, email: user.email };
}

const AuthController = {
  async login(req, res, next) {
    const { email, senha } = req.body;
    const lockoutKey = `user:${String(email || "").trim().toLowerCase()}`;

    try {
      // Sync Redis lockout state to in-memory before checking.
      // Garante que lockouts persistidos no Redis sejam respeitados
      // na primeira tentativa após restart (sem Redis, vira no-op).
      await syncFromRedis(lockoutKey);
      assertNotLocked(lockoutKey);

      const user = await userRepo.findUserByEmail(email);

      if (!user) {
        await incrementFailure(lockoutKey);
        req.rateLimit?.fail?.();
        return next(new AppError("Credenciais inválidas.", ERROR_CODES.AUTH_ERROR, 401));
      }

      const ok = await bcrypt.compare(senha, user.senha);
      if (!ok) {
        await incrementFailure(lockoutKey);
        req.rateLimit?.fail?.();
        return next(new AppError("Credenciais inválidas.", ERROR_CODES.AUTH_ERROR, 401));
      }

      await resetFailures(lockoutKey);
      // ✅ FIX: usar 0 como fallback (não 1) para alinhar com o middleware que também usa 0
      const token = authConfig.sign({ id: user.id, tokenVersion: user.tokenVersion ?? 0 });
      req.rateLimit?.reset?.();

      // ✅ AQUI: usar a função alinhada ao token
      res.cookie("auth_token", token, getAuthCookieOptionsAlignedToToken(token));

      return response.ok(res, { user: buildSafeUserResponse(user) }, "Login bem-sucedido!");
    } catch (error) {
      if (error.locked) {
        return next(new AppError(error.message, ERROR_CODES.AUTH_ERROR, 429));
      }
      console.error("❌ Erro no login do usuário:", {
        message: error.message,
        stack: process.env.NODE_ENV !== "production" ? error.stack : undefined,
        url: req.originalUrl,
      });
      return next(new AppError("Erro no servidor. Tente novamente mais tarde.", ERROR_CODES.SERVER_ERROR, 500));
    }
  },

  async register(req, res, next) {
    // ... (sem mudança)
    const { nome, email, senha } = req.body;

    try {
      if (await userRepo.emailExists(email)) {
        return next(new AppError("Este email já está cadastrado.", ERROR_CODES.VALIDATION_ERROR, 400));
      }

      const hashed = await bcrypt.hash(senha, 10);
      await userRepo.createUser({ nome, email, senha: hashed });

      return response.created(res, null, "Usuário cadastrado com sucesso!");
    } catch (error) {
      console.error("❌ Erro no registro do usuário:", error);
      return next(new AppError("Erro no servidor. Tente novamente mais tarde.", ERROR_CODES.SERVER_ERROR, 500));
    }
  },

  async logout(req, res, next) {
    try {
      // Increment tokenVersion to invalidate all existing JWT tokens for this user
      const userId = req.user?.id;
      if (userId) {
        await userRepo.incrementTokenVersion(userId);
      }
      res.clearCookie("auth_token", getAuthCookieOptions());
      return response.ok(res, null, "Logout bem-sucedido!");
    } catch (error) {
      console.error("❌ Erro no logout do usuário:", error);
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

      const userRow = await userRepo.findUserByEmail(email);

      // segurança: resposta neutra
      if (!userRow) {
        req.rateLimit?.reset?.();
        return response.ok(res, null, "Se este e-mail estiver cadastrado, enviaremos um link para redefinir a senha.");
      }

      const token = passwordResetTokens.generateToken();
      const expires = new Date(Date.now() + 3600000);

      await passwordResetTokens.revokeAllForUser(userRow.id);
      await passwordResetTokens.storeToken(userRow.id, token, expires);
      await sendResetPasswordEmail(email, token);

      req.rateLimit?.reset?.();

      return res.status(200).json({
        mensagem: "Se este e-mail estiver cadastrado, enviaremos um link para redefinir a senha.",
      });
    } catch (error) {
      req.rateLimit?.fail?.();
      console.error("❌ Erro no esqueceu-senha:", error);
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
      await userRepo.updatePassword(record.user_id, novaSenhaHash);

      await passwordResetTokens.revokeToken(record.id);
      await passwordResetTokens.revokeAllForUser(record.user_id);

      req.rateLimit?.reset?.();

      return response.ok(res, null, "Senha redefinida com sucesso!");
    } catch (error) {
      req.rateLimit?.fail?.();
      console.error("❌ Erro no reset de senha:", error);
      return next(new AppError("Erro no servidor. Tente novamente mais tarde.", ERROR_CODES.SERVER_ERROR, 500));
    }
  },
};

module.exports = AuthController;
