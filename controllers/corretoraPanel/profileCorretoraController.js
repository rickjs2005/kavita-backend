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
const mediaService = require("../../services/mediaService");
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
      // Fase 8 — regionais adicionais Zona da Mata
      "endereco_textual",
      "compra_cafe_especial",
      "volume_minimo_sacas",
      "faz_retirada_amostra",
      "trabalha_exportacao",
      "trabalha_cooperativas",
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

/**
 * PUT /api/corretora/profile/logo
 *
 * Fase 4 — corretora troca o próprio logo sem depender do admin.
 * Multer já validou tipo/tamanho antes (mediaService.upload).
 * Fluxo:
 *   1. Valida que existe arquivo (multer deixa req.file)
 *   2. Persiste via mediaService (mesmo folder "corretoras" do admin)
 *   3. Remove logo antigo (se houver), fire-and-forget pra não bloquear
 *   4. Atualiza logo_path no DB
 *   5. Audit + analytics
 *
 * RBAC: profile.edit (owner/manager) — aplicado no route.
 */
async function updateMyLogo(req, res, next) {
  if (!req.file) {
    return next(
      new AppError(
        "Arquivo de logo não enviado.",
        ERROR_CODES.VALIDATION_ERROR,
        400,
      ),
    );
  }
  try {
    const corretoraId = req.corretoraUser.corretora_id;
    const current = await adminRepo.findById(corretoraId);
    if (!current) {
      mediaService.enqueueOrphanCleanup([req.file]);
      return next(
        new AppError(
          "Corretora não encontrada.",
          ERROR_CODES.NOT_FOUND,
          404,
        ),
      );
    }

    const [persisted] = await mediaService.persistMedia([req.file], {
      folder: "corretoras",
    });

    await adminRepo.update(corretoraId, { logo_path: persisted.path });

    // Remove o logo anterior fora da transação — melhor logar falha do
    // que quebrar o update se o arquivo antigo já foi removido manualmente.
    if (current.logo_path && current.logo_path !== persisted.path) {
      mediaService
        .removeMedia([{ path: current.logo_path }])
        .catch((err) =>
          logger.warn(
            {
              err: err?.message ?? String(err),
              corretoraId,
              oldPath: current.logo_path,
            },
            "corretora.logo.cleanup_old_failed",
          ),
        );
    }

    logger.info(
      {
        userId: req.corretoraUser.id,
        corretoraId,
        newPath: persisted.path,
      },
      "corretora.profile.logo_updated",
    );

    analyticsService.track({
      name: "profile_logo_updated",
      actorType: "corretora_user",
      actorId: req.corretoraUser.id,
      corretoraId,
      req,
    });

    const updated = await adminRepo.findById(corretoraId);
    return response.ok(res, updated, "Logo atualizado.");
  } catch (err) {
    if (req.file) {
      mediaService.enqueueOrphanCleanup([req.file]);
    }
    return next(
      err instanceof AppError
        ? err
        : new AppError(
            "Erro ao atualizar logo.",
            ERROR_CODES.SERVER_ERROR,
            500,
          ),
    );
  }
}

module.exports = { getMyProfile, updateMyProfile, updateMyLogo };
