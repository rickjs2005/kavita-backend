// services/corretorasService.js
//
// Business logic for the Mercado do Café / Corretoras module.
// Owns: slug generation, approval flow (submission → corretora),
// featured/status toggle rules.
"use strict";

const AppError = require("../errors/AppError");
const ERROR_CODES = require("../constants/ErrorCodes");
const adminRepo = require("../repositories/corretorasAdminRepository");
const usersRepo = require("../repositories/corretoraUsersRepository");
const corretoraAuthService = require("./corretoraAuthService");
const mailService = require("./mailService");
const logger = require("../lib/logger");
const { withTransaction } = require("../lib/withTransaction");
const plansRepo = require("../repositories/plansRepository");
const subsRepo = require("../repositories/subscriptionsRepository");

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

function slugify(str = "") {
  return String(str)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

/**
 * Generates a unique slug. Appends -2, -3, etc. if already taken.
 * Accepts optional `conn` to reuse a transaction.
 */
async function uniqueSlug(base, excludeId, conn) {
  let slug = slugify(base);
  let suffix = 1;
  let candidate = slug;

  while (true) {
    const existing = await adminRepo.findBySlug(candidate, conn);
    if (!existing || (excludeId && existing.id === excludeId)) {
      return candidate;
    }
    suffix += 1;
    candidate = `${slug}-${suffix}`;
  }
}

// ---------------------------------------------------------------------------
// Admin CRUD
// ---------------------------------------------------------------------------

async function createCorretora(data) {
  const slug = await uniqueSlug(data.name);
  const id = await adminRepo.create({ ...data, slug });
  return { id, slug };
}

async function updateCorretora(id, data) {
  const current = await adminRepo.findById(id);
  if (!current) {
    throw new AppError("Corretora não encontrada.", ERROR_CODES.NOT_FOUND, 404);
  }

  const merged = { ...data };

  // Regenerate slug if name changed
  if (data.name && data.name !== current.name) {
    merged.slug = await uniqueSlug(data.name, id);
  }

  // If deactivating, also remove featured
  if (data.status === "inactive" && current.is_featured) {
    merged.is_featured = 0;
  }

  await adminRepo.update(id, merged);
  return adminRepo.findById(id);
}

async function toggleStatus(id, status) {
  const current = await adminRepo.findById(id);
  if (!current) {
    throw new AppError("Corretora não encontrada.", ERROR_CODES.NOT_FOUND, 404);
  }

  // If deactivating, also remove featured
  if (status === "inactive" && current.is_featured) {
    await adminRepo.clearFeatured(id);
  }

  await adminRepo.updateStatus(id, status);
}

async function toggleFeatured(id, is_featured) {
  const current = await adminRepo.findById(id);
  if (!current) {
    throw new AppError("Corretora não encontrada.", ERROR_CODES.NOT_FOUND, 404);
  }
  if (current.status !== "active" && is_featured) {
    throw new AppError(
      "Não é possível destacar uma corretora inativa.",
      ERROR_CODES.VALIDATION_ERROR,
      400
    );
  }
  await adminRepo.updateFeatured(id, is_featured);
}

// ---------------------------------------------------------------------------
// Submission flow
// ---------------------------------------------------------------------------

/**
 * Recebe o payload do form público (já validado pelo Zod) e cria a
 * submission. Quando vem `senha`, faz o bcrypt antes de persistir e
 * valida que o e-mail não colide com nenhum usuário existente nem
 * com outra submission pendente.
 */
async function createSubmission(data) {
  const { senha, senha_confirmacao: _confirm, ...rest } = data;

  // Unicidade de e-mail: não permitir cadastro com e-mail que já é
  // conta de corretora ou está em fila de outra submissão pendente.
  // Checado aqui (não em unique constraint) para que submissions
  // rejeitadas antigas não bloqueiem novo cadastro do mesmo e-mail.
  if (rest.email) {
    const existingUser = await usersRepo.findByEmail(rest.email);
    if (existingUser) {
      throw new AppError(
        "Este e-mail já está vinculado a uma corretora. Use 'Esqueci minha senha' no painel para recuperar o acesso.",
        ERROR_CODES.CONFLICT,
        409
      );
    }
    const existingPending = await adminRepo.findPendingSubmissionByEmail(
      rest.email
    );
    if (existingPending) {
      throw new AppError(
        "Já existe um cadastro pendente com este e-mail. Aguarde a análise da equipe.",
        ERROR_CODES.CONFLICT,
        409
      );
    }
  }

  // Hash da senha antes de persistir. Nunca guardamos texto.
  const password_hash = senha
    ? await corretoraAuthService.hashPassword(senha)
    : null;

  const id = await adminRepo.createSubmission({ ...rest, password_hash });

  logger.info(
    {
      submissionId: id,
      email: rest.email,
      hasPassword: Boolean(password_hash),
    },
    "corretora.submission.created"
  );

  return { id };
}

async function approveSubmission(submissionId, adminId) {
  // Pré-checagens fora da transação (leituras simples). Evita abrir
  // conexão à toa para casos idempotentes ou inválidos.
  const preSub = await adminRepo.findSubmissionById(submissionId);
  if (!preSub) {
    throw new AppError("Solicitação não encontrada.", ERROR_CODES.NOT_FOUND, 404);
  }
  if (preSub.status === "approved") {
    return { corretora_id: preSub.corretora_id, already_approved: true };
  }
  if (preSub.status === "rejected") {
    throw new AppError(
      "Não é possível aprovar uma solicitação já rejeitada.",
      ERROR_CODES.CONFLICT,
      409
    );
  }

  // Transação: INSERT corretora + UPDATE submission + (opcional) INSERT user.
  // Se qualquer passo falhar, tudo volta — evita corretora criada sem
  // submission marcada como aprovada ou vice-versa.
  const txResult = await withTransaction(async (conn) => {
    const sub = await adminRepo.findSubmissionById(submissionId, conn);
    if (!sub || sub.status !== "pending") {
      // Outra transação aprovou/rejeitou em paralelo — sai do tx sem
      // efeito e deixa a camada externa reconsultar.
      return { raceCondition: true, sub };
    }

    const slug = await uniqueSlug(sub.name, undefined, conn);
    const corretoraId = await adminRepo.create(
      {
        name: sub.name,
        slug,
        contact_name: sub.contact_name,
        description: sub.description,
        logo_path: sub.logo_path,
        city: sub.city,
        state: sub.state,
        region: sub.region,
        phone: sub.phone,
        whatsapp: sub.whatsapp,
        email: sub.email,
        website: sub.website,
        instagram: sub.instagram,
        facebook: sub.facebook,
        status: "active",
        is_featured: 0,
        sort_order: 0,
        submission_id: sub.id,
        created_by: adminId,
      },
      conn
    );

    await adminRepo.approveSubmission(
      submissionId,
      { reviewed_by: adminId, corretora_id: corretoraId },
      conn
    );

    let autoUserCreated = false;
    let autoUserId = null;
    if (sub.password_hash && sub.email) {
      const emailTaken = await usersRepo.findByEmail(sub.email, conn);
      if (!emailTaken) {
        autoUserId = await usersRepo.create(
          {
            corretora_id: corretoraId,
            nome: sub.contact_name,
            email: sub.email,
            password_hash: sub.password_hash,
          },
          conn
        );
        autoUserCreated = true;
      }
    }

    // Auto-assign trial: toda corretora aprovada nasce com 3 meses
    // de teste gratuito. Busca plano Free no banco; se não existir,
    // pula (fallback do planService cuida depois).
    const freePlan = await plansRepo.findBySlug("free", conn);
    if (freePlan) {
      const now = new Date();
      const trialEnd = new Date(now);
      trialEnd.setMonth(trialEnd.getMonth() + 3);
      await subsRepo.create(
        {
          corretora_id: corretoraId,
          plan_id: freePlan.id,
          status: "trialing",
          current_period_start: now,
          current_period_end: trialEnd,
          payment_method: "manual",
          monthly_price_cents: 0,
          trial_ends_at: trialEnd,
        },
        conn,
      );
    }

    return {
      corretoraId,
      autoUserCreated,
      autoUserId,
      email: sub.email,
      name: sub.name,
      submissionId,
    };
  });

  if (txResult.raceCondition) {
    // Recursão segura: reconsulta estado e responde idempotente.
    return approveSubmission(submissionId, adminId);
  }

  // Efeitos colaterais (email) ficam FORA da transação: email não
  // pode ser "desfeito" em rollback. Logging de casos degradados.
  if (preSub.password_hash && preSub.email && !txResult.autoUserCreated) {
    logger.warn(
      { submissionId, email: preSub.email },
      "corretora.approve.email_taken"
    );
  }

  if (txResult.autoUserCreated) {
    try {
      await mailService.sendCorretoraApprovedEmail(
        txResult.email,
        txResult.name
      );
    } catch (err) {
      logger.warn(
        { err, submissionId, corretoraId: txResult.corretoraId, userId: txResult.autoUserId },
        "corretora.approve.welcome_email_failed"
      );
    }
    logger.info(
      {
        adminId,
        submissionId,
        corretoraId: txResult.corretoraId,
        userId: txResult.autoUserId,
        email: txResult.email,
      },
      "corretora.approve.user_auto_created"
    );
  }

  return {
    corretora_id: txResult.corretoraId,
    auto_user_created: txResult.autoUserCreated,
  };
}

async function rejectSubmission(submissionId, adminId, reason) {
  const sub = await adminRepo.findSubmissionById(submissionId);
  if (!sub) {
    throw new AppError("Solicitação não encontrada.", ERROR_CODES.NOT_FOUND, 404);
  }

  if (sub.status !== "pending") {
    throw new AppError(
      "Apenas solicitações pendentes podem ser rejeitadas.",
      ERROR_CODES.CONFLICT,
      409
    );
  }

  // Transação: UPDATE status + UPDATE clearPassword devem ser atômicos.
  // Se limpeza de password falhar, rollback deixa a submission pendente
  // novamente — admin pode tentar de novo.
  await withTransaction(async (conn) => {
    await adminRepo.rejectSubmission(
      submissionId,
      { reviewed_by: adminId, rejection_reason: reason },
      conn
    );
    await adminRepo.clearSubmissionPassword(submissionId, conn);
  });
}

module.exports = {
  slugify,
  uniqueSlug,
  createCorretora,
  updateCorretora,
  toggleStatus,
  toggleFeatured,
  createSubmission,
  approveSubmission,
  rejectSubmission,
};
