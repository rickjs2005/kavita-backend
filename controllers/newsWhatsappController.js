"use strict";

// controllers/newsWhatsappController.js
//
// Inscricao publica no canal WhatsApp do Kavita News + listagem para admin.
// Validacao via schemas/newsWhatsappSchemas.js.

const { response } = require("../lib");
const service = require("../services/newsWhatsappService");
const AppError = require("../errors/AppError");
const ERROR_CODES = require("../constants/ErrorCodes");

/* =========================================================
 * PUBLIC - POST /api/news/whatsapp-subscribe
 * ========================================================= */

/**
 * @openapi
 * /api/news/whatsapp-subscribe:
 *   post:
 *     tags:
 *       - Kavita News (Public)
 *     summary: Inscreve um numero no canal WhatsApp do Kavita News
 *     description: |
 *       Idempotente — reinscricao do mesmo numero retorna 200 com `created=false`.
 *       Rate-limit: 5 req/min/IP.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [phone]
 *             properties:
 *               phone: { type: string, example: "(31) 99999-0000" }
 *               source: { type: string, example: "home_news" }
 *     responses:
 *       200:
 *         description: Inscricao registrada (ou ja existia)
 *       400:
 *         description: Telefone invalido
 *       429:
 *         description: Rate limit excedido
 *       500:
 *         description: Erro interno
 */
const subscribe = async (req, res, next) => {
  try {
    // body ja foi validado/normalizado pelo middleware validate(subscribeBodySchema)
    const { phone, source } = req.body;
    const ip = req.ip || null;
    const ua = req.get("user-agent") || null;
    // Trunca user-agent para caber no varchar(255) sem 500 silencioso.
    const user_agent = ua && ua.length > 255 ? ua.slice(0, 255) : ua;

    const { subscriber, created, optinLink, shortCode } = await service.createOrReturn({
      phone,
      source,
      ip,
      user_agent,
    });

    return response.ok(
      res,
      {
        id: subscriber.id,
        phone: subscriber.phone,
        status: subscriber.status,
        created,
        // Token e link de opt-in. NUNCA expomos o phone do admin no frontend
        // alem do que o usuario digitou; o link wa.me ja contem o numero
        // da Kavita encodado pela env KAVITA_WHATSAPP_NUMBER.
        confirm_token: subscriber.confirm_token || null,
        short_code: shortCode || null,
        whatsapp_optin_link: optinLink || null,
      },
      created ? "Inscricao registrada." : "Voce ja esta na lista.",
    );
  } catch (error) {
    console.error("newsWhatsappController.subscribe:", error);
    return next(
      new AppError(
        "Nao foi possivel registrar a inscricao.",
        ERROR_CODES.SERVER_ERROR,
        500,
      ),
    );
  }
};

/* =========================================================
 * PUBLIC - POST /api/news/whatsapp-confirm
 * ========================================================= */

/**
 * @openapi
 * /api/news/whatsapp-confirm:
 *   post:
 *     tags:
 *       - Kavita News (Public)
 *     summary: Confirma opt-in via token
 *     description: |
 *       Promove o subscriber de pending para active. Idempotente: se ja active,
 *       responde 200 com `alreadyActive=true`. Se o token pertencer a um
 *       subscriber que pediu opt-out, responde 410 (GONE) — reativacao apos
 *       opt-out exige acao manual do admin.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token]
 *             properties:
 *               token: { type: string, example: "abc123..." }
 *     responses:
 *       200: { description: "Confirmado (ou ja estava active)" }
 *       404: { description: "Token nao encontrado" }
 *       410: { description: "Subscriber ja optou por sair (unsubscribed)" }
 *       429: { description: "Rate limit excedido" }
 */
const confirm = async (req, res, next) => {
  try {
    const { token } = req.body;
    const result = await service.confirmByToken(token);

    if (!result.ok) {
      if (result.code === "NOT_FOUND") {
        return next(
          new AppError("Token nao encontrado.", ERROR_CODES.NOT_FOUND, 404),
        );
      }
      if (result.code === "UNSUBSCRIBED") {
        return next(
          new AppError(
            "Inscricao foi cancelada anteriormente. Reativacao precisa ser feita pelo admin.",
            ERROR_CODES.CONFLICT,
            409,
          ),
        );
      }
      return next(
        new AppError(
          "Nao foi possivel confirmar.",
          ERROR_CODES.SERVER_ERROR,
          500,
        ),
      );
    }

    return response.ok(
      res,
      { status: result.status, alreadyActive: result.alreadyActive },
      result.alreadyActive
        ? "Voce ja estava confirmado."
        : "Inscricao confirmada — voce esta no canal.",
    );
  } catch (error) {
    console.error("newsWhatsappController.confirm:", error);
    return next(
      new AppError("Erro ao confirmar.", ERROR_CODES.SERVER_ERROR, 500),
    );
  }
};

