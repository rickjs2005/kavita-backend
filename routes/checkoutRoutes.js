// routes/checkoutRoutes.js
const express = require("express");
const pool = require("../config/pool");
const router = express.Router();

// POST /api/checkout
router.post("/", async (req, res) => {
  const { usuario_id, endereco, formaPagamento, produtos } = req.body || {};

  if (!usuario_id || !endereco || !formaPagamento || !Array.isArray(produtos) || !produtos.length) {
    return res.status(400).json({ message: "Campos obrigatórios ausentes." });
  }

  // Mapa id -> quantidade solicitada (agrega duplicados)
  const wantMap = new Map();
  for (const p of produtos) {
    const id = Number(p.id);
    const q  = Math.max(1, Number(p.quantidade || p.quantity || 0));
    if (!id || !q) return res.status(400).json({ message: "Produto/quantidade inválidos." });
    wantMap.set(id, (wantMap.get(id) || 0) + q);
  }
  const ids = [...wantMap.keys()];

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // 🔒 trava as linhas de estoque até o commit/rollback
    const [rows] = await conn.query(
      `SELECT id, name, quantity, price
         FROM products
        WHERE id IN (?)
        FOR UPDATE`,
      [ids]
    );

    // Checagem de existência e de estoque
    const byId = new Map(rows.map(r => [r.id, r]));
    const faltas = [];
    for (const id of ids) {
      const row = byId.get(id);
      if (!row) {
        faltas.push({ id, motivo: "Produto não encontrado" });
        continue;
      }
      const want = wantMap.get(id);
      if (Number(row.quantity) < want) {
        faltas.push({
          id,
          name: row.name,
          disponivel: Number(row.quantity),
          solicitado: want,
          motivo: "Estoque insuficiente",
        });
      }
    }
    if (faltas.length) {
      await conn.rollback();
      return res.status(400).json({
        message: "Estoque insuficiente em um ou mais itens.",
        itens: faltas,
      });
    }

    // Insere o pedido
    const [pedidoResult] = await conn.query(
      `INSERT INTO pedidos (usuario_id, endereco, forma_pagamento)
       VALUES (?, ?, ?)`,
      [usuario_id, JSON.stringify(endereco), formaPagamento]
    );
    const pedidoId = pedidoResult.insertId;

    // Insere itens do pedido + baixa estoque
    for (const id of ids) {
      const row  = byId.get(id);
      const qnt  = wantMap.get(id);
      const unit = Number(row.price) || 0;

      await conn.query(
        `INSERT INTO pedidos_produtos (pedido_id, produto_id, quantidade, valor_unitario)
         VALUES (?, ?, ?, ?)`,
        [pedidoId, id, qnt, unit]
      );

      const [upd] = await conn.query(
        `UPDATE products
            SET quantity = quantity - ?
          WHERE id = ? AND quantity >= ?`,
        [qnt, id, qnt]
      );
      // Segurança adicional: se alguém consumir estoque entre o SELECT e o UPDATE
      if (!upd.affectedRows) {
        await conn.rollback();
        return res.status(409).json({
          message: "Conflito de estoque ao finalizar. Tente novamente.",
          item: { id, name: row.name },
        });
      }
    }

    await conn.commit();
    return res.status(201).json({ message: "Pedido registrado com sucesso!", pedidoId });
  } catch (err) {
    await conn.rollback();
    console.error("[checkout][POST] erro:", err?.sqlMessage || err);
    return res.status(500).json({ message: "Erro ao processar o pedido." });
  } finally {
    conn.release();
  }
});

module.exports = router;
