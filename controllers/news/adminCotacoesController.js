// controllers/news/adminCotacoesController.js
// Admin controller do Kavita News - COTAÇÕES (CRUD + logs em admin_logs via pool)
//
// Lógica de domínio de sync: services/cotacoesAdminService.js

const cotacoesRepo = require("../../repositories/cotacoesRepository");
const { logAdminAction } = require("../../services/adminLogs");
const { toInt } = require("../../services/news/newsHelpers");
const { response } = require("../../lib");
const AppError = require("../../errors/AppError");
const ERROR_CODES = require("../../constants/ErrorCodes");
const cotacoesAdminService = require("../../services/cotacoesAdminService");

/* =========================================================
 * Handlers - Cotações (news_cotacoes)
 * ========================================================= */

async function listCotacoes(req, res, next) {
  try {
    const rows = await cotacoesRepo.listCotacoes();
    return response.ok(res, rows);
  } catch (error) {
    console.error("adminCotacoesController.listCotacoes:", error);
    return next(new AppError("Erro ao listar cotações.", ERROR_CODES.SERVER_ERROR, 500));
  }
}

/**
 * GET /api/admin/news/cotacoes/meta
 * Retorna:
 * - allowed_slugs (whitelist)
 * - presets (para auto-preencher no frontend)
 * - suggestions (distinct no banco: markets/sources/units/types)
 */
async function getCotacoesMeta(req, res, next) {
  try {
    const meta = await cotacoesAdminService.getMeta();
    return response.ok(res, meta);
  } catch (error) {
    console.error("adminCotacoesController.getCotacoesMeta:", error);
    return next(new AppError("Erro ao carregar meta de cotações.", ERROR_CODES.SERVER_ERROR, 500));
  }
}

// req.body is pre-validated and coerced by validate(createCotacaoBodySchema)
async function createCotacao(req, res, next) {
  try {
    const row = await cotacoesRepo.createCotacao(req.body);
    const adminId = req.admin?.id || req.user?.id || req.adminId || req.userId || null;
    await logAdminAction({ adminId, acao: "criou", entidade: "news_cotacoes", entidadeId: row?.id ?? null });
    return response.created(res, row);
  } catch (error) {
    console.error("adminCotacoesController.createCotacao:", error);
    if (String(error?.code || "").includes("ER_DUP_ENTRY"))
      return next(new AppError("Já existe uma cotação com esse slug.", ERROR_CODES.CONFLICT, 409));
    return next(new AppError("Erro ao criar cotação.", ERROR_CODES.SERVER_ERROR, 500));
  }
}

// req.body is pre-validated and coerced by validate(updateCotacaoBodySchema)
// Only keys present in req.body are patched (the repo checks hasOwnProperty).
async function updateCotacao(req, res, next) {
  try {
    const id = toInt(req.params.id, 0);
    if (!id) return next(new AppError("ID inválido.", ERROR_CODES.VALIDATION_ERROR, 400));

    if (Object.keys(req.body).length === 0) {
      return next(new AppError("Nenhum campo para atualizar.", ERROR_CODES.VALIDATION_ERROR, 400));
    }

    const result = await cotacoesRepo.updateCotacao(id, req.body);
    const adminId = req.admin?.id || req.user?.id || req.adminId || req.userId || null;
    await logAdminAction({ adminId, acao: "editou", entidade: "news_cotacoes", entidadeId: id });
    return response.ok(res, result);
  } catch (error) {
    console.error("adminCotacoesController.updateCotacao:", error);
    if (String(error?.code || "").includes("ER_DUP_ENTRY"))
      return next(new AppError("Já existe uma cotação com esse slug.", ERROR_CODES.CONFLICT, 409));
    return next(new AppError("Erro ao atualizar cotação.", ERROR_CODES.SERVER_ERROR, 500));
  }
}

