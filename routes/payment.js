// routes/payment.js
"use strict";

const express = require("express");
const router = express.Router();
const pool = require("../config/pool");

// 👉 SDK Mercado Pago (v2)
const { MercadoPagoConfig, Preference, Payment } = require("mercadopago");

const AppError = require("../errors/AppError");
const ERROR_CODES = require("../constants/ErrorCodes");

// ✅ ACL (Broken Access Control fix)
const authenticateToken = require("../middleware/authenticateToken");
const verifyAdmin = require("../middleware/verifyAdmin"); // ✅ sem fallback: falhar cedo se estiver faltando
const validateMPSignature = require("../middleware/validateMPSignature"); // ✅ Layer 1: webhook signature
const { validateCSRF } = require("../middleware/csrfProtection"); // ✅ protege /start contra CSRF

// Configuração do cliente do Mercado Pago
const mpClient = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN,
});

// =====================================================
// Util: lê o total persistido do pedido (já com desconto de cupom + frete).
// Não recalcula a partir dos itens para evitar divergência com o valor
// mostrado ao usuário no checkout (que já incluía cupom e frete).
// =====================================================
async function getTotalPedido(conn, pedidoId) {
  const [[row]] = await conn.query(
    `SELECT (total + COALESCE(shipping_price, 0)) AS total_final
       FROM pedidos
      WHERE id = ?`,
    [pedidoId]
  );

  return Number((row?.total_final || 0).toFixed(2));
}

// =====================================================
// Normalizador de forma de pagamento (robusto)
// Aceita code OU label (pix, boleto, cartao_mp, prazo)
// E também labels bonitas como "Cartão (Mercado Pago)"
// =====================================================
function normalizeFormaPagamento(raw) {
  const s = String(raw || "").trim().toLowerCase();
  const noAccents = s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  // Codes estáveis (preferidos)
  if (noAccents === "pix") return "pix";
  if (noAccents === "boleto") return "boleto";
  if (noAccents === "prazo") return "prazo";
  if (noAccents === "cartao_mp" || noAccents === "cartao-mp") return "cartao"; // mp -> cartao

  // Compat: textos / variações
  if (noAccents.includes("pix") || noAccents.includes("bank_transfer")) return "pix";
  if (noAccents.includes("boleto") || noAccents.includes("ticket")) return "boleto";
  if (noAccents.includes("prazo")) return "prazo";

  if (
    noAccents.includes("cartao") ||
    noAccents.includes("credito") ||
    noAccents.includes("mercadopago") ||
    noAccents === "mercadopago"
  ) {
    return "cartao";
  }

  return "";
}

// =====================================================
// Helper: monta o body da Preference do Mercado Pago
// =====================================================
function buildPreferenceBody({ total, pedidoId, formaPagamento }) {
  const appUrl = process.env.APP_URL;
  const backendUrl = process.env.BACKEND_URL;

  const tipo = normalizeFormaPagamento(formaPagamento);

  const body = {
    items: [
      {
        id: `pedido-${pedidoId}`,
        title: `Pedido #${pedidoId}`,
        quantity: 1,
        unit_price: total,
        currency_id: "BRL",
      },
    ],
    back_urls: {
      success: `${appUrl}/checkout/sucesso?pedidoId=${pedidoId}`,
      pending: `${appUrl}/checkout/pendente?pedidoId=${pedidoId}`,
      failure: `${appUrl}/checkout/erro?pedidoId=${pedidoId}`,
    },
    metadata: { pedidoId },
  };

  // Filtra a experiência do MP conforme método escolhido
  if (tipo === "pix") {
    body.payment_methods = {
      excluded_payment_types: [
        { id: "credit_card" },
        { id: "debit_card" },
        { id: "ticket" }, // boleto
      ],
    };
  } else if (tipo === "boleto") {
    body.payment_methods = {
      excluded_payment_types: [
        { id: "credit_card" },
        { id: "debit_card" },
        { id: "bank_transfer" }, // pix
      ],
    };
  } else if (tipo === "cartao") {
    body.payment_methods = {
      excluded_payment_types: [
        { id: "bank_transfer" }, // pix
        { id: "ticket" }, // boleto
      ],
    };
  }

  if (process.env.NODE_ENV === "production") {
    body.auto_return = "approved";
    if (backendUrl) {
      body.notification_url = `${backendUrl}/api/payment/webhook`;
    }
  }

  return body;
}

/* ------------------------------------------------------------------ */
/*                               Swagger                              */
/* ------------------------------------------------------------------ */

