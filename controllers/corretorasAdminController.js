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
const auditRepo = require("../repositories/adminAuditLogsRepository");
const subEventsRepo = require("../repositories/subscriptionEventsRepository");
const usersRepo = require("../repositories/corretoraUsersRepository");
const corretorasService = require("../services/corretorasService");
const corretoraAuthService = require("../services/corretoraAuthService");
const auditService = require("../services/adminAuditService");
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
 *
 * Admin vê corretora mesmo quando arquivada (precisa ser capaz de
 * restaurar/editar após arquivar). A listagem tem default
 * include_archived=0; o lookup por id ignora esse default.
 */
const getById = async (req, res, next) => {
  try {
    const corretora = await adminRepo.findById(req.params.id, {
      includeArchived: true,
    });
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

    const targetId = Number(req.params.id);
    // Fase 7 — guarda snapshot ANTES para o audit log before/after
    const before = await adminRepo.findById(targetId);
    const updated = await corretorasService.updateCorretora(targetId, data);

    // Audita só os campos efetivamente editados. Não loga descrição
    // cheia no meta — vai em changed_fields só para rastreabilidade.
    const auditService = require("../services/adminAuditService");
    const diff = auditService.diffFields(before, updated, [
      "name",
      "slug",
      "contact_name",
      "description",
      "city",
      "state",
      "region",
      "phone",
      "whatsapp",
      "email",
      "website",
      "instagram",
      "facebook",
      "logo_path",
      "cidades_atendidas",
      "tipos_cafe",
      "perfil_compra",
      "horario_atendimento",
      "anos_atuacao",
    ]);
    if (diff.changed_fields.length > 0) {
      auditService.record({
        req,
        action: "corretora.updated",
        targetType: "corretora",
        targetId,
        meta: diff,
      });
    }

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
    // Fase 7 — before/after explícito no audit
    const before = await adminRepo.findById(targetId);
    await corretorasService.toggleStatus(targetId, req.body.status);
    require("../services/adminAuditService").record({
      req,
      action: "corretora.status_changed",
      targetType: "corretora",
      targetId,
      meta: {
        before: { status: before?.status ?? null },
        after: { status: req.body.status },
        changed_fields: ["status"],
      },
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
    const before = await adminRepo.findById(targetId);
    await corretorasService.toggleFeatured(targetId, req.body.is_featured);
    require("../services/adminAuditService").record({
      req,
      action: "corretora.featured_changed",
      targetType: "corretora",
      targetId,
      meta: {
        before: { is_featured: Boolean(before?.is_featured) },
        after: { is_featured: Boolean(req.body.is_featured) },
        changed_fields: ["is_featured"],
      },
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
    // Logar o erro original antes de mascarar como "SERVER_ERROR" 500 —
    // sem isso, qualquer falha no service (constraint de banco, coluna
    // nova sem default, race condition) vira toast opaco no admin e
    // não aparece no log agregado com contexto.
    if (!(err instanceof AppError)) {
      logger.error(
        {
          err: { message: err?.message, code: err?.code, stack: err?.stack },
          submissionId: Number(req.params.id),
          adminId: req.admin?.id,
        },
        "corretora.approve.unexpected_error",
      );
    }
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

/**
 * GET /api/admin/mercado-do-cafe/corretoras/:id/audit-logs
 *
 * Retorna timeline de ações do admin sobre a corretora: mudança de
 * status, destaque, aprovação/rejeição da submissão original, convite
 * de acesso, etc. Fonte: admin_audit_logs. Mescla cronologicamente
 * (target_type='corretora' direto + target_type='submission' quando
 * houver submission_id vinculado).
 */
const getCorretoraAuditLogs = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      throw new AppError("ID inválido.", ERROR_CODES.VALIDATION_ERROR, 400);
    }
    const corretora = await adminRepo.findById(id);
    if (!corretora) {
      throw new AppError("Corretora não encontrada.", ERROR_CODES.NOT_FOUND, 404);
    }
    const items = await auditRepo.listForCorretora(id, corretora.submission_id, {
      limit: 50,
    });
    return response.ok(res, items);
  } catch (err) {
    return next(
      err instanceof AppError
        ? err
        : new AppError(
            "Erro ao carregar histórico.",
            ERROR_CODES.SERVER_ERROR,
            500,
          ),
    );
  }
};

/**
 * GET /api/admin/mercado-do-cafe/corretoras/:id/subscription-events
 * Timeline de eventos de assinatura para auditoria financeira e
 * análise de churn (usado pela UI admin em ambas trilhas — audit
 * e subscription — na página de edição).
 */
const getCorretoraSubscriptionEvents = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      throw new AppError("ID inválido.", ERROR_CODES.VALIDATION_ERROR, 400);
    }
    const corretora = await adminRepo.findById(id, { includeArchived: true });
    if (!corretora) {
      throw new AppError("Corretora não encontrada.", ERROR_CODES.NOT_FOUND, 404);
    }
    const items = await subEventsRepo.listForCorretora(id, { limit: 50 });
    return response.ok(res, items);
  } catch (err) {
    return next(
      err instanceof AppError
        ? err
        : new AppError(
            "Erro ao carregar eventos de assinatura.",
            ERROR_CODES.SERVER_ERROR,
            500,
          ),
    );
  }
};

