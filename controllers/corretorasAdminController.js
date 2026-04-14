// controllers/corretorasAdminController.js
//
// Admin endpoints for Mercado do Café / Corretoras.
// Protected by verifyAdmin + validateCSRF via route mount.
"use strict";

const { response } = require("../lib");
const logger = require("../lib/logger");
const AppError = require("../errors/AppError");
const ERROR_CODES = require("../constants/ErrorCodes");
const adminRepo = require("../repositories/corretorasAdminRepository");
const corretorasService = require("../services/corretorasService");
const corretoraAuthService = require("../services/corretoraAuthService");
const mediaService = require("../services/mediaService");
const {
  listAdminQuerySchema,
  listSubmissionsQuerySchema,
  rejectSubmissionSchema,
} = require("../schemas/corretorasSchemas");

// ─── Corretoras CRUD ────────────────────────────────────────────────────────

/**
 * GET /api/admin/corretoras
 */
const listCorretoras = async (req, res, next) => {
  try {
    const qResult = listAdminQuerySchema.safeParse(req.query);
    const q = qResult.success ? qResult.data : { page: 1, limit: 20 };

    const result = await adminRepo.list(q);
    return response.paginated(res, result);
  } catch (err) {
    return next(
      err instanceof AppError
        ? err
        : new AppError("Erro ao listar corretoras.", ERROR_CODES.SERVER_ERROR, 500)
    );
  }
};

/**
 * GET /api/admin/corretoras/:id
 */
const getById = async (req, res, next) => {
  try {
    const corretora = await adminRepo.findById(req.params.id);
    if (!corretora) {
      return next(
        new AppError("Corretora não encontrada.", ERROR_CODES.NOT_FOUND, 404)
      );
    }
    return response.ok(res, corretora);
  } catch (err) {
    return next(new AppError("Erro ao buscar corretora.", ERROR_CODES.SERVER_ERROR, 500));
  }
};

/**
 * POST /api/admin/corretoras
 * Multipart: optional "logo" file field.
 * Body validated by validate(createCorretoraSchema) middleware.
 */
const createCorretora = async (req, res, next) => {
  try {
    const data = { ...req.body };

    if (req.file) {
      const [persisted] = await mediaService.persistMedia([req.file], {
        folder: "corretoras",
      });
      data.logo_path = persisted.path;
    }

    data.created_by = req.admin?.id || null;

    const { id, slug } = await corretorasService.createCorretora(data);
    return response.created(res, { id, slug }, "Corretora cadastrada.");
  } catch (err) {
    if (req.file) {
      mediaService.enqueueOrphanCleanup([req.file]);
    }
    return next(
      err instanceof AppError
        ? err
        : new AppError("Erro ao cadastrar corretora.", ERROR_CODES.SERVER_ERROR, 500)
    );
  }
};

/**
 * PUT /api/admin/corretoras/:id
 * Multipart: optional "logo" file field.
 * Body validated by validate(updateCorretoraSchema) middleware.
 */
const updateCorretora = async (req, res, next) => {
  try {
    const data = { ...req.body };

    if (req.file) {
      const [persisted] = await mediaService.persistMedia([req.file], {
        folder: "corretoras",
      });
      data.logo_path = persisted.path;
    }

    const updated = await corretorasService.updateCorretora(
      Number(req.params.id),
      data
    );
    return response.ok(res, updated, "Corretora atualizada.");
  } catch (err) {
    if (req.file) {
      mediaService.enqueueOrphanCleanup([req.file]);
    }
    return next(
      err instanceof AppError
        ? err
        : new AppError("Erro ao atualizar corretora.", ERROR_CODES.SERVER_ERROR, 500)
    );
  }
};

/**
 * PATCH /api/admin/corretoras/:id/status
 * Body validated by validate(statusSchema) middleware.
 */
const toggleStatus = async (req, res, next) => {
  try {
    const targetId = Number(req.params.id);
    await corretorasService.toggleStatus(targetId, req.body.status);
    // Audit (fire-and-forget)
    require("../services/adminAuditService").record({
      req,
      action: "corretora.status_changed",
      targetType: "corretora",
      targetId,
      meta: { to: req.body.status },
    });
    return response.ok(res, null, "Status atualizado.");
  } catch (err) {
    return next(
      err instanceof AppError
        ? err
        : new AppError("Erro ao atualizar status.", ERROR_CODES.SERVER_ERROR, 500)
    );
  }
};

/**
 * PATCH /api/admin/corretoras/:id/featured
 * Body validated by validate(featuredSchema) middleware.
 */
const toggleFeatured = async (req, res, next) => {
  try {
    const targetId = Number(req.params.id);
    await corretorasService.toggleFeatured(targetId, req.body.is_featured);
    require("../services/adminAuditService").record({
      req,
      action: "corretora.featured_changed",
      targetType: "corretora",
      targetId,
      meta: { featured: Boolean(req.body.is_featured) },
    });
    return response.ok(res, null, "Destaque atualizado.");
  } catch (err) {
    return next(
      err instanceof AppError
        ? err
        : new AppError("Erro ao atualizar destaque.", ERROR_CODES.SERVER_ERROR, 500)
    );
  }
};

