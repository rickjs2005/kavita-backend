"use strict";
// repositories/pedidoOcorrenciasRepository.js
//
// Ocorrências abertas pelo cliente para sinalizar problemas em pedidos
// (ex.: endereço incorreto). Admin analisa via painel.

const pool = require("../config/pool");

/**
 * Cria ocorrência vinculada a um pedido do usuário.
 * Retorna o id gerado.
 */
async function create({ pedidoId, usuarioId, tipo, motivo, observacao }) {
  const [result] = await pool.query(
    `INSERT INTO pedido_ocorrencias (pedido_id, usuario_id, tipo, motivo, observacao)
     VALUES (?, ?, ?, ?, ?)`,
    [pedidoId, usuarioId, tipo, motivo, observacao || null]
  );
  return result.insertId;
}

/**
 * Verifica se já existe ocorrência aberta do mesmo tipo para o pedido.
 */
async function findOpenByPedidoAndTipo(pedidoId, tipo) {
  const [[row]] = await pool.query(
    `SELECT id, status FROM pedido_ocorrencias
     WHERE pedido_id = ? AND tipo = ? AND status IN ('aberta', 'em_analise')
     LIMIT 1`,
    [pedidoId, tipo]
  );
  return row ?? null;
}

/**
 * Busca ocorrências de um pedido (visão do cliente).
 */
async function findByPedidoId(pedidoId) {
  const [rows] = await pool.query(
    `SELECT id, tipo, motivo, observacao, status, resposta_admin,
            COALESCE(taxa_extra, 0) AS taxa_extra, created_at, updated_at
     FROM pedido_ocorrencias
     WHERE pedido_id = ?
     ORDER BY created_at DESC`,
    [pedidoId]
  );
  return rows;
}

/**
 * Lista todas as ocorrências com dados do pedido e cliente (visão admin).
 * Traz todas, independente do status, ordenadas por mais recentes primeiro.
 */
async function findAllAdmin() {
  const [rows] = await pool.query(
    `SELECT
       oc.id,
       oc.pedido_id,
       oc.usuario_id,
       u.nome             AS usuario_nome,
       u.email            AS usuario_email,
       u.telefone         AS usuario_telefone,
       oc.tipo,
       oc.motivo,
       oc.observacao,
       oc.status,
       oc.resposta_admin,
       COALESCE(oc.taxa_extra, 0) AS taxa_extra,
       oc.created_at,
       oc.updated_at,
       p.endereco         AS pedido_endereco,
       p.status_pagamento AS pedido_status_pagamento,
       p.status_entrega   AS pedido_status_entrega,
       p.forma_pagamento  AS pedido_forma_pagamento,
       (p.total + COALESCE(p.shipping_price, 0)) AS pedido_total,
       p.data_pedido       AS pedido_data
     FROM pedido_ocorrencias oc
     JOIN usuarios u ON u.id = oc.usuario_id
     JOIN pedidos  p ON p.id = oc.pedido_id
     ORDER BY
       FIELD(oc.status, 'aberta', 'em_analise', 'resolvida', 'rejeitada'),
       oc.created_at DESC`
  );
  return rows;
}

/**
 * Admin atualiza status/resposta de uma ocorrência.
 */
async function updateByAdmin(id, { status, respostaAdmin, taxaExtra }) {
  const [result] = await pool.query(
    `UPDATE pedido_ocorrencias
     SET status = ?, resposta_admin = ?, taxa_extra = ?
     WHERE id = ?`,
    [status, respostaAdmin || null, taxaExtra ?? null, id]
  );
  return result.affectedRows > 0;
}

/**
 * Busca ocorrência por id (admin).
 */
async function findById(id) {
  const [[row]] = await pool.query(
    `SELECT * FROM pedido_ocorrencias WHERE id = ?`,
    [id]
  );
  return row ?? null;
}

module.exports = {
  create,
  findOpenByPedidoAndTipo,
  findByPedidoId,
  findAllAdmin,
  updateByAdmin,
  findById,
};
