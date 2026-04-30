"use strict";

// middleware/requireTotpForSensitiveOps.js
//
// F1 — step-up para operações sensíveis do admin.
//
// Há 2 níveis de defesa para 2FA admin:
//   (A) login: se admin tem mfa_active=1, o fluxo já força challenge
//       MFA antes de emitir cookie (controllers/admin/authAdminController).
//   (B) operações sensíveis: este middleware exige que o cookie atual
//       tenha sido emitido APÓS uma verificação de TOTP recente
//       (admin.mfa_step_up_at no payload do JWT, dentro de uma janela
//       de N minutos), OU que admin tenha mfa_active=1 — nesse caso
//       o (A) já garante MFA-no-login.
//
// Política prática (Fase 1+2 go-live): TODA admin com permissão
// sensível (`pedidos.*`, `mercado_cafe_*`, `usuarios.*`, `config.editar`)
// PRECISA ter mfa_active=1. Sem isso, este middleware rejeita 403.
//
// Não-objetivo: forçar step-up por operação dentro de uma sessão.
// O cookie do admin já tem TTL de 2h e a sessão admin é curta.
// Adicionar um step-up por ação se vier necessidade explícita.

const AppError = require("../errors/AppError");
const ERROR_CODES = require("../constants/ErrorCodes");
const adminRepo = require("../repositories/adminRepository");
const logger = require("../lib/logger");

/**
 * Bloqueia acesso a uma rota até que o admin tenha 2FA ativo.
 * Caller deve ter passado por verifyAdmin antes (req.admin populado).
 *
 * Em desenvolvimento (NODE_ENV !== "production"), o middleware AVISA
 * mas não bloqueia — facilita rodar smoke local sem 2FA configurado.
 * Em produção, BLOQUEIA com 403.
 *
 * @returns Express middleware
 */
function requireTotpForSensitiveOps() {
  return async function requireTotp(req, _res, next) {
    if (!req.admin?.id) {
      return next(new AppError("Não autenticado.", ERROR_CODES.AUTH_ERROR, 401));
    }

    let admin;
    try {
      admin = await adminRepo.findAdminWithMfaById(req.admin.id);
    } catch (err) {
      logger.error({ err, adminId: req.admin.id }, "requireTotp: db lookup failed");
      return next(new AppError("Erro ao validar 2FA.", ERROR_CODES.SERVER_ERROR, 500));
    }

    if (admin?.mfa_active) {
      return next();
    }

    const isProd = process.env.NODE_ENV === "production";
    const msg =
      "Esta operação exige 2FA ativo. Acesse /admin/seguranca/2fa para configurar.";

    if (isProd) {
      logger.warn(
        { adminId: req.admin.id, path: req.path, method: req.method },
        "requireTotp: rejected (admin has no 2FA in production)",
      );
      return next(new AppError(msg, ERROR_CODES.FORBIDDEN, 403));
    }

    logger.warn(
      { adminId: req.admin.id, path: req.path, method: req.method },
      "requireTotp: PASSING in dev (admin has no 2FA — would be blocked in production)",
    );
    return next();
  };
}

module.exports = requireTotpForSensitiveOps;
