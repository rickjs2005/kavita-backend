"use strict";
// lib/recoveryCoupon.js
//
// C2 (auditoria automação) — utilitários para cupom de recuperação
// de carrinho abandonado.
//
// Estratégia de unicidade:
//   código = "RECOVER-{cart_id}-{shortHash}"
//   shortHash = HMAC-SHA256(cart_id, secret).slice(0, 6).toUpperCase()
//
// Determinístico — mesmo cart_id sempre gera o mesmo código. Permite
// que o caller faça lookup antes de criar (idempotência sem precisar
// de coluna nova no schema).
//
// Não-adivinhável — usa secret. Atacante não pode enumerar IDs e
// "advinhar" cupons de outros carrinhos.

const crypto = require("crypto");

// Defaults da regra de negócio (decisão 2026-04-25)
const RECOVERY_DEFAULTS = Object.freeze({
  tipo: "percentual",
  valor: 10,                    // 10% off — conservador pra Zona da Mata
  expiracaoHours: 48,           // 48h a partir da geração
  max_usos: 1,                  // uso global único
  max_usos_por_usuario: 1,      // mesmo usuário não usa 2x
  minimo: 0,                    // sem valor mínimo
});

/**
 * Secret pra assinar o hash. Lê de env (estável em prod) ou fallback
 * em dev. Na pior hipótese (dev sem env), o código ainda é único por
 * cart_id, mas previsível — aceitável pra dev local.
 */
function getSecret() {
  return (
    process.env.RECOVERY_COUPON_SECRET ||
    process.env.JWT_SECRET ||
    "kavita-recovery-dev-secret"
  );
}

/**
 * Gera o código determinístico do cupom de recuperação para um
 * carrinho abandonado.
 *
 * @param {number|string} cartId
 * @returns {string} ex: "RECOVER-42-A3F1B2"
 */
function buildRecoveryCode(cartId) {
  const id = String(cartId);
  const hash = crypto
    .createHmac("sha256", getSecret())
    .update(id)
    .digest("hex")
    .slice(0, 6)
    .toUpperCase();
  return `RECOVER-${id}-${hash}`;
}

/**
 * Calcula data de expiração relativa ao agora.
 * @param {number} hours
 * @returns {Date}
 */
function buildExpirationDate(hours = RECOVERY_DEFAULTS.expiracaoHours) {
  return new Date(Date.now() + hours * 60 * 60 * 1000);
}

module.exports = {
  buildRecoveryCode,
  buildExpirationDate,
  RECOVERY_DEFAULTS,
};
