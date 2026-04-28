// repositories/producerAccountsRepository.js
//
// Acesso à tabela producer_accounts + producer_favorites +
// producer_alert_subscriptions. Separação de domínio:
//   - conta do produtor (auth)
//   - favoritos
//   - alertas (esqueleto)
//
// Padrão idêntico a corretoraUsersRepository.
"use strict";

const pool = require("../config/pool");

async function findByEmail(email) {
  const [[row]] = await pool.query(
    "SELECT * FROM producer_accounts WHERE email = ? LIMIT 1",
    [email],
  );
  return row ?? null;
}

async function findById(id) {
  const [[row]] = await pool.query(
    "SELECT * FROM producer_accounts WHERE id = ? LIMIT 1",
    [id],
  );
  return row ?? null;
}

async function create({ email, nome, cidade, telefone, telefone_normalizado }) {
  const [result] = await pool.query(
    `INSERT INTO producer_accounts
       (email, nome, cidade, telefone, telefone_normalizado)
     VALUES (?, ?, ?, ?, ?)`,
    [
      email,
      nome ?? null,
      cidade ?? null,
      telefone ?? null,
      telefone_normalizado ?? null,
    ],
  );
  return result.insertId;
}

async function updateProfile(id, { nome, cidade, telefone, telefone_normalizado }) {
  const sets = [];
  const values = [];
  if (nome !== undefined) {
    sets.push("nome = ?");
    values.push(nome);
  }
  if (cidade !== undefined) {
    sets.push("cidade = ?");
    values.push(cidade);
  }
  if (telefone !== undefined) {
    sets.push("telefone = ?");
    values.push(telefone);
  }
  if (telefone_normalizado !== undefined) {
    sets.push("telefone_normalizado = ?");
    values.push(telefone_normalizado);
  }
  if (sets.length === 0) return 0;
  values.push(id);
  const [result] = await pool.query(
    `UPDATE producer_accounts SET ${sets.join(", ")} WHERE id = ?`,
    values,
  );
  return result.affectedRows;
}

async function touchLastLogin(id) {
  await pool.query(
    "UPDATE producer_accounts SET last_login_at = NOW() WHERE id = ?",
    [id],
  );
}

/**
 * Marca ou desmarca `pending_deletion_at` — usado pelo fluxo LGPD
 * (Fase 10.3). Passar Date para marcar, null para cancelar.
 */
async function setPendingDeletion(id, whenOrNull) {
  await pool.query(
    "UPDATE producer_accounts SET pending_deletion_at = ? WHERE id = ?",
    [whenOrNull, id],
  );
}

/**
 * Registra versão da política de privacidade aceita pelo titular.
 */
async function setPrivacyPolicyAccepted(id, version) {
  await pool.query(
    `UPDATE producer_accounts
        SET privacy_policy_version = ?,
            privacy_policy_accepted_at = NOW()
      WHERE id = ?`,
    [String(version), id],
  );
}

async function bumpTokenVersion(id) {
  await pool.query(
    "UPDATE producer_accounts SET token_version = token_version + 1 WHERE id = ?",
    [id],
  );
}

// ─── Favoritos ──────────────────────────────────────────────────────────────

async function listFavorites(producerId) {
  const [rows] = await pool.query(
    `SELECT
       f.id,
       f.corretora_id,
       f.created_at,
       c.name AS corretora_name,
       c.slug AS corretora_slug,
       c.city AS corretora_city,
       c.state AS corretora_state,
       c.logo_path AS corretora_logo,
       c.is_featured AS corretora_featured
     FROM producer_favorites f
     JOIN corretoras c ON c.id = f.corretora_id
     WHERE f.producer_id = ?
     ORDER BY f.created_at DESC`,
    [producerId],
  );
  return rows;
}

async function addFavorite(producerId, corretoraId) {
  // INSERT IGNORE idempotente (unique constraint protege).
  await pool.query(
    `INSERT IGNORE INTO producer_favorites (producer_id, corretora_id)
     VALUES (?, ?)`,
    [producerId, corretoraId],
  );
}

async function removeFavorite(producerId, corretoraId) {
  const [result] = await pool.query(
    `DELETE FROM producer_favorites
     WHERE producer_id = ? AND corretora_id = ?`,
    [producerId, corretoraId],
  );
  return result.affectedRows;
}

async function isFavorite(producerId, corretoraId) {
  const [[row]] = await pool.query(
    `SELECT 1 FROM producer_favorites
     WHERE producer_id = ? AND corretora_id = ? LIMIT 1`,
    [producerId, corretoraId],
  );
  return Boolean(row);
}

// ─── Histórico de leads (JOIN por telefone normalizado) ─────────────────────

async function listLeadHistory(producerId) {
  const producer = await findById(producerId);
  if (!producer?.telefone_normalizado) return [];

  const [rows] = await pool.query(
    `SELECT
       l.id,
       l.cidade,
       l.objetivo,
       l.tipo_cafe,
       l.volume_range,
       l.status,
       l.amostra_status,
       l.lote_disponivel,
       l.corrego_localidade,
       l.safra_tipo,
       l.created_at,
       c.name AS corretora_name,
       c.slug AS corretora_slug,
       c.city AS corretora_city,
       c.logo_path AS corretora_logo
     FROM corretora_leads l
     JOIN corretoras c ON c.id = l.corretora_id
     WHERE l.telefone_normalizado = ?
     ORDER BY l.created_at DESC
     LIMIT 100`,
    [producer.telefone_normalizado],
  );
  return rows;
}

// ─── Alertas (esqueleto) ────────────────────────────────────────────────────

async function listAlertSubscriptions(producerId) {
  const [rows] = await pool.query(
    `SELECT * FROM producer_alert_subscriptions
     WHERE producer_id = ? ORDER BY created_at DESC`,
    [producerId],
  );
  return rows;
}

async function createAlertSubscription(producerId, { type, params }) {
  const [result] = await pool.query(
    `INSERT INTO producer_alert_subscriptions (producer_id, type, params)
     VALUES (?, ?, ?)`,
    [producerId, type, params ? JSON.stringify(params) : null],
  );
  return result.insertId;
}

async function deleteAlertSubscription(producerId, id) {
  const [result] = await pool.query(
    `DELETE FROM producer_alert_subscriptions
     WHERE id = ? AND producer_id = ?`,
    [id, producerId],
  );
  return result.affectedRows;
}

module.exports = {
  findByEmail,
  findById,
  create,
  updateProfile,
  touchLastLogin,
  bumpTokenVersion,
  setPendingDeletion,
  setPrivacyPolicyAccepted,
  listFavorites,
  addFavorite,
  removeFavorite,
  isFavorite,
  listLeadHistory,
  listAlertSubscriptions,
  createAlertSubscription,
  deleteAlertSubscription,
};
