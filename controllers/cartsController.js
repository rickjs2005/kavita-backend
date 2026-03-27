"use strict";
// controllers/cartsController.js

const { response } = require("../lib");
const AppError = require("../errors/AppError");
const ERROR_CODES = require("../constants/ErrorCodes");
const svc = require("../services/cartsAdminService");

exports.scan = async (req, res, next) => {
  try {
    const horas = req.body?.horas ?? req.query.horas;
    const scanned = await svc.scanAbandonedCarts(horas);
    return response.ok(res, { scanned }, `${scanned} carrinho(s) registrado(s) como abandonado(s).`);
  } catch (err) {
    return next(err instanceof AppError ? err : new AppError("Erro ao escanear carrinhos abandonados.", ERROR_CODES.SERVER_ERROR, 500));
  }
};

exports.list = async (req, res, next) => {
  try {
    const carrinhos = await svc.listAbandonedCarts();
    return response.ok(res, { carrinhos });
  } catch (err) {
    return next(err instanceof AppError ? err : new AppError("Erro ao buscar carrinhos abandonados.", ERROR_CODES.SERVER_ERROR, 500));
  }
};

exports.notify = async (req, res, next) => {
  const id = Number(req.params.id);
  if (!id) {
    return next(new AppError("ID inválido.", ERROR_CODES.VALIDATION_ERROR, 400));
  }

  try {
    const tipo = await svc.notifyAbandonedCart(id, req.body?.tipo);
    const message =
      tipo === "email"
        ? "Notificação via email registrada e será enviada automaticamente pelo worker."
        : "Notificação via whatsapp registrada. Use /whatsapp-link para abrir a conversa com texto pronto.";
    return response.ok(res, null, message);
  } catch (err) {
    return next(err instanceof AppError ? err : new AppError("Erro ao notificar carrinho abandonado.", ERROR_CODES.SERVER_ERROR, 500));
  }
};

exports.whatsappLink = async (req, res, next) => {
  const id = Number(req.params.id);
  if (!id) {
    return next(new AppError("ID inválido.", ERROR_CODES.VALIDATION_ERROR, 400));
  }

  try {
    const result = await svc.getWhatsAppLink(id);
    return response.ok(res, result);
  } catch (err) {
    return next(err instanceof AppError ? err : new AppError("Erro ao gerar link de WhatsApp.", ERROR_CODES.SERVER_ERROR, 500));
  }
};
