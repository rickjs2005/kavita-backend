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

    const { subscriber, created } = await service.createOrReturn({
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
      },
      created ? "Inscricao registrada." : "Voce ja esta inscrito.",
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
  listSubscribers,
};