async function deleteCotacao(req, res, next) {
  try {
    const id = toInt(req.params.id, 0);
    if (!id) return next(new AppError("ID inválido.", ERROR_CODES.VALIDATION_ERROR, 400));
    const result = await cotacoesRepo.deleteCotacao(id);
    const adminId = req.admin?.id || req.user?.id || req.adminId || req.userId || null;
    await logAdminAction({ adminId, acao: "removeu", entidade: "news_cotacoes", entidadeId: id });
    return response.ok(res, result);
  } catch (error) {
    console.error("adminCotacoesController.deleteCotacao:", error);
    return next(new AppError("Erro ao remover cotação.", ERROR_CODES.SERVER_ERROR, 500));
  }
}

/**
 * POST /api/admin/news/cotacoes/:id/sync
 * Loga apenas em caso de sucesso (comportamento original preservado).
 */
async function syncCotacao(req, res, next) {
  const startedAt = new Date();
  try {
    const id = toInt(req.params.id, 0);
    if (!id) return next(new AppError("ID inválido.", ERROR_CODES.VALIDATION_ERROR, 400));

    const row = await cotacoesRepo.getCotacaoById(id);
    if (!row) return next(new AppError("Cotação não encontrada.", ERROR_CODES.NOT_FOUND, 404));

    const { updated, provider } = await cotacoesAdminService.syncOne(id, row);

    if (provider.ok) {
      const adminId = req.admin?.id || req.user?.id || req.adminId || req.userId || null;
      await logAdminAction({ adminId, acao: "sincronizou", entidade: "news_cotacoes", entidadeId: id });
    }

    return response.ok(res, updated, null, {
      provider,
      took_ms: Date.now() - startedAt.getTime(),
    });
  } catch (error) {
    console.error("adminCotacoesController.syncCotacao:", error);
    return next(new AppError("Erro ao sincronizar cotação.", ERROR_CODES.SERVER_ERROR, 500));
  }
}

/**
 * POST /api/admin/news/cotacoes/sync-all
 */
async function syncCotacoesAll(req, res, next) {
  const startedAt = new Date();
  try {
    const summary = await cotacoesAdminService.syncAll();

    const adminId = req.admin?.id || req.user?.id || req.adminId || req.userId || null;
    await logAdminAction({ adminId, acao: "sincronizou", entidade: "news_cotacoes", entidadeId: null });

    return response.ok(res, summary, null, { took_ms: Date.now() - startedAt.getTime() });
  } catch (error) {
    console.error("adminCotacoesController.syncCotacoesAll:", error);
    return next(new AppError("Erro ao sincronizar cotações (all).", ERROR_CODES.SERVER_ERROR, 500));
  }
}

/**
 * GET /api/admin/news/cotacoes/config
 * Returns sync configuration and runtime state (mirrors clima pattern).
 */
async function getCotacoesSyncConfig(_req, res, next) {
  try {
    let cotacoesSyncJob;
    try { cotacoesSyncJob = require("../../jobs/cotacoesSyncJob"); } catch { /* optional */ }

    const runtimeState = cotacoesSyncJob?.getState?.() || {
      enabled: false, cronExpr: null, running: false,
      lastRunAt: null, lastStatus: null, lastError: null, lastReport: null,
    };

    return response.ok(res, {
      cotacoes_sync_enabled: runtimeState.enabled,
      cotacoes_sync_cron: runtimeState.cronExpr || process.env.COTACOES_SYNC_CRON || "0 */4 * * *",
      cotacoes_provider_enabled: process.env.COTACOES_PROVIDER_ENABLED === "true",
      runtime: runtimeState,
    });
  } catch (error) {
    console.error("adminCotacoesController.getCotacoesSyncConfig:", error);
    return next(new AppError("Erro ao carregar configuração de sync.", ERROR_CODES.SERVER_ERROR, 500));
  }
}

module.exports = {
  listCotacoes,
  createCotacao,
  updateCotacao,
  deleteCotacao,
  syncCotacao,
  syncCotacoesAll,
  getCotacoesMeta,
  getCotacoesSyncConfig,
};
