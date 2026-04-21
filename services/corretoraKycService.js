// services/corretoraKycService.js
//
// FSM do KYC de corretora (Fase 10.2).
//
// Estados:
//   pending_verification → inicial (corretora recém-criada)
//   under_review         → admin solicitou consulta automática (mock/bigdatacorp)
//   verified             → aprovado (adapter ATIVA ou admin aprovou manualmente)
//   rejected             → reprovado (com motivo)
//
// Transições válidas:
//   pending_verification → under_review     (runProviderCheck)
//   pending_verification → verified         (approveManual)
//   pending_verification → rejected         (rejectManual)
//   under_review        → verified          (approveAfterReview)
//   under_review        → rejected          (rejectAfterReview)
//   under_review        → pending_verification (reopenForResubmission)
//   rejected            → under_review       (runProviderCheck após correção)
//
// Qualquer transição fora dessas lança CONFLICT 409.
"use strict";

const AppError = require("../errors/AppError");
const ERROR_CODES = require("../constants/ErrorCodes");
const logger = require("../lib/logger");

const pool = require("../config/pool");
const corretorasRepo = require("../repositories/corretorasAdminRepository");
const kycRepo = require("../repositories/corretoraKycRepository");
const adminNotesRepo = require("../repositories/corretoraAdminNotesRepository");
const providerResolver = require("./kyc/kycProviderResolver");

const VALID_TRANSITIONS = {
  pending_verification: new Set(["under_review", "verified", "rejected"]),
  under_review: new Set(["verified", "rejected", "pending_verification"]),
  verified: new Set([]), // verified é terminal no MVP (expiração fica para 10.2.1)
  rejected: new Set(["under_review"]),
};

function _assertTransition(from, to) {
  if (from === to) return;
  if (!VALID_TRANSITIONS[from] || !VALID_TRANSITIONS[from].has(to)) {
    throw new AppError(
      `Transição KYC inválida: ${from} → ${to}.`,
      ERROR_CODES.CONFLICT,
      409,
    );
  }
}

async function _findCorretora(id) {
  const corretora = await corretorasRepo.findById(id);
  if (!corretora) {
    throw new AppError(
      "Corretora não encontrada.",
      ERROR_CODES.NOT_FOUND,
      404,
    );
  }
  return corretora;
}

async function _setStatus(corretoraId, newStatus, verifiedAt = null) {
  const sets = ["kyc_status = ?"];
  const values = [newStatus];
  if (newStatus === "verified") {
    sets.push("kyc_verified_at = ?");
    values.push(verifiedAt || new Date());
  }
  if (newStatus !== "verified") {
    // Ao sair de verified (não acontece no MVP), limparíamos; mas
    // quando entra em rejected/pending, limpar a data de verificação
    // anterior evita confusão.
    sets.push("kyc_verified_at = NULL");
  }
  values.push(corretoraId);
  await pool.query(
    `UPDATE corretoras SET ${sets.join(", ")} WHERE id = ?`,
    values,
  );
}

async function _logAdminNote(corretoraId, adminId, body) {
  try {
    await adminNotesRepo.create({
      corretora_id: corretoraId,
      admin_id: adminId ?? null,
      body,
      category: "kyc",
    });
  } catch (err) {
    logger.warn({ err: err?.message }, "kyc.admin_note_persist_failed");
  }
}

// ---------------------------------------------------------------------------
// Consulta ao provedor (automática)
// ---------------------------------------------------------------------------

/**
 * Dispara consulta ao provedor ativo (mock/bigdatacorp) para um CNPJ.
 * Transição: pending_verification | rejected → under_review.
 * Persiste o snapshot em corretora_kyc independente do resultado.
 */
async function runProviderCheck({ corretoraId, cnpj, adminUserId }) {
  const corretora = await _findCorretora(corretoraId);
  _assertTransition(corretora.kyc_status, "under_review");

  const adapter = providerResolver.getActiveAdapter();
  const result = await adapter.verifyCnpj(cnpj);

  if (!result.ok) {
    // Erro de formato do CNPJ ou provedor externo falhou. Não muda
    // status; devolve erro semântico para o admin reenviar.
    throw new AppError(
      result.error_message || "Falha na consulta ao provedor KYC.",
      ERROR_CODES.VALIDATION_ERROR,
      400,
      { error_code: result.error_code, provider: result.provider },
    );
  }

  await kycRepo.upsert({
    corretora_id: corretoraId,
    cnpj: result.cnpj,
    razao_social: result.razao_social,
    situacao_cadastral: result.situacao_cadastral,
    qsa: result.qsa,
    endereco: result.endereco,
    natureza_juridica: result.natureza_juridica,
    provider: result.provider,
    provider_response_raw: result.raw_response,
    risk_score: result.risk_score,
  });

  await _setStatus(corretoraId, "under_review");
  await _logAdminNote(
    corretoraId,
    adminUserId,
    `KYC: consulta ${result.provider} executada — CNPJ ${result.cnpj} situacao=${result.situacao_cadastral}.`,
  );

  logger.info(
    {
      corretoraId,
      provider: result.provider,
      situacao: result.situacao_cadastral,
    },
    "kyc.provider_check.done",
  );

  return {
    status: "under_review",
    provider: result.provider,
    situacao_cadastral: result.situacao_cadastral,
    razao_social: result.razao_social,
    risk_score: result.risk_score,
  };
}

