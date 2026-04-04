// controllers/news/adminClimaController.js
// Admin controller do Kavita News - CLIMA (CRUD + logs em admin_logs via pool)
//
// Integração Open-Meteo (chuva mm): services/climaAdminService.js
// Geocoding / sugestão de coordenadas: services/inmetStationsService.js

const climaRepo = require("../../repositories/climaRepository");
const { logAdminAction } = require("../../services/adminLogs");
const { toInt, nowSql } = require("../../services/news/newsHelpers");
const { response } = require("../../lib");
const AppError = require("../../errors/AppError");
const ERROR_CODES = require("../../constants/ErrorCodes");
const climaAdminService = require("../../services/climaAdminService");

/**
 * Sugestão de coordenadas (compatibilidade):
 * Mantivemos o nome do service por compatibilidade com o seu fluxo atual,
 * mas agora ele deve usar Open-Meteo Geocoding API (ver services/inmetStationsService.js).
 */
let inmetStationsService = null;
try {
  inmetStationsService = require("../../services/inmetStationsService");
} catch (e) {
  inmetStationsService = null;
  console.warn("[CLIMA] Falha ao carregar services/inmetStationsService:", e?.message || e);
}

function getAdminId(req) {
  return req.admin?.id || req.user?.id || req.adminId || req.userId || null;
}

async function logAdmin(req, acao, entidade, entidade_id = null) {
  await logAdminAction({ adminId: getAdminId(req), acao, entidade, entidadeId: entidade_id });
}

/* =========================================================
 * Handlers - Clima (news_clima)
 * ========================================================= */

async function listClima(req, res, next) {
  try {
    const rows = await climaRepo.listClima();
    return response.ok(res, rows);
  } catch (error) {
    console.error("adminClimaController.listClima:", error);
    return next(new AppError("Erro ao listar clima.", ERROR_CODES.SERVER_ERROR, 500));
  }
}

/**
 * GET /api/admin/news/clima/stations?uf=MG&q=manhu&limit=10
 * Sugestões via Open-Meteo Geocoding (mantém endpoint por compatibilidade).
 */
async function suggestClimaStations(req, res, next) {
  try {
    const uf = String(req.query.uf || "").trim().toUpperCase();
    const q = String(req.query.q || "").trim();
    const limit = Math.min(25, Math.max(1, Number(req.query.limit) || 10));

    if (!uf || uf.length !== 2) {
      return next(new AppError("UF inválida (use 2 letras)", ERROR_CODES.VALIDATION_ERROR, 400));
    }

    if (!q || q.length < 2) {
      return response.ok(res, []);
    }

    const data = await inmetStationsService.suggestStations({ uf, q, limit });

    return response.ok(res, data, null, {
      provider: "OPEN_METEO_GEOCODING",
      uf,
      q,
      limit,
    });
  } catch (err) {
    console.error("[CLIMA][GEOCODING]", err);
    return next(new AppError("Erro ao buscar coordenadas", ERROR_CODES.GEOCODING_ERROR, 500));
  }
}

// req.body is pre-validated and coerced by validate(createClimaBodySchema)
async function createClima(req, res, next) {
  try {
    const row = await climaRepo.createClima(req.body);
    await logAdmin(req, "criou", "news_clima", row?.id ?? null);
    return response.created(res, row);
  } catch (error) {
    console.error("adminClimaController.createClima:", error);
    if (String(error?.code || "").includes("ER_DUP_ENTRY"))
      return next(new AppError("Já existe um clima com esse slug.", ERROR_CODES.CONFLICT, 409));
    return next(new AppError("Erro ao criar clima.", ERROR_CODES.SERVER_ERROR, 500));
  }
}

// req.body is pre-validated and coerced by validate(updateClimaBodySchema)
// Only keys present in req.body are patched (the repo checks hasOwnProperty).
async function updateClima(req, res, next) {
  try {
    const id = toInt(req.params.id, 0);
    if (!id) return next(new AppError("ID inválido.", ERROR_CODES.VALIDATION_ERROR, 400));

    if (Object.keys(req.body).length === 0) {
      return next(new AppError("Nenhum campo para atualizar.", ERROR_CODES.VALIDATION_ERROR, 400));
    }

    const result = await climaRepo.updateClima(id, req.body);
    await logAdmin(req, "editou", "news_clima", id);
    return response.ok(res, result);
  } catch (error) {
    console.error("adminClimaController.updateClima:", error);
    if (String(error?.code || "").includes("ER_DUP_ENTRY"))
      return next(new AppError("Já existe um clima com esse slug.", ERROR_CODES.CONFLICT, 409));
    return next(new AppError("Erro ao atualizar clima.", ERROR_CODES.SERVER_ERROR, 500));
  }
}

