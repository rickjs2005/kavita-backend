"use strict";
// repositories/relatoriosRepository.js
// SQL queries for admin reports.

const pool = require("../config/pool");

async function getVendasPorDia() {
  const [rows] = await pool.query(`
    SELECT
      DATE(p.data_pedido) AS dia,
      SUM(p.total) AS total
    FROM pedidos p
    WHERE p.status_pagamento = 'pago'
    GROUP BY dia
    ORDER BY dia ASC
  `);
  return rows;
}

async function getProdutosMaisVendidos() {
  const [rows] = await pool.query(`
    SELECT
      pr.id,
      pr.name,
      SUM(pp.quantidade) AS vendidos,
      SUM(pp.quantidade * pp.valor_unitario) AS total_faturado
    FROM pedidos_produtos pp
    JOIN products pr ON pr.id = pp.produto_id
    GROUP BY pr.id, pr.name
    ORDER BY vendidos DESC
    LIMIT 20
  `);
  return rows;
}

async function getClientesTop() {
  const [rows] = await pool.query(`
    SELECT
      u.id,
      u.nome,
      u.email,
      COUNT(p.id) AS pedidos,
      SUM(p.total) AS total_gasto
    FROM pedidos p
    JOIN usuarios u ON u.id = p.usuario_id
    WHERE p.status_pagamento = 'pago'
    GROUP BY u.id, u.nome, u.email
    ORDER BY total_gasto DESC
    LIMIT 20
  `);
  return rows;
}

async function getEstoque() {
  const [rows] = await pool.query(`
    SELECT id, name, quantity, price
    FROM products
    ORDER BY quantity ASC
  `);
  return rows;
}

async function getEstoqueBaixo() {
  const [rows] = await pool.query(`
    SELECT id, name, quantity, price
    FROM products
    WHERE quantity <= 5
    ORDER BY quantity ASC
  `);
  return rows;
}

async function getServicosPorEspecialidade() {
  const [porEspecialidade] = await pool.query(`
    SELECT
      e.id AS especialidade_id,
      e.nome AS especialidade_nome,
      COUNT(c.id) AS total_servicos
    FROM colaboradores c
    LEFT JOIN especialidades e ON c.especialidade_id = e.id
    GROUP BY e.id, e.nome
    ORDER BY total_servicos DESC, especialidade_nome ASC
  `);

  const [[totais]] = await pool.query(
    "SELECT COUNT(*) AS total_servicos FROM colaboradores"
  );

  return {
    totalServicos: Number(totais.total_servicos || 0),
    labels: porEspecialidade.map((r) => r.especialidade_nome || "Sem categoria"),
    values: porEspecialidade.map((r) => Number(r.total_servicos)),
    porEspecialidade,
  };
}

async function getServicosRanking() {
  const [rows] = await pool.query(`
    SELECT
      c.id,
      c.nome,
      c.cargo,
      c.rating_avg,
      c.rating_count,
      c.total_servicos,
      c.views_count,
      c.whatsapp_clicks,
      e.nome AS especialidade_nome
    FROM colaboradores c
    LEFT JOIN especialidades e ON e.id = c.especialidade_id
    ORDER BY c.rating_avg DESC, c.total_servicos DESC, c.views_count DESC
    LIMIT 50
  `);
  return rows;
}

module.exports = {
  getVendasPorDia,
  getProdutosMaisVendidos,
  getClientesTop,
  getEstoque,
  getEstoqueBaixo,
  getServicosPorEspecialidade,
  getServicosRanking,
};
