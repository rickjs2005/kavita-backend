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
const { isValidCnpj, normalizeCnpj, maskCnpj } = require("../lib/cnpj");

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

// ===========================================================================
// CNPJ self-service (Fase 10.2.1 — corretora informa CNPJ no painel)
// ===========================================================================
//
// Wrapper de mais alto nivel sobre runProviderCheck + approve/reject:
//   - valida CNPJ via algoritmo (lib/cnpj) ANTES de chamar provider
//   - checa duplicidade contra outras corretoras
//   - chama provider; auto-aprova se situacao=ATIVA, auto-rejeita se nao
//   - sincroniza colunas denormalizadas (corretoras.cnpj, .razao_social,
//     .cnpj_verified_at, .cnpj_verification_status)
//   - retorna shape unificado pra UI (admin OU painel da corretora)
//
// Erro tecnico do provider nao quebra: marca status='error' pra UI
// pedir nova tentativa sem aparecer 500.

const CNPJ_STATUS = {
  NOT_INFORMED: "not_informed",
  PENDING: "pending",
  VERIFIED: "verified",
  INVALID: "invalid",
  ERROR: "error",
};

/**
 * Verifica CNPJ self-service. Funciona tanto para admin (chamado via
 * /api/admin/mercado-do-cafe/corretoras/:id/cnpj/verify) quanto para
 * a propria corretora (/api/corretora/profile/cnpj/verify).
 *
 * @param {Object} params
 * @param {number} params.corretoraId
 * @param {string} params.cnpj                 formatado ou normalizado
 * @param {"admin"|"corretora_user"} params.actorType
 * @param {number} [params.actorId]
 *
 * @returns {Promise<{
 *   status: 'verified'|'invalid'|'error',
 *   cnpj: string,
 *   razao_social: string|null,
 *   situacao_cadastral: string|null,
 *   verified_at: string|null,
 *   message: string,
 *   error_code: string|null
 * }>}
 */
async function verifyCnpjAndDecide({
  corretoraId,
  cnpj,
  actorType = "admin",
  actorId,
}) {
  if (!Number.isInteger(corretoraId) || corretoraId <= 0) {
    throw new AppError(
      "Corretora invalida.",
      ERROR_CODES.VALIDATION_ERROR,
      400,
    );
  }

  // 1) Valida formato + algoritmo localmente (economiza request).
  const normalized = normalizeCnpj(cnpj);
  if (!normalized || normalized.length !== 14) {
    throw new AppError(
      "CNPJ deve ter 14 digitos.",
      ERROR_CODES.VALIDATION_ERROR,
      400,
      { field: "cnpj" },
    );
  }
  if (!isValidCnpj(normalized)) {
    await _setCnpjStatusOnCorretora({
      corretoraId,
      cnpj: normalized,
      status: CNPJ_STATUS.INVALID,
    });
    throw new AppError(
      "CNPJ invalido. Verifique os digitos.",
      ERROR_CODES.VALIDATION_ERROR,
      400,
      { field: "cnpj" },
    );
  }

  // 2) Duplicidade: outra corretora ativa ja registrou esse CNPJ.
  const [[dup]] = await pool.query(
    `SELECT id, name FROM corretoras
      WHERE cnpj = ? AND id <> ? AND deleted_at IS NULL
      LIMIT 1`,
    [normalized, corretoraId],
  );
  if (dup) {
    logger.warn(
      {
        corretoraId,
        cnpjMasked: maskCnpj(normalized),
        conflictId: dup.id,
      },
      "kyc.cnpj.duplicate_blocked",
    );
    throw new AppError(
      "Este CNPJ ja esta registrado em outra corretora. Fale com o suporte se for engano.",
      ERROR_CODES.CONFLICT,
      409,
      { field: "cnpj" },
    );
  }

  // 3) Marca pending antes de chamar provider (UI reflete imediato).
  await _setCnpjStatusOnCorretora({
    corretoraId,
    cnpj: normalized,
    status: CNPJ_STATUS.PENDING,
  });

  // 4) Chama provider. Falha tecnica vira status='error'.
  let providerResp = null;
  try {
    const adapter = providerResolver.getActiveAdapter();
    providerResp = await adapter.verifyCnpj(normalized);
  } catch (err) {
    logger.error(
      {
        corretoraId,
        cnpjMasked: maskCnpj(normalized),
        err: err?.message || String(err),
      },
      "kyc.provider.exception",
    );
    await _setCnpjStatusOnCorretora({
      corretoraId,
      cnpj: normalized,
      status: CNPJ_STATUS.ERROR,
    });
    return {
      status: CNPJ_STATUS.ERROR,
      cnpj: normalized,
      razao_social: null,
      situacao_cadastral: null,
      verified_at: null,
      message:
        "Nao foi possivel consultar o CNPJ agora. Tente em alguns minutos.",
      error_code: "PROVIDER_DOWN",
    };
  }

  // Provider retornou erro de formato (raro — algoritmo local ja
  // pegou). Marca invalid sem persistir snapshot.
  if (!providerResp?.ok) {
    const errCode = providerResp?.error_code || "PROVIDER_ERROR";
    const status =
      errCode === "INVALID_FORMAT" ? CNPJ_STATUS.INVALID : CNPJ_STATUS.ERROR;
    await _setCnpjStatusOnCorretora({
      corretoraId,
      cnpj: normalized,
      status,
    });
    return {
      status,
      cnpj: normalized,
      razao_social: null,
      situacao_cadastral: null,
      verified_at: null,
      message:
        providerResp?.error_message ||
        "Nao foi possivel verificar agora.",
      error_code: errCode,
    };
  }

  // 5) Persiste snapshot rico em corretora_kyc.
  const isAtiva =
    String(providerResp.situacao_cadastral || "").toUpperCase() === "ATIVA";
  const verifiedAt = isAtiva ? new Date() : null;

  await kycRepo.upsert({
    corretora_id: corretoraId,
    cnpj: normalized,
    razao_social: providerResp.razao_social ?? null,
    situacao_cadastral: providerResp.situacao_cadastral ?? null,
    qsa: providerResp.qsa ?? null,
    endereco: providerResp.endereco ?? null,
    natureza_juridica: providerResp.natureza_juridica ?? null,
    provider: providerResp.provider ?? "mock",
    provider_response_raw: providerResp.raw_response ?? null,
    risk_score: providerResp.risk_score ?? null,
    verified_at: verifiedAt,
    verified_by_admin_id: actorType === "admin" ? actorId ?? null : null,
  });

  // 6) Sincroniza colunas denormalizadas + FSM existente
  // (kyc_status), preservando compat com runProviderCheck/approve/
  // reject quando admin usar o fluxo classico.
  const cnpjStatus = isAtiva ? CNPJ_STATUS.VERIFIED : CNPJ_STATUS.INVALID;
  await pool.query(
    `UPDATE corretoras
        SET cnpj = ?,
            razao_social = ?,
            cnpj_verified_at = ?,
            cnpj_verification_status = ?
      WHERE id = ?`,
    [
      normalized,
      providerResp.razao_social ?? null,
      verifiedAt,
      cnpjStatus,
      corretoraId,
    ],
  );

  // FSM principal: ATIVA -> verified; outras -> rejected.
  // Nao bloqueia se transicao for invalida (ex: ja' verified) —
  // status auxiliar (cnpj_verification_status) ja' refletiu o
  // resultado e' suficiente.
  try {
    const corretora = await _findCorretora(corretoraId);
    if (isAtiva && corretora.kyc_status !== "verified") {
      _assertTransition(corretora.kyc_status, "verified");
      await _setStatus(corretoraId, "verified", verifiedAt);
    } else if (!isAtiva && corretora.kyc_status !== "rejected") {
      _assertTransition(corretora.kyc_status, "rejected");
      await _setStatus(corretoraId, "rejected");
      await pool.query(
        `UPDATE corretora_kyc
            SET rejected_reason = ?
          WHERE corretora_id = ?`,
        [
          `Situacao Receita: ${providerResp.situacao_cadastral}.`,
          corretoraId,
        ],
      );
    }
  } catch (err) {
    // Transicao FSM invalida nao deve quebrar a verificacao —
    // cnpj_verification_status ja' guarda o resultado canonico.
    logger.info(
      { corretoraId, err: err?.message },
      "kyc.fsm_transition_skipped",
    );
  }

  await _logAdminNote(
    corretoraId,
    actorType === "admin" ? actorId : null,
    `CNPJ ${maskCnpj(normalized)} verificado via ${providerResp.provider} — situacao=${providerResp.situacao_cadastral}.`,
  );

  logger.info(
    {
      corretoraId,
      cnpjMasked: maskCnpj(normalized),
      status: cnpjStatus,
      provider: providerResp.provider,
      situacao: providerResp.situacao_cadastral,
      actorType,
    },
    "kyc.cnpj.verified",
  );

  return {
    status: cnpjStatus,
    cnpj: normalized,
    razao_social: providerResp.razao_social ?? null,
    situacao_cadastral: providerResp.situacao_cadastral ?? null,
    verified_at: verifiedAt ? verifiedAt.toISOString() : null,
    message: isAtiva
      ? "CNPJ verificado com sucesso. Situacao ATIVA na Receita."
      : `CNPJ encontrado mas com situacao ${providerResp.situacao_cadastral}. Resolva pendencias na Receita antes de operar.`,
    error_code: null,
  };
}

