// controllers/corretoraPanel/passwordResetCorretoraController.js
//
// Recuperação de senha do usuário de corretora (Fase 2).
// Reutiliza passwordResetTokenService (com scope="corretora_user") e
// mailService.sendCorretoraResetPasswordEmail. Não depende do RBAC.
"use strict";

const { response } = require("../../lib");
const AppError = require("../../errors/AppError");
const ERROR_CODES = require("../../constants/ErrorCodes");
const logger = require("../../lib/logger");

const usersRepo = require("../../repositories/corretoraUsersRepository");
const authService = require("../../services/corretoraAuthService");
const resetTokens = require("../../services/passwordResetTokenService");
const mailService = require("../../services/mailService");

const SCOPE = "corretora_user";
const TOKEN_TTL_MS = 60 * 60 * 1000; // 1h

/**
 * POST /api/corretora/forgot-password
 * Body validado por validate(forgotPasswordSchema).
 *
 * Resposta genérica mesmo quando o e-mail não existe — evita
 * enumeração de usuários.
 */
async function forgotPassword(req, res, next) {
  const rateLimit = req.rateLimit || { fail: () => {}, reset: () => {} };
  const { email } = req.body;

  // Resposta genérica reutilizada para todos os caminhos (sucesso,
  // usuário inexistente, usuário inativo, corretora inativa).
  const genericOk = () =>
    response.ok(
      res,
      null,
      "Se este e-mail estiver cadastrado, enviaremos um link para redefinir a senha."
    );

  try {
    const user = await usersRepo.findByEmail(email);

    // Só segue adiante se o usuário existe, está ativo e a corretora
    // também está ativa. Em qualquer outro caso devolvemos a mesma
    // resposta para o atacante não distinguir.
    if (!user || !user.is_active || user.corretora_status !== "active") {
      rateLimit.reset();
      return genericOk();
    }

    const token = resetTokens.generateToken();
    const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);

    await resetTokens.revokeAllForUser(user.id, SCOPE);
    await resetTokens.storeToken(user.id, token, expiresAt, SCOPE);

    // Envio síncrono — se o SMTP cair, o usuário precisa saber para
    // tentar de novo ou acionar o admin. Diferente do lead, aqui não
    // há "se o e-mail falhar, a gente salva no banco mesmo assim".
    try {
      await mailService.sendCorretoraResetPasswordEmail(user.email, token);
    } catch (err) {
      logger.error(
        { err, userId: user.id },
        "corretora forgot-password: falha ao enviar e-mail"
      );
      return next(
        new AppError(
          "Não foi possível enviar o e-mail no momento. Tente novamente em instantes.",
          ERROR_CODES.SERVER_ERROR,
          503
        )
      );
    }

    rateLimit.reset();
    logger.info(
      { userId: user.id, corretoraId: user.corretora_id },
      "corretora forgot-password: e-mail enviado"
    );
    return genericOk();
  } catch (err) {
    rateLimit.fail();
    logger.error({ err }, "corretora forgot-password: erro inesperado");
    return next(
      new AppError(
        "Erro ao processar solicitação.",
        ERROR_CODES.SERVER_ERROR,
        500
      )
    );
  }
}

/**
 * POST /api/corretora/reset-password
 * Body validado por validate(resetPasswordSchema).
 *
 * Ao trocar a senha, também incrementa token_version do corretora_user
 * para invalidar sessões ativas — se alguém estava logado com a senha
 * antiga, é deslogado imediatamente.
 */
async function resetPassword(req, res, next) {
  const rateLimit = req.rateLimit || { fail: () => {}, reset: () => {} };
  const { token, senha } = req.body;

  try {
    const record = await resetTokens.findValidToken(token, SCOPE);
    if (!record) {
      rateLimit.fail();
      return next(
        new AppError(
          "Token inválido ou expirado. Solicite um novo link.",
          ERROR_CODES.AUTH_ERROR,
          401
        )
      );
    }

    // Usuário pode ter sido desativado entre a solicitação e o reset.
    const user = await usersRepo.findById(record.user_id);
    if (!user || !user.is_active || user.corretora_status !== "active") {
      rateLimit.fail();
      await resetTokens.revokeToken(record.id);
      return next(
        new AppError(
          "Esta conta não está disponível.",
          ERROR_CODES.AUTH_ERROR,
          401
        )
      );
    }

    const passwordHash = await authService.hashPassword(senha);
    await usersRepo.updatePasswordAndBumpTokenVersion(user.id, passwordHash);

    // Revoga o token usado E todos os outros do mesmo usuário, evitando
    // que um segundo link válido circulando no e-mail ainda funcione.
    await resetTokens.revokeToken(record.id);
    await resetTokens.revokeAllForUser(user.id, SCOPE);

    rateLimit.reset();
    logger.info(
      { userId: user.id, corretoraId: user.corretora_id },
      "corretora reset-password: senha redefinida"
    );

    return response.ok(
      res,
      null,
      "Senha redefinida com sucesso. Faça login com a nova senha."
    );
  } catch (err) {
    rateLimit.fail();
    logger.error({ err }, "corretora reset-password: erro inesperado");
    return next(
      err instanceof AppError
        ? err
        : new AppError(
            "Erro ao redefinir senha.",
            ERROR_CODES.SERVER_ERROR,
            500
          )
    );
  }
}

module.exports = { forgotPassword, resetPassword };
