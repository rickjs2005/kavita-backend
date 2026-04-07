// services/corretorasService.js
//
// Business logic for the Mercado do Café / Corretoras module.
// Owns: slug generation, approval flow (submission → corretora),
// featured/status toggle rules.
"use strict";

const AppError = require("../errors/AppError");
const ERROR_CODES = require("../constants/ErrorCodes");
const adminRepo = require("../repositories/corretorasAdminRepository");

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

async function createSubmission(data) {
  const id = await adminRepo.createSubmission(data);
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

  return { corretora_id: corretoraId };
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
