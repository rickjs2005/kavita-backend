"use strict";

// lib/totp.js
//
// Helpers PUROS de TOTP (Time-based One-Time Password, RFC 6238).
//
// Fase 2 go-live — F1 (2FA admin):
//   Esta camada foi extraída de services/corretoraTotpService.js para que
//   adminTotpService possa reusar a mesma lógica sem duplicar regras
//   (window de tolerância, alfabeto de backup codes, etc.).
//
// Sem dependência de banco. Quem persiste é o service de cada contexto
// (corretora, admin, etc.).

const speakeasy = require("speakeasy");
const qrcode = require("qrcode");
const crypto = require("node:crypto");

// Alfabeto de backup codes — exclui 0/O e 1/I para não confundir o usuário
// transcrevendo manualmente. 32 símbolos = 5 bits/char. 8 chars ≈ 40 bits.
const BACKUP_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const BACKUP_CODE_LENGTH = 8;
const BACKUP_CODE_COUNT_DEFAULT = 10;

// ±30s de tolerância para clock skew. Window=1 step (cada step = 30s).
const TOTP_WINDOW = 1;

/**
 * Gera secret + URL otpauth (para QR code) + data URL do QR PNG embutido.
 *
 * @param {{ label: string, issuer?: string }} opts
 *   label    — string a aparecer no app autenticador (ex.: "Kavita:admin@x.com")
 *   issuer   — fabricante (default "Kavita")
 * @returns {Promise<{ secret: string, otpauth_url: string, qr_data_url: string }>}
 */
async function generateSecret({ label, issuer = "Kavita" }) {
  const secret = speakeasy.generateSecret({
    length: 20,
    name: label,
    issuer,
  });
  const qr_data_url = await qrcode.toDataURL(secret.otpauth_url);
  return {
    secret: secret.base32,
    otpauth_url: secret.otpauth_url,
    qr_data_url,
  };
}

/**
 * Sanitiza um código TOTP digitado pelo usuário: tira tudo que não é
 * dígito e trunca para 8 chars (cobre tanto 6 dígitos do TOTP quanto
 * placeholders maiores).
 */
function sanitizeCode(code) {
  return String(code ?? "").replace(/\D/g, "").slice(0, 8);
}

/**
 * Verifica um código TOTP de 6 dígitos contra um secret base32.
 * Retorna boolean — não loga, não toca em banco. Quem decide o que
 * fazer (incrementar tentativa, gerar sessão, etc.) é o caller.
 *
 * @param {{ secret: string, code: string }} opts
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
 * Gera 1 backup code aleatório do alfabeto sem caracteres ambíguos.
 * Usa crypto.randomInt — sem viés de módulo.
 */
function generateBackupCode() {
  let out = "";
  for (let i = 0; i < BACKUP_CODE_LENGTH; i += 1) {
    out += BACKUP_CODE_ALPHABET[crypto.randomInt(0, BACKUP_CODE_ALPHABET.length)];
  }
  return out;
}

/**
 * Gera um conjunto de backup codes em plaintext. O caller é responsável
 * por hashear (bcrypt) antes de persistir e por exibir os codes ao
 * usuário UMA ÚNICA vez.
 *
 * @param {number} [count=10]
 * @returns {string[]}
 */
function generateBackupCodes(count = BACKUP_CODE_COUNT_DEFAULT) {
  const out = [];
  for (let i = 0; i < count; i += 1) out.push(generateBackupCode());
  return out;
}

/**
 * Normaliza input de backup code do usuário: uppercase, remove
 * separadores e espaços. Não trunca o tamanho — comparação final é
 * pelo bcrypt no caller.
 */
function normalizeBackupCodeInput(raw) {
  return String(raw ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/-/g, "");
}

module.exports = {
  // constantes para reuso/teste
  BACKUP_CODE_ALPHABET,
  BACKUP_CODE_LENGTH,
  BACKUP_CODE_COUNT_DEFAULT,
  TOTP_WINDOW,
  // API
  generateSecret,
  sanitizeCode,
  verifyToken,
  generateBackupCode,
  generateBackupCodes,
  normalizeBackupCodeInput,
};