/** Atualiza so' o status auxiliar de CNPJ (sem mudar FSM). Usado
 *  para transicoes intermediarias (pending, error, invalid local). */
async function _setCnpjStatusOnCorretora({ corretoraId, cnpj, status }) {
  try {
    await pool.query(
      `UPDATE corretoras
          SET cnpj_verification_status = ?,
              cnpj = COALESCE(?, cnpj)
        WHERE id = ?`,
      [status, cnpj || null, corretoraId],
    );
  } catch (err) {
    logger.warn(
      {
        corretoraId,
        cnpjMasked: maskCnpj(cnpj),
        err: err?.message,
      },
      "kyc.persist_status_failed",
    );
  }
}

/**
 * Le o status atual do CNPJ pra UI (admin ou painel corretora).
 * Nao expoe provider_response_raw — esse fica restrito a SQL/audit.
 */
async function getCnpjStatus(corretoraId) {
  const [[c]] = await pool.query(
    `SELECT id, cnpj, razao_social, nome_fantasia,
            cnpj_verified_at, cnpj_verification_status,
            kyc_status, kyc_verified_at
       FROM corretoras WHERE id = ? LIMIT 1`,
    [corretoraId],
  );
  if (!c) return null;
  return {
    corretora_id: c.id,
    cnpj: c.cnpj,
    razao_social: c.razao_social,
    nome_fantasia: c.nome_fantasia,
    cnpj_verified_at: c.cnpj_verified_at,
    cnpj_verification_status:
      c.cnpj_verification_status || CNPJ_STATUS.NOT_INFORMED,
    kyc_status: c.kyc_status,
    kyc_verified_at: c.kyc_verified_at,
  };
}

module.exports = {
  // FSM existente (Fase 10.2)
  runProviderCheck,
  approve,
  reject,
  getStatus,
  requireVerifiedOrThrow,
  VALID_TRANSITIONS,
  // Self-service CNPJ (Fase 10.2.1)
  verifyCnpjAndDecide,
  getCnpjStatus,
  CNPJ_STATUS,
};
