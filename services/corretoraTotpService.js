// services/corretoraTotpService.js
//
// ETAPA 2.1 — 2FA TOTP (Time-based One-Time Password RFC 6238).
// Fluxo separado de corretoraAuthService porque TOTP tem regras
// próprias (secret em base32, window de tolerância, backup codes).
//
// Uso típico:
//   1. setupTotp(user)    → { secret, otpauth_url, qr_data_url }
//                           Usuário escaneia; secret fica em
//                           corretora_users.totp_secret mas totp_enabled=0.
//   2. confirmTotpSetup   → valida o primeiro código, liga totp_enabled=1
//                           e gera 10 backup codes plaintext (só aparecem 1x).
//   3. verifyToken        → checa código de autenticação (login/step-up).
//   4. consumeBackupCode  → alternativa quando usuário perde o celular.
//   5. disableTotp        → limpa secret + backup codes; força logout
//                           (incrementa tokenVersion).
//
// Decisões:
//   - issuer "Kavita" fica no otpauth_url (aparece no app)
//   - window=1 step (±30s) — flex razoável pra clock skew de celular
//   - codes de 6 dígitos (padrão Google Authenticator)
//   - backup codes: 10 strings de 8 chars alfanuméricos (uppercase
//     + números, sem chars ambíguos como 0/O/1/I). bcrypt hash no DB.
"use strict";

const speakeasy = require("speakeasy");
const qrcode = require("qrcode");
const bcrypt = require("bcrypt");
const crypto = require("node:crypto");

const AppError = require("../errors/AppError");
const ERROR_CODES = require("../constants/ErrorCodes");
const usersRepo = require("../repositories/corretoraUsersRepository");
const backupRepo = require("../repositories/corretoraBackupCodesRepository");
const logger = require("../lib/logger");

const BACKUP_CODE_LENGTH = 8;
const BACKUP_CODE_COUNT = 10;
const BACKUP_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sem 0/O/1/I
const BCRYPT_ROUNDS = 10;
const TOTP_WINDOW = 1; // ±30s de tolerância
const TOTP_LABEL_PREFIX = "Kavita Mercado do Café";

function sanitizeCode(code) {
  return String(code ?? "").replace(/\D/g, "").slice(0, 8);
}

function generateBackupCode() {
  // crypto.randomInt — sorteia byte por byte; sem viés de módulo.
  let out = "";
  for (let i = 0; i < BACKUP_CODE_LENGTH; i += 1) {
    out += BACKUP_ALPHABET[crypto.randomInt(0, BACKUP_ALPHABET.length)];
  }
  return out;
}

/**
 * Gera um novo secret TOTP + QR code data URL pra renderizar no
 * frontend. Guarda o secret no banco com totp_enabled=0.
 *
 * Se o usuário já tem totp_enabled=1, este método LEVANTA 409 —
 * regenerar secret exige `disableTotp` primeiro (bloco intencional,
 * evita regenerar acidentalmente).
 */
async function setupTotp(user) {
  if (user.totp_enabled) {
    throw new AppError(
      "2FA já está ativo. Desative antes de gerar um novo segredo.",
      ERROR_CODES.CONFLICT,
      409,
    );
  }
  const label = `${TOTP_LABEL_PREFIX}:${user.email}`;
  const secret = speakeasy.generateSecret({
    length: 20,
    name: label,
    issuer: "Kavita",
  });
  await usersRepo.setTotpSecret(user.id, secret.base32);
  const qrDataUrl = await qrcode.toDataURL(secret.otpauth_url);
  logger.info({ userId: user.id }, "corretora.totp.setup_started");
  return {
    secret: secret.base32,
    otpauth_url: secret.otpauth_url,
    qr_data_url: qrDataUrl,
  };
}

/**
 * Segundo passo: usuário confirma o primeiro código gerado pelo app.
 * Liga totp_enabled=1 e devolve os 10 backup codes em PLAINTEXT
 * (aparecem só aqui; no banco viram hash).
 *
 * Se a secret não existir (usuário pulou o setup), retorna 400.
 * Se o código for inválido, retorna 401.
 */
