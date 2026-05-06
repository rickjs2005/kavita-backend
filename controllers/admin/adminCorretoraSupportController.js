"use strict";

// Endpoints admin para mensageria de suporte das corretoras.
//
// Estrutura:
//   GET  /threads                     -> lista corretoras com mensagens
//   GET  /threads/:corretoraId        -> detalha conversa + marca lidas
//   POST /threads/:corretoraId/messages -> admin responde

const { response } = require("../../lib");
const AppError = require("../../errors/AppError");
const ERROR_CODES = require("../../constants/ErrorCodes");
const repo = require("../../repositories/corretoraSupportMessagesRepository");
const logger = require("../../lib/logger");

async function listThreads(_req, res, next) {
  try {
    const threads = await repo.listThreadsForAdmin();
    response.ok(res, { threads });
  } catch (err) {
    next(err);
  }
}

async function getThread(req, res, next) {
  try {
    const corretoraId = Number(req.params.corretoraId);
    if (!Number.isInteger(corretoraId) || corretoraId <= 0) {
      throw new AppError("ID invalido.", ERROR_CODES.VALIDATION_ERROR, 400);
    }
    const messages = await repo.listForCorretora(corretoraId);

    // Admin abriu o thread: marca mensagens da corretora como lidas.
    repo
      .markRead({ corretora_id: corretoraId, sender_type: "corretora" })
      .catch((err) =>
        logger.warn(
          { err, corretoraId },
          "admin.support.mark_corretora_read_failed",
        ),
      );

    response.ok(res, { messages });
  } catch (err) {
    next(err);
  }
}

async function replyToThread(req, res, next) {
  try {
    const corretoraId = Number(req.params.corretoraId);
    if (!Number.isInteger(corretoraId) || corretoraId <= 0) {
      throw new AppError("ID invalido.", ERROR_CODES.VALIDATION_ERROR, 400);
    }
    const body = String(req.body?.body ?? "").trim();

    const id = await repo.create({
      corretora_id: corretoraId,
      sender_type: "admin",
      sender_id: req.admin?.id ?? null,
      sender_name: req.admin?.nome ?? "Curadoria Kavita",
      body,
    });

    logger.info(
      { corretoraId, adminId: req.admin?.id, messageId: id },
      "admin.support.replied",
    );

    // Audit log para compliance — admin enviou mensagem para corretora.
    require("../../services/adminAuditService").record({
      req,
      action: "support.replied",
      targetType: "corretora",
      targetId: corretoraId,
      meta: { message_id: id },
    });

    response.created(res, { id }, "Resposta enviada.");
  } catch (err) {
    next(err);
  }
}

module.exports = { listThreads, getThread, replyToThread };
