// controllers/corretoraPanel/totpCorretoraController.js
//
// ETAPA 2.1 — endpoints de gestão do 2FA pelo próprio usuário logado.
// Todos requerem corretoraToken ativo (verifyCorretora no mount).
"use strict";

const { response } = require("../../lib");
const AppError = require("../../errors/AppError");
const ERROR_CODES = require("../../constants/ErrorCodes");
const totpService = require("../../services/corretoraTotpService");
const authService = require("../../services/corretoraAuthService");
const usersRepo = require("../../repositories/corretoraUsersRepository");
const backupRepo = require("../../repositories/corretoraBackupCodesRepository");
const logger = require("../../lib/logger");

/**
 * GET /api/corretora/2fa
 * Status do 2FA do usuário logado.
 */
async function getStatus(req, res, next) {
  try {
    const user = await usersRepo.findById(req.corretoraUser.id);
    if (!user) {
      throw new AppError("Usuário não encontrado.", ERROR_CODES.NOT_FOUND, 404);
    }
    const unusedBackupCodes = user.totp_enabled
      ? await backupRepo.countUnused(user.id)
      : 0;
    return response.ok(res, {
      enabled: Boolean(user.totp_enabled),
      enabled_at: user.totp_enabled_at ?? null,
      has_pending_setup: Boolean(user.totp_secret && !user.totp_enabled),
      unused_backup_codes: unusedBackupCodes,
      last_login_ip: user.last_login_ip ?? null,
      last_login_at: user.last_login_at ?? null,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/corretora/2fa/setup
 * Gera um secret novo + QR code. NÃO habilita o 2FA — isso só
 * acontece após o usuário confirmar o primeiro código em /confirm.
 */
async function startSetup(req, res, next) {
  try {
    const user = await usersRepo.findById(req.corretoraUser.id);
    if (!user) {
      throw new AppError("Usuário não encontrado.", ERROR_CODES.NOT_FOUND, 404);
    }
    const result = await totpService.setupTotp(user);
    return response.ok(res, result, "Escaneie o QR code no seu aplicativo.");
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/corretora/2fa/confirm
 * Body: { code }
 */
async function confirmSetup(req, res, next) {
  try {
    const user = await usersRepo.findById(req.corretoraUser.id);
    if (!user) {
      throw new AppError("Usuário não encontrado.", ERROR_CODES.NOT_FOUND, 404);
    }
    const result = await totpService.confirmTotpSetup(user, req.body.code);
    return response.ok(
      res,
      result,
      "2FA ativado. Guarde os códigos de backup em lugar seguro.",
    );
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/corretora/2fa/disable
 * Body: { senha }
 * Exige senha atual pra previnir sequestro de cookie.
 */
async function disable(req, res, next) {
  try {
    const user = await usersRepo.findById(req.corretoraUser.id);
    if (!user) {
      throw new AppError("Usuário não encontrado.", ERROR_CODES.NOT_FOUND, 404);
    }
    if (!user.totp_enabled) {
      throw new AppError(
        "2FA já está desativado.",
        ERROR_CODES.VALIDATION_ERROR,
        400,
      );
    }
    const ok = await authService.verifyPassword(
      req.body.senha,
      user.password_hash,
    );
    if (!ok) {
      logger.warn(
        { userId: user.id, ip: req.ip },
        "corretora.totp.disable_wrong_password",
      );
      throw new AppError(
        "Senha incorreta.",
        ERROR_CODES.AUTH_ERROR,
        401,
      );
    }
    await totpService.disableTotp(user.id);
    return response.ok(res, null, "2FA desativado.");
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/corretora/2fa/backup-codes/regenerate
 */
async function regenerateBackupCodes(req, res, next) {
  try {
    const user = await usersRepo.findById(req.corretoraUser.id);
    if (!user || !user.totp_enabled) {
      throw new AppError(
        "2FA precisa estar ativo para regenerar códigos.",
        ERROR_CODES.VALIDATION_ERROR,
        400,
      );
    }
    const result = await totpService.regenerateBackupCodes(user.id);
    return response.ok(
      res,
      result,
      "Códigos regenerados. Os anteriores foram invalidados.",
    );
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/corretora/logout-all
 * Incrementa token_version — invalida todos os cookies emitidos
 * (o próprio do usuário incluso). Frontend faz logout em sequência.
 */
async function logoutAllDevices(req, res, next) {
  try {
    await usersRepo.incrementTokenVersion(req.corretoraUser.id);
    logger.info(
      { userId: req.corretoraUser.id },
      "corretora.logout_all",
    );
    return response.ok(res, null, "Todos os dispositivos foram desconectados.");
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getStatus,
  startSetup,
  confirmSetup,
  disable,
  regenerateBackupCodes,
  logoutAllDevices,
};
