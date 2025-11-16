// routes/checkoutRoutes.js
const express = require("express");
const { z } = require("zod");
const pool = require("../config/pool");
const { serializeAddress } = require("../utils/address");
const router = express.Router();

/**
 * @openapi
 * tags:
 *   name: Checkout
 *   description: Criação de pedidos no e-commerce
 *
 * components:
 *   schemas:
 *     CheckoutProduto:
 *       type: object
 *       required: [id, quantidade]
 *       properties:
 *         id: { type: integer, example: 1 }
 *         quantidade: { type: integer, example: 2 }
 *     Endereco:
 *       type: object
 *       required: [cep, rua, numero, bairro, cidade, estado]
 *       properties:
 *         cep: { type: string, example: "36940000" }
 *         rua: { type: string, example: "Rua das Flores" }
 *         numero: { type: string, example: "288" }
 *         bairro: { type: string, example: "Centro" }
 *         cidade: { type: string, example: "Manhuaçu" }
 *         estado: { type: string, example: "Minas Gerais" }
 *         complemento: { type: string, example: "perto da pracinha" }
 *     CheckoutBody:
 *       type: object
 *       required: [usuario_id, formaPagamento, endereco, produtos]
 *       properties:
 *         usuario_id: { type: integer, example: 1 }
 *         formaPagamento: { type: string, enum: [pix, boleto, mercadopago, prazo], example: pix }
 *         endereco:
 *           $ref: "#/components/schemas/Endereco"
 *         produtos:
 *           type: array
 *           items: { $ref: "#/components/schemas/CheckoutProduto" }
 *         total: { type: number, example: 55.0 }
 *     CheckoutResponse:
 *       type: object
 *       properties:
 *         success: { type: boolean }
 *         message: { type: string }
 *         pedido_id: { type: integer }
 */

/**
 * @openapi
 * /api/checkout:
 *   post:
 *     summary: Cria um novo pedido
 *     tags: [Checkout]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: "#/components/schemas/CheckoutBody" }
 *     responses:
 *       201:
 *         description: Pedido criado
 *         content:
 *           application/json:
 *             schema: { $ref: "#/components/schemas/CheckoutResponse" }
 *       400:
 *         description: Erro de validação/estoque
 *       500:
 *         description: Erro interno
 */

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

// POST /api/checkout
<<<<<<< HEAD
router.post("/", async (req, res) => {
  try {
    const parsed = checkoutSchema.parse(req.body);
    const { usuario_id, formaPagamento, endereco, produtos } = parsed;

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      // endereço em TEXT (tabela pedidos)
      const enderecoTexto =
        `${endereco.rua}, ${endereco.numero} - ${endereco.bairro}, ` +
        `${endereco.cidade} - ${endereco.estado}. CEP: ${endereco.cep}` +
        (endereco.complemento ? ` (${endereco.complemento})` : "");

      // cria pedido
      const [pedidoResult] = await conn.query(
        `INSERT INTO pedidos (usuario_id, endereco, forma_pagamento, status, data_pedido)
         VALUES (?, ?, ?, 'pendente', NOW())`,
        [usuario_id, enderecoTexto, formaPagamento]
      );
      const pedido_id = pedidoResult.insertId;

      // consulta produtos e valida estoque
      const ids = produtos.map((p) => p.id);

      // ⚠️ usa colunas reais com alias
      const [found] = await conn.query(
        `SELECT 
           id,
           name     AS nome,
           quantity AS estoque,
           price    AS preco
         FROM products
         WHERE id IN (?)`,
        [ids]
      );

      const mapaQtd = new Map(produtos.map((p) => [p.id, p.quantidade]));

      // checa se todos foram encontrados
      const encontrados = new Set(found.map((f) => f.id));
      for (const reqItem of produtos) {
        if (!encontrados.has(reqItem.id)) {
          throw new Error(`Produto ${reqItem.id} não encontrado`);
        }
      }

      // abate estoque + salva itens
      for (const prod of found) {
        const qtd = mapaQtd.get(prod.id);
        if (qtd > prod.estoque) {
          throw new Error(`Estoque insuficiente para o produto ${prod.nome}`);
        }

        // ⚠️ coluna correta: quantity
        await conn.query(
          `UPDATE products SET quantity = quantity - ? WHERE id = ?`,
          [qtd, prod.id]
        );

        await conn.query(
          `INSERT INTO pedidos_produtos (pedido_id, produto_id, quantidade, valor_unitario)
           VALUES (?, ?, ?, ?)`,
          [pedido_id, prod.id, qtd, prod.preco]
        );
      }

      await conn.commit();
      conn.release();

      return res.status(201).json({
        success: true,
        message: "Pedido criado com sucesso!",
        pedido_id,
      });
    } catch (error) {
      await conn.rollback();
      conn.release();
      console.error("Erro no checkout:", error);
      return res
        .status(400)
        .json({ success: false, message: error.message || "Erro ao criar pedido" });
    }
  } catch (err) {
    console.error("Erro geral:", err);
    if (err instanceof z.ZodError) {
      return res.status(400).json({ success: false, errors: err.errors });
    }
    return res.status(500).json({ success: false, message: "Erro interno no checkout" });
  }
});
=======
class CheckoutError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

