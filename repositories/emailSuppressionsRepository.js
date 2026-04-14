"use strict";

// repositories/emailSuppressionsRepository.js
//
// CRUD mínimo da lista de supressão. Queries pensadas p/ serem
// executáveis em qualquer send de marketing sem impacto perceptível
// (índice UNIQUE em email+scope).

const pool = require("../config/pool");

async function isSuppressed(email, scope = "marketing") {
  const normalized = String(email).trim().toLowerCase();
  const [rows] = await pool.query(
    `SELECT 1 FROM email_suppressions
      WHERE email = ? AND scope IN (?, 'all') LIMIT 1`,
    [normalized, scope],
  );
  return rows.length > 0;
}

async function suppress({ email, scope = "marketing", reason = "user_unsubscribe", note = null }) {
  const normalized = String(email).trim().toLowerCase();
  // ON DUPLICATE — idempotente: clicar 2x no link não gera erro.
  await pool.query(
    `INSERT INTO email_suppressions (email, scope, reason, note)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE reason = VALUES(reason), note = VALUES(note)`,
    [normalized, scope, reason, note],
  );
}

async function unsuppress({ email, scope = "marketing" }) {
  const normalized = String(email).trim().toLowerCase();
  await pool.query(
    `DELETE FROM email_suppressions WHERE email = ? AND scope = ?`,
    [normalized, scope],
  );
}

module.exports = { isSuppressed, suppress, unsuppress };
