const express = require("express");
const router = express.Router();
const pool = require("../config/pool");
const verifyAdmin = require("../middleware/verifyAdmin");
const { parseAddress } = require("../utils/address");
const {
  dispararEventoComunicacao,
} = require("../services/comunicacaoService"); // ⬅️ novo import

// 🔄 Função utilitária para tratar erros e exibir logs contextuais
const handleErroInterno = (res, err, contexto = "erro") => {
  console.error(`Erro ao ${contexto}:`, err);
  res.status(500).json({ message: `Erro ao ${contexto}` });
};

/**
 * @openapi
 * tags:
 *   - name: Admin
 *     description: Endpoints administrativos (pedidos, produtos, etc.)
 */

/**
 * @openapi
 * components:
 *   schemas:
 *     AdminPedidoItem:
 *       type: object
 *       properties:
 *         produto:
 *           type: string
 *           example: "Ração Premium 25kg"
 *         quantidade:
 *           type: integer
 *           example: 2
 *         preco_unitario:
 *           type: number
 *           format: float
 *           example: 99.9
 *
 *     AdminPedidoResumo:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *           example: 123
 *         usuario_id:
 *           type: integer
 *           example: 19
 *         usuario:
 *           type: string
 *           example: "José da Silva"
 *         email:
 *           type: string
 *           nullable: true
 *           example: "cliente@exemplo.com"
 *         telefone:
 *           type: string
 *           nullable: true
 *           example: "33999998888"
 *         cpf:
 *           type: string
 *           nullable: true
 *           example: "111.111.111-11"
 *         forma_pagamento:
 *           type: string
 *           example: "pix"
 *         status_pagamento:
 *           type: string
 *           enum: [pendente, pago, falhou, estornado]
 *           example: "pago"
 *         status_entrega:
 *           type: string
 *           enum: [em_separacao, processando, enviado, entregue, cancelado]
 *           example: "enviado"
 *         total:
 *           type: number
 *           format: float
 *           example: 199.9
 *         data_pedido:
 *           type: string
 *           format: date-time
 *           example: "2025-11-20T18:30:00Z"
 *         endereco:
 *           type: object
 *           description: Endereço de entrega já parseado a partir do JSON salvo
 *           properties:
 *             cep: { type: string, example: "39800-000" }
 *             rua: { type: string, example: "Rua das Flores" }
 *             numero: { type: string, example: "123" }
 *             bairro: { type: string, example: "Centro" }
 *             cidade: { type: string, example: "Teófilo Otoni" }
 *             estado: { type: string, example: "MG" }
 *       required:
 *         [
 *           id,
 *           usuario_id,
 *           usuario,
 *           forma_pagamento,
 *           status_pagamento,
 *           status_entrega,
 *           total,
 *           data_pedido
 *         ]
 *
 *     AdminPedidoDetalhe:
 *       allOf:
 *         - $ref: '#/components/schemas/AdminPedidoResumo'
 *         - type: object
 *           properties:
 *             itens:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/AdminPedidoItem'
 */

/**
 * @openapi
 * /api/admin/pedidos:
 *   get:
 *     tags: [Admin, Pedidos]
 *     summary: Lista todos os pedidos com itens, status e endereço
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de pedidos do sistema
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/AdminPedidoResumo'
 *       401:
 *         description: Não autorizado
 *       500:
 *         description: Erro ao buscar pedidos
 */

// ✅ GET /api/admin/pedidos — Lista todos os pedidos com itens e endereço
router.get("/", verifyAdmin, async (req, res) => {
  try {
    const [pedidos] = await pool.query(`
      SELECT
        p.id AS pedido_id,
        p.usuario_id,
        u.nome AS usuario_nome,
        u.email AS usuario_email,
        u.telefone AS usuario_telefone,
        u.cpf AS usuario_cpf,
        p.endereco,
        p.forma_pagamento,
        p.status_pagamento,
        p.status_entrega,
        p.total,
        p.data_pedido
      FROM pedidos p
      JOIN usuarios u ON p.usuario_id = u.id
      ORDER BY p.data_pedido DESC
    `);

    const [itens] = await pool.query(`
      SELECT
        pp.pedido_id,
        pr.name AS produto_nome,
        pp.quantidade,
        pp.valor_unitario AS preco_unitario
      FROM pedidos_produtos pp
      JOIN products pr ON pp.produto_id = pr.id
    `);

    const pedidosComItens = pedidos.map((p) => ({
      id: p.pedido_id,
      usuario_id: p.usuario_id,
      usuario: p.usuario_nome,
      email: p.usuario_email ?? null,
      telefone: p.usuario_telefone ?? null,
      cpf: p.usuario_cpf ?? null,
      endereco: parseAddress(p.endereco),
      forma_pagamento: p.forma_pagamento,
      status_pagamento: p.status_pagamento,
      status_entrega: p.status_entrega,
      total: Number(p.total ?? 0),
      data_pedido: p.data_pedido,
      itens: itens
        .filter((i) => i.pedido_id === p.pedido_id)
        .map((i) => ({
          produto: i.produto_nome,
          quantidade: i.quantidade,
          preco_unitario: Number(i.preco_unitario),
        })),
    }));

    res.json(pedidosComItens);
  } catch (err) {
    handleErroInterno(res, err, "buscar pedidos");
  }
});

/**
 * @openapi
 * /api/admin/pedidos/{id}:
 *   get:
 *     tags: [Admin, Pedidos]
 *     summary: Detalhe de um pedido específico
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID do pedido
 *     responses:
 *       200:
 *         description: Pedido encontrado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AdminPedidoDetalhe'
 *       401:
 *         description: Não autorizado
 *       404:
 *         description: Pedido não encontrado
 *       500:
 *         description: Erro ao buscar pedido
 */