/**
 * @openapi
 * tags:
 *   - name: Pagamentos
 *     description: Integração Mercado Pago + métodos de pagamento
 *
 * components:
 *   schemas:
 *     ApiError:
 *       type: object
 *       properties:
 *         code:
 *           type: string
 *           example: VALIDATION_ERROR
 *         message:
 *           type: string
 *           example: "pedidoId é obrigatório."
 *     PaymentMethod:
 *       type: object
 *       properties:
 *         id: { type: integer, example: 1 }
 *         code: { type: string, example: "pix" }
 *         label: { type: string, example: "Pix" }
 *         description: { type: string, nullable: true, example: "Pagamento instantâneo via Pix." }
 *         is_active: { type: integer, example: 1 }
 *         sort_order: { type: integer, example: 10 }
 *         created_at: { type: string, example: "2026-01-09 10:00:00" }
 *         updated_at: { type: string, nullable: true, example: "2026-01-09 10:05:00" }
 */

/**
 * @openapi
 * /api/payment/methods:
 *   get:
 *     tags: [Pagamentos]
 *     summary: Lista métodos de pagamento ativos (para o checkout)
 *     responses:
 *       200:
 *         description: Lista de métodos ativos ordenados por sort_order
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 methods:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/PaymentMethod'
 */

/**
 * @openapi
 * /api/payment/admin/payment-methods:
 *   get:
 *     tags: [Pagamentos]
 *     summary: (Admin) Lista todos os métodos (ativos e inativos)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lista completa ordenada por sort_order
 *
 *   post:
 *     tags: [Pagamentos]
 *     summary: (Admin) Cria um método de pagamento
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       201:
 *         description: Criado
 *
 * /api/payment/admin/payment-methods/{id}:
 *   put:
 *     tags: [Pagamentos]
 *     summary: (Admin) Atualiza um método
 *     security:
 *       - bearerAuth: []
 *   delete:
 *     tags: [Pagamentos]
 *     summary: (Admin) Desativa (soft delete) um método
 *     security:
 *       - bearerAuth: []
 */

/**
 * @openapi
 * /api/payment/start:
 *   post:
 *     tags: [Pagamentos]
 *     summary: Inicia o fluxo de pagamento via Mercado Pago
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [pedidoId]
 *             properties:
 *               pedidoId: { type: integer, example: 123 }
 *     responses:
 *       200:
 *         description: Retorna dados da preferência de pagamento
 *       400:
 *         description: Campo pedidoId ausente/inválido ou forma_pagamento incompatível com MP
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ApiError' }
 *       404:
 *         description: Pedido não encontrado
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ApiError' }
 *       500:
 *         description: Erro ao iniciar pagamento
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ApiError' }
 */

/* ------------------------------------------------------------------ */
/*                      PUBLIC: LIST METHODS (checkout)                 */
/* ------------------------------------------------------------------ */

router.get("/methods", async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    const [rows] = await conn.query(
      `SELECT id, code, label, description, is_active, sort_order, created_at, updated_at
         FROM payment_methods
        WHERE is_active = 1
        ORDER BY sort_order ASC, id ASC`
    );
    return res.json({ methods: rows });
  } catch (err) {
    return next(
      err instanceof AppError
        ? err
        : new AppError("Erro ao listar métodos de pagamento.", ERROR_CODES.SERVER_ERROR, 500)
    );
  } finally {
    conn.release();
  }
});

/* ------------------------------------------------------------------ */
/*                    ADMIN: CRUD PAYMENT METHODS                       */
/*  ✅ FIX: Broken Access Control (exige auth + role admin)             */
/*  Obs: como o router é montado em /api/payment no index.js,           */
/*       o caminho final fica /api/payment/admin/payment-methods        */
/* ------------------------------------------------------------------ */

router.get("/admin/payment-methods", authenticateToken, verifyAdmin, async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    const [rows] = await conn.query(
      `SELECT id, code, label, description, is_active, sort_order, created_at, updated_at
         FROM payment_methods
        ORDER BY sort_order ASC, id ASC`
    );
    return res.json({ methods: rows });
  } catch (err) {
    return next(
      err instanceof AppError
        ? err
        : new AppError(
            "Erro ao listar métodos de pagamento (admin).",
            ERROR_CODES.SERVER_ERROR,
            500
          )
    );
  } finally {
    conn.release();
  }
});

