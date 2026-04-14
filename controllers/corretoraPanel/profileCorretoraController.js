// controllers/corretoraPanel/profileCorretoraController.js
//
// A corretora logada vê e edita a própria ficha (subconjunto dos
// campos). Nunca edita status, featured ou sort_order — isso é admin.
"use strict";

const { response } = require("../../lib");
const AppError = require("../../errors/AppError");
const ERROR_CODES = require("../../constants/ErrorCodes");
const adminRepo = require("../../repositories/corretorasAdminRepository");
const analyticsService = require("../../services/analyticsService");
const logger = require("../../lib/logger");

/**
 * GET /api/corretora/profile
 */
async function getMyProfile(req, res, next) {
  try {
    const corretoraId = req.corretoraUser.corretora_id;
    const corretora = await adminRepo.findById(corretoraId);

    if (!corretora) {
      return next(
        new AppError("Corretora não encontrada.", ERROR_CODES.NOT_FOUND, 404)
      );
    }

    return response.ok(res, corretora);
  } catch (err) {
    return next(
      new AppError(
        "Erro ao carregar perfil.",
        ERROR_CODES.SERVER_ERROR,
        500
      )
    );
  }
}

/**
 * PUT /api/corretora/profile
 * Body validado por validate(updateProfileSchema).
 */
async function updateMyProfile(req, res, next) {
  try {
    const corretoraId = req.corretoraUser.corretora_id;

    const allowed = [
      "contact_name",
      "description",
      "phone",
      "whatsapp",
      "email",
      "website",
      "instagram",
      "facebook",
      // Regional (Sprint 2) — corretora edita para se apresentar melhor.
      // Campos institucionais (name, city, state, logo) seguem admin-only.
      "cidades_atendidas",
      "tipos_cafe",
      "perfil_compra",
      "horario_atendimento",
      "anos_atuacao",
    ];

    const data = {};
    for (const k of allowed) {
      if (req.body[k] !== undefined) data[k] = req.body[k];
    }

    if (Object.keys(data).length === 0) {
      return next(
        new AppError(
          "Nada para atualizar.",
          ERROR_CODES.VALIDATION_ERROR,
          400
        )
      );
    }

    await adminRepo.update(corretoraId, data);
    const updated = await adminRepo.findById(corretoraId);

    logger.info(
      {
        userId: req.corretoraUser.id,
        corretoraId,
        fieldsChanged: Object.keys(data),
      },
      "corretora.profile.updated"
    );

    analyticsService.track({
      name: "profile_updated",
      actorType: "corretora_user",
      actorId: req.corretoraUser.id,
      corretoraId,
      props: { fields_changed: Object.keys(data) },
      req,
    });

    return response.ok(res, updated, "Perfil atualizado.");
  } catch (err) {
    return next(
      err instanceof AppError
        ? err
        : new AppError(
            "Erro ao atualizar perfil.",
            ERROR_CODES.SERVER_ERROR,
            500
          )
    );
  }
}

module.exports = { getMyProfile, updateMyProfile };
