"use strict";
// utils/cpfCrypto.js
//
// Criptografia de CPF para armazenamento seguro (LGPD).
//
// Estratégia:
//   - AES-256-GCM para criptografar/decriptar (confidencialidade + integridade)
//   - HMAC-SHA256 para gerar hash determinístico (busca por duplicata sem decriptar)
//
// Formato armazenado (cpf column): "iv_hex:authTag_hex:ciphertext_hex"
// Formato do hash (cpf_hash column): hex(HMAC-SHA256(key, plaintext_digits))
//
// Chave: CPF_ENCRYPTION_KEY (env var, 32+ chars). Obrigatória em produção.
// Em dev/test sem chave, encrypt/decrypt são no-op (plaintext).

const crypto = require("crypto");

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const KEY_ENV = "CPF_ENCRYPTION_KEY";

function getKey() {
  const raw = process.env[KEY_ENV];
  if (!raw) return null;
  // Derive a consistent 32-byte key from the secret
  return crypto.createHash("sha256").update(raw).digest();
}

/**
 * Encrypts a plaintext CPF (digits-only) using AES-256-GCM.
 * Returns "iv:authTag:ciphertext" in hex, or the plaintext if no key is configured.
 *
 * @param {string|null} plaintext  Digits-only CPF (e.g. "12345678901")
 * @returns {string|null}
 */
function encryptCPF(plaintext) {
  if (!plaintext) return null;
  const digits = String(plaintext).replace(/\D/g, "");
  if (!digits) return null;

  const key = getKey();
  if (!key) return digits; // no-op in dev without key

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(digits, "utf8", "hex");
  encrypted += cipher.final("hex");

  const authTag = cipher.getAuthTag().toString("hex");
  return `${iv.toString("hex")}:${authTag}:${encrypted}`;
}

/**
 * Decrypts an AES-256-GCM encrypted CPF back to digits-only plaintext.
 * If the value doesn't look encrypted (no colons), returns it as-is (legacy plaintext).
 *
 * @param {string|null} stored  "iv:authTag:ciphertext" or plain digits (legacy)
 * @returns {string|null}
 */
function decryptCPF(stored) {
  if (!stored) return null;
  const str = String(stored);

  // Legacy plaintext: no colons, just digits
  if (!str.includes(":")) return str;

  const key = getKey();
  if (!key) return str; // can't decrypt without key

  const parts = str.split(":");
  if (parts.length !== 3) return str; // malformed, return as-is

  const [ivHex, authTagHex, ciphertext] = parts;

  try {
    const iv = Buffer.from(ivHex, "hex");
    const authTag = Buffer.from(authTagHex, "hex");
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(ciphertext, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  } catch {
    // Decryption failed — possibly wrong key or corrupted data
    return null;
  }
}

/**
 * Generates a deterministic HMAC-SHA256 hash of a CPF for indexed lookups.
 * Allows searching for duplicate CPFs without decrypting all rows.
 *
 * @param {string|null} plaintext  Digits-only CPF
 * @returns {string|null}  64-char hex string, or null
 */
function hashCPF(plaintext) {
  if (!plaintext) return null;
  const digits = String(plaintext).replace(/\D/g, "");
  if (!digits) return null;

  const key = getKey();
  if (!key) return digits; // no-op in dev without key — use raw digits as "hash"

  return crypto.createHmac("sha256", key).update(digits).digest("hex");
}

module.exports = { encryptCPF, decryptCPF, hashCPF };