// ---------------------------------------------------------------------------
// Aprovações e rejeições
// ---------------------------------------------------------------------------

async function approve({ corretoraId, adminUserId, manual = false, notes }) {
  const corretora = await _findCorretora(corretoraId);
  _assertTransition(corretora.kyc_status, "verified");

  if (!manual) {
    // Se foi consulta automática, precisa haver snapshot compatível
    // (situacao=ATIVA). Segurança extra: admin não aprova sem ver.
    const snap = await kycRepo.findByCorretoraId(corretoraId);
    if (!snap) {
      throw new AppError(
        "Não existe snapshot KYC para esta corretora. Rode a consulta primeiro ou use aprovação manual.",
        ERROR_CODES.CONFLICT,
        409,
      );
    }
    if (snap.situacao_cadastral && snap.situacao_cadastral !== "ATIVA") {
      throw new AppError(
        `Situação cadastral "${snap.situacao_cadastral}" não permite aprovação. Rejeite ou use aprovação manual justificada.`,
        ERROR_CODES.CONFLICT,
        409,
      );
    }
  }

  const now = new Date();
  await _setStatus(corretoraId, "verified", now);

  // Atualiza snapshot com verified_by + notes.
  await pool.query(
    `UPDATE corretora_kyc
        SET verified_at = ?,
            verified_by_admin_id = ?,
            admin_notes = COALESCE(?, admin_notes),
            rejected_reason = NULL
      WHERE corretora_id = ?`,
    [now, adminUserId ?? null, notes ?? null, corretoraId],
  );

  await _logAdminNote(
    corretoraId,
    adminUserId,
    manual
      ? `KYC aprovado manualmente${notes ? ` — ${notes}` : ""}.`
      : `KYC aprovado após consulta${notes ? ` — ${notes}` : ""}.`,
  );

  logger.info({ corretoraId, manual }, "kyc.approved");
  return { status: "verified", verified_at: now };
}

async function reject({ corretoraId, adminUserId, reason }) {
  const corretora = await _findCorretora(corretoraId);
  _assertTransition(corretora.kyc_status, "rejected");

  if (!reason || String(reason).trim().length < 5) {
    throw new AppError(
      "Informe o motivo da rejeição (mínimo 5 caracteres).",
      ERROR_CODES.VALIDATION_ERROR,
      400,
    );
  }

  await _setStatus(corretoraId, "rejected");
  await pool.query(
    `UPDATE corretora_kyc
        SET rejected_reason = ?,
            verified_by_admin_id = ?,
            verified_at = NULL
      WHERE corretora_id = ?`,
    [reason, adminUserId ?? null, corretoraId],
  );

  await _logAdminNote(
    corretoraId,
    adminUserId,
    `KYC rejeitado — ${reason}`,
  );

  logger.info({ corretoraId }, "kyc.rejected");
  return { status: "rejected", reason };
}

// ---------------------------------------------------------------------------
// Leitura
// ---------------------------------------------------------------------------

async function getStatus(corretoraId) {
  const corretora = await _findCorretora(corretoraId);
  const snapshot = await kycRepo.findByCorretoraId(corretoraId);
  return {
    corretora_id: corretoraId,
    kyc_status: corretora.kyc_status,
    kyc_verified_at: corretora.kyc_verified_at,
    snapshot: snapshot
      ? {
          cnpj: snapshot.cnpj,
          razao_social: snapshot.razao_social,
          situacao_cadastral: snapshot.situacao_cadastral,
          qsa: snapshot.qsa,
          provider: snapshot.provider,
          risk_score: snapshot.risk_score,
          verified_at: snapshot.verified_at,
          rejected_reason: snapshot.rejected_reason,
          admin_notes: snapshot.admin_notes,
          updated_at: snapshot.updated_at,
        }
      : null,
  };
}

/**
 * Precondição usada por outros services (ex.: contratoService) —
 * lança se a corretora não está verificada. Mensagem amigável.
 */
function requireVerifiedOrThrow(corretora) {
  if (corretora?.kyc_status === "verified") return;
  throw new AppError(
    "A corretora precisa estar com KYC aprovado antes de emitir contratos.",
    ERROR_CODES.FORBIDDEN,
    403,
    {
      kyc_status: corretora?.kyc_status || "unknown",
    },
  );
}

module.exports = {
  runProviderCheck,
  approve,
  reject,
  getStatus,
  requireVerifiedOrThrow,
  VALID_TRANSITIONS,
};