// ✅ GET /api/admin/pedidos/:id — Detalhe do pedido
router.get("/:id", verifyAdmin, async (req, res) => {
  const { id } = req.params;

  try {
    const [[pedido]] = await pool.query(
      `
      SELECT
        p.id AS pedido_id,
        p.usuario_id,
        u.nome AS usuario_nome,
        u.email AS usuario_email,
        u.telefone AS usuario_telefone,
        u.cpf AS usuario_cpf,
        p.endereco,
        p.forma_pagamento,
        p.status_pagamento,
        p.status_entrega,
        p.total,
        p.data_pedido
      FROM pedidos p
      JOIN usuarios u ON p.usuario_id = u.id
      WHERE p.id = ?
    `,
      [id]
    );

    if (!pedido) {
      return res.status(404).json({ message: "Pedido não encontrado" });
    }

    const [itens] = await pool.query(
      `
      SELECT
        pr.name AS produto_nome,
        pp.quantidade,
        pp.valor_unitario AS preco_unitario
      FROM pedidos_produtos pp
      JOIN products pr ON pp.produto_id = pr.id
      WHERE pp.pedido_id = ?
    `,
      [id]
    );

    res.json({
      id: pedido.pedido_id,
      usuario_id: pedido.usuario_id,
      usuario: pedido.usuario_nome,
      email: pedido.usuario_email ?? null,
      telefone: pedido.usuario_telefone ?? null,
      cpf: pedido.usuario_cpf ?? null,
      endereco: parseAddress(pedido.endereco),
      forma_pagamento: pedido.forma_pagamento,
      status_pagamento: pedido.status_pagamento,
      status_entrega: pedido.status_entrega,
      total: Number(pedido.total ?? 0),
      data_pedido: pedido.data_pedido,
      itens: itens.map((i) => ({
        produto: i.produto_nome,
        quantidade: i.quantidade,
        preco_unitario: Number(i.preco_unitario),
      })),
    });
  } catch (err) {
    handleErroInterno(res, err, "buscar detalhamento de pedido");
  }
});

/**
 * @openapi
 * /api/admin/pedidos/{id}/pagamento:
 *   put:
 *     tags: [Admin, Pedidos]
 *     summary: Atualiza o status de pagamento de um pedido (dispara comunicação automática quando marcado como pago)
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               status_pagamento:
 *                 type: string
 *                 enum: [pendente, pago, falhou, estornado]
 *     responses:
 *       200:
 *         description: Status de pagamento atualizado
 *       400:
 *         description: Status inválido
 *       404:
 *         description: Pedido não encontrado
 *       500:
 *         description: Erro ao atualizar status de pagamento
 */

// ✅ PUT /api/admin/pedidos/:id/pagamento
router.put("/:id/pagamento", verifyAdmin, async (req, res) => {
  const { id } = req.params;
  const { status_pagamento } = req.body;

  const permitidos = ["pendente", "pago", "falhou", "estornado"];
  if (!permitidos.includes(status_pagamento)) {
    return res
      .status(400)
      .json({ message: "status_pagamento inválido", status_pagamento });
  }

  try {
    const [result] = await pool.query(
      "UPDATE pedidos SET status_pagamento = ? WHERE id = ?",
      [status_pagamento, id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Pedido não encontrado" });
    }

    // 🔔 Se o pagamento foi marcado como "pago", dispara comunicação automática
    if (status_pagamento === "pago") {
      try {
        await dispararEventoComunicacao("pagamento_aprovado", Number(id));
      } catch (errCom) {
        console.error(
          "[adminPedidos] Erro ao disparar comunicação de pagamento aprovado:",
          errCom
        );
      }
    }

    res.json({ message: "Status de pagamento atualizado com sucesso" });
  } catch (err) {
    handleErroInterno(res, err, "atualizar status de pagamento");
  }
});

/**
 * @openapi
 * /api/admin/pedidos/{id}/entrega:
 *   put:
 *     tags: [Admin, Pedidos]
 *     summary: Atualiza o status de entrega de um pedido (dispara comunicação automática quando marcado como enviado)
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               status_entrega:
 *                 type: string
 *                 enum: [em_separacao, processando, enviado, entregue, cancelado]
 *     responses:
 *       200:
 *         description: Status de entrega atualizado
 *       400:
 *         description: Status inválido
 *       404:
 *         description: Pedido não encontrado
 *       500:
 *         description: Erro ao atualizar status de entrega
 */

// ✅ PUT /api/admin/pedidos/:id/entrega
router.put("/:id/entrega", verifyAdmin, async (req, res) => {
  const { id } = req.params;
  const { status_entrega } = req.body;

  const permitidos = [
    "em_separacao",
    "processando",
    "enviado",
    "entregue",
    "cancelado",
  ];
  if (!permitidos.includes(status_entrega)) {
    return res
      .status(400)
      .json({ message: "status_entrega inválido", status_entrega });
  }

  try {
    const [result] = await pool.query(
      "UPDATE pedidos SET status_entrega = ? WHERE id = ?",
      [status_entrega, id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Pedido não encontrado" });
    }

    // 🔔 Se o status de entrega foi marcado como "enviado", dispara comunicação automática
    if (status_entrega === "enviado") {
      try {
        await dispararEventoComunicacao("pedido_enviado", Number(id));
      } catch (errCom) {
        console.error(
          "[adminPedidos] Erro ao disparar comunicação de pedido enviado:",
          errCom
        );
      }
    }

    res.json({ message: "Status de entrega atualizado com sucesso" });
  } catch (err) {
    handleErroInterno(res, err, "atualizar status de entrega");
  }
});

module.exports = router;
