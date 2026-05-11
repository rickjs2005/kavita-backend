// services/contractAuditLogService.js
//
// Wrapper sobre contractAuditLogRepository.createEvent com política
// de criticidade (crítico vs best-effort) e extração de contexto
// (actor/ip/user_agent) do request.
//
// Política:
//   - Eventos de TRANSIÇÃO DE ESTADO (created, sent_to_signature,
//     signed, cancelled, expired) são CRÍTICOS. Se a auditoria
//     falhar, o caller lança 500. Sem trilha, o ato não vale como
//     evidência — preferimos abortar a barrar.
//   - Eventos OBSERVACIONAIS (blocked_by_*, downloaded,
//     webhook_applied, webhook_blocked, immutable_blocked) são
//     BEST-EFFORT. Se a auditoria falhar, registramos no logger e
//     seguimos — a operação principal (negar o 403, servir o PDF,
//     responder 200 ao webhook) deve continuar.
//
// Trade-off explícito: marcar 'created' como crítico pode deixar
// o contrato no banco sem linha de auditoria se a inserção do log
// falhar entre o INSERT do contrato e o record. A próxima evolução
// é envelopar ambos em transação (planService.assignPlan já segue
// o padrão withTransaction). Por ora a chance é baixa o suficiente
// para o ganho de simplicidade.
"use strict";

const AppError = require("../errors/AppError");
const ERROR_CODES = require("../constants/ErrorCodes");
const logger = require("../lib/logger");
const repo = require("../repositories/contractAuditLogRepository");

// Eventos que indicam transição de estado do contrato — falha de
// audit aqui derruba a operação. Mantenha em sync com o ENUM da
// migration 2026051000000001.
const CRITICAL_EVENTS = new Set([
  "created",
  "sent_to_signature",
  "signed",
  "cancelled",
  "expired",
]);

// Conjunto fechado de actor_type — bate com o ENUM da migration.
const VALID_ACTOR_TYPES = new Set([
  "admin",
  "corretora_user",
  "producer",
  "system",
  "webhook",
]);

/**
 * Insere uma linha em contract_audit_log.
 *
 * Argumentos esperados (todos em camelCase no JS — o repository
 * traduz para snake_case do banco):
 *   - contratoId   (obrig)
 *   - corretoraId  (opcional)
 *   - leadId       (opcional)
 *   - eventType    (obrig, valor do ENUM)
 *   - actorType    (obrig, valor do ENUM)
 *   - actorId      (opcional)
 *   - ip, userAgent (opcionais — vem de fromRequest)
 *   - previousStatus, newStatus (opcionais)
 *   - provider, providerDocumentId (opcionais — quando vier do
 *     ClickSign ou outro provider)
 *   - payload      (opcional — JSON livre com motivo, capability,
 *     numero_externo, hash, etc)
 *   - critical     (opcional — override; default deriva de eventType)
 *
 * Segundo argumento (opções):
 *   - conn         (opcional — conexão transacional MySQL2). Quando
 *     o caller precisa atomicidade entre o INSERT do recurso (ex:
 *     contrato) e o registro de auditoria, basta passar a `conn` do
 *     `withTransaction` que o repositório executa o INSERT dentro
 *     da mesma tx. Se o audit falhar e o caller propagar o erro, a
 *     tx faz rollback no `withTransaction` e o recurso não fica
 *     persistido.
 */
async function record(data, { conn } = {}) {
  if (!data || !data.eventType || !data.actorType || !data.contratoId) {
    // Erro de programação — falha imediatamente para flagrar no dev.
    throw new AppError(
      "contractAuditLog.record: contratoId, eventType e actorType são obrigatórios.",
      ERROR_CODES.SERVER_ERROR,
      500,
    );
  }
  if (!VALID_ACTOR_TYPES.has(data.actorType)) {
    throw new AppError(
      `contractAuditLog.record: actorType inválido (${data.actorType}).`,
      ERROR_CODES.SERVER_ERROR,
      500,
    );
  }

  const isCritical = data.critical ?? CRITICAL_EVENTS.has(data.eventType);

  try {
    await repo.createEvent(
      {
        contrato_id: data.contratoId,
        corretora_id: data.corretoraId ?? null,
        lead_id: data.leadId ?? null,
        event_type: data.eventType,
        actor_type: data.actorType,
        actor_id: data.actorId ?? null,
        ip: data.ip ?? null,
        user_agent: data.userAgent ?? null,
        previous_status: data.previousStatus ?? null,
        new_status: data.newStatus ?? null,
        provider: data.provider ?? null,
        provider_document_id: data.providerDocumentId ?? null,
        payload: data.payload ?? null,
      },
      conn,
    );
  } catch (err) {
    // Auditoria é série A na nossa tese — logger SEMPRE.
    logger.error(
      {
        err: err?.message ?? String(err),
        contratoId: data.contratoId,
        eventType: data.eventType,
      },
      "contract_audit_log.persist_failed",
    );
    if (isCritical) {
      throw new AppError(
        "Falha ao registrar auditoria do contrato.",
        ERROR_CODES.SERVER_ERROR,
        500,
        {
          event_type: data.eventType,
          contrato_id: data.contratoId,
        },
      );
    }
    // best-effort: silencia o caller. Quem chama segue normalmente.
  }
}

/**
 * Extrai ip/user_agent do request do Express. Retorna um objeto
 * que pode ser spread no auditContext passado para services.
 *
 *   const ctx = { ...fromRequest(req), actorType: "corretora_user",
 *                  actorId: req.corretoraUser.id };
 *
 * Para webhooks/jobs sem request, o caller monta o ctx manualmente
 * com actorType="webhook"/"system".
 */
function fromRequest(req) {
  if (!req) return {};
  // req.ip já considera trust proxy — Express devolve o forwarded
  // quando configurado. Slice defensivo no UA mantém a coluna
  // VARCHAR(500) dentro do limite.
  const ua = req.headers?.["user-agent"];
  return {
    ip: req.ip ?? req.headers?.["x-forwarded-for"] ?? null,
    userAgent: ua ? String(ua).slice(0, 500) : null,
  };
}

module.exports = {
  record,
  fromRequest,
  CRITICAL_EVENTS,
  VALID_ACTOR_TYPES,
};