router.post("/admin/payment-methods", authenticateToken, verifyAdmin, async (req, res, next) => {
  const { code, label, description = null, is_active = 1, sort_order = 0 } = req.body || {};

  const codeStr = String(code || "").trim();
  const labelStr = String(label || "").trim();

  if (!codeStr || !labelStr) {
    return next(
      new AppError("code e label são obrigatórios.", ERROR_CODES.VALIDATION_ERROR, 400)
    );
  }

  const conn = await pool.getConnection();
  try {
    const [result] = await conn.query(
      `INSERT INTO payment_methods (code, label, description, is_active, sort_order, created_at)
       VALUES (?, ?, ?, ?, ?, NOW())`,
      [codeStr, labelStr, description, Number(is_active) ? 1 : 0, Number(sort_order) || 0]
    );

    const [[created]] = await conn.query(
      `SELECT id, code, label, description, is_active, sort_order, created_at, updated_at
         FROM payment_methods
        WHERE id = ?`,
      [result.insertId]
    );

    return res.status(201).json({ method: created });
  } catch (err) {
    if (err && String(err.code || "").toLowerCase().includes("er_dup")) {
      return next(
        new AppError("Já existe um método com esse code.", ERROR_CODES.VALIDATION_ERROR, 400)
      );
    }

    return next(
      err instanceof AppError
        ? err
        : new AppError("Erro ao criar método de pagamento.", ERROR_CODES.SERVER_ERROR, 500)
    );
  } finally {
    conn.release();
  }
});

router.put("/admin/payment-methods/:id", authenticateToken, verifyAdmin, async (req, res, next) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id <= 0) {
    return next(new AppError("id inválido.", ERROR_CODES.VALIDATION_ERROR, 400));
  }

  const { code, label, description, is_active, sort_order } = req.body || {};

  const fields = [];
  const values = [];

  if (code !== undefined) {
    const codeStr = String(code || "").trim();
    if (!codeStr) {
      return next(new AppError("code não pode ser vazio.", ERROR_CODES.VALIDATION_ERROR, 400));
    }
    fields.push("code = ?");
    values.push(codeStr);
  }

  if (label !== undefined) {
    const labelStr = String(label || "").trim();
    if (!labelStr) {
      return next(new AppError("label não pode ser vazio.", ERROR_CODES.VALIDATION_ERROR, 400));
    }
    fields.push("label = ?");
    values.push(labelStr);
  }

  if (description !== undefined) {
    fields.push("description = ?");
    values.push(description === "" ? null : description);
  }

  if (is_active !== undefined) {
    fields.push("is_active = ?");
    values.push(Number(is_active) ? 1 : 0);
  }

  if (sort_order !== undefined) {
    fields.push("sort_order = ?");
    values.push(Number(sort_order) || 0);
  }

  if (fields.length === 0) {
    return next(
      new AppError("Nenhum campo para atualizar.", ERROR_CODES.VALIDATION_ERROR, 400)
    );
  }

  const conn = await pool.getConnection();
  try {
    const [[exists]] = await conn.query("SELECT id FROM payment_methods WHERE id = ?", [id]);

    if (!exists) {
      return next(new AppError("Método não encontrado.", ERROR_CODES.NOT_FOUND, 404));
    }

    await conn.query(
      `UPDATE payment_methods
          SET ${fields.join(", ")}, updated_at = NOW()
        WHERE id = ?`,
      [...values, id]
    );

    const [[updated]] = await conn.query(
      `SELECT id, code, label, description, is_active, sort_order, created_at, updated_at
         FROM payment_methods
        WHERE id = ?`,
      [id]
    );

    return res.json({ method: updated });
  } catch (err) {
    if (err && String(err.code || "").toLowerCase().includes("er_dup")) {
      return next(
        new AppError("Já existe um método com esse code.", ERROR_CODES.VALIDATION_ERROR, 400)
      );
    }

    return next(
      err instanceof AppError
        ? err
        : new AppError("Erro ao atualizar método de pagamento.", ERROR_CODES.SERVER_ERROR, 500)
    );
  } finally {
    conn.release();
  }
});

router.delete(
  "/admin/payment-methods/:id",
  authenticateToken,
  verifyAdmin,
  async (req, res, next) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      return next(new AppError("id inválido.", ERROR_CODES.VALIDATION_ERROR, 400));
    }

    const conn = await pool.getConnection();
    try {
      const [[exists]] = await conn.query("SELECT id FROM payment_methods WHERE id = ?", [id]);

      if (!exists) {
        return next(new AppError("Método não encontrado.", ERROR_CODES.NOT_FOUND, 404));
      }

      // Soft delete: desativa
      await conn.query(
        `UPDATE payment_methods
            SET is_active = 0, updated_at = NOW()
          WHERE id = ?`,
        [id]
      );

      return res.json({ ok: true });
    } catch (err) {
      return next(
        err instanceof AppError
          ? err
          : new AppError(
              "Erro ao desativar método de pagamento.",
              ERROR_CODES.SERVER_ERROR,
              500
            )
      );
    } finally {
      conn.release();
    }
  }
);

