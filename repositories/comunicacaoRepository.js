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

module.exports = {
  getPedidoBasico,
  insertLogComunicacao,
};