// ─── Submissions ────────────────────────────────────────────────────────────

/**
 * GET /api/admin/corretora-submissions
 */
const listSubmissions = async (req, res, next) => {
  try {
    const qResult = listSubmissionsQuerySchema.safeParse(req.query);
    const q = qResult.success ? qResult.data : { status: "pending", page: 1, limit: 20 };

    const result = await adminRepo.listSubmissions(q);
    const pending = await adminRepo.countPending();

    return response.paginated(res, {
      ...result,
      meta_extra: { pending_count: pending },
    });
  } catch (err) {
    return next(
      new AppError("Erro ao listar solicitações.", ERROR_CODES.SERVER_ERROR, 500)
    );
  }
};

/**
 * GET /api/admin/corretora-submissions/:id
 */
const getSubmissionById = async (req, res, next) => {
  try {
    const sub = await adminRepo.findSubmissionById(req.params.id);
    if (!sub) {
      return next(
        new AppError("Solicitação não encontrada.", ERROR_CODES.NOT_FOUND, 404)
      );
    }
    return response.ok(res, sub);
  } catch (err) {
    return next(
      new AppError("Erro ao buscar solicitação.", ERROR_CODES.SERVER_ERROR, 500)
    );
  }
};

/**
 * POST /api/admin/corretora-submissions/:id/approve
 */
const approveSubmission = async (req, res, next) => {
  try {
    const submissionId = Number(req.params.id);
    const result = await corretorasService.approveSubmission(
      submissionId,
      req.admin?.id,
    );
    if (!result.already_approved) {
      require("../services/adminAuditService").record({
        req,
        action: "corretora.approved",
        targetType: "submission",
        targetId: submissionId,
        meta: { corretora_id: result.corretora_id },
      });
    }
    const msg = result.already_approved
      ? "Solicitação já havia sido aprovada."
      : "Corretora aprovada e publicada.";
    return response.ok(res, { corretora_id: result.corretora_id }, msg);
  } catch (err) {
    return next(
      err instanceof AppError
        ? err
        : new AppError("Erro ao aprovar solicitação.", ERROR_CODES.SERVER_ERROR, 500)
    );
  }
};

/**
 * POST /api/admin/corretora-submissions/:id/reject
 * Body validated by validate(rejectSubmissionSchema) middleware.
 */
const rejectSubmission = async (req, res, next) => {
  try {
    const submissionId = Number(req.params.id);
    await corretorasService.rejectSubmission(
      submissionId,
      req.admin?.id,
      req.body.reason,
    );
    require("../services/adminAuditService").record({
      req,
      action: "corretora.rejected",
      targetType: "submission",
      targetId: submissionId,
      meta: { reason: req.body.reason },
    });
    return response.ok(res, null, "Solicitação rejeitada.");
  } catch (err) {
    return next(
      err instanceof AppError
        ? err
        : new AppError("Erro ao rejeitar solicitação.", ERROR_CODES.SERVER_ERROR, 500)
    );
  }
};

/**
 * POST /api/admin/mercado-do-cafe/corretoras/:id/users/invite
 * Cria ou reenvia convite de primeiro acesso para a corretora.
 * Body validado por validate(inviteCorretoraUserSchema).
 *
 * Fluxos cobertos (idempotente):
 *   - primeira vez: cria usuário pendente + envia e-mail
 *   - reenviar: revoga tokens antigos + envia novo e-mail
 *   - conta já ativa: 409 com guidance para usar reset
 *
 * Toda a lógica fica no service (corretoraAuthService.inviteCorretoraUser);
 * este controller só extrai dados de req e chama o service.
 */
const inviteCorretoraUser = async (req, res, next) => {
  try {
    const corretoraId = Number(req.params.id);
    const result = await corretoraAuthService.inviteCorretoraUser(
      corretoraId,
      req.body,
      { adminId: req.admin?.id }
    );

    const msg = result.resent
      ? "Convite reenviado. A corretora receberá um novo e-mail de primeiro acesso."
      : "Convite enviado. A corretora receberá um e-mail com o link de primeiro acesso.";

    return response.created(
      res,
      {
        id: result.id,
        corretora_id: result.corretora_id,
        nome: result.nome,
        email: result.email,
        resent: result.resent,
      },
      msg
    );
  } catch (err) {
    return next(
      err instanceof AppError
        ? err
        : new AppError(
            "Erro ao enviar convite.",
            ERROR_CODES.SERVER_ERROR,
            500
          )
    );
  }
};

/**
 * GET /api/admin/corretora-submissions/pending-count
 */
const getPendingCount = async (req, res, next) => {
  try {
    const count = await adminRepo.countPending();
    return response.ok(res, { count });
  } catch (err) {
    return next(
      new AppError("Erro ao contar pendentes.", ERROR_CODES.SERVER_ERROR, 500)
    );
  }
};

module.exports = {
  listCorretoras,
  getById,
  createCorretora,
  updateCorretora,
  toggleStatus,
  toggleFeatured,
  inviteCorretoraUser,
  listSubmissions,
  getSubmissionById,
  approveSubmission,
  rejectSubmission,
  getPendingCount,
};