/* ------------------------------------------------------------------ */
/*                          MERCADO PAGO FLOW                           */
/* ------------------------------------------------------------------ */

// inicia pagamento para um pedido existente
// ✅ FIX: requer autenticação + ownership check (Broken Access Control)
router.post("/start", authenticateToken, validateCSRF, async (req, res, next) => {
  const { pedidoId } = req.body || {};
  const pedidoIdNum = Number(pedidoId);

  if (!Number.isFinite(pedidoIdNum) || pedidoIdNum <= 0) {
    return next(new AppError("pedidoId é obrigatório.", ERROR_CODES.VALIDATION_ERROR, 400));
  }

  const conn = await pool.getConnection();
  try {
    const [[pedido]] = await conn.query(
      `SELECT id, forma_pagamento, usuario_id, status_pagamento
         FROM pedidos
        WHERE id = ?`,
      [pedidoIdNum]
    );

    // ✅ FIX: ownership check — o pedido deve pertencer ao usuário autenticado
    if (pedido && pedido.usuario_id !== req.user.id) {
      return next(new AppError("Pedido não encontrado.", ERROR_CODES.NOT_FOUND, 404));
    }

    if (!pedido) {
      return next(new AppError("Pedido não encontrado.", ERROR_CODES.NOT_FOUND, 404));
    }

    // Apenas pedidos em estado elegível aceitam nova tentativa de pagamento.
    // 'pendente' = criado mas pagamento ainda não iniciado (ou gateway ainda processando).
    // 'falhou'   = pagamento rejeitado/cancelado — retry é a ação esperada.
    // 'pago' / 'estornado' = estados finais — retry seria cobrança indevida.
    const statusElegiveis = ["pendente", "falhou"];
    if (!statusElegiveis.includes(pedido.status_pagamento)) {
      return next(
        new AppError(
          "Este pedido não pode ser pago novamente.",
          ERROR_CODES.VALIDATION_ERROR,
          409
        )
      );
    }

    const formaPagamentoRaw = pedido.forma_pagamento || "";
    const formaPagamentoNorm = normalizeFormaPagamento(formaPagamentoRaw);

    // "Prazo" NÃO é Mercado Pago
    if (formaPagamentoNorm === "prazo") {
      return next(
        new AppError(
          "Forma de pagamento 'Prazo' não é processada pelo Mercado Pago.",
          ERROR_CODES.VALIDATION_ERROR,
          400
        )
      );
    }

    if (!formaPagamentoNorm) {
      return next(
        new AppError(
          "Forma de pagamento inválida/indefinida para Mercado Pago.",
          ERROR_CODES.VALIDATION_ERROR,
          400
        )
      );
    }

    const total = await getTotalPedido(conn, pedidoIdNum);

    if (total <= 0) {
      return next(
        new AppError(
          "Não foi possível iniciar o pagamento: valor final do pedido inválido.",
          ERROR_CODES.VALIDATION_ERROR,
          400
        )
      );
    }

    const preference = new Preference(mpClient);
    const body = buildPreferenceBody({
      total,
      pedidoId: pedidoIdNum,
      formaPagamento: formaPagamentoRaw,
    });

    const pref = await preference.create({ body });

    await conn.query(
      `UPDATE pedidos
          SET status_pagamento = 'pendente', status = 'pendente'
        WHERE id = ?`,
      [pedidoIdNum]
    );

    const { id, init_point, sandbox_init_point } = pref;

    return res.json({
      preferenceId: id,
      init_point,
      sandbox_init_point,
    });
  } catch (err) {
    console.error("[payment/start] erro bruto:", err);
    if (err?.message || err?.status || err?.error) {
      console.error("[payment/start] detalhes:", {
        message: err.message,
        error: err.error,
        status: err.status,
        cause: err.cause ?? null,
      });
    }

    return next(
      err instanceof AppError
        ? err
        : new AppError(
            "Erro ao iniciar pagamento com o Mercado Pago.",
            ERROR_CODES.SERVER_ERROR,
            500
          )
    );
  } finally {
    conn.release();
  }
});

