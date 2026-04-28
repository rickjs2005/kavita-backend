"use strict";
// repositories/rotaParadasRepository.js
//
// Paradas (M:N rotas <-> pedidos). UNIQUE(rota_id, pedido_id).
// Regras de "1 pedido em 1 rota ativa" ficam no service.

const pool = require("../config/pool");

async function findById(id, conn = pool) {
  const [rows] = await conn.query(
    `SELECT p.*, r.status AS rota_status, r.motorista_id AS rota_motorista_id
       FROM rota_paradas p
       JOIN rotas r ON r.id = p.rota_id
      WHERE p.id = ?
      LIMIT 1`,
    [id],
  );
  return rows[0] || null;
}

/**
 * Lista paradas de uma rota com dados leves do pedido pra montar
 * o card no admin OU no motorista.
 */
async function listByRotaId(rotaId, conn = pool) {
  const [rows] = await conn.query(
    `SELECT p.id, p.rota_id, p.pedido_id, p.ordem, p.status,
            p.entregue_em, p.observacao_motorista, p.ocorrencia_id,
            p.comprovante_foto_url, p.assinatura_url,
            p.created_at, p.updated_at,
            ped.endereco         AS pedido_endereco,
            ped.tipo_endereco    AS pedido_tipo_endereco,
            ped.endereco_latitude   AS pedido_lat,
            ped.endereco_longitude  AS pedido_lng,
            ped.observacao_entrega  AS pedido_observacao_entrega,
            ped.total            AS pedido_total,
            ped.forma_pagamento  AS pedido_forma_pagamento,
            ped.data_pedido      AS pedido_criado_em,
            u.id     AS usuario_id,
            u.nome   AS usuario_nome,
            u.email  AS usuario_email,
            u.telefone AS usuario_telefone,
            oc.tipo       AS ocorrencia_tipo,
            oc.motivo     AS ocorrencia_motivo,
            oc.observacao AS ocorrencia_observacao,
            oc.created_at AS ocorrencia_criado_em
       FROM rota_paradas p
       JOIN pedidos ped ON ped.id = p.pedido_id
       LEFT JOIN usuarios u ON u.id = ped.usuario_id
       LEFT JOIN pedido_ocorrencias oc ON oc.id = p.ocorrencia_id
      WHERE p.rota_id = ?
      ORDER BY p.ordem ASC, p.id ASC`,
    [rotaId],
  );
  return rows;
}

async function listItensDoPedido(pedidoId, conn = pool) {
  const [rows] = await conn.query(
    `SELECT pp.produto_id, pp.quantidade, pp.valor_unitario, pp.subtotal,
            pr.name AS produto_nome
       FROM pedidos_produtos pp
       JOIN products pr ON pr.id = pp.produto_id
      WHERE pp.pedido_id = ?
      ORDER BY pp.id ASC`,
    [pedidoId],
  );
  return rows;
}

/**
 * Verifica se o pedido ja' esta' em alguma rota ATIVA
 * (status NOT IN ('cancelada','finalizada')).
 * Retorna a parada existente ou null.
 */
async function findActiveStopByPedidoId(pedidoId, conn = pool) {
  const [rows] = await conn.query(
    `SELECT p.id, p.rota_id, r.status AS rota_status
       FROM rota_paradas p
       JOIN rotas r ON r.id = p.rota_id
      WHERE p.pedido_id = ?
        AND r.status NOT IN ('cancelada','finalizada')
      LIMIT 1`,
    [pedidoId],
  );
  return rows[0] || null;
}

async function findByRotaAndPedido(rotaId, pedidoId, conn = pool) {
  const [rows] = await conn.query(
    `SELECT * FROM rota_paradas
      WHERE rota_id = ? AND pedido_id = ?
      LIMIT 1`,
    [rotaId, pedidoId],
  );
  return rows[0] || null;
}

async function nextOrdem(rotaId, conn = pool) {
  const [[row]] = await conn.query(
    "SELECT COALESCE(MAX(ordem), 0) + 1 AS next FROM rota_paradas WHERE rota_id = ?",
    [rotaId],
  );
  return Number(row?.next || 1);
}

async function create({ rota_id, pedido_id, ordem }, conn = pool) {
  const [r] = await conn.query(
    "INSERT INTO rota_paradas (rota_id, pedido_id, ordem) VALUES (?, ?, ?)",
    [rota_id, pedido_id, ordem],
  );
  return r.insertId;
}

async function deleteById(id, conn = pool) {
  const [r] = await conn.query("DELETE FROM rota_paradas WHERE id = ?", [id]);
  return r.affectedRows;
}

async function deleteByRotaAndPedido(rotaId, pedidoId, conn = pool) {
  const [r] = await conn.query(
    "DELETE FROM rota_paradas WHERE rota_id = ? AND pedido_id = ?",
    [rotaId, pedidoId],
  );
  return r.affectedRows;
}

/**
 * Atualiza ordem em batch dentro de uma transacao.
 * `ordens` = [{ pedido_id, ordem }, ...]
 */
async function updateOrdensBulk(rotaId, ordens, conn = pool) {
  for (const o of ordens) {
    await conn.query(
      `UPDATE rota_paradas SET ordem = ?
        WHERE rota_id = ? AND pedido_id = ?`,
      [o.ordem, rotaId, o.pedido_id],
    );
  }
}

/**
 * Fase 5 — atualiza colunas de comprovante (foto + assinatura).
 * Aceita patch parcial: so' atualiza colunas que vierem em `updates`.
 */
async function updateComprovante(id, updates, conn = pool) {
  const allowed = ["comprovante_foto_url", "assinatura_url"];
  const sets = [];
  const params = [];
  for (const k of allowed) {
    if (Object.prototype.hasOwnProperty.call(updates, k)) {
      sets.push(`${k} = ?`);
      params.push(updates[k]);
    }
  }
  if (sets.length === 0) return 0;
  params.push(id);
  const [r] = await conn.query(
    `UPDATE rota_paradas SET ${sets.join(", ")} WHERE id = ?`,
    params,
  );
  return r.affectedRows;
}

async function updateStatus(id, patch, conn = pool) {
  const allowed = [
    "status",
    "entregue_em",
    "observacao_motorista",
    "ocorrencia_id",
  ];
  const sets = [];
  const params = [];
  for (const k of allowed) {
    if (Object.prototype.hasOwnProperty.call(patch, k)) {
      sets.push(`${k} = ?`);
      params.push(patch[k]);
    }
  }
  if (sets.length === 0) return 0;
  params.push(id);
  const [r] = await conn.query(
    `UPDATE rota_paradas SET ${sets.join(", ")} WHERE id = ?`,
    params,
  );
  return r.affectedRows;
}

module.exports = {
  findById,
  listByRotaId,
  listItensDoPedido,
  findActiveStopByPedidoId,
  findByRotaAndPedido,
  nextOrdem,
  create,
  deleteById,
  deleteByRotaAndPedido,
  updateOrdensBulk,
  updateStatus,
  updateComprovante,
};
