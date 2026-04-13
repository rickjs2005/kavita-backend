"use strict";

// services/couponService.js
//
// Única fonte de verdade para regras de negócio de cupom.
//
// Consumidores:
//   - checkoutService.create()        → applyCoupon()          (transacional, WITH lock)
//   - checkoutService.previewCoupon() → validateCouponRules()  (read-only, sem DB)
//
// Regras implementadas:
//   1. Ativo / expirado / limite global de usos / valor mínimo
//   2. Limite de uso por usuário (max_usos_por_usuario)
//   3. Restrições por categoria ou produto (cupom_restricoes)

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
 *   3. Cupom não pode ter atingido o limite global de usos
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
// Per-user usage validation — requer I/O
// ---------------------------------------------------------------------------

/**
 * Valida se o usuário já atingiu o limite individual de uso do cupom.
 * Lança AppError se excedido.
 *
 * @param {object} conn       MySQL2 connection (transação aberta)
 * @param {object} cupom      Linha da tabela cupons (com max_usos_por_usuario)
 * @param {number} userId
 */
async function validatePerUserUsage(conn, cupom, userId) {
  const maxPorUsuario =
    cupom.max_usos_por_usuario === null || cupom.max_usos_por_usuario === undefined
      ? null
      : Number(cupom.max_usos_por_usuario);

  if (maxPorUsuario === null) return; // sem limite por usuário

  const count = await checkoutRepo.countCouponUsageByUser(conn, cupom.id, userId);

  if (count >= maxPorUsuario) {
    throw new AppError(
      "Você já utilizou este cupom o número máximo de vezes permitido.",
      ERROR_CODES.VALIDATION_ERROR,
      400
    );
  }
}

// ---------------------------------------------------------------------------
// Restriction validation — requer I/O
// ---------------------------------------------------------------------------

/**
 * Valida se os produtos do carrinho são elegíveis para o cupom.
 * Cupom sem restrições (tabela cupom_restricoes vazia) aceita qualquer produto.
 *
 * @param {object} dbOrConn   MySQL2 pool ou connection
 * @param {number} couponId
 * @param {number[]} productIds  IDs dos produtos no carrinho
 * @throws {AppError} se nenhum produto do carrinho é elegível
 */
async function validateRestrictions(dbOrConn, couponId, productIds) {
  const restricoes = await checkoutRepo.getCouponRestrictions(dbOrConn, couponId);

  // Sem restrições → cupom vale para tudo
  if (!restricoes.length) return;

  const produtoIds = new Set(
    restricoes.filter((r) => r.tipo === "produto").map((r) => Number(r.target_id))
  );
  const categoriaIds = new Set(
    restricoes.filter((r) => r.tipo === "categoria").map((r) => Number(r.target_id))
  );

  // Verifica se pelo menos um produto do carrinho é elegível
  let algumElegivel = false;

  // Check por produto direto
  if (produtoIds.size > 0) {
    for (const pid of productIds) {
      if (produtoIds.has(pid)) {
        algumElegivel = true;
        break;
      }
    }
  }

  // Check por categoria
  if (!algumElegivel && categoriaIds.size > 0) {
    const catRows = await checkoutRepo.getProductCategories(dbOrConn, productIds);
    for (const row of catRows) {
      if (categoriaIds.has(Number(row.category_id))) {
        algumElegivel = true;
        break;
      }
    }
  }

  // Se só tem restrições de um tipo e o outro não foi checado, já resolveu
  if (produtoIds.size === 0 && categoriaIds.size === 0) return;

  if (!algumElegivel) {
    throw new AppError(
      "Este cupom não é válido para os produtos do seu carrinho.",
      ERROR_CODES.VALIDATION_ERROR,
      400
    );
  }
}

// ---------------------------------------------------------------------------
// Transactional apply — DEVE ser chamada dentro de uma transação aberta
// ---------------------------------------------------------------------------