// webhook Mercado Pago
router.post("/webhook", validateMPSignature, async (req, res) => {
  const signatureHeader = req.get("x-signature");

  try {
    const { type, data } = req.body || {};
    const payload = JSON.stringify(req.body || {});

    // Use the MP notification ID (top-level `id`) as the unique event identifier
    const eventId = String(req.body?.id ?? "");

    if (!eventId) {
      console.warn("[payment/webhook] payload sem id de notificação");
      return res.status(200).json({ ok: true });
    }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      // Layer 3: idempotency — UNIQUE(event_id) + FOR UPDATE prevents race conditions
      const [[existingEvent]] = await conn.query(
        `SELECT id, status, processed_at
           FROM webhook_events
          WHERE event_id = ?
          FOR UPDATE`,
        [eventId]
      );

      let dbEventId = existingEvent?.id;

      if (!existingEvent) {
        const [insertResult] = await conn.query(
          `INSERT INTO webhook_events (event_id, signature, event_type, payload, status, created_at)
           VALUES (?, ?, ?, ?, 'received', NOW())`,
          [eventId, signatureHeader, type || null, payload]
        );
        dbEventId = insertResult.insertId;
      } else if (existingEvent.processed_at) {
        await conn.commit();
        return res.status(200).json({ ok: true, idempotent: true });
      } else {
        dbEventId = existingEvent.id;
        await conn.query(
          `UPDATE webhook_events
              SET signature = ?, event_type = ?, payload = ?, status = 'received', updated_at = NOW()
            WHERE id = ?`,
          [signatureHeader, type || null, payload, dbEventId]
        );
      }

      if (type !== "payment" || !data?.id) {
        await conn.query(
          `UPDATE webhook_events
              SET status = 'ignored', processed_at = NOW(), updated_at = NOW()
            WHERE id = ?`,
          [dbEventId]
        );
        await conn.commit();
        return res.status(200).json({ ok: true });
      }

      // Layer 2: consult the REAL payment status from Mercado Pago API
      const paymentClient = new Payment(mpClient);
      const payment = await paymentClient.get({ id: data.id });

      const status = payment.status;
      const pedidoId = payment.metadata?.pedidoId;

      if (!pedidoId) {
        console.warn("[payment/webhook] pagamento sem metadata.pedidoId", data.id);
        await conn.query(
          `UPDATE webhook_events
              SET status = 'ignored', processed_at = NOW(), updated_at = NOW()
            WHERE id = ?`,
          [dbEventId]
        );
        await conn.commit();
        return res.status(200).json({ ok: true });
      }

      let novoStatusPagamento = "pendente";
      if (status === "approved") novoStatusPagamento = "pago";
      else if (status === "rejected" || status === "cancelled") novoStatusPagamento = "falhou";
      else if (status === "in_process" || status === "pending") novoStatusPagamento = "pendente";
      else if (status === "charged_back" || status === "refunded") novoStatusPagamento = "estornado";

      // Restaura estoque se pagamento falhou.
      // Executado ANTES de atualizar status_pagamento para que a guarda de
      // idempotência funcione: se o mesmo pedido já está 'falhou' (webhook
      // duplicado com event_id diferente), o UPDATE não toca os produtos.
      if (novoStatusPagamento === "falhou") {
        await conn.query(
          `UPDATE products p
              JOIN pedidos_produtos pp ON pp.produto_id = p.id
              JOIN pedidos ped         ON ped.id        = pp.pedido_id
             SET p.quantity = p.quantity + pp.quantidade
           WHERE pp.pedido_id = ?
             AND ped.status_pagamento <> 'falhou'`,
          [pedidoId]
        );
      }

      // Atualiza status_pagamento e status (campo operacional) de forma atômica.
      // status espelha status_pagamento para evitar divergência entre os dois campos.
      await conn.query(
        `UPDATE pedidos
            SET status_pagamento = ?, status = ?, pagamento_id = ?
          WHERE id = ?
            AND (status_pagamento <> ? OR pagamento_id <> ?)`,
        [
          novoStatusPagamento,
          novoStatusPagamento,
          String(data.id),
          pedidoId,
          novoStatusPagamento,
          String(data.id),
        ]
      );

      await conn.query(
        `UPDATE webhook_events
            SET status = ?, processed_at = NOW(), updated_at = NOW()
          WHERE id = ?`,
        [novoStatusPagamento, dbEventId]
      );

      await conn.commit();
      return res.status(200).json({ ok: true });
    } catch (dbErr) {
      try {
        await conn.rollback();
      } catch (rollbackErr) {
        console.error("[payment/webhook] rollback falhou:", rollbackErr);
      }
      throw dbErr;
    } finally {
      conn.release();
    }
  } catch (err) {
    console.error("[payment/webhook] erro:", err, err?.stack);
    const status = process.env.NODE_ENV === "development" ? 500 : 200;
    return res.status(status).json({ ok: status === 200 });
  }
});

module.exports = router;
