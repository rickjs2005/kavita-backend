"use strict";

// services/couponService.js
//
// Única fonte de verdade para regras de negócio de cupom.
//
// Consumidores:
//   - checkoutService.create()     → applyCoupon()          (transacional, WITH lock)
//   - checkoutService.previewCoupon() → validateCouponRules() (read-only, sem DB)
//
// Não exporta nada específico de pedido, produto ou frete.
// Toda lógica de desconto é delegada para cá.

const checkoutRepo = require("../repositories/checkoutRepository");
const AppError = require("../errors/AppError");
const ERROR_CODES = require("../constants/ErrorCodes");

// ---------------------------------------------------------------------------
// Pure validation — sem I/O, usada tanto no checkout real quanto no preview
// ---------------------------------------------------------------------------

/**
 * Valida um registro de cupom contra um subtotal e calcula o desconto.
 * Lança AppError para qualquer violação de regra.
 * Não acessa o banco de dados.
 *
 * Regras aplicadas (em ordem):
 *   1. Cupom deve estar ativo
 *   2. Cupom não pode estar expirado
 *   3. Cupom não pode ter atingido o limite de usos
 *   4. Subtotal deve atingir o valor mínimo do cupom
 *   5. Desconto calculado: percentual ou fixo, clampado em [0, subtotal]
 *
 * @param {object} cupom    Linha da tabela cupons
 * @param {number} subtotal Subtotal pré-cupom
 * @returns {{ desconto: number, cupomAplicado: object }}
 */
function validateCouponRules(cupom, subtotal) {
  if (!cupom.ativo) {
    throw new AppError("Este cupom está inativo.", ERROR_CODES.VALIDATION_ERROR, 400);
  }

  if (cupom.expiracao) {
    const exp = new Date(cupom.expiracao);
    if (exp.getTime() < Date.now()) {
      throw new AppError("Este cupom está expirado.", ERROR_CODES.VALIDATION_ERROR, 400);
    }
  }

  const usos = Number(cupom.usos || 0);
  const maxUsos =
    cupom.max_usos === null || cupom.max_usos === undefined
      ? null
      : Number(cupom.max_usos);

  if (maxUsos !== null && usos >= maxUsos) {
    throw new AppError(
      "Este cupom já atingiu o limite de usos.",
      ERROR_CODES.VALIDATION_ERROR,
      400
    );
  }

  const minimo = Number(cupom.minimo || 0);
  if (minimo > 0 && subtotal < minimo) {
    throw new AppError(
      `Este cupom exige um valor mínimo de R$ ${minimo.toFixed(2)}.`,
      ERROR_CODES.VALIDATION_ERROR,
      400
    );
  }

  const valor = Number(cupom.valor || 0);
  let desconto =
    cupom.tipo === "percentual" ? (subtotal * valor) / 100 : valor;

  if (desconto < 0) desconto = 0;
  if (desconto > subtotal) desconto = subtotal;

  return {
    desconto,
    cupomAplicado: { id: cupom.id, codigo: cupom.codigo, tipo: cupom.tipo, valor },
  };
}

// ---------------------------------------------------------------------------
// Transactional apply — DEVE ser chamada dentro de uma transação aberta
// ---------------------------------------------------------------------------

/**
 * Aplica um cupom dentro de uma transação aberta:
 *   1. Bloqueia a linha do cupom com FOR UPDATE (evita corrida de uso)
 *   2. Valida regras via validateCouponRules
 *   3. Incrementa o contador de usos
 *
 * DEVE ser chamada depois que o subtotal dos itens já foi calculado
 * (após reserveStock) e dentro da mesma transação do pedido.
 *
 * @param {object} conn         Conexão MySQL2 com transação aberta
 * @param {string} couponCode   Código do cupom (pode ter espaços — normalizado aqui)
 * @param {number} subtotal     Subtotal pré-desconto
 * @returns {{ desconto: number, cupomAplicado: object }}
 * @throws {AppError} cupom não encontrado, inativo, expirado, esgotado ou subtotal insuficiente
 */
async function applyCoupon(conn, couponCode, subtotal) {
  const codigo = String(couponCode).trim();

  const cupom = await checkoutRepo.lockCoupon(conn, codigo);

  if (!cupom) {
    throw new AppError(
      "Cupom inválido ou não encontrado.",
      ERROR_CODES.VALIDATION_ERROR,
      400
    );
  }

  const { desconto, cupomAplicado } = validateCouponRules(cupom, subtotal);

  await checkoutRepo.incrementCouponUsage(conn, cupom.id);

  return { desconto, cupomAplicado };
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = { validateCouponRules, applyCoupon };