/**
 * Aplica um cupom dentro de uma transação aberta:
 *   1. Bloqueia a linha do cupom com FOR UPDATE (evita corrida de uso)
 *   2. Valida regras puras via validateCouponRules
 *   3. Valida limite por usuário via validatePerUserUsage
 *   4. Valida restrições por categoria/produto via validateRestrictions
 *   5. Incrementa o contador global de usos
 *   6. Registra o uso individual em cupom_usos
 *
 * DEVE ser chamada depois que o subtotal dos itens já foi calculado
 * (após reserveStock) e dentro da mesma transação do pedido.
 *
 * @param {object} conn         Conexão MySQL2 com transação aberta
 * @param {string} couponCode   Código do cupom (pode ter espaços — normalizado aqui)
 * @param {number} subtotal     Subtotal pré-desconto
 * @param {number} userId       ID do usuário (para limite por usuário)
 * @param {number} pedidoId     ID do pedido (para registrar uso)
 * @param {number[]} productIds IDs dos produtos no carrinho
 * @returns {{ desconto: number, cupomAplicado: object }}
 * @throws {AppError} cupom não encontrado, inativo, expirado, esgotado, etc.
 */
async function applyCoupon(conn, couponCode, subtotal, userId, pedidoId, productIds) {
  const codigo = String(couponCode).trim();

  const cupom = await checkoutRepo.lockCoupon(conn, codigo);

  if (!cupom) {
    throw new AppError(
      "Cupom inválido ou não encontrado.",
      ERROR_CODES.VALIDATION_ERROR,
      400
    );
  }

  // 1. Regras puras (ativo, expirado, limite global, mínimo, cálculo)
  const { desconto, cupomAplicado } = validateCouponRules(cupom, subtotal);

  // 2. Limite por usuário
  if (userId) {
    await validatePerUserUsage(conn, cupom, userId);
  }

  // 3. Restrições por categoria/produto
  if (productIds && productIds.length > 0) {
    await validateRestrictions(conn, cupom.id, productIds);
  }

  // 4. Incrementa contador global
  await checkoutRepo.incrementCouponUsage(conn, cupom.id);

  // 5. Registra uso individual
  if (userId && pedidoId) {
    await checkoutRepo.recordCouponUsage(conn, cupom.id, userId, pedidoId);
  }

  return { desconto, cupomAplicado };
}

/**
 * Preview de cupom — valida restrições sem transação.
 * Usado em previewCoupon do checkoutService.
 *
 * @param {object} dbOrConn   MySQL2 pool
 * @param {object} cupom      Linha da tabela cupons
 * @param {number} subtotal   Subtotal calculado
 * @param {number[]} productIds  IDs dos produtos no carrinho
 * @param {number|null} userId   ID do usuário (opcional no preview)
 * @returns {{ desconto: number, cupomAplicado: object }}
 */
async function previewCoupon(dbOrConn, cupom, subtotal, productIds, userId) {
  // 1. Regras puras
  const result = validateCouponRules(cupom, subtotal);

  // 2. Restrições por categoria/produto
  if (productIds && productIds.length > 0) {
    await validateRestrictions(dbOrConn, cupom.id, productIds);
  }

  // 3. Limite por usuário (read-only, sem lock)
  if (userId) {
    const maxPorUsuario =
      cupom.max_usos_por_usuario === null || cupom.max_usos_por_usuario === undefined
        ? null
        : Number(cupom.max_usos_por_usuario);

    if (maxPorUsuario !== null) {
      const count = await checkoutRepo.countCouponUsageByUser(dbOrConn, cupom.id, userId);
      if (count >= maxPorUsuario) {
        throw new AppError(
          "Você já utilizou este cupom o número máximo de vezes permitido.",
          ERROR_CODES.VALIDATION_ERROR,
          400
        );
      }
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = { validateCouponRules, applyCoupon, previewCoupon, validateRestrictions };
