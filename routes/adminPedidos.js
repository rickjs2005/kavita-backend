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

// ✅ GET /admin/pedidos — Lista todos os pedidos com itens e endereço
router.get("/", verifyAdmin, async (req, res) => {
  try {
    // Consulta os pedidos com informações do usuário
    const [pedidos] = await pool.query(`
      SELECT
        p.id AS pedido_id,
        u.nome AS usuario_nome,
        p.endereco,
        p.forma_pagamento,
        p.status,
        p.total,
        p.data_pedido
      FROM pedidos p
      JOIN usuarios u ON p.usuario_id = u.id
      ORDER BY p.data_pedido DESC
    `);

    // Consulta os itens de todos os pedidos
    const [itens] = await pool.query(`
      SELECT
        pp.pedido_id,
        pr.name AS produto_nome,
        pp.quantidade,
        pp.valor_unitario AS preco_unitario
      FROM pedidos_produtos pp
      JOIN products pr ON pp.produto_id = pr.id
    `);

    // Agrupa os pedidos com seus respectivos itens
    const pedidosComItens = pedidos.map((p) => ({
      id: p.pedido_id,
      usuario: p.usuario_nome,
      endereco: parseAddress(p.endereco),
      forma_pagamento: p.forma_pagamento,
      status: p.status,
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

// ✅ PUT /admin/pedidos/:id/status — Atualiza o status do pedido
router.put("/:id/status", verifyAdmin, async (req, res) => {
  const { status } = req.body;
  const { id } = req.params;

  try {
    await pool.query("UPDATE pedidos SET status = ? WHERE id = ?", [status, id]);
    res.json({ message: "Status atualizado com sucesso!" });
  } catch (err) {
    handleErroInterno(res, err, "atualizar status do pedido");
  }
});

// ✅ PUT /admin/pedidos/:id/endereco — Atualiza o endereço do pedido
router.put("/:id/endereco", verifyAdmin, async (req, res) => {
  const { endereco } = req.body;
  const { id } = req.params;

  try {
    const enderecoJson = serializeAddress(endereco);
    await pool.query(
      "UPDATE pedidos SET endereco = ? WHERE id = ?",
      [enderecoJson, id]
    );
    res.json({ message: "Endereço atualizado com sucesso!" });
  } catch (err) {
    if (
      err instanceof Error &&
      (err.message?.includes("Campo de endereço") || err.message?.includes("CEP"))
    ) {
      return res.status(400).json({ message: err.message });
    }
    handleErroInterno(res, err, "atualizar endereço do pedido");
  }
});

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
 *         description: Lista de pedidos
 *       401:
 *         description: Não autorizado
 *       500:
 *         description: Erro ao buscar pedidos
 */

/**
 * @openapi
 * /api/admin/pedidos/{id}/status:
 *   put:
 *     tags: [Admin, Pedidos]
 *     summary: Atualiza o status do pedido
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               status: { type: string, example: "entregue" }
 *     responses:
 *       200:
 *         description: Status atualizado
 *       401:
 *         description: Não autorizado
 *       500:
 *         description: Erro interno
 */

/**
 * @openapi
 * /api/admin/pedidos/{id}/endereco:
 *   put:
 *     tags: [Admin, Pedidos]
 *     summary: Atualiza o endereço de um pedido
 *     security:
 *       - BearerAuth: []
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

/**
 * @openapi
 * /api/admin/pedidos/{id}/itens:
 *   put:
 *     tags: [Admin, Pedidos]
 *     summary: Substitui os itens do pedido
 *     security:
 *       - BearerAuth: []
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

  // Verifica se o corpo da requisição contém um array de itens
  if (!Array.isArray(itens)) {
    return res.status(400).json({ message: "Itens inválidos." });
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction(); // Inicia transação para garantir integridade

    // Remove todos os itens antigos do pedido
    await connection.query(
      "DELETE FROM pedidos_produtos WHERE pedido_id = ?",
      [pedidoId]
    );

    let total = 0;
    // Insere os novos itens
    for (const item of itens) {
      const quantidade = Number(item.quantidade);
      const produtoId = Number(item.produto_id);
      const valorUnitario = Number(item.valor_unitario ?? item.preco_unitario ?? 0);

      if (!produtoId || !Number.isInteger(quantidade) || quantidade <= 0) {
        throw new Error("Itens devem conter produto_id e quantidade válida.");
      }

      total += valorUnitario * quantidade;

      await connection.query(
        "INSERT INTO pedidos_produtos (pedido_id, produto_id, quantidade, valor_unitario) VALUES (?, ?, ?, ?)",
        [pedidoId, produtoId, quantidade, valorUnitario]
      );
    }

    await connection.query(
      "UPDATE pedidos SET total = ? WHERE id = ?",
      [total, pedidoId]
    );

    await connection.commit(); // Finaliza a transação
    res.json({ message: "Itens atualizados com sucesso!", total });
  } catch (err) {
    await connection.rollback(); // Reverte caso ocorra erro
    handleErroInterno(res, err, "atualizar itens do pedido");
  } finally {
    connection.release(); // Libera a conexão
  }
});

module.exports = router;
