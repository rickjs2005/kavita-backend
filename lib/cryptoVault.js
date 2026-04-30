"use strict";

// lib/cryptoVault.js
//
// F1.6 — criptografia simétrica para segredos sensíveis em repouso.
// Hoje cobre admins.mfa_secret (TOTP base32). A mesma camada serve para
// outros segredos no futuro (campos cifrados de KYC, OAuth tokens, etc.)
// — quando aparecerem, compartilham MFA_ENCRYPTION_KEY ou ganham chave
// dedicada (overload em getKey).
//
// Garantias:
//   - AES-256-GCM (sigilo + autenticidade num só primitivo).
//   - IV único por mensagem (12 bytes random).
//   - Auth tag de 128 bits — qualquer alteração no ciphertext quebra
//     decryptString com Error("Unsupported state or unable to authenticate data").
//   - Formato self-describing com versão: "v1:<iv-b64>:<tag-b64>:<ct-b64>"
//     → permite trocar algoritmo no futuro sem migration nova
//       (basta detectar o prefixo "v2:" etc).
//
// Compatibilidade com plaintext (transição F1 → F1.6):
//   - Em NODE_ENV=development|test, decryptString aceita valor sem
//     prefixo "v1:" e devolve como veio (fallback). Permite rodar smoke
//     local sem migrar fixtures.
//   - Em NODE_ENV=production, decryptString REJEITA valor sem prefixo
//     com Error explícito. Defesa contra ataque pós-migração onde alguém
//     INSERT/UPDATE plaintext direto no DB tentando burlar a camada de
//     crypto.

const crypto = require("node:crypto");

const VERSION_TAG = "v1";
const ALGO = "aes-256-gcm";
const IV_BYTES = 12;        // GCM recomenda 96 bits
const TAG_BYTES = 16;       // 128 bits — full strength

const KEY_BYTES = 32;       // 256 bits

class CryptoVaultError extends Error {
  constructor(message) {
    super(message);
    this.name = "CryptoVaultError";
  }
}

function _resolveKey() {
  const raw = process.env.MFA_ENCRYPTION_KEY;
  if (!raw) {
    throw new CryptoVaultError(
      "MFA_ENCRYPTION_KEY ausente. Em produção é obrigatória; em dev/test " +
        "use uma key fixa local (ver docs/security/mfa-encryption.md).",
    );
  }
  const value = String(raw).trim();
  // Aceita base64 (44 chars com padding) ou hex (64 chars)
  let buf;
  if (/^[0-9a-fA-F]{64}$/.test(value)) {
    buf = Buffer.from(value, "hex");
  } else if (/^[A-Za-z0-9+/]{42,44}={0,2}$/.test(value)) {
    buf = Buffer.from(value, "base64");
  } else {
    throw new CryptoVaultError(
      "MFA_ENCRYPTION_KEY formato inválido. Use 32 bytes em base64 (44 chars) " +
        "ou hex (64 chars). Gere com: " +
        "node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\"",
    );
  }
  if (buf.length !== KEY_BYTES) {
    throw new CryptoVaultError(
      `MFA_ENCRYPTION_KEY decodificada tem ${buf.length} bytes; esperado ${KEY_BYTES}.`,
    );
  }
  return buf;
}

/**
 * Indica se o valor armazenado já está no formato v1 (criptografado).
 * Não decifra — só inspeciona o prefixo.
 */
function isEncrypted(value) {
  return typeof value === "string" && value.startsWith(`${VERSION_TAG}:`);
}

/**
 * Criptografa uma string. Devolve o blob no formato self-describing
 * `v1:<iv-b64>:<tag-b64>:<ct-b64>`.
 *
 * @param {string} plaintext
 * @returns {string}
 */
function encryptString(plaintext) {
  if (typeof plaintext !== "string") {
    throw new CryptoVaultError("encryptString: esperado string.");
  }
  if (plaintext.length === 0) {
    throw new CryptoVaultError("encryptString: string vazia não é cifrável.");
  }

  const key = _resolveKey();
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [
    VERSION_TAG,
    iv.toString("base64"),
    tag.toString("base64"),
    ct.toString("base64"),
  ].join(":");
}

/**
 * Descriptografa um valor que pode estar no formato `v1:...` ou em
 * plaintext (legado pré-F1.6).
 *
 * Plaintext legado:
 *   - dev/test → aceita, devolve como veio (compat).
 *   - production → throw CryptoVaultError. Defesa em profundidade
 *     contra alguém escrever plaintext no DB pós-migração.
 *
 * @param {string} stored
 * @returns {string}
 */
function decryptString(stored) {
  if (typeof stored !== "string" || stored.length === 0) {
    throw new CryptoVaultError("decryptString: valor vazio ou não-string.");
  }

  if (!isEncrypted(stored)) {
    if (process.env.NODE_ENV === "production") {
      throw new CryptoVaultError(
        "decryptString: valor armazenado em PLAINTEXT detectado em produção. " +
          "Pós-migração F1.6, todos os segredos devem estar no formato v1. " +
          "Esse cenário indica INSERT/UPDATE direto no banco — investigar.",
      );
    }
    return stored;
  }

  const parts = stored.split(":");
  if (parts.length !== 4 || parts[0] !== VERSION_TAG) {
    throw new CryptoVaultError("decryptString: formato inesperado.");
  }
  const [, ivB64, tagB64, ctB64] = parts;

  let iv, tag, ct;
  try {
    iv = Buffer.from(ivB64, "base64");
    tag = Buffer.from(tagB64, "base64");
    ct = Buffer.from(ctB64, "base64");
  } catch {
    throw new CryptoVaultError("decryptString: payload corrompido (base64).");
  }
  if (iv.length !== IV_BYTES) {
    throw new CryptoVaultError(`decryptString: IV inválido (${iv.length} bytes).`);
  }
  if (tag.length !== TAG_BYTES) {
    throw new CryptoVaultError(`decryptString: tag inválida (${tag.length} bytes).`);
  }

  const key = _resolveKey();
  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  let pt;
  try {
    pt = Buffer.concat([decipher.update(ct), decipher.final()]);
  } catch (err) {
    throw new CryptoVaultError(
      `decryptString: falha de autenticação — ciphertext adulterado ou key errada. (${err.message})`,
    );
  }
  return pt.toString("utf8");
}

module.exports = {
  encryptString,
  decryptString,
  isEncrypted,
  VERSION_TAG,
  CryptoVaultError,
  // exports para teste
  _internal: { _resolveKey },
};