async function deleteClima(req, res, next) {
  try {
    const id = toInt(req.params.id, 0);
    if (!id) return next(new AppError("ID inválido.", ERROR_CODES.VALIDATION_ERROR, 400));
    const result = await climaRepo.deleteClima(id);
    await logAdmin(req, "removeu", "news_clima", id);
    return response.ok(res, result);
  } catch (error) {
    console.error("adminClimaController.deleteClima:", error);
    return next(new AppError("Erro ao remover clima.", ERROR_CODES.SERVER_ERROR, 500));
  }
}

/**
 * POST /api/admin/news/clima/:id/sync
 */
async function syncClima(req, res, next) {
  try {
    const id = toInt(req.params.id, 0);
    if (!id) return next(new AppError("ID inválido.", ERROR_CODES.VALIDATION_ERROR, 400));

    const row = await climaRepo.getClimaById(id);
    if (!row) return next(new AppError("Registro de clima não encontrado.", ERROR_CODES.NOT_FOUND, 404));

    let providerData = null;

    try {
      providerData = await climaAdminService.fetchRainData(row);
    } catch (e) {
      if (String(e?.code || "") === "COORDS_REQUIRED") {
        return next(new AppError(
          "Para sincronizar chuva com Open-Meteo, preencha station_lat e station_lon (ou mantenha city_name/uf válidos para geocoding).",
          ERROR_CODES.VALIDATION_ERROR,
          400,
          e?.details || { field: ["station_lat", "station_lon"] }
        ));
      }

      if (String(e?.code || "") === "GEOCODE_NOT_FOUND") {
        return response.ok(res, row, null, {
          provider: {
            ok: false,
            code: "GEOCODE_NOT_FOUND",
            message: "Geocoding não encontrou coordenadas para essa cidade/UF.",
            details: e?.details || null,
          },
        });
      }

      console.error("syncClima.provider:", e?.details || e);
      return response.ok(res, row, null, {
        provider: {
          ok: false,
          code: String(e?.code || "PROVIDER_ERROR"),
          message: "Falha ao consultar provedor de clima.",
          details: e?.details || null,
        },
      });
    }

    const patch = {
      mm_24h: providerData.mm_24h ?? null,
      mm_7d: providerData.mm_7d ?? null,
      source: providerData.source || row.source || "UNKNOWN",
      last_update_at: nowSql(),
      last_sync_observed_at: nowSql(),
    };

    await climaRepo.updateClima(id, patch);
    await logAdmin(req, "sincronizou", "news_clima", id);

    const updated = await climaRepo.getClimaById(id);

    if (providerData?.meta) {
      return response.ok(res, updated, null, { provider: { ok: true, ...providerData.meta } });
    }
    return response.ok(res, updated);
  } catch (error) {
    console.error("adminClimaController.syncClima:", error);
    return next(new AppError("Erro ao sincronizar clima.", ERROR_CODES.SERVER_ERROR, 500));
  }
}

/**
 * POST /api/admin/news/clima/sync-all
 * Trigger manual do batch sync (mesma logica do cron job).
 */
async function syncClimaAll(req, res, next) {
  try {
    const climaSyncService = require("../../services/climaSyncService");
    const report = await climaSyncService.syncAll();

    await logAdmin(req, "sync-all", "news_clima", null);

    return response.ok(res, report);
  } catch (error) {
    console.error("adminClimaController.syncAll:", error);
    return next(new AppError("Erro ao sincronizar clima (batch).", ERROR_CODES.SERVER_ERROR, 500));
  }
}

module.exports = {
  listClima,
  suggestClimaStations,
  createClima,
  updateClima,
  deleteClima,
  syncClima,
  syncClimaAll,
};
