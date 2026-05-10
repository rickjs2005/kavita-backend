"use strict";

// services/newsWhatsappService.js
//
// Regras de negocio para o canal WhatsApp do Kavita News.
//
// IMPORTANTE: este modulo NAO envia mensagens. O canal de disparo em massa
// nao esta ligado ainda — esta camada cobre apenas o fluxo de opt-in/opt-out
// exigido por LGPD e pelas politicas anti-spam da Meta.
//
// Operacoes:
//   - createOrReturn: registra/recupera o subscriber em status pending. Gera
//     confirm_token e devolve o link wa.me que o produtor deve abrir para
//     mandar a mensagem de confirmacao para o numero da Kavita.
//   - confirmByToken: usa o token retornado no subscribe para promover o
//     status para active. Idempotente. Quando o webhook do provedor estiver
//     plugado no futuro, ele chama essa mesma funcao.
//   - unsubscribeByToken: marca como unsubscribed. Idempotente.
//   - updateStatusByAdmin: o admin marca manualmente quando recebe a
//     mensagem de opt-in pelo proprio WhatsApp.
//
// Fluxo end-to-end (sem provedor de envio):
//   1. Produtor envia numero pelo card "Lista de interesse" do /news
//   2. Backend cria pending + retorna { confirm_token, whatsapp_optin_link }
//   3. Frontend mostra botao "Confirmar pelo WhatsApp" -> abre wa.me em outra aba
//   4. Produtor envia a mensagem pre-formatada para o numero da Kavita
//   5. Admin recebe a msg, ve o codigo curto na lista do painel, marca active
//      via PATCH /api/admin/news/whatsapp-subscribers/:id/status

const repo = require("../repositories/newsWhatsappRepository");
const logger = require("../lib/logger");

/**
 * Numero do WhatsApp da Kavita usado no link wa.me. Formato: digitos puros
 * com DDI (ex: "5531999990000"). Se a env nao estiver definida, o link
 * abre o WhatsApp na tela de pesquisa — UX ruim mas nao quebra.
 */
const KAVITA_WHATSAPP_NUMBER = String(
  process.env.KAVITA_WHATSAPP_NUMBER || "",
).replace(/\D/g, "");

/** Codigo curto humano usado na mensagem que o produtor envia para o admin
 *  identificar visualmente na lista. 8 chars do token = ~4 bilhoes de combinacoes,
 *  suficiente para evitar colisao em escala razoavel sem ser intimidante. */
function shortCodeFromToken(token) {
  return String(token || "").slice(0, 8).toUpperCase();
}

/**
 * Monta o link wa.me com mensagem pre-formatada. O texto e' deliberadamente
 * humano e em PT — o produtor le e entende o que esta enviando.
 */
function buildWhatsappOptinLink(token) {
  const code = shortCodeFromToken(token);
  const text = `Olá Kavita! Quero ativar meu canal de notícias do agro. Código: ${code}`;
  const encoded = encodeURIComponent(text);
  // Sem numero -> abre o WhatsApp/web na tela de pesquisa. Ainda funcional, so menos comodo.
  if (!KAVITA_WHATSAPP_NUMBER) {
    return `https://wa.me/?text=${encoded}`;
  }
  return `https://wa.me/${KAVITA_WHATSAPP_NUMBER}?text=${encoded}`;
}

/**
 * Cria o subscriber (ou retorna o existente, sem erro). Idempotente.
 *
 * @returns {Promise<{ subscriber, created, optinLink, shortCode }>}
 */
async function createOrReturn({ phone, source = "home_news", ip = null, user_agent = null }) {
  const existing = await repo.getByPhone(phone);
  if (existing) {
    return {
      subscriber: existing,
      created: false,
      optinLink: existing.confirm_token
        ? buildWhatsappOptinLink(existing.confirm_token)
        : null,
      shortCode: existing.confirm_token
        ? shortCodeFromToken(existing.confirm_token)
        : null,
    };
  }

  await repo.createSubscriber({ phone, source, ip, user_agent });
  const fresh = await repo.getByPhone(phone);

  logger.info(
    { subscriberId: fresh?.id, source },
    "news.whatsapp.subscribe.created",
  );

  return {
    subscriber: fresh,
    created: true,
    optinLink: fresh?.confirm_token ? buildWhatsappOptinLink(fresh.confirm_token) : null,
    shortCode: fresh?.confirm_token ? shortCodeFromToken(fresh.confirm_token) : null,
  };
}

/**
 * Confirma opt-in via token. Resultado:
 *   - { ok: true, status, alreadyActive: bool }  para token valido
 *   - { ok: false, code: 'NOT_FOUND' }           para token desconhecido
 *   - { ok: false, code: 'UNSUBSCRIBED' }        para subscriber em opt-out
 *
 * Reativacao apos opt-out NAO acontece aqui — exige acao manual do admin
 * (LGPD / boas praticas: usuario pediu pra sair, nao pode voltar sozinho
 *  por um link possivelmente vazado).
 */
async function confirmByToken(token) {
  const subscriber = await repo.getByConfirmToken(token);
  if (!subscriber) {
    return { ok: false, code: "NOT_FOUND" };
  }

  if (subscriber.status === "unsubscribed") {
    logger.warn(
      { subscriberId: subscriber.id },
      "news.whatsapp.confirm.blocked_unsubscribed",
    );
    return { ok: false, code: "UNSUBSCRIBED" };
  }

  const alreadyActive = subscriber.status === "active";
  if (!alreadyActive) {
    await repo.confirmSubscriber(subscriber.id);
    logger.info(
      { subscriberId: subscriber.id },
      "news.whatsapp.confirm.activated",
    );
  }

  const fresh = await repo.getById(subscriber.id);
  return {
    ok: true,
    alreadyActive,
    status: fresh?.status || "active",
  };
}

/**
 * Opt-out via token. Idempotente — chamadas repetidas nao falham e nao
 * sobrescrevem unsubscribed_at original.
 */
async function unsubscribeByToken(token) {
  const subscriber = await repo.getByConfirmToken(token);
  if (!subscriber) {
    return { ok: false, code: "NOT_FOUND" };
  }

  const alreadyOut = subscriber.status === "unsubscribed";
  if (!alreadyOut) {
    await repo.unsubscribeSubscriber(subscriber.id);
    logger.info(
      { subscriberId: subscriber.id },
      "news.whatsapp.unsubscribe.opted_out",
    );
  }

  return { ok: true, alreadyUnsubscribed: alreadyOut, status: "unsubscribed" };
}

/**
 * Update manual via admin (recebeu a mensagem de opt-in pelo WhatsApp e
 * marca active). Loga adminId para auditoria.
 */
async function updateStatusByAdmin({ id, status, adminId = null }) {
  const subscriber = await repo.getById(id);
  if (!subscriber) {
    return { ok: false, code: "NOT_FOUND" };
  }

  await repo.updateStatus(id, status);
  logger.info(
    { subscriberId: id, fromStatus: subscriber.status, toStatus: status, adminId },
    "news.whatsapp.admin.status_changed",
  );

  const fresh = await repo.getById(id);
  return { ok: true, subscriber: fresh };
}

async function listForAdmin({ limit = 50, offset = 0, status = null } = {}) {
  return repo.listSubscribers({ limit, offset, status });
}

module.exports = {
  createOrReturn,
  confirmByToken,
  unsubscribeByToken,
  updateStatusByAdmin,
  listForAdmin,
  // export para teste
  buildWhatsappOptinLink,
  shortCodeFromToken,
};
