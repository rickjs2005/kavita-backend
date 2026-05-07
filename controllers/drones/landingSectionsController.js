"use strict";

const dronesService = require("../../services/dronesService");
const AppError = require("../../errors/AppError");
const ERROR_CODES = require("../../constants/ErrorCodes");
const { response } = require("../../lib");
const {
  upsertLandingSectionSchema,
  SECTION_KEY_RE,
  formatDronesErrors,
} = require("../../schemas/dronesSchemas");

function parseKey(raw) {
  const k = String(raw || "").trim().toLowerCase();
  if (!SECTION_KEY_RE.test(k)) {
    throw new AppError(
      "section_key inválida.",
      ERROR_CODES.VALIDATION_ERROR,
      400,
      { field: "section_key" },
    );
  }
  return k;
}

async function listSectionsAdmin(req, res, next) {
  try {
    const items = await dronesService.listSectionsAdmin();
    return response.ok(res, { items });
  } catch (e) {
    console.error("[drones/admin] listSectionsAdmin error:", e);
    return next(
      new AppError("Erro ao listar seções.", ERROR_CODES.SERVER_ERROR, 500),
    );
  }
}

async function getSectionAdmin(req, res, next) {
  try {
    const key = parseKey(req.params.key);
    const row = await dronesService.getSectionAdmin(key);
    if (!row) {
      // Se a seção não existe ainda, devolve um esqueleto vazio para o
      // admin poder criá-la pelo UI sem POST extra.
      return response.ok(res, {
        section_key: key,
        title: null,
        subtitle: null,
        items: [],
        sort_order: 0,
        is_active: 1,
        _exists: false,
      });
    }
    return response.ok(res, { ...row, _exists: true });
  } catch (e) {
    console.error("[drones/admin] getSectionAdmin error:", e);
    return next(
      e instanceof AppError
        ? e
        : new AppError("Erro ao buscar seção.", ERROR_CODES.SERVER_ERROR, 500),
    );
  }
}

async function upsertSection(req, res, next) {
  try {
    const keyFromParams = parseKey(req.params.key);
    const body = { ...req.body, section_key: keyFromParams };
    const bodyResult = upsertLandingSectionSchema.safeParse(body);
    if (!bodyResult.success) {
      throw new AppError("Dados inválidos.", ERROR_CODES.VALIDATION_ERROR, 400, {
        fields: formatDronesErrors(bodyResult.error),
      });
    }

    await dronesService.upsertSection(bodyResult.data);
    return response.ok(res, { section_key: keyFromParams }, "Seção salva.");
  } catch (e) {
    console.error("[drones/admin] upsertSection error:", e);
    return next(
      e instanceof AppError
        ? e
        : new AppError("Erro ao salvar seção.", ERROR_CODES.SERVER_ERROR, 500),
    );
  }
}

async function deleteSection(req, res, next) {
  try {
    const key = parseKey(req.params.key);
    const affected = await dronesService.deleteSection(key);
    if (!affected) {
      throw new AppError("Seção não encontrada.", ERROR_CODES.NOT_FOUND, 404);
    }
    return response.ok(res, { section_key: key }, "Seção removida.");
  } catch (e) {
    console.error("[drones/admin] deleteSection error:", e);
    return next(
      e instanceof AppError
        ? e
        : new AppError("Erro ao remover seção.", ERROR_CODES.SERVER_ERROR, 500),
    );
  }
}

async function listSectionsPublic(req, res, next) {
  try {
    const items = await dronesService.listSectionsPublic();
    return response.ok(res, { items });
  } catch (e) {
    console.error("[drones/public] listSectionsPublic error:", e);
    return next(
      new AppError("Erro ao carregar seções.", ERROR_CODES.SERVER_ERROR, 500),
    );
  }
}

async function getSectionPublic(req, res, next) {
  try {
    const key = parseKey(req.params.key);
    const row = await dronesService.getSectionPublic(key);
    return response.ok(res, row || null);
  } catch (e) {
    console.error("[drones/public] getSectionPublic error:", e);
    return next(
      e instanceof AppError
        ? e
        : new AppError("Erro ao buscar seção.", ERROR_CODES.SERVER_ERROR, 500),
    );
  }
}

module.exports = {
  listSectionsAdmin,
  getSectionAdmin,
  upsertSection,
  deleteSection,
  listSectionsPublic,
  getSectionPublic,
};
