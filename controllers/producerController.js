// controllers/producerController.js
"use strict";

const { response } = require("../lib");
const AppError = require("../errors/AppError");
const ERROR_CODES = require("../constants/ErrorCodes");
const authService = require("../services/producerAuthService");
const producerRepo = require("../repositories/producerAccountsRepository");
const { normalizePhone } = require("../lib/phoneNormalize");
const verifyProducer = require("../middleware/verifyProducer");

const COOKIE_NAME = verifyProducer.COOKIE_NAME;
const COOKIE_MAX_AGE_MS = authService.JWT_TTL_DAYS * 24 * 60 * 60 * 1000;

function cookieOptions() {
  const prod = process.env.NODE_ENV === "production";
  return {
    httpOnly: true,
    secure: prod,
    sameSite: "lax",
    path: "/",
    maxAge: COOKIE_MAX_AGE_MS,
  };
}

// ─── Público ────────────────────────────────────────────────────────────────

async function requestMagicLink(req, res, next) {
  try {
    await authService.requestMagicLink({ email: req.body.email });
    // Resposta genérica (não vaza se conta existe ou não).
    return response.ok(res, { sent: true }, "Se este e-mail existir, enviaremos um link.");
  } catch (err) {
    return next(
      err instanceof AppError
        ? err
        : new AppError("Erro ao solicitar link.", ERROR_CODES.SERVER_ERROR, 500),
    );
  }
}

async function consumeMagicLink(req, res, next) {
  try {
    const { user, jwt } = await authService.consumeMagicLink({
      token: req.body.token,
    });
    res.cookie(COOKIE_NAME, jwt, cookieOptions());
    return response.ok(res, user, "Autenticado.");
  } catch (err) {
    return next(
      err instanceof AppError
        ? err
        : new AppError("Erro ao entrar.", ERROR_CODES.SERVER_ERROR, 500),
    );
  }
}

// ─── Autenticado (producer) ─────────────────────────────────────────────────

async function getMe(req, res, next) {
  try {
    return response.ok(res, req.producer);
  } catch (err) {
    return next(err);
  }
}

async function logout(_req, res) {
  res.clearCookie(COOKIE_NAME, { path: "/" });
  return response.ok(res, null, "Sessão encerrada.");
}

async function updateProfile(req, res, next) {
  try {
    const payload = {
      nome: req.body.nome,
      cidade: req.body.cidade,
      telefone: req.body.telefone,
    };
    if (payload.telefone !== undefined) {
      payload.telefone_normalizado = normalizePhone(payload.telefone ?? "");
    }
    await producerRepo.updateProfile(req.producer.id, payload);
    const fresh = await producerRepo.findById(req.producer.id);
    return response.ok(
      res,
      {
        id: fresh.id,
        email: fresh.email,
        nome: fresh.nome,
        cidade: fresh.cidade,
        telefone: fresh.telefone,
        telefone_normalizado: fresh.telefone_normalizado,
      },
      "Perfil atualizado.",
    );
  } catch (err) {
    return next(
      err instanceof AppError
        ? err
        : new AppError("Erro ao atualizar perfil.", ERROR_CODES.SERVER_ERROR, 500),
    );
  }
}

// Favoritos

async function listFavorites(req, res, next) {
  try {
    const data = await producerRepo.listFavorites(req.producer.id);
    return response.ok(res, data);
  } catch (err) {
    return next(err);
  }
}

async function addFavorite(req, res, next) {
  try {
    const corretoraId = Number(req.params.corretoraId);
    if (!Number.isInteger(corretoraId) || corretoraId <= 0) {
      throw new AppError("ID inválido.", ERROR_CODES.VALIDATION_ERROR, 400);
    }
    await producerRepo.addFavorite(req.producer.id, corretoraId);
    return response.ok(res, { added: true });
  } catch (err) {
    return next(err);
  }
}

async function removeFavorite(req, res, next) {
  try {
    const corretoraId = Number(req.params.corretoraId);
    if (!Number.isInteger(corretoraId) || corretoraId <= 0) {
      throw new AppError("ID inválido.", ERROR_CODES.VALIDATION_ERROR, 400);
    }
    await producerRepo.removeFavorite(req.producer.id, corretoraId);
    return response.ok(res, { removed: true });
  } catch (err) {
    return next(err);
  }
}

// Histórico

async function getLeadHistory(req, res, next) {
  try {
    const data = await producerRepo.listLeadHistory(req.producer.id);
    return response.ok(res, data);
  } catch (err) {
    return next(err);
  }
}

// Alertas (esqueleto)

async function listAlerts(req, res, next) {
  try {
    const data = await producerRepo.listAlertSubscriptions(req.producer.id);
    return response.ok(res, data);
  } catch (err) {
    return next(err);
  }
}

async function createAlert(req, res, next) {
  try {
    const id = await producerRepo.createAlertSubscription(req.producer.id, {
      type: req.body.type,
      params: req.body.params ?? null,
    });
    return response.created(res, { id });
  } catch (err) {
    return next(err);
  }
}

async function deleteAlert(req, res, next) {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      throw new AppError("ID inválido.", ERROR_CODES.VALIDATION_ERROR, 400);
    }
    const affected = await producerRepo.deleteAlertSubscription(
      req.producer.id,
      id,
    );
    if (affected === 0) {
      throw new AppError("Alerta não encontrado.", ERROR_CODES.NOT_FOUND, 404);
    }
    return response.ok(res, { deleted: true });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  requestMagicLink,
  consumeMagicLink,
  getMe,
  logout,
  updateProfile,
  listFavorites,
  addFavorite,
  removeFavorite,
  getLeadHistory,
  listAlerts,
  createAlert,
  deleteAlert,
};
