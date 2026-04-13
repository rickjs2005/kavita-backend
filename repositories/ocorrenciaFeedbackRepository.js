"use strict";
// repositories/ocorrenciaFeedbackRepository.js

const pool = require("../config/pool");

async function create({ ocorrenciaId, usuarioId, nota, comentario }) {
  const [result] = await pool.query(
    `INSERT INTO ocorrencia_feedbacks (ocorrencia_id, usuario_id, nota, comentario)
     VALUES (?, ?, ?, ?)`,
    [ocorrenciaId, usuarioId, nota, comentario || null]
  );
  return result.insertId;
}

async function findByOcorrenciaId(ocorrenciaId) {
  const [[row]] = await pool.query(
    `SELECT id, ocorrencia_id, usuario_id, nota, comentario, created_at
     FROM ocorrencia_feedbacks WHERE ocorrencia_id = ?`,
    [ocorrenciaId]
  );
  return row ?? null;
}

module.exports = { create, findByOcorrenciaId };
