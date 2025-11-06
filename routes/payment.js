// routes/payment.js
const express = require("express");
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

// webhook Mercado Pago
router.post("/webhook", async (req, res) => {
  try {
    // Mercado Pago pode enviar diferentes formatos. O mais comum:
    // { type: 'payment', data: { id: '123456' } }
    const { type, data } = req.body || {};
    if (type !== "payment" || !data?.id) {
      // aceite 200 para não repetir em loop
      return res.status(200).json({ ok: true });
    }

    // consulta status do pagamento
    const payment = await mercadopago.payment.findById(data.id);
    const status = payment.body.status; // approved | pending | rejected | cancelled | in_process ...
    const pedidoId = payment.body.metadata?.pedidoId;

    if (!pedidoId) {
      console.warn("[webhook] pagamento sem metadata.pedidoId", data.id);
      return res.status(200).json({ ok: true });
    }

    const conn = await pool.getConnection();
    try {
      // mapeia status MP -> status local
      let novoStatus = "pendente";
      if (status === "approved") novoStatus = "pago";
      else if (status === "rejected" || status === "cancelled") novoStatus = "falhou";
      else if (status === "in_process" || status === "pending") novoStatus = "pendente";

      await conn.query(
        `UPDATE pedidos
            SET status = ?, pagamento_id = ?
          WHERE id = ?`,
        [novoStatus, String(data.id), pedidoId]
      );
    } finally {
      conn.release();
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("[payment/webhook] erro:", err);
    // ainda retornamos 200 para evitar redelivery infinito em produção; avalie 500 no dev
    return res.status(200).json({ ok: true });
  }
});

module.exports = router;
