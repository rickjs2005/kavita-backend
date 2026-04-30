"use strict";

// services/adminTotpService.js
//
// Phase 2 go-live — F1 (2FA admin completion).
//
// Fluxo de gestão do TOTP do admin:
//   1. setupTotp(admin)       → secret + QR + otpauth_url. Salva o
//                                secret em admins.mfa_secret mas
//                                mfa_active fica 0.
//   2. confirmTotpSetup(...)  → valida o primeiro código gerado pelo
//                                app, liga mfa_active=1 e gera 10
//                                backup codes em plaintext (mostrados
//                                ao admin uma vez; persistidos como
//                                bcrypt hash).
//   3. consumeBackupCode      → fallback de login quando admin perdeu
//                                o celular.
//   4. regenerateBackupCodes  → gera novos 10 codes mantendo MFA ativo.
//   5. disableTotp            → limpa secret + apaga backup codes +
//                                incrementa tokenVersion (força logout
//                                em todos dispositivos).
//
// Nota de schema: admins.mfa_secret + admins.mfa_active JÁ EXISTIAM e
// são usadas pelo loginMfa controller atual. Este service mantém
// esses nomes para não quebrar o fluxo de login.

const bcrypt = require("bcrypt");

const totp = require("../lib/totp");
const adminRepo = require("../repositories/adminRepository");
const backupRepo = require("../repositories/adminBackupCodesRepository");
const AppError = require("../errors/AppError");
const ERROR_CODES = require("../constants/ErrorCodes");
const logger = require("../lib/logger");

const BCRYPT_ROUNDS = 10;
const BACKUP_CODE_COUNT = 10;
const TOTP_LABEL_PREFIX = "Kavita Admin";

/**
 * Inicia setup do TOTP. Recusa se já estiver ativo (re-emitir secret
 * exige disable + setup novo, decisão consciente para evitar reset
 * acidental).
 *
 * @param {{ id: number, email: string, mfa_active?: number|boolean }} admin
 *   Admin já carregado (ex.: do middleware verifyAdmin).
 * @returns {Promise<{ secret: string, otpauth_url: string, qr_data_url: string }>}
 */
async function setupTotp(admin) {
  if (admin.mfa_active) {
    throw new AppError(
      "2FA já está ativo. Desative antes de gerar um novo segredo.",
      ERROR_CODES.CONFLICT,
      409,
    );
  }

  const label = `${TOTP_LABEL_PREFIX}:${admin.email}`;
  const out = await totp.generateSecret({ label, issuer: "Kavita" });

  await adminRepo.setMfaSecret(admin.id, out.secret);

  logger.info({ adminId: admin.id }, "admin.totp.setup_started");

  return out;
}

/**
 * Confirma o setup com o primeiro código gerado pelo app. Liga
 * mfa_active=1 e gera 10 backup codes.
 *
 * @param {{ id: number, email: string }} admin
 * @param {string} code  6 dígitos do app autenticador
 * @returns {Promise<{ backup_codes: string[] }>} plaintext, mostrar uma única vez
 */
async function confirmTotpSetup(admin, code) {
  const fresh = await adminRepo.findAdminWithMfaById(admin.id);
  if (!fresh) {
    throw new AppError("Admin não encontrado.", ERROR_CODES.NOT_FOUND, 404);
  }
  if (!fresh.mfa_secret) {
    throw new AppError(
      "Gere o QR code primeiro.",
      ERROR_CODES.VALIDATION_ERROR,
      400,
    );
  }
  if (fresh.mfa_active) {
    throw new AppError(
      "2FA já está ativo.",
      ERROR_CODES.CONFLICT,
      409,
    );
  }

  const ok = totp.verifyToken({ secret: fresh.mfa_secret, code });
  if (!ok) {
    throw new AppError(
      "Código inválido. Tente novamente.",
      ERROR_CODES.AUTH_ERROR,
      401,
    );
  }

  const plaintexts = totp.generateBackupCodes(BACKUP_CODE_COUNT);
  const hashes = await Promise.all(
    plaintexts.map((p) => bcrypt.hash(p, BCRYPT_ROUNDS)),
  );
  await backupRepo.replaceAllForAdmin({ adminId: admin.id, hashes });
  await adminRepo.enableMfa(admin.id);

  logger.info({ adminId: admin.id }, "admin.totp.enabled");
  return { backup_codes: plaintexts };
}

/**
 * Consome um backup code. Compara via bcrypt contra cada code não
 * usado do admin. Retorna true se consumiu (e marca used_at), false
 * se nenhum bate.
 *
 * Usado no fluxo de login quando o admin não tem o celular.
 */
async function consumeBackupCode(adminId, raw) {
  const input = totp.normalizeBackupCodeInput(raw);
  if (input.length < 4) return false;

  const unused = await backupRepo.listUnused(adminId);
  for (const row of unused) {
    const match = await bcrypt.compare(input, row.code_hash);
    if (match) {
      await backupRepo.markUsed(row.id);
      logger.info({ adminId }, "admin.totp.backup_code_used");
      return true;
    }
  }
  return false;
}

/**
 * Regenera backup codes mantendo MFA ativo. Útil quando admin
 * imprimiu os codes e perdeu a folha.
 */
async function regenerateBackupCodes(adminId) {
  const fresh = await adminRepo.findAdminWithMfaById(adminId);
  if (!fresh || !fresh.mfa_active) {
    throw new AppError(
      "2FA não está ativo. Faça o setup antes de regenerar backup codes.",
      ERROR_CODES.CONFLICT,
      409,
    );
  }

  const plaintexts = totp.generateBackupCodes(BACKUP_CODE_COUNT);
  const hashes = await Promise.all(
    plaintexts.map((p) => bcrypt.hash(p, BCRYPT_ROUNDS)),
  );
  await backupRepo.replaceAllForAdmin({ adminId, hashes });

  logger.info({ adminId }, "admin.totp.backup_codes_regenerated");
  return { backup_codes: plaintexts };
}

/**
 * Desliga o 2FA: limpa secret, apaga backup codes e incrementa
 * tokenVersion (força logout em todos os dispositivos).
 *
 * Política operacional: NÃO permitir self-disable em produção via
 * endpoint público pelo próprio admin se ele tem permissões
 * sensíveis (configurar uma allow-list de quem pode chamar este
 * endpoint diretamente). Por ora o service só executa; a política
 * fica no controller/route.
 */
async function disableTotp(adminId) {
  await backupRepo.deleteAllForAdmin(adminId);
  await adminRepo.disableMfa(adminId);
  await adminRepo.incrementTokenVersion(adminId);
  logger.info({ adminId }, "admin.totp.disabled");
}

/**
 * Status conciso para o painel: 2FA ligado/desligado, secret pendente
 * (setup iniciado mas não confirmado) e quantos backup codes restam.
 */
async function getStatus(adminId) {
  const fresh = await adminRepo.findAdminWithMfaById(adminId);
  if (!fresh) {
    throw new AppError("Admin não encontrado.", ERROR_CODES.NOT_FOUND, 404);
  }
  const remaining = fresh.mfa_active ? await backupRepo.countUnused(adminId) : 0;
  return {
    enabled: Boolean(fresh.mfa_active),
    setup_pending: Boolean(fresh.mfa_secret) && !fresh.mfa_active,
    backup_codes_remaining: remaining,
  };
}

module.exports = {
  setupTotp,
  confirmTotpSetup,
  consumeBackupCode,
  regenerateBackupCodes,
  disableTotp,
  getStatus,
};
