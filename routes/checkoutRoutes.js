// routes/checkoutRoutes.js
const express = require("express");
const { z } = require("zod");
const pool = require("../config/pool"); // usa seu pool.js
const router = express.Router();

/**
 * @openapi
 * tags:
 *   name: Checkout
 *   description: Criação de pedidos no e-commerce Kavita
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
 *         total:
 *           type: number
 *           example: 55.0
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
 *           schema:
 *             $ref: "#/components/schemas/CheckoutBody"
 *     responses:
 *       201:
 *         description: Pedido criado com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/CheckoutResponse"
 *       400:
 *         description: Erro de validação ou estoque
 *       500:
 *         description: Erro interno
 */

// =========================
// Schemas de validação
// =========================
const enderecoSchema = z.object({
  cep: z.string().min(8),
  rua: z.string(),
  numero: z.string(),
  bairro: z.string(),
  cidade: z.string(),
  estado: z.string(),
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

// =========================
// POST /api/checkout
// =========================
router.post("/", async (req, res) => {
  try {
    const parsed = checkoutSchema.parse(req.body);
    const { usuario_id, formaPagamento, endereco, produtos } = parsed;

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      // Monta o texto do endereço para salvar no campo TEXT da tabela pedidos
      const enderecoTexto = `${endereco.rua}, ${endereco.numero} - ${endereco.bairro}, ${endereco.cidade} - ${endereco.estado}. CEP: ${endereco.cep}${endereco.complemento ? " (" + endereco.complemento + ")" : ""}`;

      // Cria o pedido principal
      const [pedidoResult] = await conn.query(
        `INSERT INTO pedidos (usuario_id, endereco, forma_pagamento, status, data_pedido)
         VALUES (?, ?, ?, 'pendente', NOW())`,
        [usuario_id, enderecoTexto, formaPagamento]
      );
      const pedido_id = pedidoResult.insertId;

      // Valida produtos e estoque
      const ids = produtos.map((p) => p.id);
      const [found] = await conn.query(
        `SELECT id, nome, estoque, preco FROM products WHERE id IN (?)`,
        [ids]
      );

      const mapaQtd = new Map(produtos.map((p) => [p.id, p.quantidade]));
      for (const prod of found) {
        const qtd = mapaQtd.get(prod.id);
        if (qtd > prod.estoque) {
          throw new Error(`Estoque insuficiente para o produto ${prod.nome}`);
        }

        await conn.query(
          `UPDATE products SET estoque = estoque - ? WHERE id = ?`,
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
      return res.status(400).json({
        success: false,
        message: error.message || "Erro ao criar pedido",
      });
    }
  } catch (err) {
    console.error("Erro geral:", err);
    if (err instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        errors: err.errors,
      });
    }
    return res
      .status(500)
      .json({ success: false, message: "Erro interno no checkout" });
  }
});

module.exports = router;
