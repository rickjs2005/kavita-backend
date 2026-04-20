// repositories/contratoRepository.js
//
// Acesso à tabela `contratos`. Escopo por corretora_id em todas as
// leituras autenticadas. Leitura pública é só via token (findByToken)
// que devolve um recorte seguro — nunca joga dados sensíveis numa
// busca por ID sem scope.
"use strict";

const pool = require("../config/pool");

function parseJsonField(value) {
  if (value == null) return null;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function hydrate(row) {
  if (!row) return null;
  return { ...row, data_fields: parseJsonField(row.data_fields) };
}

async function create({
  lead_id,
  corretora_id,
  created_by_user_id,
  tipo,
  pdf_url,
  hash_sha256,
  qr_verification_token,
  data_fields,
}) {
  const [result] = await pool.query(
    `INSERT INTO contratos
       (lead_id, corretora_id, created_by_user_id, tipo,
        status, pdf_url, hash_sha256, qr_verification_token,
        data_fields)
     VALUES (?, ?, ?, ?, 'draft', ?, ?, ?, ?)`,
    [
      lead_id,
      corretora_id,
      created_by_user_id ?? null,
      tipo,
      pdf_url,
      hash_sha256,
      qr_verification_token,
      JSON.stringify(data_fields ?? {}),
    ],
  );
  return result.insertId;
}

async function findById(id, corretora_id) {
  const [rows] = await pool.query(
    `SELECT * FROM contratos WHERE id = ? AND corretora_id = ? LIMIT 1`,
    [id, corretora_id],
  );
  return hydrate(rows[0]);
}

async function findByIdUnscoped(id) {
  const [rows] = await pool.query(
    `SELECT * FROM contratos WHERE id = ? LIMIT 1`,
    [id],
  );
  return hydrate(rows[0]);
}

async function findByToken(token) {
  const [rows] = await pool.query(
    `SELECT c.id, c.tipo, c.status, c.hash_sha256,
            c.qr_verification_token, c.signed_at, c.created_at,
            c.data_fields,
            co.name AS corretora_name, co.slug AS corretora_slug
       FROM contratos c
       JOIN corretoras co ON co.id = c.corretora_id
      WHERE c.qr_verification_token = ?
      LIMIT 1`,
    [token],
  );
  return hydrate(rows[0]);
}

async function listByLead(lead_id, corretora_id) {
  const [rows] = await pool.query(
    `SELECT id, tipo, status, pdf_url, hash_sha256,
            qr_verification_token, sent_at, signed_at,
            cancelled_at, cancel_reason, created_at
       FROM contratos
      WHERE lead_id = ? AND corretora_id = ?
      ORDER BY created_at DESC`,
    [lead_id, corretora_id],
  );
  return rows;
}

async function hasActiveForLead(lead_id, corretora_id) {
  const [rows] = await pool.query(
    `SELECT id FROM contratos
      WHERE lead_id = ? AND corretora_id = ?
        AND status IN ('draft', 'sent', 'signed')
      LIMIT 1`,
    [lead_id, corretora_id],
  );
  return rows.length > 0;
}

async function updateStatus(id, status, patch = {}) {
  const sets = ["status = ?", "updated_at = CURRENT_TIMESTAMP"];
  const values = [status];

  for (const key of [
    "signer_provider",
    "signer_document_id",
    "signer_envelope_id",
    "sent_at",
    "signed_at",
    "cancelled_at",
    "cancel_reason",
    "signed_pdf_url",
    "signed_hash_sha256",
  ]) {
    if (Object.prototype.hasOwnProperty.call(patch, key)) {
      sets.push(`${key} = ?`);
      values.push(patch[key] ?? null);
    }
  }

  values.push(id);
  await pool.query(
    `UPDATE contratos SET ${sets.join(", ")} WHERE id = ?`,
    values,
  );
}

async function findBySignerDocumentId(documentId) {
  const [rows] = await pool.query(
    `SELECT * FROM contratos WHERE signer_document_id = ? LIMIT 1`,
    [documentId],
  );
  return hydrate(rows[0]);
}

/**
 * Lista contratos em que o produtor identificado pelo email é
 * signatário. O vínculo é via `corretora_leads.email` — o lead guarda
 * o email informado pelo produtor na captura, que é o mesmo usado
 * pela ClickSign. Retorna já com dados da corretora para o frontend
 * renderizar sem segunda query.
 *
 * Segurança: escopa estritamente por email da sessão autenticada.
 * Um produtor com email X nunca vê contrato de lead com email Y.
 */
async function listByProducerEmail(email) {
  if (!email) return [];
  const [rows] = await pool.query(
    `SELECT
        c.id, c.tipo, c.status, c.hash_sha256,
        c.qr_verification_token,
        c.sent_at, c.signed_at, c.cancelled_at, c.cancel_reason,
        c.created_at,
        c.data_fields,
        (c.signed_pdf_url IS NOT NULL) AS has_signed_pdf,
        co.id AS corretora_id, co.name AS corretora_name,
        co.slug AS corretora_slug, co.logo_path AS corretora_logo
       FROM contratos c
       JOIN corretora_leads l ON l.id = c.lead_id
       JOIN corretoras co ON co.id = c.corretora_id
      WHERE LOWER(l.email) = LOWER(?)
      ORDER BY c.created_at DESC
      LIMIT 100`,
    [email],
  );
  return rows.map((r) => ({
    ...r,
    data_fields: parseJsonField(r.data_fields),
    has_signed_pdf: Boolean(r.has_signed_pdf),
  }));
}

/**
 * Busca 1 contrato por id, escopado por email do produtor. Usado
 * pelo endpoint de download de PDF — evita IDOR (produtor com id A
 * não consegue baixar contrato de produtor B mesmo guessando o id).
 */
async function findByIdForProducer(id, email) {
  if (!email) return null;
  const [rows] = await pool.query(
    `SELECT c.*
       FROM contratos c
       JOIN corretora_leads l ON l.id = c.lead_id
      WHERE c.id = ? AND LOWER(l.email) = LOWER(?)
      LIMIT 1`,
    [id, email],
  );
  return hydrate(rows[0]);
}

module.exports = {
  create,
  findById,
  findByIdUnscoped,
  findByToken,
  findBySignerDocumentId,
  listByLead,
  listByProducerEmail,
  findByIdForProducer,
  hasActiveForLead,
  updateStatus,
};
