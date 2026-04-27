// repositories/paymentRepository.js
"use strict";

// ---------------------------------------------------------------------------
// All SQL for the payment domain.
// Functions that participate in a transaction receive `conn` as first param.
// Functions that run standalone acquire their own connection from pool.
// ---------------------------------------------------------------------------

const pool = require("../config/pool");
const logger = require("../lib/logger");

/* ---- Payment methods --------------------------------------------------- */

async function getActiveMethods() {
  const [rows] = await pool.query(
    `SELECT id, code, label, description, is_active, sort_order, created_at, updated_at
       FROM payment_methods
      WHERE is_active = 1
      ORDER BY sort_order ASC, id ASC`
  );
  return rows;
}

async function getAllMethods() {
  const [rows] = await pool.query(
    `SELECT id, code, label, description, is_active, sort_order, created_at, updated_at
       FROM payment_methods
      ORDER BY sort_order ASC, id ASC`
  );
  return rows;
}

async function findMethodById(id) {
  const [[row]] = await pool.query(
    `SELECT id, code, label, description, is_active, sort_order, created_at, updated_at
       FROM payment_methods
      WHERE id = ?`,
    [id]
  );
  return row || null;
}

async function createMethod({ code, label, description, is_active, sort_order }) {
  const [result] = await pool.query(
    `INSERT INTO payment_methods (code, label, description, is_active, sort_order, created_at)
     VALUES (?, ?, ?, ?, ?, NOW())`,
    [code, label, description, is_active, sort_order]
  );
  const [[created]] = await pool.query(
    `SELECT id, code, label, description, is_active, sort_order, created_at, updated_at
       FROM payment_methods
      WHERE id = ?`,
    [result.insertId]
  );
  return created;
}

async function updateMethodById(id, fields, values) {
  await pool.query(
    `UPDATE payment_methods
        SET ${fields.join(", ")}, updated_at = NOW()
      WHERE id = ?`,
    [...values, id]
  );
  const [[updated]] = await pool.query(
    `SELECT id, code, label, description, is_active, sort_order, created_at, updated_at
       FROM payment_methods
      WHERE id = ?`,
    [id]
  );
  return updated;
}

async function softDeleteMethod(id) {
  await pool.query(
    `UPDATE payment_methods
        SET is_active = 0, updated_at = NOW()
      WHERE id = ?`,
    [id]
  );
}

/* ---- Pedidos -------------------------------------------------------------- */

async function getTotalPedido(pedidoId) {
  const [[row]] = await pool.query(
    `SELECT (total + COALESCE(shipping_price, 0)) AS total_final
       FROM pedidos
      WHERE id = ?`,
    [pedidoId]
  );
  return Number((row?.total_final || 0).toFixed(2));
}

async function getPedidoById(pedidoId) {
  const [[row]] = await pool.query(
    `SELECT id, forma_pagamento, usuario_id, status_pagamento
       FROM pedidos
      WHERE id = ?`,
    [pedidoId]
  );
  return row || null;
}

async function setPedidoStatusPendente(pedidoId) {
  await pool.query(
    `UPDATE pedidos
        SET status_pagamento = 'pendente', status = 'pendente'
      WHERE id = ?`,
    [pedidoId]
  );
}

/* ---- Webhook events ------------------------------------------------------- */

// TODO(sprint-pos-go-live): conciliar schemas conflitantes de webhook_events.
// As migrations 2026022420502108 (event_id/signature/status enum) e
// 2026041800000002 (provider/provider_event_id/processing_error/retry_count)
// criam a mesma tabela com colunas diferentes. A segunda faz DROP TABLE IF
// EXISTS antes de recriar, portanto o schema vivente é o multi-provider —
// ver ADR docs/decisions/0001-webhook-events-unified-schema.md. Esta camada
// está alinhada com o schema vivente; a primeira migration deve ser marcada
// obsoleta ou removida em sprint pós-go-live, junto com squash de migrations.

/**
 * Provider canônico do MP nesta tabela. Hardcoded — todos os webhooks MP
 * gravam com este valor para coexistir com Asaas/ClickSign no mesmo schema.
 */
const MP_PROVIDER = "mercadopago";

/**
 * Embute a assinatura HMAC do header dentro do JSON `payload` para
 * preservar auditoria — o schema multi-provider não tem coluna dedicada.
 *
 * Resultado: `{ "_signature": "<header>", "body": <body original> }`.
 * Se `payload` não for JSON parseável, mantém como string crua em `body`.
 */
function enrichPayloadWithSignature(payload, signature) {
  let body;
  try {
    body = typeof payload === "string" ? JSON.parse(payload) : payload;
  } catch {
    body = payload;
  }
  return JSON.stringify({ _signature: signature ?? null, body });
}

/**
 * Busca evento já recebido (com FOR UPDATE para serializar duplicatas).
 *
 * No schema multi-provider, a chave única é (provider, provider_event_id).
 * O parâmetro `eventId` mantém o nome legado para preservar a assinatura
 * do método — internamente bate em `provider_event_id` filtrado por
 * `provider = 'mercadopago'`.
 *
 * Retorna `{ id, processed_at, processing_error, retry_count } | null`.
 *
 * @param {import("mysql2").PoolConnection} conn
 * @param {string} eventId
 */
