// routes/checkoutRoutes.js
const express = require("express");
const pool = require("../config/pool");
const { z } = require("zod");
const router = express.Router();

/** ===== Schema de validação ===== */
const EnderecoSchema = z.object({
  cep: z.string().min(8).max(10),
  rua: z.string().min(2),
  numero: z.string().min(1),
  bairro: z.string().min(2),
  cidade: z.string().min(2),
  estado: z.string().min(2).max(2),
  complemento: z.string().optional().nullable(),
});

const ProdutoSchema = z.object({
  id: z.coerce.number().int().positive(),
  quantidade: z.coerce.number().int().positive().default(1)
}).transform(p => ({ id: p.id, quantidade: Math.max(1, p.quantidade) }));

const CheckoutSchema = z.object({
  usuario_id: z.coerce.number().int().positive(),
  endereco: EnderecoSchema,
  formaPagamento: z.enum(["mercadopago", "pix", "cartao"]),
  produtos: z.array(ProdutoSchema).nonempty()
});

/**
 * @openapi
 * /api/checkout:
 *   post:
 *     tags: [Public, Pedidos]
 *     summary: Realiza checkout e cria um novo pedido
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [usuario_id, endereco, formaPagamento, produtos]
 *             properties:
 *               usuario_id: { type: integer }
 *               formaPagamento: { type: string, enum: ["mercadopago", "pix", "cartao"] }
 *               endereco:
 *                 type: object
 *                 properties:
 *                   cep: { type: string }
 *                   rua: { type: string }
 *                   numero: { type: string }
 *                   bairro: { type: string }
 *                   cidade: { type: string }
 *                   estado: { type: string }
 *                   complemento: { type: string, nullable: true }
 *               produtos:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     id: { type: integer }
 *                     quantidade: { type: integer }
 *     responses:
 *       201:
 *         description: Pedido criado com sucesso
 *       400:
 *         description: Erro de validação ou estoque insuficiente
 *       409:
 *         description: Conflito de estoque
 *       500:
 *         description: Erro interno
 */

router.post("/", async (req, res) => {
  // valida (lança se inválido)
  let parsed;
  try {
    parsed = CheckoutSchema.parse(req.body || {});
  } catch (err) {
    return res.status(400).json({ message: "Payload inválido", detalhes: err.errors });
  }

  const { usuario_id, endereco, formaPagamento, produtos } = parsed;

  // agrega duplicados: id -> quantidade
  const wantMap = new Map();
  for (const p of produtos) {
    wantMap.set(p.id, (wantMap.get(p.id) || 0) + p.quantidade);
  }
  const ids = [...wantMap.keys()];

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [rows] = await conn.query(
      `SELECT id, name, quantity, price
         FROM products
        WHERE id IN (?)
        FOR UPDATE`,
      [ids]
    );

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

    // cria pedido com status inicial aguardando pagamento
    const [pedidoResult] = await conn.query(
      `INSERT INTO pedidos (usuario_id, endereco, forma_pagamento, status)
       VALUES (?, ?, ?, ?)`,
      [usuario_id, JSON.stringify(endereco), formaPagamento, "aguardando_pagamento"]
    );
    const pedidoId = pedidoResult.insertId;

    // insere itens e baixa estoque
    for (const id of ids) {
      const row = byId.get(id);
      const qnt = wantMap.get(id);
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
      if (!upd.affectedRows) {
        await conn.rollback();
        return res.status(409).json({
          message: "Conflito de estoque ao finalizar. Tente novamente.",
          item: { id, name: row.name },
        });
      }
    }

    await conn.commit();
    return res.status(201).json({
      message: "Pedido registrado com sucesso! Aguardando pagamento.",
      pedidoId
    });
  } catch (err) {
    await conn.rollback();
    console.error("[checkout][POST] erro:", err?.sqlMessage || err);
    return res.status(500).json({ message: "Erro ao processar o pedido." });
  } finally {
    conn.release();
  }
});

module.exports = router;
