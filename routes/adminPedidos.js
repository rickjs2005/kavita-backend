const express = require("express");
const router = express.Router();
const pool = require("../config/pool");
const verifyAdmin = require("../middleware/verifyAdmin");

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
        pr.price AS preco_unitario
      FROM pedidos_produtos pp
      JOIN products pr ON pp.produto_id = pr.id
    `);

    // Agrupa os pedidos com seus respectivos itens
    const pedidosComItens = pedidos.map((p) => ({
      id: p.pedido_id,
      usuario: p.usuario_nome,
      endereco: JSON.parse(p.endereco), // Converte string JSON para objeto
      forma_pagamento: p.forma_pagamento,
      status: p.status,
      data_pedido: p.data_pedido,
      itens: itens
        .filter((i) => i.pedido_id === p.pedido_id)
        .map((i) => ({
          produto: i.produto_nome,
          quantidade: i.quantidade,
          preco_unitario: i.preco_unitario,
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
    await pool.query(
      "UPDATE pedidos SET endereco = ? WHERE id = ?",
      [JSON.stringify(endereco), id]
    );
    res.json({ message: "Endereço atualizado com sucesso!" });
  } catch (err) {
    handleErroInterno(res, err, "atualizar endereço do pedido");
  }
});

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

    // Insere os novos itens
    for (const item of itens) {
      await connection.query(
        "INSERT INTO pedidos_produtos (pedido_id, produto_id, quantidade) VALUES (?, ?, ?)",
        [pedidoId, item.produto_id, item.quantidade]
      );
    }

    await connection.commit(); // Finaliza a transação
    res.json({ message: "Itens atualizados com sucesso!" });
  } catch (err) {
    await connection.rollback(); // Reverte caso ocorra erro
    handleErroInterno(res, err, "atualizar itens do pedido");
  } finally {
    connection.release(); // Libera a conexão
  }
});

module.exports = router;