/**
 * POST /api/admin/mercado-do-cafe/corretoras/:id/cancel-subscription
 * Body: { reason?: string, target_plan_slug?: "free" | null }
 *
 * Cancela a assinatura ativa de uma corretora sem arquivar o registro
 * nem mexer em usuários. Diferente de archive: a corretora continua
 * operando, só perde o plano pago.
 *
 * Por padrão (sem target_plan_slug) cai no FREE. Passando null,
 * a corretora fica sem plano ativo (status: expired degradado) —
 * usar com cuidado.
 */
const cancelCorretoraSubscription = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      throw new AppError("ID inválido.", ERROR_CODES.VALIDATION_ERROR, 400);
    }

    const reason = typeof req.body?.reason === "string"
      ? req.body.reason.trim().slice(0, 500)
      : null;
    const targetPlanSlug = req.body?.target_plan_slug === null
      ? null
      : typeof req.body?.target_plan_slug === "string"
        ? req.body.target_plan_slug.trim() || "free"
        : "free";

    const planService = require("../services/planService");
    const result = await planService.cancelPlan({
      corretoraId: id,
      opts: {
        actor_type: "admin",
        actor_id: req.admin?.id ?? null,
        reason,
        targetPlanSlug,
        source: "admin_manual_cancel",
      },
    });

    auditService.record({
      req,
      action: "corretora.subscription_canceled",
      targetType: "corretora",
      targetId: id,
      meta: {
        reason,
        target_plan_slug: targetPlanSlug,
        already_free: result.already_free,
      },
    });

    const msg = result.already_free
      ? "Corretora já estava no plano gratuito."
      : "Assinatura cancelada.";

    return response.ok(res, result, msg);
  } catch (err) {
    return next(
      err instanceof AppError
        ? err
        : new AppError(
            "Erro ao cancelar assinatura.",
            ERROR_CODES.SERVER_ERROR,
            500,
          ),
    );
  }
};

/**
 * POST /api/admin/mercado-do-cafe/corretoras/:id/archive
 * Soft delete — preserva histórico/FK, tira da vitrine.
 */
const archiveCorretora = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      throw new AppError("ID inválido.", ERROR_CODES.VALIDATION_ERROR, 400);
    }
    await corretorasService.archiveCorretora(id);
    auditService.record({
      req,
      action: "corretora.archived",
      targetType: "corretora",
      targetId: id,
    });
    return response.ok(res, null, "Corretora arquivada.");
  } catch (err) {
    return next(
      err instanceof AppError
        ? err
        : new AppError("Erro ao arquivar.", ERROR_CODES.SERVER_ERROR, 500),
    );
  }
};

/**
 * POST /api/admin/mercado-do-cafe/corretoras/:id/restore
 * Reverte soft delete. Status (active/inactive) é preservado.
 */
const restoreCorretora = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      throw new AppError("ID inválido.", ERROR_CODES.VALIDATION_ERROR, 400);
    }
    await corretorasService.restoreCorretora(id);
    auditService.record({
      req,
      action: "corretora.restored",
      targetType: "corretora",
      targetId: id,
    });
    return response.ok(res, null, "Corretora restaurada.");
  } catch (err) {
    return next(
      err instanceof AppError
        ? err
        : new AppError("Erro ao restaurar.", ERROR_CODES.SERVER_ERROR, 500),
    );
  }
};

