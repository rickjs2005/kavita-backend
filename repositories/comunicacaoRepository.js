"use strict";
// repositories/comunicacaoRepository.js
//
// Acesso a dados para o serviço de comunicação transacional.
// Tabelas: pedidos, usuarios (leitura), comunicacoes_enviadas (escrita).
// Consumido por: services/comunicacaoService.js

const pool = require("../config/pool");

/**
 * Busca os dados principais do pedido e do cliente para montar comunicações.
 * @param {number} pedidoId
 * @returns {Promise<object|null>}
 */
async function getPedidoBasico(pedidoId) {
  const [[pedido]] = await pool.query(
    `
    SELECT
      p.id,
      p.usuario_id,
      p.total,
      p.status_pagamento,
      p.status_entrega,
      p.forma_pagamento,
      p.data_pedido,
      u.nome      AS usuario_nome,
      u.email     AS usuario_email,
      u.telefone  AS usuario_telefone
    FROM pedidos p
    JOIN usuarios u ON u.id = p.usuario_id
    WHERE p.id = ?
    `,
    [pedidoId]
  );
  return pedido || null;
}

/**
 * Registra um envio de comunicação na tabela de log.
 * Falhas de log são silenciadas para não interromper o fluxo de envio.
 * @param {object} params
 * @param {number|null}  params.usuarioId
 * @param {number|null}  params.pedidoId
 * @param {string}       params.canal         "email" | "whatsapp"
 * @param {string}       params.tipoTemplate
 * @param {string}       params.destino
 * @param {string|null}  params.assunto
 * @param {string}       params.mensagem
 * @param {string}       params.statusEnvio   "sucesso" | "erro"
 * @param {string|null}  params.erro
 */
async function insertLogComunicacao({
  usuarioId,
  pedidoId,
  canal,
  tipoTemplate,
  destino,
  assunto,
  mensagem,
  statusEnvio,
  erro,
}) {
  await pool.query(
    `
    INSERT INTO comunicacoes_enviadas
      (usuario_id, pedido_id, canal, tipo_template, destino, assunto, mensagem, status_envio, erro)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      usuarioId || null,
      pedidoId  || null,
      canal,
      tipoTemplate,
      destino,
      assunto  || null,
      mensagem,
      statusEnvio,
      erro     || null,
    ]
  );
}

/**
 * Verifica se já existe log de comunicação enviada com sucesso para
 * o mesmo (pedido, template, canal). Usado por dispararEventoComunicacao
 * para evitar reenvio em duplicidade — webhook MP pode chegar 2x,
 * status pode ser atualizado manualmente após webhook etc.
 *
 * "Sucesso" inclui o status "manual_pending" (link wa.me gerado), pois
 * o sistema considera o evento como já comunicado mesmo que o admin
 * não tenha clicado ainda — o link está disponível no painel.
 *
 * @param {object} params
 * @param {number} params.pedidoId
 * @param {string} params.tipoTemplate
 * @param {string} params.canal       "email" | "whatsapp"
 * @returns {Promise<boolean>}
 */
async function jaEnviado({ pedidoId, tipoTemplate, canal }) {
  if (!pedidoId || !tipoTemplate || !canal) return false;
  const [rows] = await pool.query(
    `
    SELECT 1
      FROM comunicacoes_enviadas
     WHERE pedido_id = ?
       AND tipo_template = ?
       AND canal = ?
       AND status_envio IN ('sucesso', 'manual_pending')
     LIMIT 1
    `,
    [pedidoId, tipoTemplate, canal],
  );
  return rows.length > 0;
}

/**
 * Lista os logs de comunicação de um pedido (ordem mais recente primeiro).
 * Usado pelo painel admin para mostrar histórico + links wa.me pendentes.
 *
 * @param {number} pedidoId
 * @returns {Promise<Array>}
 */
async function listarPorPedido(pedidoId) {
  const [rows] = await pool.query(
    `
    SELECT
      id, canal, tipo_template, destino, assunto, mensagem,
      status_envio, erro, criado_em
      FROM comunicacoes_enviadas
     WHERE pedido_id = ?
     ORDER BY criado_em DESC
     LIMIT 50
    `,
    [pedidoId],
  );
  return rows;
}

module.exports = {
  getPedidoBasico,
  insertLogComunicacao,
  jaEnviado,
  listarPorPedido,
};