async function confirmTotpSetup(user, code) {
  if (!user.totp_secret) {
    throw new AppError(
      "Gere o QR code primeiro.",
      ERROR_CODES.VALIDATION_ERROR,
      400,
    );
  }
  const sanitized = sanitizeCode(code);
  if (sanitized.length !== 6) {
    throw new AppError(
      "Código TOTP deve ter 6 dígitos.",
      ERROR_CODES.VALIDATION_ERROR,
      400,
    );
  }
  const ok = speakeasy.totp.verify({
    secret: user.totp_secret,
    encoding: "base32",
    token: sanitized,
    window: TOTP_WINDOW,
  });
  if (!ok) {
    throw new AppError(
      "Código inválido. Tente novamente.",
      ERROR_CODES.AUTH_ERROR,
      401,
    );
  }

  // Gera 10 backup codes plaintext + hashes pro DB
  const plaintexts = [];
  const hashes = [];
  for (let i = 0; i < BACKUP_CODE_COUNT; i += 1) {
    const code = generateBackupCode();
    plaintexts.push(code);
    hashes.push(await bcrypt.hash(code, BCRYPT_ROUNDS));
  }
  await backupRepo.replaceAllForUser({ userId: user.id, hashes });
  await usersRepo.enableTotp(user.id);

  logger.info({ userId: user.id }, "corretora.totp.enabled");
  return { backup_codes: plaintexts };
}

/**
 * Verifica código TOTP em momento de autenticação (login step-up).
 * Não toca o banco — só valida contra o secret.
 */
function verifyToken({ secret, code }) {
  if (!secret) return false;
  const sanitized = sanitizeCode(code);
  if (sanitized.length !== 6) return false;
  return speakeasy.totp.verify({
    secret,
    encoding: "base32",
    token: sanitized,
    window: TOTP_WINDOW,
  });
}

/**
 * Consome um backup code. Compara com bcrypt contra os codes não
 * usados do usuário; se bater, marca used_at=NOW(). Retorna true
 * se consumiu.
 */
async function consumeBackupCode(userId, code) {
  const input = String(code ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/-/g, "");
  if (input.length < 4) return false;

  const unused = await backupRepo.listUnused(userId);
  for (const row of unused) {
    // bcrypt compare sequencial — lista pequena (≤10 códigos) e o
    // loop é o fluxo de autenticação (não loop quente de hot path)
    const match = await bcrypt.compare(input, row.code_hash);
    if (match) {
      await backupRepo.markUsed(row.id);
      logger.info({ userId }, "corretora.totp.backup_code_used");
      return true;
    }
  }
  return false;
}

/**
 * Desliga 2FA. Limpa secret + todos backup codes + incrementa
 * tokenVersion (força logout em todos dispositivos).
 */
async function disableTotp(userId) {
  await backupRepo.deleteAllForUser(userId);
  await usersRepo.disableTotp(userId);
  logger.info({ userId }, "corretora.totp.disabled");
}

/**
 * Regenera backup codes mantendo o TOTP ativo. Útil quando usuário
 * imprime os códigos e perde a folha.
 */
async function regenerateBackupCodes(userId) {
  const plaintexts = [];
  const hashes = [];
  for (let i = 0; i < BACKUP_CODE_COUNT; i += 1) {
    const code = generateBackupCode();
    plaintexts.push(code);
    hashes.push(await bcrypt.hash(code, BCRYPT_ROUNDS));
  }
  await backupRepo.replaceAllForUser({ userId, hashes });
  logger.info({ userId }, "corretora.totp.backup_codes_regenerated");
  return { backup_codes: plaintexts };
}

module.exports = {
  setupTotp,
  confirmTotpSetup,
  verifyToken,
  consumeBackupCode,
  disableTotp,
  regenerateBackupCodes,
};
