"use strict";
// controllers/cartsController.js

const { response } = require("../lib");
const AppError = require("../errors/AppError");
const ERROR_CODES = require("../constants/ErrorCodes");
const svc = require("../services/cartsAdminService");
const adminAudit = require("../services/adminAuditService");

const scan = async (req, res, next) => {
  try {
    // req.body.horas é coercido para number|undefined pelo ScanBodySchema.
    // req.query.horas (string) é aceito como fallback pelo service.
    const horas = req.body?.horas ?? req.query.horas;
    const report = await svc.scanAbandonedCarts(horas);

    // Auditoria do scan manual — fire-and-forget, nao bloqueia resposta.
    adminAudit.record({
      req,
      action: "carrinhos.scan",
      targetType: "carrinhos_abandonados",
      targetId: null,
      meta: report,
    });

    const message = `${report.inserted} carrinho(s) adicionado(s) de ${report.candidates} candidato(s).`;
    return response.ok(res, report, message);
  } catch (err) {
    return next(err instanceof AppError ? err : new AppError("Erro ao escanear carrinhos abandonados.", ERROR_CODES.SERVER_ERROR, 500));
  }
};

const list = async (req, res, next) => {
  try {
    const carrinhos = await svc.listAbandonedCarts();
    return response.ok(res, { carrinhos });
  } catch (err) {
    return next(err instanceof AppError ? err : new AppError("Erro ao buscar carrinhos abandonados.", ERROR_CODES.SERVER_ERROR, 500));
  }
};

const notify = async (req, res, next) => {
  // req.params.id é coercido para number pelo CartIdParamSchema.
  // req.body.tipo é validado pelo NotifyBodySchema ("whatsapp"|"email").
  try {
    const tipo = await svc.notifyAbandonedCart(req.params.id, req.body.tipo);
    const message =
      tipo === "email"
        ? "Notificação via email registrada e será enviada automaticamente pelo worker."
        : "Notificação via whatsapp registrada. Use /whatsapp-link para abrir a conversa com texto pronto.";
    return response.ok(res, null, message);
  } catch (err) {
    return next(err instanceof AppError ? err : new AppError("Erro ao notificar carrinho abandonado.", ERROR_CODES.SERVER_ERROR, 500));
  }
};

const whatsappLink = async (req, res, next) => {
  // req.params.id é coercido para number pelo CartIdParamSchema.
  try {
    const result = await svc.getWhatsAppLink(req.params.id);
    return response.ok(res, result);
  } catch (err) {
    return next(err instanceof AppError ? err : new AppError("Erro ao gerar link de WhatsApp.", ERROR_CODES.SERVER_ERROR, 500));
  }
};

module.exports = { scan, list, notify, whatsappLink };
