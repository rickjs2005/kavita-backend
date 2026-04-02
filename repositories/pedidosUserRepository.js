"use strict";
// repositories/pedidosUserRepository.js
//
// Escopo: leitura de pedidos do USUÁRIO autenticado (ecommerce).
// Não contém pedidos admin — para isso, usar orderRepository.js.
//
// Consumidor: controllers/pedidosUserController.js

const pool = require("../config/pool");

/**
 * Lista pedidos de um usuário, ordenados por data desc.
 * Retorna total = subtotal + frete.
 */
async function findByUserId(usuarioId) {
  const [rows] = await pool.query(
    `SELECT
       p.id,
       p.usuario_id,
       p.forma_pagamento,
       p.status,
       p.status_pagamento,
       p.data_pedido,
       (p.total + COALESCE(p.shipping_price, 0)) AS total
     FROM pedidos p
     WHERE p.usuario_id = ?
     ORDER BY p.data_pedido DESC`,
    [usuarioId]
  );
  return rows;
}

/**
 * Busca um pedido específico de um usuário (ownership check no WHERE).
 * Retorna null se não encontrado.
 */
async function findByIdAndUserId(pedidoId, usuarioId) {
  const [[row]] = await pool.query(
    `SELECT
       p.id,
       p.usuario_id,
       p.forma_pagamento,
       p.status,
       p.status_pagamento,
       p.data_pedido,
       p.endereco,
       p.total AS total_produtos,
       COALESCE(p.shipping_price, 0) AS shipping_price
     FROM pedidos p
     WHERE p.id = ? AND p.usuario_id = ?`,
    [pedidoId, usuarioId]
  );
  return row ?? null;
}

/**
 * Busca itens de um pedido com nome e imagem do produto.
 */
async function findItemsByPedidoId(pedidoId) {
  const [rows] = await pool.query(
    `SELECT
       pp.id,
       pp.produto_id,
       pp.quantidade,
       pp.valor_unitario AS preco,
       pr.name AS nome,
       pr.image AS imagem
     FROM pedidos_produtos pp
     JOIN products pr ON pr.id = pp.produto_id
     WHERE pp.pedido_id = ?`,
    [pedidoId]
  );
  return rows;
}

module.exports = { findByUserId, findByIdAndUserId, findItemsByPedidoId };
