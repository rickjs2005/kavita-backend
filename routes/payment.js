const express = require("express");
const crypto = require("crypto");
const router = express.Router();
const pool = require("../config/pool");

// 👉 NOVO SDK Mercado Pago (v2)
const { MercadoPagoConfig, Preference, Payment } = require("mercadopago");

// Configuração do cliente do Mercado Pago
const mpClient = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN,
});

// =====================================================
// Util: calcula o total do pedido diretamente no banco
// =====================================================
async function calcularTotalPedido(conn, pedidoId) {
  const [rows] = await conn.query(
    `SELECT quantidade, valor_unitario
       FROM pedidos_produtos
      WHERE pedido_id = ?`,
    [pedidoId]
  );

  const total = rows.reduce(
    (acc, r) => acc + Number(r.quantidade) * Number(r.valor_unitario),
    0
  );

  return Number(total.toFixed(2));
}

// =====================================================
// Helper: monta o body da Preference do Mercado Pago
// - Configura back_urls
// - Configura payment_methods de acordo com forma_pagamento
// - Em produção, adiciona auto_return + notification_url
// =====================================================
function buildPreferenceBody({ total, pedidoId, formaPagamento }) {
  const appUrl = process.env.APP_URL;
  const backendUrl = process.env.BACKEND_URL;
  const tipo = (formaPagamento || "").toLowerCase();

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

  /**
   * 💳 Alinhando com a forma de pagamento escolhida no checkout:
   *
   * - PIX:
   *    - Exclui cartão de crédito, débito e boleto (ticket)
   *    - Sobra principalmente bank_transfer (Pix)
   *
   * - BOLETO:
   *    - Exclui cartão de crédito, débito e bank_transfer (Pix)
   *
   * - CARTÃO / MERCADOPAGO:
   *    - Exclui Pix (bank_transfer) e boleto (ticket)
   */
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
        { id: "bank_transfer" }, // Pix
      ],
    };
  } else if (tipo === "mercadopago" || tipo === "cartao" || tipo === "cartão") {
    body.payment_methods = {
      excluded_payment_types: [
        { id: "bank_transfer" }, // Pix
        { id: "ticket" }, // boleto
      ],
    };
  }

  /**
   * ⚠️ IMPORTANTE:
   * Em ambiente local (localhost / IP interno), o Mercado Pago costuma
   * rejeitar:
   *   - auto_return com back_urls locais
   *   - notification_url apontando para IP privado / localhost
   *
   * Por isso, deixamos auto_return + notification_url **apenas em produção**,
   * quando APP_URL e BACKEND_URL apontam para domínios públicos HTTPS.
   */
  if (process.env.NODE_ENV === "production") {
    body.auto_return = "approved";

    if (backendUrl) {
      body.notification_url = `${backendUrl}/api/payment/webhook`;
    }
  }

  return body;
}

// =====================================================
// ROTA /start
// =====================================================

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
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 preferenceId: { type: string }
 *                 init_point: { type: string }
 *                 sandbox_init_point: { type: string }
 *       400:
 *         description: Campo pedidoId ausente
 *       404:
 *         description: Pedido não encontrado
 *       500:
 *         description: Erro ao iniciar pagamento
 */

