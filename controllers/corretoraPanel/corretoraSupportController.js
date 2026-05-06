"use strict";

// Endpoints de mensageria suporte do lado da corretora.
//
// Fluxo simples: corretora envia mensagem para a curadoria Kavita
// e ve respostas no mesmo lugar. Sem subject, sem multiplos threads
// — uma conversa cronologica por corretora.

const { response } = require("../../lib");
const repo = require("../../repositories/corretoraSupportMessagesRepository");
const logger = require("../../lib/logger");

/**
 * GET /api/corretora/support/messages
 * Lista todas as mensagens da corretora (corretora <-> admin).
 * Marca mensagens enviadas pelo admin como lidas (read_at = NOW())
 * — UI mostra badge de "novo" baseado nesta consulta.
 */
async function listMyMessages(req, res, next) {
  try {
    const corretoraId = req.corretoraUser.corretora_id;
    const messages = await repo.listForCorretora(corretoraId);

    // Best-effort: marca 'admin' como lidas. Se falhar, log + segue.
    repo
      .markRead({ corretora_id: corretoraId, sender_type: "admin" })
      .catch((err) =>
        logger.warn(
          { err, corretoraId },
          "corretora.support.mark_admin_read_failed",
        ),
      );

    response.ok(res, { messages });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/corretora/support/messages
 * Body: { body }
 * Cria nova mensagem com sender_type='corretora'.
 */
async function sendMessage(req, res, next) {
  try {
    const corretoraId = req.corretoraUser.corretora_id;
    const body = String(req.body?.body ?? "").trim();
    const id = await repo.create({
      corretora_id: corretoraId,
      sender_type: "corretora",
      sender_id: req.corretoraUser.id,
      sender_name: req.corretoraUser.nome ?? null,
      body,
    });
    logger.info(
      { corretoraId, userId: req.corretoraUser.id, messageId: id },
      "corretora.support.message_sent",
    );
    response.created(res, { id }, "Mensagem enviada para a curadoria Kavita.");
  } catch (err) {
    next(err);
  }
}

module.exports = { listMyMessages, sendMessage };
