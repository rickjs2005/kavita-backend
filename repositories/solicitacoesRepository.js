"use strict";
// repositories/solicitacoesRepository.js
//
// Escopo: solicitações de serviço (admin).
// Consumidor: controllers/solicitacoesController.js

const pool = require("../config/pool");

async function findAll() {
  const [rows] = await pool.query(
    `SELECT
       s.id,
       s.colaborador_id,
       c.nome AS colaborador_nome,
       s.nome_contato,
       s.whatsapp,
       s.descricao,
       s.status,
       s.origem,
       s.created_at
     FROM solicitacoes_servico s
     JOIN colaboradores c ON c.id = s.colaborador_id
     ORDER BY s.created_at DESC`
  );
  return rows;
}

async function updateStatus(id, status) {
  const [result] = await pool.query(
    "UPDATE solicitacoes_servico SET status = ? WHERE id = ?",
    [status, id]
  );
  return result.affectedRows;
}

async function incrementColaboradorServicos(solicitacaoId) {
  await pool.query(
    `UPDATE colaboradores c
     JOIN solicitacoes_servico s ON s.colaborador_id = c.id
     SET c.total_servicos = c.total_servicos + 1
     WHERE s.id = ?`,
    [solicitacaoId]
  );
}

module.exports = { findAll, updateStatus, incrementColaboradorServicos };
