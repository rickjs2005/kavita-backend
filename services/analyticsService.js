// services/analyticsService.js
//
// Analytics mínimo do projeto. Uma função pública: track().
//
// Princípios:
// 1. Nunca derruba o fluxo chamador. Qualquer erro vira log.warn.
// 2. Fire-and-forget: o chamador não espera o insert.
// 3. Formato do payload espelha o contrato do PostHog/Mixpanel, para
//    que a migração futura seja apenas trocar a implementação de
//    _persist() sem mudar os callsites.
//
// Para ligar PostHog no futuro:
//   - npm install posthog-node
//   - instanciar client no topo do arquivo
//   - dentro de _persist(), adicionar `posthog.capture({ distinctId, event, properties })`
//   - manter o insert em product_events como backup local (ou remover)
//
// Todos os eventos atuais são emitidos pelo backend. Eventos de UI
// (page_view, clique em card, etc.) são responsabilidade da próxima
// fase de analytics, quando o frontend for instrumentado.
"use strict";

const repo = require("../repositories/productEventsRepository");
const logger = require("../lib/logger");

/**
 * Registra um evento de produto.
 *
 * @param {object}   event
 * @param {string}   event.name         — nome do evento (snake_case), obrigatório
 * @param {"corretora_user"|"anonymous"|"admin"|"system"} event.actorType
 * @param {number}   [event.actorId]    — id do ator (corretora_user.id, admin.id, ou null)
 * @param {number}   [event.corretoraId]— id da corretora alvo do evento
 * @param {object}   [event.props]      — propriedades extras do evento
 * @param {object}   [event.req]        — objeto Express para capturar IP/UA
 */
function track({ name, actorType, actorId, corretoraId, props, req }) {
  // Validação mínima — não derruba ninguém, só loga e sai.
  if (!name || !actorType) {
    logger.warn(
      { name, actorType },
      "analytics.track chamado sem name ou actorType"
    );
    return;
  }

  const ip = req?.ip ?? null;
  const user_agent = req?.get?.("user-agent")?.slice(0, 500) ?? null;

  // Fire-and-forget. setImmediate garante que o callsite retorna
  // antes de a escrita acontecer — zero impacto em latência do request.
  setImmediate(() => {
    _persist({
      event: name,
      actor_type: actorType,
      actor_id: actorId,
      corretora_id: corretoraId,
      props,
      ip,
      user_agent,
    }).catch((err) => {
      logger.warn({ err, event: name }, "analytics.track falhou");
    });
  });
}

/**
 * Persistência concreta. Único ponto a alterar quando migrar para
 * PostHog/Mixpanel — mantenha a assinatura estável.
 */
async function _persist(evt) {
  await repo.insert(evt);

  // Exemplo futuro (comentado):
  // if (posthog) {
  //   posthog.capture({
  //     distinctId: evt.actor_id ? `user_${evt.actor_id}` : `anon_${evt.ip}`,
  //     event: evt.event,
  //     properties: {
  //       ...(evt.props || {}),
  //       corretora_id: evt.corretora_id,
  //       actor_type: evt.actor_type,
  //     },
  //   });
  // }
}

module.exports = { track };
