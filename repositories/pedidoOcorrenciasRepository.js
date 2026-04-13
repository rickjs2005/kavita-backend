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
 * Verifica se já existe ocorrência em andamento do mesmo tipo para o pedido.
 * Inclui aguardando_retorno — cliente não pode abrir outra enquanto há pendência.
 */
async function findOpenByPedidoAndTipo(pedidoId, tipo) {
  const [[row]] = await pool.query(
    `SELECT id, status FROM pedido_ocorrencias
     WHERE pedido_id = ? AND tipo = ? AND status IN ('aberta', 'em_analise', 'aguardando_retorno')
     LIMIT 1`,
    [pedidoId, tipo]
  );
  return row ?? null;
}

/**
 * Busca ocorrências de um pedido (visão do cliente).
 * Retorna status, resposta do admin e datas.
 */
async function findByPedidoId(pedidoId) {
  const [rows] = await pool.query(
    `SELECT id, tipo, motivo, observacao, resposta_cliente, endereco_sugerido,
            status, resposta_admin,
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
       oc.resposta_cliente,
       oc.endereco_sugerido,
       oc.status,
       oc.resposta_admin,
       oc.endereco_corrigido,
       COALESCE(oc.taxa_extra, 0) AS taxa_extra,
       oc.admin_id,
       oc.created_at,
       oc.updated_at,
       p.endereco         AS pedido_endereco,
       p.status_pagamento AS pedido_status_pagamento,
       p.status_entrega   AS pedido_status_entrega,
       p.forma_pagamento  AS pedido_forma_pagamento,
       (p.total + COALESCE(p.shipping_price, 0)) AS pedido_total,
       p.data_pedido       AS pedido_data,
       (SELECT fb.nota FROM ocorrencia_feedbacks fb WHERE fb.ocorrencia_id = oc.id LIMIT 1) AS feedback_nota,
       (SELECT fb.comentario FROM ocorrencia_feedbacks fb WHERE fb.ocorrencia_id = oc.id LIMIT 1) AS feedback_comentario
     FROM pedido_ocorrencias oc
     JOIN usuarios u ON u.id = oc.usuario_id
     JOIN pedidos  p ON p.id = oc.pedido_id
     ORDER BY
       FIELD(oc.status, 'aberta', 'em_analise', 'aguardando_retorno', 'resolvida', 'rejeitada'),
       oc.created_at DESC`
  );
  return rows;
}

/**
 * Cliente responde uma ocorrência em aguardando_retorno.
 * Salva resposta + endereço sugerido e muda status para em_analise.
 */
async function replyByClient(id, { respostaCliente, enderecoSugerido }) {
  const [result] = await pool.query(
    `UPDATE pedido_ocorrencias
     SET resposta_cliente = ?, endereco_sugerido = ?, status = 'em_analise'
     WHERE id = ? AND status = 'aguardando_retorno'`,
    [respostaCliente, enderecoSugerido ? JSON.stringify(enderecoSugerido) : null, id]
  );
  return result.affectedRows > 0;
}

/**
 * Busca ocorrência por id e usuario_id (ownership check para o cliente).
 */
async function findByIdAndUserId(id, usuarioId) {
  const [[row]] = await pool.query(
    `SELECT * FROM pedido_ocorrencias WHERE id = ? AND usuario_id = ?`,
    [id, usuarioId]
  );
  return row ?? null;
}

/**
 * Admin atualiza status/resposta de uma ocorrência.
 * Registra admin_id para auditoria.
 */
async function updateByAdmin(id, { status, respostaAdmin, taxaExtra, adminId, enderecoCorrigido }) {
  const [result] = await pool.query(
    `UPDATE pedido_ocorrencias
     SET status = ?, resposta_admin = ?, taxa_extra = ?, admin_id = ?, endereco_corrigido = ?
     WHERE id = ?`,
    [status, respostaAdmin || null, taxaExtra ?? null, adminId ?? null, enderecoCorrigido ?? null, id]
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

/**
 * Lista paginada com filtros server-side (visão admin).
 */
async function findAllAdminPaginated({ page = 1, limit = 20, status, motivo } = {}) {
  const where = [];
  const params = [];

  if (status) { where.push("oc.status = ?"); params.push(status); }
  if (motivo) { where.push("oc.motivo = ?"); params.push(motivo); }

  const whereSql = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";
  const offset = (page - 1) * limit;

  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) AS total FROM pedido_ocorrencias oc ${whereSql}`,
    params
  );

  const [rows] = await pool.query(
    `SELECT
       oc.id, oc.pedido_id, oc.usuario_id,
       u.nome AS usuario_nome, u.email AS usuario_email, u.telefone AS usuario_telefone,
       oc.tipo, oc.motivo, oc.observacao,
       oc.resposta_cliente, oc.endereco_sugerido,
       oc.status, oc.resposta_admin, oc.endereco_corrigido,
       COALESCE(oc.taxa_extra, 0) AS taxa_extra, oc.admin_id,
       oc.created_at, oc.updated_at,
       p.endereco AS pedido_endereco, p.status_pagamento AS pedido_status_pagamento,
       p.status_entrega AS pedido_status_entrega, p.forma_pagamento AS pedido_forma_pagamento,
       (p.total + COALESCE(p.shipping_price, 0)) AS pedido_total, p.data_pedido AS pedido_data,
       (SELECT fb.nota FROM ocorrencia_feedbacks fb WHERE fb.ocorrencia_id = oc.id LIMIT 1) AS feedback_nota,
       (SELECT fb.comentario FROM ocorrencia_feedbacks fb WHERE fb.ocorrencia_id = oc.id LIMIT 1) AS feedback_comentario
     FROM pedido_ocorrencias oc
     JOIN usuarios u ON u.id = oc.usuario_id
     JOIN pedidos  p ON p.id = oc.pedido_id
     ${whereSql}
     ORDER BY
       FIELD(oc.status, 'aberta', 'em_analise', 'aguardando_retorno', 'resolvida', 'rejeitada'),
       oc.created_at DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  return { rows, total: Number(total) };
}

/**
 * Conta ocorrências criadas pelo usuário nos últimos N minutos.
 * Usado para rate limiting.
 */
async function countRecentByUserId(usuarioId, minutes) {
  const [[row]] = await pool.query(
    `SELECT COUNT(*) AS total FROM pedido_ocorrencias
     WHERE usuario_id = ? AND created_at >= DATE_SUB(NOW(), INTERVAL ? MINUTE)`,
    [usuarioId, minutes]
  );
  return Number(row.total);
}

/**
 * Contagem de ocorrências pendentes agrupada por status.
 */
async function countByStatus() {
  const [rows] = await pool.query(
    `SELECT status, COUNT(*) AS total
     FROM pedido_ocorrencias
     WHERE status IN ('aberta', 'em_analise', 'aguardando_retorno')
     GROUP BY status`
  );
  const counts = { aberta: 0, em_analise: 0, aguardando_retorno: 0 };
  for (const r of rows) counts[r.status] = Number(r.total);
  return counts;
}

module.exports = {
  create,
  findOpenByPedidoAndTipo,
  findByPedidoId,
  findAllAdmin,
  findAllAdminPaginated,
  replyByClient,
  findByIdAndUserId,
  updateByAdmin,
  findById,
  countRecentByUserId,
  countByStatus,
};