/**
 * POST /api/admin/mercado-do-cafe/submissions/bulk-approve
 * Body: { ids: number[] }
 * Retorna agregado de sucessos/falhas. Nunca retorna 4xx parcial —
 * prefere 200 com `failed > 0` para o admin ver o que não passou.
 */
const bulkApproveSubmissions = async (req, res, next) => {
  try {
    const result = await corretorasService.bulkApproveSubmissions(
      req.body.ids,
      req.admin?.id ?? null,
    );
    return response.ok(
      res,
      result,
      `${result.approved} aprovada(s), ${result.failed} com erro.`,
    );
  } catch (err) {
    return next(
      err instanceof AppError
        ? err
        : new AppError(
            "Erro ao aprovar em lote.",
            ERROR_CODES.SERVER_ERROR,
            500,
          ),
    );
  }
};

/**
 * POST /api/admin/mercado-do-cafe/submissions/bulk-reject
 * Body: { ids: number[], reason: string }
 */
const bulkRejectSubmissions = async (req, res, next) => {
  try {
    const result = await corretorasService.bulkRejectSubmissions(
      req.body.ids,
      req.admin?.id ?? null,
      req.body.reason,
    );
    return response.ok(
      res,
      result,
      `${result.rejected} rejeitada(s), ${result.failed} com erro.`,
    );
  } catch (err) {
    return next(
      err instanceof AppError
        ? err
        : new AppError(
            "Erro ao rejeitar em lote.",
            ERROR_CODES.SERVER_ERROR,
            500,
          ),
    );
  }
};

/**
 * POST /api/admin/mercado-do-cafe/corretoras/:id/impersonate
 *
 * Emite um corretoraToken temporário (30 min) com claim de
 * impersonação, permitindo ao admin abrir o painel da corretora em
 * modo suporte — sem trocar senha nem invalidar sessão real.
 *
 * O cookie é setado na resposta do admin (same-origin). Admin mantém
 * seu adminToken; as duas sessões coexistem. A corretora real, se
 * estiver logada em outro lugar, segue logada (tokenVersion não muda).
 */
const impersonateCorretora = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      throw new AppError("ID inválido.", ERROR_CODES.VALIDATION_ERROR, 400);
    }

    const corretora = await adminRepo.findById(id);
    if (!corretora) {
      throw new AppError("Corretora não encontrada.", ERROR_CODES.NOT_FOUND, 404);
    }
    if (corretora.status !== "active") {
      throw new AppError(
        "Só é possível impersonar corretoras ativas.",
        ERROR_CODES.VALIDATION_ERROR,
        400,
      );
    }

    const user = await usersRepo.findByCorretoraId(id);
    if (!user) {
      throw new AppError(
        "Corretora ainda não tem usuário ativo. Envie o convite de primeiro acesso antes.",
        ERROR_CODES.CONFLICT,
        409,
      );
    }
    if (!user.is_active) {
      throw new AppError(
        "O usuário principal desta corretora está inativo.",
        ERROR_CODES.CONFLICT,
        409,
      );
    }
    if (corretoraAuthService.isPendingFirstAccess(user)) {
      throw new AppError(
        "Usuário ainda não definiu senha. Impersonação indisponível.",
        ERROR_CODES.CONFLICT,
        409,
      );
    }

    const token = corretoraAuthService.generateImpersonationToken(user, {
      adminId: req.admin?.id ?? null,
      adminNome: req.admin?.nome ?? null,
    });

    res.cookie("corretoraToken", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: corretoraAuthService.IMPERSONATION_COOKIE_MAX_AGE_MS,
      path: "/",
    });

    auditService.record({
      req,
      action: "corretora.impersonation_started",
      targetType: "corretora",
      targetId: id,
      meta: {
        corretora_user_id: user.id,
        corretora_user_email: user.email,
      },
    });

    logger.info(
      {
        adminId: req.admin?.id,
        corretoraId: id,
        corretoraUserId: user.id,
      },
      "corretora.impersonation.started",
    );

    return response.ok(
      res,
      { redirect: "/painel/corretora" },
      "Impersonação iniciada. Abra o painel em outra aba.",
    );
  } catch (err) {
    return next(
      err instanceof AppError
        ? err
        : new AppError(
            "Erro ao iniciar impersonação.",
            ERROR_CODES.SERVER_ERROR,
            500,
          ),
    );
  }
};

// ─── Fase 7 — Notas internas admin ─────────────────────────────────────────

const adminNotesRepo = require("../repositories/corretoraAdminNotesRepository");

