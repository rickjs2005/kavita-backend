"use strict";
// controllers/motorista/motoristaController.js
//
// Endpoints autenticados do motorista (verifyMotorista no mount).
// Body validation via schemas/rotasSchemas.js.

const { response } = require("../../lib");
const AppError = require("../../errors/AppError");
const ERROR_CODES = require("../../constants/ErrorCodes");
const motoristaService = require("../../services/motoristaService");

const IDEMPOTENCY_HEADER = "x-idempotency-key";

function _parseId(raw) {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) {
    throw new AppError("ID invalido.", ERROR_CODES.VALIDATION_ERROR, 400);
  }
  return id;
}

function _idemKey(req) {
  const v = req.headers?.[IDEMPOTENCY_HEADER];
  return typeof v === "string" && v.length >= 8 && v.length <= 64 ? v : null;
}

async function me(req, res, next) {
  try {
    return response.ok(res, req.motorista);
  } catch (err) {
    return next(err);
  }
}

async function rotaHoje(req, res, next) {
  try {
    const data = await motoristaService.getRotaHoje(req.motorista.id);
    if (!data) return response.ok(res, null, "Sem rota para hoje.");
    return response.ok(res, data);
  } catch (err) {
    return next(err);
  }
}

async function rotaDetalhe(req, res, next) {
  try {
    const id = _parseId(req.params.id);
    const data = await motoristaService.getRotaDetalhe(id, req.motorista.id);
    return response.ok(res, data);
  } catch (err) {
    return next(err);
  }
}

async function iniciarRota(req, res, next) {
  try {
    const id = _parseId(req.params.id);
    const data = await motoristaService.iniciarRota(id, req.motorista.id);
    return response.ok(res, data, "Rota iniciada.");
  } catch (err) {
    return next(err);
  }
}

async function finalizarRota(req, res, next) {
  try {
    const id = _parseId(req.params.id);
    const data = await motoristaService.finalizarRota(id, req.motorista.id, {
      km_real: req.body?.km_real ?? null,
    });
    return response.ok(res, data, "Rota finalizada.");
  } catch (err) {
    return next(err);
  }
}

async function abrirParada(req, res, next) {
  try {
    const id = _parseId(req.params.id);
    const data = await motoristaService.abrirParada(id, req.motorista.id, {
      idempotencyKey: _idemKey(req),
    });
    return response.ok(res, data);
  } catch (err) {
    return next(err);
  }
}

async function marcarEntregue(req, res, next) {
  try {
    const id = _parseId(req.params.id);
    const data = await motoristaService.marcarEntregue(
      id,
      req.motorista.id,
      { observacao: req.body?.observacao ?? null },
      { idempotencyKey: _idemKey(req) },
    );
    return response.ok(res, data, "Entrega registrada.");
  } catch (err) {
    return next(err);
  }
}

async function reportarProblema(req, res, next) {
  try {
    const id = _parseId(req.params.id);
    const data = await motoristaService.reportarProblema(
      id,
      req.motorista.id,
      { tipo: req.body?.tipo, observacao: req.body?.observacao ?? null },
      { idempotencyKey: _idemKey(req) },
    );
    return response.ok(res, data, "Problema registrado.");
  } catch (err) {
    return next(err);
  }
}

async function fixarPosicao(req, res, next) {
  try {
    const id = _parseId(req.params.id);
    const data = await motoristaService.fixarPosicao(
      id,
      req.motorista.id,
      {
        latitude: Number(req.body?.latitude),
        longitude: Number(req.body?.longitude),
      },
      { idempotencyKey: _idemKey(req) },
    );
    return response.ok(res, data, "Posicao registrada.");
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  me,
  rotaHoje,
  rotaDetalhe,
  iniciarRota,
  finalizarRota,
  abrirParada,
  marcarEntregue,
  reportarProblema,
  fixarPosicao,
};
