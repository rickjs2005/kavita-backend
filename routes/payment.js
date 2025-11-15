// routes/payment.js
const express = require("express");
const crypto = require("crypto");
const router = express.Router();
const pool = require("../config/pool");
const mercadopago = require("mercadopago");

mercadopago.configure({
  access_token: process.env.MP_ACCESS_TOKEN
});

// util: calcula total a partir do banco
async function calcularTotalPedido(conn, pedidoId) {
  const [rows] = await conn.query(
    `SELECT quantidade, valor_unitario
       FROM pedidos_produtos
      WHERE pedido_id = ?`,
    [pedidoId]
  );
  const total = rows.reduce((acc, r) => acc + Number(r.quantidade) * Number(r.valor_unitario), 0);
  return Number(total.toFixed(2));
}

// inicia pagamento para um pedido existente
router.post("/start", async (req, res) => {
  const { pedidoId } = req.body || {};
  if (!pedidoId) return res.status(400).json({ message: "pedidoId é obrigatório." });

  const conn = await pool.getConnection();
  try {
    // garante que pedido existe
    const [[pedido]] = await conn.query(
      `SELECT id, status FROM pedidos WHERE id = ?`,
      [pedidoId]
    );
    if (!pedido) {
      return res.status(404).json({ message: "Pedido não encontrado." });
    }

    // pega total pelo banco
    const total = await calcularTotalPedido(conn, pedidoId);

    // cria uma preference simples (1 item com o total)
    const pref = await mercadopago.preferences.create({
      items: [
        {
          id: `pedido-${pedidoId}`,
          title: `Pedido #${pedidoId}`,
          quantity: 1,
          unit_price: total,
          currency_id: "BRL",
        }
      ],
      back_urls: {
        success: `${process.env.APP_URL}/checkout/sucesso?pedidoId=${pedidoId}`,
        pending: `${process.env.APP_URL}/checkout/pendente?pedidoId=${pedidoId}`,
        failure: `${process.env.APP_URL}/checkout/erro?pedidoId=${pedidoId}`
      },
      auto_return: "approved",
      notification_url: `${process.env.BACKEND_URL}/api/payment/webhook`,
      metadata: { pedidoId }
    });

    // marca pedido como "pendente" (opcional: quando o cliente abre o fluxo)
    await conn.query(
      `UPDATE pedidos SET status = 'pendente' WHERE id = ?`,
      [pedidoId]
    );

    return res.json({
      preferenceId: pref.body.id,
      init_point: pref.body.init_point,
      sandbox_init_point: pref.body.sandbox_init_point
    });
  } catch (err) {
    console.error("[payment/start] erro:", err);
    return res.status(500).json({ message: "Erro ao iniciar pagamento." });
  } finally {
    conn.release();
  }
});

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
    console.warn(`[payment/webhook] assinatura inválida para chave ${idempotencyKey}`);
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

      const payment = await mercadopago.payment.findById(data.id);
      const status = payment.body.status; // approved | pending | rejected | cancelled | in_process ...
      const pedidoId = payment.body.metadata?.pedidoId;

      if (!pedidoId) {
        console.warn("[webhook] pagamento sem metadata.pedidoId", data.id);
        await conn.query(
          `UPDATE webhook_events
              SET status = 'ignored', processed_at = NOW(), updated_at = NOW()
            WHERE id = ?`,
          [eventId]
        );
        await conn.commit();
        return res.status(200).json({ ok: true });
      }

      // mapeia status MP -> status local
      let novoStatus = "pendente";
      if (status === "approved") novoStatus = "pago";
      else if (status === "rejected" || status === "cancelled") novoStatus = "falhou";
      else if (status === "in_process" || status === "pending") novoStatus = "pendente";

      await conn.query(
        `UPDATE pedidos
            SET status = ?, pagamento_id = ?
          WHERE id = ?
            AND (status <> ? OR pagamento_id <> ?)`,
        [novoStatus, String(data.id), pedidoId, novoStatus, String(data.id)]
      );

      await conn.query(
        `UPDATE webhook_events
            SET status = ?, processed_at = NOW(), updated_at = NOW()
          WHERE id = ?`,
        [novoStatus, eventId]
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
