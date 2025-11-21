const express = require("express");
const router = express.Router();
const pool = require("../config/pool");
const verifyAdmin = require("../middleware/verifyAdmin");
const { parseAddress, serializeAddress } = require("../utils/address");

// 🔄 Função utilitária para tratar erros e exibir logs contextuais
const handleErroInterno = (res, err, contexto = "erro") => {
  console.error(`Erro ao ${contexto}:`, err);
  res.status(500).json({ message: `Erro ao ${contexto}` });
};

/**
 * @openapi
 * tags:
 *   - name: Admin
 *     description: Rotas de administração
 *   - name: Pedidos
 *     description: Gestão de pedidos no painel admin
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
 *         usuario:
 *           type: string
 *           example: "José da Silva"
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
 *       required: [id, usuario, forma_pagamento, status_pagamento, status_entrega, total, data_pedido]
 *
 *     AdminPedidoDetalhe:
 *       allOf:
 *         - $ref: '#/components/schemas/AdminPedidoResumo'
 *         - type: object
 *           properties:
 *             email:
 *               type: string
 *               nullable: true
 *               example: "cliente@exemplo.com"
 *             telefone:
 *               type: string
 *               nullable: true
 *               example: "33999998888"
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

// ✅ GET /admin/pedidos — Lista todos os pedidos com itens e endereço
router.get("/", verifyAdmin, async (req, res) => {
  try {
    const [pedidos] = await pool.query(`
      SELECT
        p.id AS pedido_id,
        u.nome AS usuario_nome,
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
      usuario: p.usuario_nome,
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

// ✅ GET /admin/pedidos/:id — Detalhe do pedido para a telinha do admin
router.get("/:id", verifyAdmin, async (req, res) => {
  const { id } = req.params;

  try {
    const [[pedido]] = await pool.query(
      `
      SELECT
        p.id AS pedido_id,
        u.nome AS usuario_nome,
        u.email AS usuario_email,
        u.telefone AS usuario_telefone,
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
      usuario: pedido.usuario_nome,
      email: pedido.usuario_email ?? null,
      telefone: pedido.usuario_telefone ?? null,
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
    handleErroInterno(res, err, "buscar detalhe do pedido");
  }
});

/**
 * @openapi
 * /api/admin/pedidos/{id}/entrega:
 *   put:
 *     tags: [Admin, Pedidos]
 *     summary: Atualiza o status de entrega de um pedido
 *     description: |
 *       Atualiza apenas o status de ENTREGA do pedido (fluxo logístico).
 *       Valores permitidos: em_separacao, processando, enviado, entregue, cancelado.
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID do pedido
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [status_entrega]
 *             properties:
 *               status_entrega:
 *                 type: string
 *                 enum: [em_separacao, processando, enviado, entregue, cancelado]
 *                 example: enviado
 *     responses:
 *       200:
 *         description: Status de entrega atualizado com sucesso
 *       400:
 *         description: Status de entrega inválido
 *       401:
 *         description: Não autorizado
 *       500:
 *         description: Erro interno ao atualizar status de entrega
 */

// ✅ PUT /admin/pedidos/:id/entrega — Atualiza o status de entrega do pedido
router.put("/:id/entrega", verifyAdmin, async (req, res) => {
  const { status_entrega } = req.body;
  const { id } = req.params;

  const valoresValidos = [
    "em_separacao",
    "processando",
    "enviado",
    "entregue",
    "cancelado",
  ];

  if (!valoresValidos.includes(status_entrega)) {
    return res.status(400).json({
      message:
        "status_entrega inválido. Use em_separacao, processando, enviado, entregue ou cancelado.",
    });
  }

  try {
    await pool.query("UPDATE pedidos SET status_entrega = ? WHERE id = ?", [
      status_entrega,
      id,
    ]);

    // opcional: manter coluna legada `status` em sincronia, se ela ainda existir
    try {
      await pool.query("UPDATE pedidos SET status = ? WHERE id = ?", [
        status_entrega,
        id,
      ]);
    } catch {
      // se não existir a coluna `status`, ignoramos
    }

    res.json({ message: "Status de entrega atualizado com sucesso!" });
  } catch (err) {
    handleErroInterno(res, err, "atualizar status de entrega do pedido");
  }
});

/**
 * @openapi
 * /api/admin/pedidos/{id}/status:
 *   put:
 *     tags: [Admin, Pedidos]
 *     summary: (Legado) Atualiza o status de entrega do pedido
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
 *               status:
 *                 type: string
 *                 example: "entregue"
 *     responses:
 *       200:
 *         description: Status atualizado
 *       401:
 *         description: Não autorizado
 *       500:
 *         description: Erro interno
 */

// ✅ Legado: PUT /admin/pedidos/:id/status — agora também mexe em status_entrega
router.put("/:id/status", verifyAdmin, async (req, res) => {
  const { status } = req.body;
  const { id } = req.params;

  try {
    await pool.query("UPDATE pedidos SET status_entrega = ? WHERE id = ?", [
      status,
      id,
    ]);
    try {
      await pool.query("UPDATE pedidos SET status = ? WHERE id = ?", [
        status,
        id,
      ]);
    } catch {
      // se coluna `status` não existir, ignora
    }

    res.json({ message: "Status atualizado com sucesso!" });
  } catch (err) {
    handleErroInterno(res, err, "atualizar status do pedido");
  }
});