router.post("/", async (req, res) => {
  let conn;
  try {
    const parsed = checkoutSchema.parse(req.body);
    const { usuario_id, formaPagamento, endereco, produtos } = parsed;

    conn = await pool.getConnection();

    const aggregated = new Map();
    for (const item of produtos) {
      const current = aggregated.get(item.id) || 0;
      aggregated.set(item.id, current + item.quantidade);
    }

    try {
      await conn.beginTransaction();

      const [[usuario]] = await conn.query(
        "SELECT id FROM usuarios WHERE id = ?",
        [usuario_id]
      );
      if (!usuario) {
        throw new CheckoutError("Usuário não encontrado", 404);
      }

      const enderecoJSON = serializeAddress(endereco);

      const productIds = Array.from(aggregated.keys());
      const placeholders = productIds.map(() => "?").join(",");
      const [foundProducts] = await conn.query(
        `SELECT id, name, quantity, price FROM products WHERE id IN (${placeholders})`,
        productIds
      );

      if (foundProducts.length !== productIds.length) {
        const missing = productIds.filter(
          (id) => !foundProducts.some((p) => p.id === id)
        );
        throw new CheckoutError(
          `Produtos não encontrados: ${missing.join(", ")}`,
          404
        );
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

      const [pedidoResult] = await conn.query(
        `INSERT INTO pedidos (usuario_id, endereco, forma_pagamento, status, total, data_pedido)
         VALUES (?, ?, ?, 'pendente', ?, CURRENT_TIMESTAMP)`,
        [usuario_id, enderecoJSON, formaPagamento, total]
      );
      const pedido_id = pedidoResult.insertId;

      for (const product of foundProducts) {
        const quantidade = aggregated.get(product.id);

        await conn.query(
          `UPDATE products SET quantity = quantity - ? WHERE id = ?`,
          [quantidade, product.id]
        );

        await conn.query(
          `INSERT INTO pedidos_produtos (pedido_id, produto_id, quantidade, valor_unitario)
           VALUES (?, ?, ?, ?)`,
          [pedido_id, product.id, quantidade, product.price]
        );
      }

      await conn.commit();

      return res.status(201).json({
        success: true,
        message: "Pedido criado com sucesso!",
        pedido_id,
      });
    } catch (error) {
      if (conn) {
        try {
          await conn.rollback();
        } catch (rollbackError) {
          console.error("Erro ao desfazer transação do checkout:", rollbackError);
        }
      }
      const status = error.status || 400;
      console.error("Erro no checkout:", error);
      return res
        .status(status)
        .json({ success: false, message: error.message || "Erro ao criar pedido" });
    }
  } catch (err) {
    console.error("Erro geral:", err);
    if (err instanceof z.ZodError) {
      return res.status(400).json({ success: false, errors: err.errors });
    }
    const status = err.status || 500;
    return res
      .status(status)
      .json({ success: false, message: err.message || "Erro interno no checkout" });
  } finally {
    conn?.release();
  }
});
>>>>>>> e32923eee2d71eeeceaefbc041610dc629ce8a62

module.exports = router;
