"use strict";
// services/kycStaleScanService.js
//
// G5 (auditoria automacao) — alerta de KYC parado.
//
// Identifica corretoras com KYC pendente ha tempo demais e cria
// entrada de auditoria em corretora_admin_notes (category='kyc_stale_alert').
// Anti-spam: 1 entrada/corretora/dia max.
//
// Decisao de produto (2026-04-25):
//   - pending_verification: stale apos 7 dias do cadastro
//     (corretora se cadastrou mas nunca submeteu CNPJ)
//   - under_review: stale apos 3 dias da ultima atualizacao do snapshot
//     (corretora submeteu, admin sentado em cima da revisao)
//
// NAO altera estado de corretora ou snapshot. NAO toca FSM. Apenas
// observa + registra na trilha de auditoria que admin ja consulta.
//
// Estados terminais (verified, rejected) ficam de fora.
//
// Endpoint companion:
//   GET /admin/mercado-do-cafe/corretoras/kyc-stale -> usa list() (read-only)

const logger = require("../lib/logger");
const kycRepo = require("../repositories/corretoraKycRepository");
const adminNotesRepo = require("../repositories/corretoraAdminNotesRepository");

const DEFAULT_PENDING_DAYS = 7;
const DEFAULT_REVIEW_DAYS = 3;
const ADMIN_NOTE_CATEGORY = "kyc_stale_alert";

function _resolveThresholds(opts = {}) {
  const pendingDays =
    Number(opts.pendingDays) ||
    Number(process.env.KYC_STALE_PENDING_DAYS) ||
    DEFAULT_PENDING_DAYS;
  const reviewDays =
    Number(opts.reviewDays) ||
    Number(process.env.KYC_STALE_REVIEW_DAYS) ||
    DEFAULT_REVIEW_DAYS;
  return { pendingDays, reviewDays };
}

/**
 * Leitura pura — devolve a lista atual de corretoras stale separadas por
 * status. Endpoint admin consome este metodo (sem efeitos colaterais).
 *
 * @param {{pendingDays?: number, reviewDays?: number}} [opts]
 * @returns {Promise<{
 *   pending: Array<{corretora_id, nome, email, kyc_status, stale_since, age_days}>,
 *   underReview: Array<{corretora_id, nome, email, kyc_status, stale_since, age_days}>,
 *   thresholds: { pendingDays: number, reviewDays: number },
 * }>}
 */
async function list(opts = {}) {
  const { pendingDays, reviewDays } = _resolveThresholds(opts);
  const [pending, underReview] = await Promise.all([
    kycRepo.findStaleByStatus({
      status: "pending_verification",
      olderThanDays: pendingDays,
    }),
    kycRepo.findStaleByStatus({
      status: "under_review",
      olderThanDays: reviewDays,
    }),
  ]);
  return {
    pending,
    underReview,
    thresholds: { pendingDays, reviewDays },
  };
}

function _buildBody(item) {
  const ageStr =
    item.age_days <= 1 ? "1 dia" : `${item.age_days} dias`;
  if (item.kyc_status === "pending_verification") {
    return (
      `KYC parado em pending_verification ha ${ageStr} ` +
      "(corretora cadastrou mas nao submeteu CNPJ). " +
      "Considerar contato proativo via WhatsApp/email."
    );
  }
  return (
    `KYC parado em under_review ha ${ageStr} ` +
    "(snapshot ja existe, falta aprovacao/rejeicao do admin)."
  );
}

/**
 * Roda 1 ciclo do scan. Nunca lanca.
 *
 * Pra cada corretora stale:
 *   1. Verifica se ja existe nota 'kyc_stale_alert' hoje (skip se sim)
 *   2. Insere nota em corretora_admin_notes (admin_id=NULL, sistema)
 *
 * Falha em uma corretora nao quebra as proximas.
 *
 * @param {{pendingDays?: number, reviewDays?: number}} [opts]
 * @returns {Promise<{
 *   pending_count: number,
 *   review_count: number,
 *   total_stale: number,
 *   notified: number,
 *   skipped_duplicate: number,
 *   thresholds: { pendingDays: number, reviewDays: number },
 * }>}
 */
async function runOnce(opts = {}) {
  const report = {
    pending_count: 0,
    review_count: 0,
    total_stale: 0,
    notified: 0,
    skipped_duplicate: 0,
    thresholds: null,
  };

  let stale;
  try {
    stale = await list(opts);
  } catch (err) {
    logger.error({ err }, "kyc-stale-scan.list_failed");
    return report;
  }

  report.pending_count = stale.pending.length;
  report.review_count = stale.underReview.length;
  report.total_stale = report.pending_count + report.review_count;
  report.thresholds = stale.thresholds;

  const all = [...stale.pending, ...stale.underReview];

  for (const item of all) {
    try {
      const dup = await adminNotesRepo.hasNoteTodayByCategory({
        corretora_id: item.corretora_id,
        category: ADMIN_NOTE_CATEGORY,
      });
      if (dup) {
        report.skipped_duplicate += 1;
        continue;
      }
      await adminNotesRepo.create({
        corretora_id: item.corretora_id,
        admin_id: null,
        admin_nome: "sistema",
        body: _buildBody(item),
        category: ADMIN_NOTE_CATEGORY,
      });
      report.notified += 1;
    } catch (err) {
      logger.error(
        { err, corretoraId: item.corretora_id },
        "kyc-stale-scan.entry_failed",
      );
    }
  }

  if (report.notified > 0 || report.total_stale > 0) {
    logger.info(report, "kyc-stale-scan.done");
  }

  return report;
}

module.exports = {
  list,
  runOnce,
  DEFAULT_PENDING_DAYS,
  DEFAULT_REVIEW_DAYS,
  ADMIN_NOTE_CATEGORY,
};
