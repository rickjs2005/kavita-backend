"use strict";

// services/newsWhatsappService.js
//
// Regras de negocio para inscricao no canal WhatsApp do Kavita News.
//
// Fluxo:
//   1. Schema (newsWhatsappSchemas) ja normalizou o telefone para digitos
//      e validou DDD/comprimento — quando o service e' chamado, o phone
//      e' confiavel.
//   2. Verifica duplicidade. Reinscricao do mesmo numero nao falha — apenas
//      retorna o registro existente (idempotente). Isso evita expor enumeracao
//      de subscribers para um atacante que teste varios numeros.
//   3. Registra IP e user-agent (apenas para revisao manual de abuso).
//
// Decisao deliberada: NAO enviamos mensagem de confirmacao agora. Quando o
// canal operacional do WhatsApp for ativado, basta plugar uma chamada para
// services/whatsapp/sendWhatsapp aqui dentro de createOrReturn.

const repo = require("../repositories/newsWhatsappRepository");

/**
 * Cria a inscrição (ou retorna a existente, sem erro). Idempotente.
 *
 * @param {object} input
 * @param {string} input.phone        Apenas dígitos (10 ou 11).
 * @param {string} [input.source]     Origem (default 'home_news').
 * @param {string|null} [input.ip]
 * @param {string|null} [input.user_agent]
 * @returns {Promise<{ subscriber: object, created: boolean }>}
 */
async function createOrReturn({ phone, source = "home_news", ip = null, user_agent = null }) {
  const existing = await repo.getByPhone(phone);
  if (existing) {
    return { subscriber: existing, created: false };
  }

  await repo.createSubscriber({ phone, source, ip, user_agent });
  // Releitura para devolver o objeto completo (id, status default, timestamps).
  const fresh = await repo.getByPhone(phone);
  return { subscriber: fresh, created: true };
}

async function listForAdmin({ limit = 50, offset = 0, status = null } = {}) {
  return repo.listSubscribers({ limit, offset, status });
}

module.exports = {
  createOrReturn,
  listForAdmin,
};