/**
 * GET /api/admin/mercado-do-cafe/corretoras/:id/admin-notes
 * Lista notas internas do admin sobre a corretora.
 */
const listAdminNotes = async (req, res, next) => {
  try {
    const corretoraId = Number(req.params.id);
    if (!Number.isInteger(corretoraId) || corretoraId <= 0) {
      throw new AppError("ID inválido.", ERROR_CODES.VALIDATION_ERROR, 400);
    }
    const notes = await adminNotesRepo.listForCorretora(corretoraId);
    return response.ok(res, notes);
  } catch (err) {
    next(
      err instanceof AppError
        ? err
        : new AppError("Erro ao listar notas.", ERROR_CODES.SERVER_ERROR, 500),
    );
  }
};

/**
 * POST /api/admin/mercado-do-cafe/corretoras/:id/admin-notes
 * Body: { body, category? }
 */
const createAdminNote = async (req, res, next) => {
  try {
    const corretoraId = Number(req.params.id);
    if (!Number.isInteger(corretoraId) || corretoraId <= 0) {
      throw new AppError("ID inválido.", ERROR_CODES.VALIDATION_ERROR, 400);
    }
    const body = typeof req.body?.body === "string" ? req.body.body.trim() : "";
    if (!body) {
      throw new AppError(
        "Escreva o conteúdo da nota.",
        ERROR_CODES.VALIDATION_ERROR,
        400,
      );
    }
    if (body.length > 2000) {
      throw new AppError(
        "Nota excede o limite de 2000 caracteres.",
        ERROR_CODES.VALIDATION_ERROR,
        400,
      );
    }
    const category =
      typeof req.body?.category === "string" && req.body.category.trim()
        ? req.body.category.trim().slice(0, 40)
        : null;

    // Confirma que a corretora existe antes de criar a nota
    const corretora = await adminRepo.findById(corretoraId, {
      includeArchived: true,
    });
    if (!corretora) {
      throw new AppError(
        "Corretora não encontrada.",
        ERROR_CODES.NOT_FOUND,
        404,
      );
    }

    const id = await adminNotesRepo.create({
      corretora_id: corretoraId,
      admin_id: req.admin?.id ?? null,
      admin_nome: req.admin?.nome ?? null,
      body,
      category,
    });

    auditService.record({
      req,
      action: "corretora.admin_note_created",
      targetType: "corretora",
      targetId: corretoraId,
      meta: { note_id: id, category, preview: body.slice(0, 80) },
    });

    return response.created(res, { id }, "Nota adicionada.");
  } catch (err) {
    next(
      err instanceof AppError
        ? err
        : new AppError("Erro ao adicionar nota.", ERROR_CODES.SERVER_ERROR, 500),
    );
  }
};

/**
 * DELETE /api/admin/mercado-do-cafe/corretoras/:id/admin-notes/:noteId
 */
const deleteAdminNote = async (req, res, next) => {
  try {
    const corretoraId = Number(req.params.id);
    const noteId = Number(req.params.noteId);
    if (
      !Number.isInteger(corretoraId) ||
      corretoraId <= 0 ||
      !Number.isInteger(noteId) ||
      noteId <= 0
    ) {
      throw new AppError("ID inválido.", ERROR_CODES.VALIDATION_ERROR, 400);
    }
    const affected = await adminNotesRepo.deleteById({
      id: noteId,
      corretora_id: corretoraId,
    });
    if (affected === 0) {
      throw new AppError(
        "Nota não encontrada.",
        ERROR_CODES.NOT_FOUND,
        404,
      );
    }
    auditService.record({
      req,
      action: "corretora.admin_note_deleted",
      targetType: "corretora",
      targetId: corretoraId,
      meta: { note_id: noteId },
    });
    return response.ok(res, null, "Nota removida.");
  } catch (err) {
    next(
      err instanceof AppError
        ? err
        : new AppError("Erro ao remover nota.", ERROR_CODES.SERVER_ERROR, 500),
    );
  }
};

module.exports = {
  listCorretoras,
  getById,
  getCorretoraAuditLogs,
  getCorretoraSubscriptionEvents,
  impersonateCorretora,
  archiveCorretora,
  restoreCorretora,
  cancelCorretoraSubscription,
  bulkApproveSubmissions,
  bulkRejectSubmissions,
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
  listAdminNotes,
  createAdminNote,
  deleteAdminNote,
};
