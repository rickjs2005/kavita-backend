// controllers/checkoutController.js
const pool = require("../config/pool") 

/**
 * Cria um novo pedido a partir do checkout.
 * Espera no body:
 * {
 *   usuario_id,
 *   formaPagamento,
 *   endereco,
 *   produtos,
 *   total
 * }
 */
async function create(req, res, next) {
  const { usuario_id, formaPagamento, endereco, produtos, total } = req.body;

  try {
    // Endereço salvo como JSON (como já está na sua tabela pedidos)
    const enderecoStr = JSON.stringify(endereco || {});

    // 1) Insere na tabela pedidos
    const [result] = await pool.query(
      `
      INSERT INTO pedidos (usuario_id, endereco, forma_pagamento, data_pedido, status, pagamento_id)
      VALUES (?, ?, ?, NOW(), ?, ?)
      `,
      [
        usuario_id,
        enderecoStr,
        formaPagamento,
        "pendente", // status inicial
        null, // pagamento_id (para integrar com Mercado Pago depois)
      ]
    );

    const pedidoId = result.insertId;

    // 2) (Opcional) inserir itens na tabela pedidos_produtos
    //    Descomente se essa tabela já existir no seu banco:
    //
    // if (Array.isArray(produtos) && produtos.length > 0) {
    //   const values = produtos.map((p) => [
    //     pedidoId,
    //     p.id,
    //     p.quantidade,
    //   ]);
    //
    //   await pool.query(
    //     "INSERT INTO pedidos_produtos (pedido_id, produto_id, quantidade) VALUES ?",
    //     [values]
    //   );
    // }

    return res.status(201).json({
      success: true,
      message: "Pedido criado com sucesso",
      pedido_id: pedidoId,
      total,
    });
  } catch (err) {
    return next(err);
  }
}

module.exports = { create };
