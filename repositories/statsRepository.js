"use strict";
// repositories/statsRepository.js
// SQL queries for admin dashboard stats.

const pool = require("../config/pool");

async function getDashboardSummary() {
  const [[prodRow]] = await pool.query(
    "SELECT COUNT(*) AS total FROM products"
  );
  const [[pedRow]] = await pool.query(
    "SELECT COUNT(*) AS total FROM pedidos WHERE data_pedido >= DATE_SUB(NOW(), INTERVAL 30 DAY)"
  );
  const [[cliRow]] = await pool.query(
    "SELECT COUNT(*) AS total FROM usuarios"
  );
  const [[destRow]] = await pool.query(
    "SELECT COUNT(*) AS total FROM product_promotions"
  );
  const [[servRow]] = await pool.query(
    "SELECT COUNT(*) AS total FROM colaboradores"
  );
  const [[vendasRow]] = await pool.query(`
    SELECT
      COALESCE(SUM(pp.quantidade * pp.valor_unitario), 0) AS totalVendas,
      COUNT(DISTINCT p.id) AS pedidosPagos
    FROM pedidos p
    JOIN pedidos_produtos pp ON pp.pedido_id = p.id
    WHERE p.status_pagamento = 'pago'
      AND p.data_pedido >= DATE_SUB(NOW(), INTERVAL 30 DAY)
  `);

  const totalVendas30Dias = Number(vendasRow.totalVendas || 0);
  const pedidosPagos30 = Number(vendasRow.pedidosPagos || 0);

  return {
    totalProdutos: Number(prodRow.total || 0),
    totalPedidosUltimos30: Number(pedRow.total || 0),
    totalClientes: Number(cliRow.total || 0),
    totalDestaques: Number(destRow.total || 0),
    totalServicos: Number(servRow.total || 0),
    totalVendas30Dias,
    ticketMedio: pedidosPagos30 > 0 ? totalVendas30Dias / pedidosPagos30 : 0,
  };
}

async function getSalesSeries(rangeDays) {
  const [rows] = await pool.query(
    `
    SELECT
      DATE(p.data_pedido) AS dia,
      COALESCE(SUM(pp.quantidade * pp.valor_unitario), 0) AS total
    FROM pedidos p
    JOIN pedidos_produtos pp ON pp.pedido_id = p.id
    WHERE p.status_pagamento = 'pago'
      AND p.data_pedido >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
    GROUP BY DATE(p.data_pedido)
    ORDER BY dia ASC
    `,
    [rangeDays]
  );
  return rows;
}

async function getTopProducts(limit) {
  const [rows] = await pool.query(
    `
    SELECT
      pr.id,
      pr.name,
      SUM(pp.quantidade) AS quantidadeVendida,
      SUM(pp.quantidade * pp.valor_unitario) AS totalVendido
    FROM pedidos_produtos pp
    JOIN pedidos p   ON p.id = pp.pedido_id
    JOIN products pr ON pr.id = pp.produto_id
    WHERE p.status_pagamento = 'pago'
    GROUP BY pr.id, pr.name
    ORDER BY quantidadeVendida DESC
    LIMIT ?
    `,
    [limit]
  );
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    quantidadeVendida: Number(r.quantidadeVendida || 0),
    totalVendido: Number(r.totalVendido || 0),
  }));
}

module.exports = {
  getDashboardSummary,
  getSalesSeries,
  getTopProducts,
};
