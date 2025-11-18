const pool = require("../config/pool");

/**
 * Cria um novo pedido a partir do checkout.
 * Espera no body:
 * {
 *   usuario_id,
 *   formaPagamento,
 *   endereco,
 *   produtos
 * }
 */
async function create(req, res, next) {
  const { usuario_id, formaPagamento, endereco, produtos } = req.body;

  try {
    // Serializa o endereço fornecido (ou objeto vazio) para JSON
    const enderecoStr = JSON.stringify(endereco || {});

    // Abre uma conexão separada para a transação
    const connection = await pool.getConnection();
    try {
      // Inicia a transação para garantir que todas as operações ocorram de forma atômica
      await connection.beginTransaction();

      // Insere o pedido inicial com total 0; o total será atualizado após inserir os itens
      const [pedidoIns] = await connection.query(
        `INSERT INTO pedidos (usuario_id, endereco, forma_pagamento, status, total, data_pedido, pagamento_id)
         VALUES (?, ?, ?, ?, ?, NOW(), ?)`,
        [usuario_id, enderecoStr, formaPagamento, "pendente", 0, null]
      );
      const pedidoId = pedidoIns.insertId;

      // Calcula o total do pedido e insere os itens
      let totalPedido = 0;
      if (Array.isArray(produtos) && produtos.length > 0) {
        // Extrai todos os IDs dos produtos do checkout
        const ids = produtos.map((p) => Number(p.id));
        // Busca preço e estoque atual dos produtos para evitar corrida de condições
        const [prodRows] = await connection.query(
          `SELECT id, price, quantity FROM products WHERE id IN (?) FOR UPDATE`,
          [ids]
        );
        // Mapeia dados por ID para acesso rápido
        const priceMap = {};
        prodRows.forEach((r) => {
          priceMap[Number(r.id)] = { price: Number(r.price), stock: Number(r.quantity) };
        });
        // Percorre cada item do pedido
        for (const item of produtos) {
          const produtoId = Number(item.id);
          const qtd = Number(item.quantidade || 0);
          if (!produtoId || !Number.isFinite(qtd) || qtd <= 0) {
            throw new Error("Produto inválido no checkout");
          }
          const info = priceMap[produtoId];
          if (!info) {
            throw new Error(`Produto ${produtoId} não encontrado`);
          }
          const valorUnitario = info.price;
          // Verifica se há estoque suficiente
          if (info.stock < qtd) {
            throw new Error(`Estoque insuficiente para o produto ${produtoId}`);
          }
          // Insere item na tabela pedidos_produtos com o preço atual
          await connection.query(
            `INSERT INTO pedidos_produtos (pedido_id, produto_id, quantidade, valor_unitario)
             VALUES (?, ?, ?, ?)`,
            [pedidoId, produtoId, qtd, valorUnitario]
          );
          // Atualiza o estoque do produto
          await connection.query(
            `UPDATE products SET quantity = quantity - ? WHERE id = ?`,
            [qtd, produtoId]
          );
          totalPedido += valorUnitario * qtd;
        }
      }

      // Atualiza o total do pedido no próprio registro
      await connection.query(
        `UPDATE pedidos SET total = ? WHERE id = ?`,
        [totalPedido, pedidoId]
      );

      // Finaliza transação
      await connection.commit();

      return res.status(201).json({
        success: true,
        message: "Pedido criado com sucesso",
        pedido_id: pedidoId,
        total: totalPedido,
      });
    } catch (err) {
      // Reverte a transação em caso de erro
      await connection.rollback();
      return next(err);
    } finally {
      connection.release();
    }
  } catch (err) {
    return next(err);
  }
}

module.exports = { create };