const { z } = require("zod");
const pool = require("../config/pool");
const { serializeAddress } = require("../utils/address");

class CheckoutError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

const enderecoSchema = z.object({
  cep: z.string().min(8),
  rua: z.string(),
  numero: z.string(),
  bairro: z.string(),
  cidade: z.string(),
  estado: z.string().min(2),
  complemento: z.string().optional(),
});

const checkoutSchema = z.object({
  usuario_id: z.number().int().positive(),
  formaPagamento: z
    .string()
    .transform((v) => v.toLowerCase())
    .transform((v) => (v.includes("cart") ? "mercadopago" : v))
    .refine((v) => ["pix", "boleto", "mercadopago", "prazo"].includes(v), {
      message: "Forma de pagamento inválida",
    }),
  endereco: enderecoSchema,
  produtos: z
    .array(
      z.object({
        id: z.number().int().positive(),
        quantidade: z.number().int().positive(),
      })
    )
    .min(1),
  total: z.number().optional(),
});

async function create(req, res) {
  let parsed;
  try {
    parsed = checkoutSchema.parse(req.body);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ success: false, errors: err.errors });
    }
    return res
      .status(err.status || 500)
      .json({ success: false, message: err.message || "Erro interno no checkout" });
  }

  const { usuario_id, formaPagamento, endereco, produtos } = parsed;
  const aggregated = new Map();
  for (const item of produtos) {
    const current = aggregated.get(item.id) || 0;
    aggregated.set(item.id, current + item.quantidade);
  }

  try {
    const [[usuario]] = await pool.query("SELECT id FROM usuarios WHERE id = ?", [
      usuario_id,
    ]);
    if (!usuario) {
      throw new CheckoutError("Usuário não encontrado", 404);
    }

    const enderecoJSON = serializeAddress(endereco);

    const productIds = Array.from(aggregated.keys());
    const placeholders = productIds.map(() => "?").join(",");
    const [foundProducts] = await pool.query(
      `SELECT id, name, quantity, price FROM products WHERE id IN (${placeholders})`,
      productIds
    );

    if (foundProducts.length !== productIds.length) {
      const missing = productIds.filter((id) => !foundProducts.some((p) => p.id === id));
      throw new CheckoutError(`Produtos não encontrados: ${missing.join(", ")}`, 404);
    }

    let total = 0;
    for (const product of foundProducts) {
      const requested = aggregated.get(product.id);
      if (requested > product.quantity) {
        throw new CheckoutError(
          `Estoque insuficiente para o produto ${product.name}`,
          409
        );
      }
      total += Number(product.price) * requested;
    }

    const [{ insertId: pedido_id }] = await pool.query(
      `INSERT INTO pedidos (usuario_id, endereco, forma_pagamento, status, total, data_pedido)
       VALUES (?, ?, ?, 'pendente', ?, CURRENT_TIMESTAMP)`,
      [usuario_id, enderecoJSON, formaPagamento, total]
    );

    for (const product of foundProducts) {
      const quantidade = aggregated.get(product.id);

      await pool.query(
        `UPDATE products SET quantity = quantity - ? WHERE id = ?`,
        [quantidade, product.id]
      );

      await pool.query(
        `INSERT INTO pedidos_produtos (pedido_id, produto_id, quantidade, valor_unitario)
         VALUES (?, ?, ?, ?)`,
        [pedido_id, product.id, quantidade, product.price]
      );
    }

    return res.status(201).json({
      success: true,
      message: "Pedido criado com sucesso!",
      pedido_id,
    });
  } catch (err) {
    const status = err.status || 400;
    return res
      .status(status)
      .json({ success: false, message: err.message || "Erro ao criar pedido" });
  }
}

module.exports = { create };
