"use strict";
// repositories/especialidadesRepository.js
//
// Escopo: leitura de especialidades de colaboradores.
// Tabela: especialidades.
//
// Consumido por: controllers/especialidadesController.js
// Domínio compartilhado com: repositories/servicosAdminRepository.js (colaboradores)

const pool = require("../config/pool");

/**
 * Retorna todas as especialidades cadastradas (id e nome).
 * Usado tanto no painel admin quanto na página pública "Trabalhe Conosco".
 * @returns {{ id: number, nome: string }[]}
 */
async function findAll() {
  const [rows] = await pool.query(
    "SELECT id, nome FROM especialidades ORDER BY nome ASC"
  );
  return rows;
}

module.exports = { findAll };
