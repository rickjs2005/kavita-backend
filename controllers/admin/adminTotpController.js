"use strict";

// controllers/admin/adminTotpController.js
//
// F1 — endpoints de gestão do 2FA do admin (autenticado, painel admin).
// Login + verificação de código continua em authAdminController; aqui
// é a área onde o admin gerencia o próprio 2FA.

const adminTotpService = require("../../services/adminTotpService");
const { logAdminAction } = require("../../services/adminLogs");
const AppError = require("../../errors/AppError");
const ERROR_CODES = require("../../constants/ErrorCodes");
const { response } = require("../../lib");
const logger = require("../../lib/logger");

function requireAdmin(req) {
  if (!req.admin?.id) {
    throw new AppError(
      "Token inválido ou administrador não autenticado.",
      ERROR_CODES.AUTH_ERROR,
      401,
    );
  }
  return req.admin;
}

/**
 * GET /api/admin/totp/status
 * Estado do 2FA do admin autenticado. Usado pelo painel para decidir
 * qual fluxo de UI mostrar (setup x ativo x sem 2FA).
 */
async function getStatus(req, res, next) {
  try {
    const admin = requireAdmin(req);
    const status = await adminTotpService.getStatus(admin.id);
    return response.ok(res, status);
  } catch (err) {
    return next(err instanceof AppError ? err : new AppError(
      "Erro ao consultar status 2FA.",
      ERROR_CODES.SERVER_ERROR,
      500,
    ));
  }
}

/**
 * POST /api/admin/totp/setup
 * Inicia o setup gerando secret + QR. mfa_active fica 0 até confirm.
 */
async function setup(req, res, next) {
  try {
    const admin = requireAdmin(req);
    const out = await adminTotpService.setupTotp({
      id: admin.id,
      email: admin.email,
      mfa_active: admin.mfa_active,
    });
    logAdminAction({
      adminId: admin.id,
      acao: "totp_setup_started",
      entidade: "admin",
      entidadeId: admin.id,
    });
    return response.ok(res, out);
  } catch (err) {
    return next(err instanceof AppError ? err : new AppError(
      "Erro ao iniciar setup 2FA.",
      ERROR_CODES.SERVER_ERROR,
      500,
    ));
  }
}

/**
 * POST /api/admin/totp/confirm
 * body: { code: "123456" }
 * Confirma o primeiro código, ativa MFA e devolve 10 backup codes em
 * plaintext UMA ÚNICA vez.
 */
async function confirm(req, res, next) {
  try {
    const admin = requireAdmin(req);
    const code = String(req.body?.code ?? "").trim();
    if (!code) {
      throw new AppError("Informe o código do app autenticador.", ERROR_CODES.VALIDATION_ERROR, 400);
    }
    const out = await adminTotpService.confirmTotpSetup({ id: admin.id, email: admin.email }, code);
    logAdminAction({
      adminId: admin.id,
      acao: "totp_enabled",
      entidade: "admin",
      entidadeId: admin.id,
    });
    return response.ok(res, out, "2FA ativado com sucesso. Guarde os backup codes em local seguro.");
  } catch (err) {
    if (!(err instanceof AppError)) {
      logger.error({ err, adminId: req.admin?.id }, "admin.totp.confirm error");
    }
    return next(err instanceof AppError ? err : new AppError(
      "Erro ao confirmar setup 2FA.",
      ERROR_CODES.SERVER_ERROR,
      500,
    ));
  }
}

/**
 * POST /api/admin/totp/regenerate-backup-codes
 * Gera 10 novos backup codes mantendo MFA ativo. Os antigos são
 * substituídos (não invalidados — apagados).
 */
async function regenerateBackupCodes(req, res, next) {
  try {
    const admin = requireAdmin(req);
    const out = await adminTotpService.regenerateBackupCodes(admin.id);
    logAdminAction({
      adminId: admin.id,
      acao: "totp_backup_codes_regenerated",
      entidade: "admin",
      entidadeId: admin.id,
    });
    return response.ok(res, out, "Novos backup codes gerados. Guarde-os agora.");
  } catch (err) {
    return next(err instanceof AppError ? err : new AppError(
      "Erro ao regenerar backup codes.",
      ERROR_CODES.SERVER_ERROR,
      500,
    ));
  }
}

/**
 * POST /api/admin/totp/disable
 * body: { code: "123456" }
 * Desliga 2FA. Exige código TOTP válido como step-up — evita que
 * sessão sequestrada desligue 2FA sozinha.
 */
async function disable(req, res, next) {
  try {
    const admin = requireAdmin(req);
    const code = String(req.body?.code ?? "").trim();
    if (!code) {
      throw new AppError(
        "Informe o código do app autenticador para desligar 2FA.",
        ERROR_CODES.VALIDATION_ERROR,
        400,
      );
    }

    // Step-up: re-validar TOTP antes de permitir disable
    const adminFull = await require("../../repositories/adminRepository").findAdminWithMfaById(admin.id);
    if (!adminFull?.mfa_active) {
      throw new AppError(
        "2FA não está ativo nesta conta.",
        ERROR_CODES.CONFLICT,
        409,
      );
    }
    const totp = require("../../lib/totp");
    if (!totp.verifyToken({ secret: adminFull.mfa_secret, code })) {
      throw new AppError("Código inválido.", ERROR_CODES.AUTH_ERROR, 401);
    }

    await adminTotpService.disableTotp(admin.id);
    logAdminAction({
      adminId: admin.id,
      acao: "totp_disabled",
      entidade: "admin",
      entidadeId: admin.id,
    });
    return response.ok(res, null, "2FA desativado. Sessões em outros dispositivos foram encerradas.");
  } catch (err) {
    return next(err instanceof AppError ? err : new AppError(
      "Erro ao desativar 2FA.",
      ERROR_CODES.SERVER_ERROR,
      500,
    ));
  }
}

module.exports = { getStatus, setup, confirm, regenerateBackupCodes, disable };