// inicia pagamento para um pedido existente
router.post("/start", async (req, res) => {
  const { pedidoId } = req.body || {};
  if (!pedidoId) {
    return res.status(400).json({ message: "pedidoId é obrigatório." });
  }

  const conn = await pool.getConnection();
  try {
    // garante que o pedido existe e traz a forma_pagamento
    const [[pedido]] = await conn.query(
      `SELECT id, forma_pagamento
         FROM pedidos
        WHERE id = ?`,
      [pedidoId]
    );

    if (!pedido) {
      return res.status(404).json({ message: "Pedido não encontrado." });
    }

    const formaPagamento = (pedido.forma_pagamento || "").toLowerCase();

    // pega total pelo banco
    const total = await calcularTotalPedido(conn, pedidoId);

    // cria a preference
    const preference = new Preference(mpClient);
    const body = buildPreferenceBody({ total, pedidoId, formaPagamento });

    const pref = await preference.create({ body });

    // marca pagamento como "pendente" (início do fluxo de pagamento)
    await conn.query(
      `UPDATE pedidos
          SET status_pagamento = 'pendente'
        WHERE id = ?`,
      [pedidoId]
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

    return res
      .status(500)
      .json({ message: "Erro ao iniciar pagamento com o Mercado Pago." });
  } finally {
    conn.release();
  }
});

// =====================================================
// ROTA /webhook
// =====================================================

/**
 * @openapi
 * /api/payment/webhook:
 *   post:
 *     tags: [Pagamentos]
 *     summary: Webhook de notificação do Mercado Pago
 *     description: Atualiza automaticamente o status dos pedidos conforme o pagamento.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               type: { type: string, example: "payment" }
 *               data:
 *                 type: object
 *                 properties:
 *                   id: { type: string, example: "123456789" }
 *     responses:
 *       200:
 *         description: Notificação recebida e processada
 *       500:
 *         description: Erro interno (geralmente ainda retorna 200 para evitar redelivery)
 */

// webhook Mercado Pago
router.post("/webhook", async (req, res) => {
  const signatureHeader = req.get("x-signature");
  const idempotencyKey = req.get("x-idempotency-key");
  const secret = process.env.MP_WEBHOOK_SECRET;
  const unauthorized = () => res.status(401).json({ ok: false });

  if (!signatureHeader || !idempotencyKey) {
    console.warn("[payment/webhook] assinatura ou idempotency key ausentes");
    return unauthorized();
  }

  if (!secret) {
    console.error("[payment/webhook] MP_WEBHOOK_SECRET não configurado");
    const status = process.env.NODE_ENV === "development" ? 500 : 200;
    return res.status(status).json({ ok: status === 200 });
  }

  const signatureParts = signatureHeader
    .split(",")
    .map((part) => part.trim().split("="))
    .reduce((acc, [key, value]) => {
      if (key && value) acc[key] = value;
      return acc;
    }, {});

  const ts = signatureParts.ts;
  const providedHash = signatureParts.v1;

  if (!ts || !providedHash) {
    console.warn("[payment/webhook] formato de assinatura inválido");
    return unauthorized();
  }

  const payloadString = JSON.stringify(req.body || {});
  const expectedHash = crypto
    .createHmac("sha256", secret)
    .update(`${ts}.${payloadString}`)
    .digest("hex");

  const safeCompare = (a, b) => {
    const bufferA = Buffer.from(a, "utf8");
    const bufferB = Buffer.from(b, "utf8");
    if (bufferA.length !== bufferB.length) return false;
    return crypto.timingSafeEqual(bufferA, bufferB);
  };

  if (!safeCompare(expectedHash, providedHash)) {
    console.warn(
      `[payment/webhook] assinatura inválida para chave ${idempotencyKey}`
    );
    return unauthorized();
  }

  try {
    const { type, data } = req.body || {};
    const payload = JSON.stringify(req.body || {});

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const [[existingEvent]] = await conn.query(
        `SELECT id, status, processed_at
           FROM webhook_events
          WHERE idempotency_key = ?
          FOR UPDATE`,
        [idempotencyKey]
      );

      let eventId = existingEvent?.id;

      if (!existingEvent) {
        const [insertResult] = await conn.query(
          `INSERT INTO webhook_events (idempotency_key, signature, event_type, payload, status, created_at)
           VALUES (?, ?, ?, ?, 'received', NOW())`,
          [idempotencyKey, signatureHeader, type || null, payload]
        );
        eventId = insertResult.insertId;
      } else if (existingEvent.processed_at) {
        await conn.commit();
        return res.status(200).json({ ok: true, idempotent: true });
      } else {
        eventId = existingEvent.id;
        await conn.query(
          `UPDATE webhook_events
              SET signature = ?, event_type = ?, payload = ?, status = 'received', updated_at = NOW()
            WHERE id = ?`,
          [signatureHeader, type || null, payload, eventId]
        );
      }

      if (type !== "payment" || !data?.id) {
        await conn.query(
          `UPDATE webhook_events
              SET status = 'ignored', processed_at = NOW(), updated_at = NOW()
            WHERE id = ?`,
          [eventId]
        );
        await conn.commit();
        return res.status(200).json({ ok: true });
      }

      // 👉 NOVO jeito de pegar o pagamento no SDK v2
      const paymentClient = new Payment(mpClient);
      const payment = await paymentClient.get({ id: data.id });

      const status = payment.status; // approved | pending | rejected | cancelled | in_process ...
      const pedidoId = payment.metadata?.pedidoId;

      if (!pedidoId) {
        console.warn(
          "[payment/webhook] pagamento sem metadata.pedidoId",
          data.id
        );
        await conn.query(
          `UPDATE webhook_events
              SET status = 'ignored', processed_at = NOW(), updated_at = NOW()
            WHERE id = ?`,
          [eventId]
        );
        await conn.commit();
        return res.status(200).json({ ok: true });
      }

      // mapeia status MP -> status_pagamento local
      let novoStatusPagamento = "pendente";
      if (status === "approved") novoStatusPagamento = "pago";
      else if (status === "rejected" || status === "cancelled")
        novoStatusPagamento = "falhou";
      else if (status === "in_process" || status === "pending")
        novoStatusPagamento = "pendente";

      await conn.query(
        `UPDATE pedidos
            SET status_pagamento = ?, pagamento_id = ?
          WHERE id = ?
            AND (status_pagamento <> ? OR pagamento_id <> ?)`,
        [
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
        [novoStatusPagamento, eventId]
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
