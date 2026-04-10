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
 */
async function uniqueSlug(base, excludeId) {
  let slug = slugify(base);
  let suffix = 1;
  let candidate = slug;

  while (true) {
    const existing = await adminRepo.findBySlug(candidate);
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
  const sub = await adminRepo.findSubmissionById(submissionId);
  if (!sub) {
    throw new AppError("Solicitação não encontrada.", ERROR_CODES.NOT_FOUND, 404);
  }

  if (sub.status === "approved") {
    // Idempotent — return existing corretora
    return { corretora_id: sub.corretora_id, already_approved: true };
  }

  if (sub.status === "rejected") {
    throw new AppError(
      "Não é possível aprovar uma solicitação já rejeitada.",
      ERROR_CODES.CONFLICT,
      409
    );
  }

  // Create corretora from submission data
  const slug = await uniqueSlug(sub.name);
  const corretoraId = await adminRepo.create({
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
  });

  // Mark submission as approved
  await adminRepo.approveSubmission(submissionId, {
    reviewed_by: adminId,
    corretora_id: corretoraId,
  });

  // Se a submissão trouxe senha (fluxo novo), criamos o usuário
  // imediatamente com o hash já persistido e mandamos o e-mail de
  // "aprovada, pode entrar". Se NÃO trouxe senha (submission antiga,
  // fluxo legacy), seguimos o comportamento anterior — admin ainda
  // precisa clicar "Criar acesso" para disparar o convite.
  let autoUserCreated = false;
  if (sub.password_hash && sub.email) {
    // Revalida unicidade do e-mail no momento da aprovação: pode ter
    // virado conta de outra corretora entre o submit e o approve.
    const emailTaken = await usersRepo.findByEmail(sub.email);
    if (emailTaken) {
      logger.warn(
        { submissionId, email: sub.email },
        "corretora.approve.email_taken"
      );
      // Não bloqueia a aprovação da corretora em si — o admin pode
      // depois criar acesso manualmente com um e-mail diferente.
    } else {
      const userId = await usersRepo.create({
        corretora_id: corretoraId,
        nome: sub.contact_name,
        email: sub.email,
        password_hash: sub.password_hash,
      });

      // E-mail de boas-vindas "aprovada, já pode entrar".
      // Síncrono: se falhar, logamos e seguimos — a conta foi criada
      // com sucesso e a corretora pode usar "Esqueci minha senha"
      // para recuperar o acesso no pior caso.
      try {
        await mailService.sendCorretoraApprovedEmail(
          sub.email,
          sub.name
        );
      } catch (err) {
        logger.warn(
          { err, submissionId, corretoraId, userId },
          "corretora.approve.welcome_email_failed"
        );
      }

      autoUserCreated = true;
      logger.info(
        { adminId, submissionId, corretoraId, userId, email: sub.email },
        "corretora.approve.user_auto_created"
      );
    }
  }

  return { corretora_id: corretoraId, auto_user_created: autoUserCreated };
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

  await adminRepo.rejectSubmission(submissionId, {
    reviewed_by: adminId,
    rejection_reason: reason,
  });

  // Higiene: não guardar hash de senha de pessoa que nunca virou
  // corretora. Se a rejeição falhar em limpar o hash, não é bloqueador
  // mas merece warn para alertar.
  try {
    await adminRepo.clearSubmissionPassword(submissionId);
  } catch (err) {
    logger.warn(
      { err, submissionId },
      "corretora.reject.clear_password_failed"
    );
  }
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