/**
 * @openapi
 * /api/admin/pedidos/{id}/pagamento:
 *   put:
 *     tags: [Admin, Pedidos]
 *     summary: Atualiza o status de pagamento de um pedido (manual)
 *     description: |
 *       Uso interno do admin para ajustar manualmente o status de PAGAMENTO,
 *       por exemplo para pedidos pagos via Pix direto ou acerto offline.
 *       Valores permitidos: pendente, pago, falhou, estornado.
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID do pedido
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [status_pagamento]
 *             properties:
 *               status_pagamento:
 *                 type: string
 *                 enum: [pendente, pago, falhou, estornado]
 *                 example: pago
 *     responses:
 *       200:
 *         description: Status de pagamento atualizado com sucesso
 *       400:
 *         description: Status de pagamento inválido
 *       401:
 *         description: Não autorizado
 *       500:
 *         description: Erro interno ao atualizar status de pagamento
 */

// ✅ PUT /admin/pedidos/:id/pagamento — Atualizar status_pagamento manualmente
router.put("/:id/pagamento", verifyAdmin, async (req, res) => {
  const { status_pagamento } = req.body;
  const { id } = req.params;

  const valoresValidos = ["pendente", "pago", "falhou", "estornado"];

  if (!valoresValidos.includes(status_pagamento)) {
    return res.status(400).json({
      message:
        "status_pagamento inválido. Use pendente, pago, falhou ou estornado.",
    });
  }

  try {
    await pool.query("UPDATE pedidos SET status_pagamento = ? WHERE id = ?", [
      status_pagamento,
      id,
    ]);
    res.json({ message: "Status de pagamento atualizado com sucesso!" });
  } catch (err) {
    handleErroInterno(res, err, "atualizar status de pagamento do pedido");
  }
});

/**
 * @openapi
 * /api/admin/pedidos/{id}/endereco:
 *   put:
 *     tags: [Admin, Pedidos]
 *     summary: Atualiza o endereço de um pedido
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID do pedido
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               endereco:
 *                 type: object
 *                 properties:
 *                   cep: { type: string }
 *                   rua: { type: string }
 *                   numero: { type: string }
 *                   bairro: { type: string }
 *                   cidade: { type: string }
 *                   estado: { type: string }
 *     responses:
 *       200:
 *         description: Endereço atualizado
 *       401:
 *         description: Não autorizado
 *       500:
 *         description: Erro interno
 */

// ✅ PUT /admin/pedidos/:id/endereco — Atualiza o endereço do pedido
router.put("/:id/endereco", verifyAdmin, async (req, res) => {
  const { endereco } = req.body;
  const { id } = req.params;

  try {
    const enderecoJson = serializeAddress(endereco);
    await pool.query("UPDATE pedidos SET endereco = ? WHERE id = ?", [
      enderecoJson,
      id,
    ]);
    res.json({ message: "Endereço atualizado com sucesso!" });
  } catch (err) {
    if (
      err instanceof Error &&
      (err.message?.includes("Campo de endereço") ||
        err.message?.includes("CEP"))
    ) {
      return res.status(400).json({ message: err.message });
    }
    handleErroInterno(res, err, "atualizar endereço do pedido");
  }
});

/**
 * @openapi
 * /api/admin/pedidos/{id}/itens:
 *   put:
 *     tags: [Admin, Pedidos]
 *     summary: Substitui os itens do pedido
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID do pedido
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               itens:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     produto_id: { type: integer }
 *                     quantidade: { type: integer }
 *     responses:
 *       200:
 *         description: Itens atualizados
 *       400:
 *         description: Itens inválidos
 *       401:
 *         description: Não autorizado
 *       500:
 *         description: Erro interno
 */

// ✅ PUT /admin/pedidos/:id/itens — Substitui os itens do pedido
router.put("/:id/itens", verifyAdmin, async (req, res) => {
  const { itens } = req.body;
  const { id: pedidoId } = req.params;

  if (!Array.isArray(itens)) {
    return res.status(400).json({ message: "Itens inválidos." });
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    await connection.query(
      "DELETE FROM pedidos_produtos WHERE pedido_id = ?",
      [pedidoId]
    );

    let total = 0;

    for (const item of itens) {
      const quantidade = Number(item.quantidade);
      const produtoId = Number(item.produto_id);
      const valorUnitario = Number(
        item.valor_unitario ?? item.preco_unitario ?? 0
      );

      if (!produtoId || !Number.isInteger(quantidade) || quantidade <= 0) {
        throw new Error("Itens devem conter produto_id e quantidade válida.");
      }

      total += valorUnitario * quantidade;

      await connection.query(
        "INSERT INTO pedidos_produtos (pedido_id, produto_id, quantidade, valor_unitario) VALUES (?, ?, ?, ?)",
        [pedidoId, produtoId, quantidade, valorUnitario]
      );
    }

    await connection.query("UPDATE pedidos SET total = ? WHERE id = ?", [
      total,
      pedidoId,
    ]);

    await connection.commit();
    res.json({ message: "Itens atualizados com sucesso!", total });
  } catch (err) {
    await connection.rollback();
    handleErroInterno(res, err, "atualizar itens do pedido");
  } finally {
    connection.release();
  }
});

module.exports = router;