async function findWebhookEventForUpdate(conn, eventId) {
  const [[row]] = await conn.query(
    `SELECT id, processed_at, processing_error, retry_count
       FROM webhook_events
      WHERE provider = ? AND provider_event_id = ?
      FOR UPDATE`,
    [MP_PROVIDER, eventId]
  );
  return row || null;
}

/**
 * Insere evento novo. A coluna `signature` não existe no schema
 * multi-provider — a assinatura HMAC é embutida no JSON `payload`
 * (chave `_signature`) para preservar auditoria sem alterar schema.
 *
 * @param {import("mysql2").PoolConnection} conn
 * @param {{ eventId: string, signature: string|null, type: string|null, payload: string }} args
 *   `payload` é a string JSON do body original (req.body stringificado).
 */
async function insertWebhookEvent(conn, { eventId, signature, type, payload }) {
  const eventType = type || "unknown";

  // Caller didn't pass a type → distinguishable in dashboards from legitimate
  // unknown values. Helps spot bugs in upstream wiring (router/controller).
  if (eventType === "unknown") {
    const preview =
      typeof payload === "string"
        ? payload.slice(0, 200)
        : String(payload ?? "").slice(0, 200);
    logger.warn(
      { provider: MP_PROVIDER, eventId, payloadPreview: preview },
      "webhook.event_type.missing"
    );
  }

  const enriched = enrichPayloadWithSignature(payload, signature);
  const [result] = await conn.query(
    `INSERT INTO webhook_events
        (provider, provider_event_id, event_type, payload, created_at)
     VALUES (?, ?, ?, ?, NOW())`,
    [MP_PROVIDER, eventId, eventType, enriched]
  );
  return result.insertId;
}

/**
 * Atualiza um evento que JÁ existia mas ainda não foi processado
 * (re-delivery do gateway). Atualiza o payload — uma re-delivery pode
 * trazer body ligeiramente diferente — e incrementa `retry_count` para
 * visibilidade. NÃO mexe em `processed_at`: o evento continua pendente
 * até ser processado de fato.
 *
 * @param {import("mysql2").PoolConnection} conn
 */
async function markWebhookEventReceived(conn, dbEventId, { signature, type, payload }) {
  const enriched = enrichPayloadWithSignature(payload, signature);
  await conn.query(
    `UPDATE webhook_events
        SET event_type   = COALESCE(?, event_type),
            payload      = ?,
            retry_count  = retry_count + 1
      WHERE id = ?`,
    [type || null, enriched, dbEventId]
  );
}

/**
 * Marca evento como ignorado (sem dados úteis: type != payment, sem
 * dataId, sem metadata.pedidoId, etc.). `reason` é opcional e fica
 * gravada em `processing_error` no formato `IGNORED:<reason>` para
 * auditoria.
 *
 * Usar `IGNORED:` (sem prefixo `PARKED:`) sinaliza que NÃO deve ser
 * reprocessado — é descartável. Diferente de `PARKED:`, que aguarda retry.
 *
 * @param {import("mysql2").PoolConnection} conn
 * @param {number} dbEventId
 * @param {string|null} [reason]
 */
async function markWebhookEventIgnored(conn, dbEventId, reason = null) {
  const marker = reason ? `IGNORED:${reason}` : "IGNORED";
  await conn.query(
    `UPDATE webhook_events
        SET processed_at     = NOW(),
            processing_error = ?
      WHERE id = ?`,
    [marker, dbEventId]
  );
}

/**
 * Marca evento como processado.
 *
 * `outcome` aceita:
 *   - "pago" / "falhou" / "pendente" / "estornado" — caminho feliz,
 *     `processing_error` fica `NULL`.
 *   - "blocked:<from>-><to>" — transição rejeitada pelo guard
 *     `isStatusTransitionSafe`; `processing_error` grava como
 *     `BLOCKED:<from>-><to>` para auditoria. NÃO é `PARKED:` — não retentar.
 *
 * @param {import("mysql2").PoolConnection} conn
 * @param {number} dbEventId
 * @param {string} outcome
 */
async function markWebhookEventProcessed(conn, dbEventId, outcome) {
  const isBlocked = typeof outcome === "string" && outcome.startsWith("blocked:");
  const procError = isBlocked ? `BLOCKED:${outcome.slice("blocked:".length)}` : null;
  await conn.query(
    `UPDATE webhook_events
        SET processed_at     = NOW(),
            processing_error = ?
      WHERE id = ?`,
    [procError, dbEventId]
  );
}

/**
 * Atualiza status_pagamento, status e pagamento_id de forma idempotente.
 * Só executa se o estado ou pagamento_id mudou.
 * @param {import("mysql2").PoolConnection} conn
 */
async function updatePedidoPayment(conn, pedidoId, status, paymentId) {
  await conn.query(
    `UPDATE pedidos
        SET status_pagamento = ?, status = ?, pagamento_id = ?
      WHERE id = ?
        AND (status_pagamento <> ? OR pagamento_id <> ?)`,
    [status, status, String(paymentId), pedidoId, status, String(paymentId)]
  );
}

module.exports = {
  // Payment methods
  getActiveMethods,
  getAllMethods,
  findMethodById,
  createMethod,
  updateMethodById,
  softDeleteMethod,
  // Pedidos
  getTotalPedido,
  getPedidoById,
  setPedidoStatusPendente,
  // Webhook events
  findWebhookEventForUpdate,
  insertWebhookEvent,
  markWebhookEventReceived,
  markWebhookEventIgnored,
  markWebhookEventProcessed,
  updatePedidoPayment,
};
