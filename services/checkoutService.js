"use strict";

const pool = require("../config/pool");
const { dispararEventoComunicacao } = require("./comunicacaoService");
const AppError = require("../errors/AppError");
const ERROR_CODES = require("../constants/ErrorCodes");

// ---------------------------------------------------------------------------
// Stock operations — exported for future use by orderService and
// paymentRepository (Phase 5 / Phase 6).
// Callers are responsible for guards (e.g., checking order status before
// calling restoreStock to prevent double-restore).
// ---------------------------------------------------------------------------

/**
 * Inserts order items and debits stock for each product.
 * MUST be called inside an open transaction on `conn`.
 *
 * @param {object} conn          MySQL2 connection (inside a transaction)
 * @param {number} pedidoId
 * @param {Array<{ id: number, quantidade: number }>} produtos
 * @param {object} mapProdutos   { [productId]: { price, stock } } — from FOR UPDATE lock
 * @param {object} mapPromocoes  { [productId]: finalPrice } — from active promotions
 * @returns {{ total: number }} Sum of (valor_unitario * quantidade) for all items
 */
async function reserveStock(conn, pedidoId, produtos, mapProdutos, mapPromocoes) {
  let total = 0;

  for (const item of produtos) {
    const produtoId = Number(item.id);
    const qtd = Number(item.quantidade || 0);

    if (!produtoId || !Number.isFinite(qtd) || qtd <= 0) {
      throw new AppError(
        "Produto inválido no checkout.",
        ERROR_CODES.VALIDATION_ERROR,
        400
      );
    }

    const info = mapProdutos[produtoId];
    if (!info) {
      throw new AppError(
        `Produto ${produtoId} não encontrado.`,
        ERROR_CODES.NOT_FOUND,
        404
      );
    }

    if (info.stock < qtd) {
      throw new AppError(
        `Estoque insuficiente para o produto ${produtoId}.`,
        ERROR_CODES.VALIDATION_ERROR,
        400
      );
    }

    // Promotion price takes precedence; fall back to list price.
    const valorUnitario = mapPromocoes[produtoId] ?? info.price;

    await conn.query(
      `INSERT INTO pedidos_produtos (pedido_id, produto_id, quantidade, valor_unitario)
       VALUES (?, ?, ?, ?)`,
      [pedidoId, produtoId, qtd, valorUnitario]
    );

    await conn.query(
      "UPDATE products SET quantity = quantity - ? WHERE id = ?",
      [qtd, produtoId]
    );

    total += valorUnitario * qtd;
  }

  return { total };
}

/**
 * Restores stock for all items of a cancelled or failed order.
 *
 * Pass a connection object when called inside a transaction, or pass `pool`
 * for a standalone (auto-committed) update.
 *
 * Callers MUST apply the idempotency guard before calling this function:
 *   - adminPedidos guard: status_entrega <> 'cancelado' AND status_pagamento <> 'falhou'
 *   - paymentRepository guard: status_pagamento <> 'falhou'
 * The guard prevents double-restore when both webhook and admin cancel fire.
 *
 * @param {object} connOrPool  MySQL2 connection (in transaction) or pool (standalone)
 * @param {number} pedidoId
 */
async function restoreStock(connOrPool, pedidoId) {
  await connOrPool.query(
    `UPDATE products p
        JOIN pedidos_produtos pp ON pp.produto_id = p.id
        SET p.quantity = p.quantity + pp.quantidade
      WHERE pp.pedido_id = ?`,
    [pedidoId]
  );
}

// ---------------------------------------------------------------------------
// Main checkout operation
// ---------------------------------------------------------------------------

/**
 * Creates an order for an authenticated user.
 *
 * Handles: advisory lock (idempotency), product composition deduplication,
 * user info update, stock validation + debit (reserveStock), coupon
 * application, shipping persistence, abandoned-cart recovery, cart closure,
 * and post-commit communication event.
 *
 * @param {number} userId
 * @param {object} body  Validated checkout payload (from req.body, after
 *                       validateCheckoutBody + recalcShippingMiddleware).
 *                       Expected fields:
 *                         formaPagamento, endereco, produtos,
 *                         nome?, cpf?, telefone?,
 *                         cupom_codigo?,
 *                         shipping_price, shipping_rule_applied,
 *                         shipping_prazo_dias, shipping_cep
 *
 * @returns {object}
 *   Duplicate:  { idempotente: true,  pedido_id }
 *   New order:  { idempotente: false, pedido_id, total, total_sem_desconto,
 *                 desconto_total, cupom_aplicado }
 */
