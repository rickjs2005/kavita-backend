"use strict";

// repositories/consentsRepository.js
//
// Repositório raw SQL para a tabela `consents` (evidência LGPD).
// Inserção é write-once — nunca update/delete (rastro auditável).

const pool = require("../config/pool");

/**
 * Persiste um aceite de termos.
 *
 * @param {object} args
 * @param {"user"|"corretora"|"corretora_lead"|"drone_lead"} args.subject_type
 * @param {number|null} [args.subject_id]
 * @param {string|null} [args.subject_email]
 * @param {string} args.terms_version
 * @param {string} args.privacy_version
 * @param {string} args.source — match com SOURCES de lib/legal/versions.js
 * @param {string|null} [args.ip]
 * @param {string|null} [args.user_agent]
 * @returns {Promise<number>} id do registro criado
 */
async function recordConsent({
  subject_type,
  subject_id = null,
  subject_email = null,
  terms_version,
  privacy_version,
  source,
  ip = null,
  user_agent = null,
}) {
  const [result] = await pool.query(
    `INSERT INTO consents
       (subject_type, subject_id, subject_email,
        terms_version, privacy_version, source,
        ip, user_agent, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
    [
      subject_type,
      subject_id,
      subject_email,
      terms_version,
      privacy_version,
      source,
      ip,
      // user_agent pode estourar 512 chars (clientes maliciosos / bots)
      user_agent ? String(user_agent).slice(0, 512) : null,
    ],
  );
  return result.insertId;
}

/**
 * Busca todos os aceites de um titular. Útil para o painel LGPD
 * "exportar meus dados" e auditoria pós-incidente.
 *
 * @param {"user"|"corretora"|"corretora_lead"|"drone_lead"} subject_type
 * @param {number} subject_id
 * @returns {Promise<Array>}
 */
async function listConsentsForSubject(subject_type, subject_id) {
  const [rows] = await pool.query(
    `SELECT id, subject_type, subject_id, subject_email,
            terms_version, privacy_version, source,
            ip, user_agent, created_at
       FROM consents
      WHERE subject_type = ? AND subject_id = ?
      ORDER BY created_at DESC`,
    [subject_type, subject_id],
  );
  return rows;
}

module.exports = {
  recordConsent,
  listConsentsForSubject,
};
