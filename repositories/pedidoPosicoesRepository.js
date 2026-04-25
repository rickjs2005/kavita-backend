"use strict";
// repositories/pedidoPosicoesRepository.js
//
// Historico de fixacoes GPS feitas pelo motorista por pedido.
// Sempre append-only. Service decide se promove pra pedidos.lat/lng.

const pool = require("../config/pool");

async function create(
  { pedido_id, parada_id, motorista_id, latitude, longitude, origem = "fixacao_motorista" },
  conn = pool,
) {
  const [r] = await conn.query(
    `INSERT INTO pedido_posicoes_motorista
       (pedido_id, parada_id, motorista_id, latitude, longitude, origem)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [pedido_id, parada_id ?? null, motorista_id, latitude, longitude, origem],
  );
  return r.insertId;
}

async function listByPedido(pedidoId, { limit = 20 } = {}, conn = pool) {
  const [rows] = await conn.query(
    `SELECT * FROM pedido_posicoes_motorista
      WHERE pedido_id = ?
      ORDER BY created_at DESC
      LIMIT ?`,
    [pedidoId, Number(limit)],
  );
  return rows;
}

/**
 * Atualiza pedidos.endereco_latitude/longitude APENAS se ainda for NULL
 * (preserva o "primeiro acerto" da fonte de verdade do endereco).
 * Retorna true se atualizou.
 */
async function setPedidoLatLngIfEmpty(pedidoId, latitude, longitude, conn = pool) {
  const [r] = await conn.query(
    `UPDATE pedidos
        SET endereco_latitude = ?,
            endereco_longitude = ?
      WHERE id = ?
        AND endereco_latitude IS NULL
        AND endereco_longitude IS NULL`,
    [latitude, longitude, pedidoId],
  );
  return r.affectedRows > 0;
}

module.exports = { create, listByPedido, setPedidoLatLngIfEmpty };
