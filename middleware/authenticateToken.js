// middleware/authenticateToken.js
const authConfig = require("../config/auth");
const userRepository = require("../repositories/userRepository");
const AppError = require("../errors/AppError");
const ERROR_CODES = require("../constants/ErrorCodes");

module.exports = async function authenticateToken(req, _res, next) {
  // Cookie-only authentication — Bearer tokens are not accepted
  const token = req.cookies?.auth_token || null;

  if (!token) {
    return next(new AppError("Usuário não autenticado.", ERROR_CODES.UNAUTHORIZED, 401));
  }

  try {
    const payload = authConfig.verify(token);

    const userId = payload?.id;
    if (!userId) {
      return next(new AppError("Token inválido.", ERROR_CODES.AUTH_ERROR, 401));
    }

    const user = await userRepository.findUserById(userId);

    if (!user) {
      return next(new AppError("Usuário não encontrado.", ERROR_CODES.AUTH_ERROR, 401));
    }

    // Validate tokenVersion to support logout revocation.
    // ✅ FIX: tratar null como 0 — sem esse fallback, usuários pré-migração com
    // tokenVersion NULL no banco ignoram completamente a verificação de revogação.
    const dbVersion = user.tokenVersion ?? 0;
    const jwtVersion = payload.tokenVersion ?? 0;
    if (jwtVersion !== dbVersion) {
      return next(new AppError("Sessão inválida. Faça login novamente.", ERROR_CODES.AUTH_ERROR, 401));
    }

    req.user = {
      id: user.id,
      nome: user.nome,
      email: user.email,
      role: payload.role || "user",
    };

    return next();
  } catch (err) {
    const isExpired = err?.name === "TokenExpiredError";
    return next(
      new AppError(
        isExpired ? "Sessão expirada. Faça login novamente." : "Token inválido.",
        ERROR_CODES.AUTH_ERROR,
        401
      )
    );
  }
};