/* =========================================================
 * PUBLIC - POST /api/news/whatsapp-unsubscribe
 * ========================================================= */

/**
 * @openapi
 * /api/news/whatsapp-unsubscribe:
 *   post:
 *     tags:
 *       - Kavita News (Public)
 *     summary: Opt-out via token
 *     description: |
 *       Marca como unsubscribed. Idempotente — chamadas repetidas nao falham.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token]
 *             properties:
 *               token: { type: string }
 *     responses:
 *       200: { description: "Opt-out registrado (ou ja estava)" }
 *       404: { description: "Token nao encontrado" }
 *       429: { description: "Rate limit excedido" }
 */
const unsubscribe = async (req, res, next) => {
  try {
    const { token } = req.body;
    const result = await service.unsubscribeByToken(token);

    if (!result.ok) {
      return next(
        new AppError("Token nao encontrado.", ERROR_CODES.NOT_FOUND, 404),
      );
    }

    return response.ok(
      res,
      { status: result.status, alreadyUnsubscribed: result.alreadyUnsubscribed },
      result.alreadyUnsubscribed
        ? "Voce ja estava fora do canal."
        : "Inscricao cancelada — voce nao recebera mais alertas.",
    );
  } catch (error) {
    console.error("newsWhatsappController.unsubscribe:", error);
    return next(
      new AppError("Erro ao processar opt-out.", ERROR_CODES.SERVER_ERROR, 500),
    );
  }
};

/* =========================================================
 * ADMIN - PATCH /api/admin/news/whatsapp-subscribers/:id/status
 * ========================================================= */

/**
 * @openapi
 * /api/admin/news/whatsapp-subscribers/{id}/status:
 *   patch:
 *     tags: [Kavita News (Admin)]
 *     summary: Muda o status de um subscriber manualmente (admin)
 *     description: |
 *       Usado quando o admin recebe a mensagem de opt-in pelo proprio
 *       WhatsApp e marca como active manualmente. Tambem permite reativar
 *       um subscriber que tinha pedido opt-out (LGPD: so via admin).
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [status]
 *             properties:
 *               status: { type: string, enum: [pending, active, unsubscribed] }
 *     responses:
 *       200: { description: "Status atualizado" }
 *       401: { description: "Nao autenticado" }
 *       404: { description: "Subscriber nao encontrado" }
 */
const adminUpdateStatus = async (req, res, next) => {
  try {
    const { id } = req.params; // ja coerced pelo schema
    const { status } = req.body;
    const adminId = req.adminUser?.id || req.user?.id || null;

    const result = await service.updateStatusByAdmin({ id, status, adminId });
    if (!result.ok) {
      return next(
        new AppError("Subscriber nao encontrado.", ERROR_CODES.NOT_FOUND, 404),
      );
    }

    return response.ok(res, result.subscriber, "Status atualizado.");
  } catch (error) {
    console.error("newsWhatsappController.adminUpdateStatus:", error);
    return next(
      new AppError("Erro ao atualizar status.", ERROR_CODES.SERVER_ERROR, 500),
    );
  }
};

/* =========================================================
 * ADMIN - GET /api/admin/news/whatsapp-subscribers
 * ========================================================= */

/**
 * @openapi
 * /api/admin/news/whatsapp-subscribers:
 *   get:
 *     tags:
 *       - Kavita News (Admin)
 *     summary: Lista assinantes do canal WhatsApp (admin)
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 50, maximum: 200 }
 *       - in: query
 *         name: offset
 *         schema: { type: integer, default: 0 }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [pending, active, unsubscribed] }
 *     responses:
 *       200: { description: Lista paginada }
 *       401: { description: Nao autenticado }
 *       500: { description: Erro interno }
 */
const listSubscribers = async (req, res, next) => {
  try {
    // query ja foi validada/coerced pelo middleware validate(listSubscribersQuerySchema)
    const { limit, offset, status } = req.query;
    const { rows, total } = await service.listForAdmin({ limit, offset, status });
    return response.ok(res, rows, null, { limit, offset, total, status: status || null });
  } catch (error) {
    console.error("newsWhatsappController.listSubscribers:", error);
    return next(
      new AppError(
        "Erro ao listar assinantes.",
        ERROR_CODES.SERVER_ERROR,
        500,
      ),
    );
  }
};

module.exports = {
  subscribe,
  confirm,
  unsubscribe,
  listSubscribers,
  adminUpdateStatus,
};