async function create(userId, body) {
  const {
    formaPagamento,
    endereco,
    produtos,
    nome,
    cpf,
    telefone,
    cupom_codigo,
    shipping_price,
    shipping_rule_applied,
    shipping_prazo_dias,
    shipping_cep,
  } = body;

  let connection;
  let lockAcquired = false;
  const lockName = `kavita_checkout_${userId}`;

  try {
    connection = await pool.getConnection();

    /* 0) Advisory lock — serializes concurrent checkouts from the same user.
     *    GET_LOCK is a MySQL global advisory lock by name.
     *    Timeout: 5 s. Returns 409 if another transaction from the same user
     *    holds the lock for more than 5 s (extreme latency, not the normal case).
     *    RELEASE_LOCK must be called BEFORE connection.release() — see finally block. */
    const [[lockRow]] = await connection.query(
      "SELECT GET_LOCK(?, 5) AS ok",
      [lockName]
    );
    lockAcquired = lockRow?.ok === 1;

    if (!lockAcquired) {
      throw new AppError(
        "Outro checkout está em andamento para esta conta. Aguarde alguns segundos e tente novamente.",
        ERROR_CODES.VALIDATION_ERROR,
        409
      );
    }

    await connection.beginTransaction();

    /* 1) Update user info — non-blocking (does not abort the order on failure) */
    try {
      const campos = [];
      const valores = [];

      if (nome && String(nome).trim()) {
        campos.push("nome = ?");
        valores.push(String(nome).trim());
      }

      if (telefone && String(telefone).trim()) {
        const telDigits = String(telefone).replace(/\D/g, "");
        if (telDigits) {
          campos.push("telefone = ?");
          valores.push(telDigits);
        }
      }

      if (cpf && String(cpf).trim()) {
        const cpfDigits = String(cpf).replace(/\D/g, "");
        if (cpfDigits) {
          campos.push("cpf = ?");
          valores.push(cpfDigits);
        }
      }

      if (campos.length > 0) {
        await connection.query(
          `UPDATE usuarios SET ${campos.join(", ")} WHERE id = ?`,
          [...valores, userId]
        );
      }
    } catch (err) {
      console.error("[checkoutService] Erro ao atualizar dados do usuário:", err);
    }

    /* 2) Find open cart — non-blocking (used later to mark abandoned cart recovered) */
    let carrinhoAberto = null;
    try {
      const [rowsCarrinho] = await connection.query(
        `SELECT id
           FROM carrinhos
          WHERE usuario_id = ? AND status = "aberto"
          ORDER BY id DESC
          LIMIT 1`,
        [userId]
      );
      if (rowsCarrinho && rowsCarrinho.length > 0) {
        carrinhoAberto = rowsCarrinho[0];
      }
    } catch (err) {
      console.error("[checkoutService] Erro ao buscar carrinho aberto:", err);
    }

    /* 2.5) Deduplication by product composition + coupon.
     *
     *  Fingerprint: sorted "id:qty" pairs joined by comma, plus normalized coupon code.
     *  Same products + different coupon = NOT a duplicate (intentional re-submit).
     *  Window: 2 min — covers high latency, double-click, and auto-retry.
     *  GET_LOCK (step 0) ensures only one transaction from this user reaches here
     *  at a time, so the SELECT reads the already-committed state of the previous
     *  transaction — no race condition.                                           */
    const cupomNorm = cupom_codigo
      ? String(cupom_codigo).trim().toUpperCase()
      : null;

    const sortedProds = [...produtos]
      .map((p) => `${Number(p.id)}:${Number(p.quantidade || 0)}`)
      .sort()
      .join(",");

    const [recentOrders] = await connection.query(
      `SELECT pp.pedido_id,
              GROUP_CONCAT(
                CONCAT(pp.produto_id, ':', pp.quantidade)
                ORDER BY pp.produto_id SEPARATOR ','
              ) AS composicao,
              p.cupom_codigo AS cupom
         FROM pedidos_produtos pp
         JOIN pedidos p ON p.id = pp.pedido_id
        WHERE p.usuario_id       = ?
          AND p.status           = 'pendente'
          AND p.status_pagamento = 'pendente'
          AND p.data_pedido      >= NOW() - INTERVAL 2 MINUTE
        GROUP BY pp.pedido_id, p.cupom_codigo`,
      [userId]
    );

    const pedidoDuplicado = recentOrders.find(
      (row) =>
        row.composicao === sortedProds &&
        (row.cupom ?? null) === cupomNorm
    );

    if (pedidoDuplicado) {
      await connection.rollback();
      return { idempotente: true, pedido_id: pedidoDuplicado.pedido_id };
    }

    /* 3) Create order record with status = 'pendente' */
    const enderecoStr = JSON.stringify(endereco || {});

    const [pedidoIns] = await connection.query(
      `INSERT INTO pedidos (
         usuario_id, endereco, forma_pagamento,
         status, status_pagamento, status_entrega,
         total, data_pedido, pagamento_id, cupom_codigo
       ) VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), ?, ?)`,
      [
        userId,
        enderecoStr,
        formaPagamento,
        "pendente",
        "pendente",
        "em_separacao",
        0,
        null,
        cupomNorm,
      ]
    );

    const pedidoId = pedidoIns.insertId;

    /* 4) Lock product rows (stock + price) and fetch active promotions.
     *
     *  Pricing rule:
     *    products.price         = list price (never changed by promotions)
     *    product_promotions.final_price = effective price when a promotion is active
     *    Coupon applies on the post-promotion subtotal.
     *    Same formula used in publicPromocoes.js and preview-cupom.          */
    const ids = produtos.map((p) => Number(p.id));

    const [prodRows] = await connection.query(
      "SELECT id, price, quantity FROM products WHERE id IN (?) FOR UPDATE",
      [ids]
    );

    const mapProdutos = {};
    prodRows.forEach((row) => {
      mapProdutos[Number(row.id)] = {
        price: Number(row.price),
        stock: Number(row.quantity),
      };
    });

    const [promoRows] = await connection.query(
      `SELECT
         pp.product_id,
         CAST(
           CASE
             WHEN pp.promo_price IS NOT NULL
               THEN pp.promo_price
             WHEN pp.discount_percent IS NOT NULL
               THEN p.price - (p.price * (pp.discount_percent / 100))
             ELSE p.price
           END
         AS DECIMAL(10,2)) AS final_price
       FROM product_promotions pp
       JOIN products p ON p.id = pp.product_id
       WHERE pp.product_id IN (?)
         AND pp.is_active = 1
         AND (pp.start_at IS NULL OR pp.start_at <= NOW())
         AND (pp.end_at   IS NULL OR pp.end_at   >= NOW())`,
      [ids]
    );

    const mapPromocoes = {};
    promoRows.forEach((row) => {
      mapPromocoes[Number(row.product_id)] = Number(row.final_price);
    });

    /* 5) Insert order items + debit stock (atomic within this transaction) */
    const { total: totalPedido } = await reserveStock(
      connection,
      pedidoId,
      produtos,
      mapProdutos,
      mapPromocoes
    );

    /* 6) Apply coupon (optional) */
    let totalFinal = totalPedido;
    let descontoTotal = 0;
    let cupomAplicado = null;

    if (cupom_codigo && String(cupom_codigo).trim()) {
      const codigo = String(cupom_codigo).trim();

      try {
        const [rowsCupom] = await connection.query(
          `SELECT id, codigo, tipo, valor, minimo, expiracao, usos, max_usos, ativo
             FROM cupons
            WHERE codigo = ?
            LIMIT 1
            FOR UPDATE`,
          [codigo]
        );

        if (!rowsCupom || rowsCupom.length === 0) {
          throw new AppError(
            "Cupom inválido ou não encontrado.",
            ERROR_CODES.VALIDATION_ERROR,
            400
          );
        }

        const cupom = rowsCupom[0];

        if (!cupom.ativo) {
          throw new AppError(
            "Este cupom está inativo.",
            ERROR_CODES.VALIDATION_ERROR,
            400
          );
        }

        if (cupom.expiracao) {
          const exp = new Date(cupom.expiracao);
          if (exp.getTime() < Date.now()) {
            throw new AppError(
              "Este cupom está expirado.",
              ERROR_CODES.VALIDATION_ERROR,
              400
            );
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
        if (minimo > 0 && totalPedido < minimo) {
          throw new AppError(
            `Este cupom exige um valor mínimo de R$ ${minimo.toFixed(2)}.`,
            ERROR_CODES.VALIDATION_ERROR,
            400
          );
        }

        const valor = Number(cupom.valor || 0);
        let desconto =
          cupom.tipo === "percentual"
            ? (totalPedido * valor) / 100
            : valor;

        if (desconto < 0) desconto = 0;
        if (desconto > totalPedido) desconto = totalPedido;

        descontoTotal = desconto;
        totalFinal = totalPedido - descontoTotal;
        cupomAplicado = {
          id: cupom.id,
          codigo: cupom.codigo,
          tipo: cupom.tipo,
          valor,
        };

        await connection.query(
          "UPDATE cupons SET usos = usos + 1 WHERE id = ?",
          [cupom.id]
        );
      } catch (errCupom) {
        if (errCupom instanceof AppError) throw errCupom;
        console.error("[checkoutService] Erro ao aplicar cupom:", errCupom);
        throw new AppError(
          "Erro ao aplicar o cupom de desconto.",
          ERROR_CODES.SERVER_ERROR,
          500
        );
      }
    }

    /* 7) Persist final total */
    await connection.query(
      "UPDATE pedidos SET total = ? WHERE id = ?",
      [totalFinal, pedidoId]
    );

    /* 7.1) Persist shipping data inside the transaction.
     *  Values were injected into req.body by recalcShippingMiddleware.
     *  The controller passes them through as part of `body`. */
    await connection.query(
      `UPDATE pedidos
          SET shipping_price        = ?,
              shipping_rule_applied = ?,
              shipping_prazo_dias   = ?,
              shipping_cep          = ?
        WHERE id = ?`,
      [
        Number(shipping_price ?? 0),
        String(shipping_rule_applied ?? "ZONE"),
        shipping_prazo_dias == null ? null : Number(shipping_prazo_dias),
        shipping_cep == null ? null : String(shipping_cep),
        pedidoId,
      ]
    );

    /* 8) Mark abandoned cart as recovered — non-blocking */
    try {
      if (carrinhoAberto?.id) {
        await connection.query(
          `UPDATE carrinhos_abandonados
              SET recuperado    = 1,
                  atualizado_em = NOW()
            WHERE carrinho_id = ?`,
          [carrinhoAberto.id]
        );
      }
    } catch (err) {
      console.error(
        "[checkoutService] Erro ao marcar carrinho como recuperado:",
        err
      );
    }

    /* 9) Commit */
    await connection.commit();

    /* 9.1) Communication event — non-blocking, runs after commit */
    try {
      await dispararEventoComunicacao("pedido_criado", pedidoId);
    } catch (errCom) {
      console.error("[checkoutService] Erro ao disparar comunicação:", errCom);
    }

    /* 10) Close open cart — non-blocking, outside transaction.
     *  A crash here leaves the cart as "aberto" but the order exists — acceptable,
     *  does not affect inventory or order integrity. */
    try {
      await pool.query(
        'UPDATE carrinhos SET status = "convertido" WHERE usuario_id = ? AND status = "aberto"',
        [userId]
      );
    } catch (err) {
      console.error("[checkoutService] Erro ao fechar carrinho:", err);
    }

    return {
      idempotente: false,
      pedido_id: pedidoId,
      total: totalFinal,
      total_sem_desconto: totalPedido,
      desconto_total: descontoTotal,
      cupom_aplicado: cupomAplicado,
    };
  } catch (err) {
    if (connection) {
      try {
        await connection.rollback();
      } catch (rb) {
        console.error("[checkoutService] Erro ao dar rollback:", rb);
      }
    }
    throw err;
  } finally {
    if (connection) {
      // RELEASE_LOCK must be called BEFORE connection.release() to avoid leaking
      // the advisory lock back to the pool (MySQL advisory locks are per-connection;
      // connection.release() does NOT release them).
      if (lockAcquired) {
        await connection
          .query("SELECT RELEASE_LOCK(?)", [lockName])
          .catch(() => {});
      }
      connection.release();
    }
  }
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = { create, reserveStock, restoreStock };
