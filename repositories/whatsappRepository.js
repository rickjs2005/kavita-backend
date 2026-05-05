"use strict";

// repositories/whatsappRepository.js — Etapa 3 da reativacao
// (ver docs/whatsapp-reativacao.md).
//
// Acesso SQL bruto a:
//   - whatsapp_templates  (leitura: template ativo por key/version)
//   - whatsapp_messages   (escrita: insert pre-envio + update pos-envio)
//
// Convencao do projeto: repository so' fala SQL. Regra de negocio
// (validacao, render, retry) fica no service (whatsappService.js).
// Sem AppError aqui — o service traduz null/0-rows em codigo de
// dominio.

const pool = require("../config/pool");

// ---------------------------------------------------------------------------
// Templates (read-only)
// ---------------------------------------------------------------------------

/**
 * Busca template ativo por key. Se version vier, exige match exato;
 * caso contrario, retorna a maior version ativa.
 *
 * @param {string} key             ex.: "corretora_lead_recebido"
 * @param {number|null} version    opcional
 * @returns {Promise<object|null>}
 */
async function findActiveTemplate(key, version = null) {
  const params = [key];
  let sql =
    "SELECT id, `key`, version, language_code, category, body, variables, " +
    "meta_template_name, active, approved_at " +
    "FROM whatsapp_templates WHERE `key` = ? AND active = 1";

  if (version != null) {
    sql += " AND version = ?";
    params.push(Number(version));
  }

  sql += " ORDER BY version DESC LIMIT 1";

  const [rows] = await pool.query(sql, params);
  return rows[0] || null;
}

/**
 * Versao "diagnostica": busca o template ignorando active. Util
 * para o service distinguir "nao existe" de "existe mas esta
 * desativado", retornando codigo de erro mais especifico.
 *
 * @param {string} key
 * @param {number|null} version
 * @returns {Promise<object|null>}
 */
async function findAnyTemplate(key, version = null) {
  const params = [key];
  let sql =
    "SELECT id, `key`, version, language_code, active " +
    "FROM whatsapp_templates WHERE `key` = ?";

  if (version != null) {
    sql += " AND version = ?";
    params.push(Number(version));
  }

  sql += " ORDER BY version DESC LIMIT 1";

  const [rows] = await pool.query(sql, params);
  return rows[0] || null;
}

// ---------------------------------------------------------------------------
// Messages (write)
// ---------------------------------------------------------------------------

/**
 * Insere uma linha em whatsapp_messages antes do envio. Status
 * inicial fica 'queued' (api), 'queued_stub' (stub) ou
 * 'manual_pending' (manual) — quem escolhe e' o service.
 *
 * @param {object} m
 * @param {number|null} m.lead_id
 * @param {number|null} m.contract_id
 * @param {number|null} m.corretora_id
 * @param {string} m.recipient_phone   E.164 sem "+"
 * @param {string|null} m.template_key
 * @param {string|null} m.body
 * @param {"manual"|"api"|"stub"} m.provider
 * @param {string} m.status
 * @param {string} m.language_code
 * @returns {Promise<{ id: number }>}
 */
async function insertMessage(m) {
  const sql =
    "INSERT INTO whatsapp_messages (" +
    "  lead_id, contract_id, corretora_id, " +
    "  recipient_phone, template_key, body, " +
    "  provider, status, language_code, retry_count" +
    ") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)";

  const [res] = await pool.query(sql, [
    m.lead_id ?? null,
    m.contract_id ?? null,
    m.corretora_id ?? null,
    m.recipient_phone,
    m.template_key ?? null,
    m.body ?? null,
    m.provider,
    m.status,
    m.language_code,
  ]);

  return { id: res.insertId };
}

/**
 * Atualiza o resultado pos-envio. Status final + timestamps
 * granulares + provider_message_id (api) + error_message (failed).
 *
 * Aceita atualizar parcialmente (so' os campos passados sao
 * tocados). Outros ficam como estao no banco.
 *
 * @param {number} id
 * @param {object} patch
 * @param {string} [patch.status]
 * @param {string|null} [patch.provider_message_id]
 * @param {string|null} [patch.error_message]
 * @param {number} [patch.retry_count]
 * @param {Date|null} [patch.sent_at]
 * @param {Date|null} [patch.failed_at]
 * @returns {Promise<{ affectedRows: number }>}
 */
async function updateMessageResult(id, patch = {}) {
  const fields = [];
  const params = [];
  const map = {
    status: "status",
    provider_message_id: "provider_message_id",
    error_message: "error_message",
    retry_count: "retry_count",
    sent_at: "sent_at",
    failed_at: "failed_at",
  };

  for (const [k, col] of Object.entries(map)) {
    if (Object.prototype.hasOwnProperty.call(patch, k)) {
      fields.push(`${col} = ?`);
      params.push(patch[k]);
    }
  }

  if (!fields.length) return { affectedRows: 0 };

  params.push(id);
  const sql = `UPDATE whatsapp_messages SET ${fields.join(", ")} WHERE id = ?`;
  const [res] = await pool.query(sql, params);
  return { affectedRows: res.affectedRows ?? 0 };
}

/**
 * Read pontual de uma mensagem por id (util em testes e em retry
 * manual via painel — proxima etapa).
 *
 * @param {number} id
 * @returns {Promise<object|null>}
 */
async function getMessageById(id) {
  const [rows] = await pool.query(
    "SELECT * FROM whatsapp_messages WHERE id = ? LIMIT 1",
    [id],
  );
  return rows[0] || null;
}

module.exports = {
  findActiveTemplate,
  findAnyTemplate,
  insertMessage,
  updateMessageResult,
  getMessageById,
};
