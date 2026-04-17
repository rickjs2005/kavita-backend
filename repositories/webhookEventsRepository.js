// repositories/webhookEventsRepository.js
//
// Registro idempotente de eventos de webhook recebidos de gateways
// de pagamento (Asaas, Pagar.me, etc.). O UNIQUE(provider,
// provider_event_id) na tabela garante que o mesmo evento nunca seja
// persistido duas vezes — INSERT IGNORE retorna affectedRows=0
// quando duplicado, que o service usa como sinal de "já processei".
//
// Nada aqui toca regras de negócio — só persistência e leitura.
// A camada service (paymentService) traduz eventos em transições de
// subscription.
"use strict";

const pool = require("../config/pool");

/**
 * Registra um evento recebido. Retorna:
 *   { id, inserted: true }   → primeira vez visto, processar
 *   { id: null, inserted: false } → duplicado, ignorar
 *
 * O caller usa `inserted` para decidir se avança no processamento
 * ou responde 200 sem efeito colateral. O id retornado na primeira
 * vez é usado depois para markProcessed/markFailed.
 */
async function recordIfNew({
  provider,
  provider_event_id,
  event_type,
  payload,
}) {
  const [result] = await pool.query(
    `INSERT IGNORE INTO webhook_events
       (provider, provider_event_id, event_type, payload)
     VALUES (?, ?, ?, ?)`,
    [
      provider,
      provider_event_id,
      event_type,
      payload ? JSON.stringify(payload) : "{}",
    ],
  );
  if (result.affectedRows === 0) {
    return { id: null, inserted: false };
  }
  return { id: result.insertId, inserted: true };
}

/**
 * Marca evento como processado com sucesso. Chamado pelo
 * paymentService após aplicar a regra de negócio com sucesso
 * (ex.: subscription virou active depois de payment_confirmed).
 */
async function markProcessed(id) {
  const [result] = await pool.query(
    `UPDATE webhook_events
        SET processed_at = NOW(),
            processing_error = NULL
      WHERE id = ?`,
    [id],
  );
  return result.affectedRows;
}

/**
 * Marca evento com falha persistente. Mantém processed_at NULL
 * (reconciliação ainda pega) e armazena mensagem para debug.
 * Incrementa retry_count; cron de reprocessamento pode decidir
 * parar após N tentativas.
 */
async function markFailed(id, errorMessage) {
  const [result] = await pool.query(
    `UPDATE webhook_events
        SET processing_error = ?,
            retry_count = retry_count + 1
      WHERE id = ?`,
    [String(errorMessage ?? "").slice(0, 2000), id],
  );
  return result.affectedRows;
}

/**
 * Lista eventos não processados para reconciliação cron. Ordenados
 * por created_at ASC (mais antigos primeiro). O maxRetries corta a
 * fila para não ficar tentando indefinidamente eventos corrompidos.
 */
async function listUnprocessed({
  provider,
  limit = 50,
  maxRetries = 5,
} = {}) {
  const where = ["processed_at IS NULL", "retry_count < ?"];
  const params = [maxRetries];
  if (provider) {
    where.push("provider = ?");
    params.push(provider);
  }
  const [rows] = await pool.query(
    `SELECT id, provider, provider_event_id, event_type, payload,
            processing_error, retry_count, created_at
       FROM webhook_events
      WHERE ${where.join(" AND ")}
      ORDER BY created_at ASC
      LIMIT ?`,
    [...params, limit],
  );
  return rows.map((r) => ({
    ...r,
    payload: parseJson(r.payload),
  }));
}

/**
 * Consulta por id (debug / admin inspecionar evento pontual).
 */
async function findById(id) {
  const [[row]] = await pool.query(
    "SELECT * FROM webhook_events WHERE id = ? LIMIT 1",
    [id],
  );
  if (!row) return null;
  return { ...row, payload: parseJson(row.payload) };
}

function parseJson(value) {
  if (value == null) return null;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

module.exports = {
  recordIfNew,
  markProcessed,
  markFailed,
  listUnprocessed,
  findById,
};
