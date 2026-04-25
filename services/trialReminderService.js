// services/trialReminderService.js
//
// Bloco 3 — lembretes progressivos de fim de trial.
// Processa 4 "buckets" por execução:
//   - `d7`       -> trial termina em ~7 dias
//   - `d3`       -> trial termina em ~3 dias
//   - `d1`       -> trial termina amanhã (≤ 1 dia)
//   - `expired`  -> trial_ends_at já passou mas status ainda é "trialing"
//
// Idempotência: antes de enviar, consulta subscription_events
// (event_type=`trial.reminder_sent`, meta.bucket=<bucket>). Se já
// existir, skipa. Depois de enviar com sucesso, grava o event.
//
// Destinatários: e-mail institucional da corretora + todos os users
// ativos/activated (dedupe case-insensitive). Mesmo padrão do
// corretoraLeadsService.collectLeadRecipients.

"use strict";

const subsRepo = require("../repositories/subscriptionsRepository");
const subEventsRepo = require("../repositories/subscriptionEventsRepository");
const usersRepo = require("../repositories/corretoraUsersRepository");
const notifRepo = require("../repositories/corretoraNotificationsRepository");
const planService = require("./planService");
const mailService = require("./mailService");
const logger = require("../lib/logger");

const TAG = "trial-reminder";

// G4 — auto-downgrade no bucket "expired".
//   - Master switch: TRIAL_AUTO_DOWNGRADE_ENABLED (default false)
//   - Margem de seguranca: TRIAL_AUTO_DOWNGRADE_GRACE_HOURS (default 1h)
//     evita rebaixar trial recem-expirado que admin pode estender.
const AUTO_DOWNGRADE_EVENT_TYPE = "trial_expired_downgrade";
const NOTIF_TYPE = "trial_expired";

function autoDowngradeEnabled() {
  return (
    String(process.env.TRIAL_AUTO_DOWNGRADE_ENABLED || "false").toLowerCase() ===
    "true"
  );
}

function graceMs() {
  const hours = Number(process.env.TRIAL_AUTO_DOWNGRADE_GRACE_HOURS) || 1;
  return Math.max(0, hours) * 3600 * 1000;
}

function pastGracePeriod(trialEndsAt) {
  if (!trialEndsAt) return false;
  const ts =
    trialEndsAt instanceof Date ? trialEndsAt.getTime() : new Date(trialEndsAt).getTime();
  if (Number.isNaN(ts)) return false;
  return Date.now() - ts >= graceMs();
}

// buckets[i] = { days: número, label: string pro log, daysLeftToSend: passado ao e-mail }
const BUCKETS = [
  { key: "d7", days: 7, daysLeftForEmail: 7 },
  { key: "d3", days: 3, daysLeftForEmail: 3 },
  { key: "d1", days: 1, daysLeftForEmail: 1 },
  { key: "expired", days: 0, daysLeftForEmail: 0 },
];

async function collectRecipients(corretoraId, institutionalEmail) {
  const list = [];
  const seen = new Set();
  const push = (email) => {
    if (!email || typeof email !== "string") return;
    const norm = email.trim().toLowerCase();
    if (!norm || seen.has(norm)) return;
    seen.add(norm);
    list.push(email.trim());
  };
  push(institutionalEmail);
  try {
    const team = await usersRepo.listTeamByCorretoraId(corretoraId);
    for (const u of team) {
      if (u.is_active && u.activated) push(u.email);
    }
  } catch (err) {
    logger.warn(
      { err: err?.message ?? String(err), corretoraId },
      `${TAG}: team_lookup_failed`,
    );
  }
  return list;
}

/**
 * G4 — downgrade automatico de trial expirado para FREE.
 *
 * So roda no bucket 'expired'. Estrategia:
 *   1. Margem de seguranca: pula se trial_ends_at < grace (1h padrao)
 *   2. Idempotencia forte: pula se ja existe trial_expired_downgrade
 *   3. Chama planService.cancelPlan (transacional, idempotente, ja
 *      preserva subscription antiga como 'canceled' e cria nova FREE)
 *   4. Loga subscription_events trial_expired_downgrade
 *
 * Retorna { downgraded: bool, skipped_reason?: string, error?: string }.
 * NUNCA lanca — caller decide se envia email mesmo apos falha.
 */
async function maybeAutoDowngrade(sub, report) {
  if (!autoDowngradeEnabled()) {
    return { downgraded: false, skipped_reason: "feature_disabled" };
  }
  if (!pastGracePeriod(sub.trial_ends_at)) {
    report.downgrade_skipped_grace++;
    return { downgraded: false, skipped_reason: "within_grace_period" };
  }
  const alreadyDowngraded = await subEventsRepo.hasEventOfType(
    sub.id,
    AUTO_DOWNGRADE_EVENT_TYPE,
  );
  if (alreadyDowngraded) {
    report.downgrade_skipped_idempotent++;
    return { downgraded: false, skipped_reason: "already_downgraded" };
  }
  try {
    const result = await planService.cancelPlan({
      corretoraId: sub.corretora_id,
      opts: {
        actor_type: "system",
        actor_id: null,
        reason: "trial_expired_auto_downgrade",
        source: "trial_reminder_job",
        targetPlanSlug: "free",
      },
    });
    if (result?.already_free) {
      // Caso de borda: corretora ja estava no FREE por outro caminho
      // (cancelamento manual recente). Loga evento ainda assim pra
      // rastrear a decisao do cron (idempotencia futura).
      try {
        await subEventsRepo.create({
          corretora_id: sub.corretora_id,
          subscription_id: sub.id,
          event_type: AUTO_DOWNGRADE_EVENT_TYPE,
          from_plan_id: sub.plan_id,
          to_plan_id: sub.plan_id,
          from_status: "trialing",
          to_status: "trialing",
          meta: {
            reason: "trial_expired_auto_downgrade",
            source: "trial_reminder_job",
            already_free: true,
            trial_ends_at: sub.trial_ends_at,
          },
          actor_type: "system",
          actor_id: null,
        });
      } catch (err) {
        logger.warn(
          { err: err?.message ?? String(err), subscriptionId: sub.id },
          `${TAG}: downgrade_event_write_failed`,
        );
      }
      report.downgrade_already_free++;
      return { downgraded: false, skipped_reason: "already_free" };
    }
    // cancelPlan ja' loga 'canceled' event. Aqui logamos um evento
    // semantico adicional para distinguir auto-downgrade do cancel manual.
    try {
      await subEventsRepo.create({
        corretora_id: sub.corretora_id,
        subscription_id: sub.id,
        event_type: AUTO_DOWNGRADE_EVENT_TYPE,
        from_plan_id: sub.plan_id,
        to_plan_id: result?.newSubId
          ? null /* novo plan_id ja' esta no evento canceled emitido por cancelPlan */
          : null,
        from_status: "trialing",
        to_status: "active",
        meta: {
          reason: "trial_expired_auto_downgrade",
          source: "trial_reminder_job",
          previous_plan_id: sub.plan_id,
          new_subscription_id: result?.newSubId ?? null,
          trial_ends_at: sub.trial_ends_at,
        },
        actor_type: "system",
        actor_id: null,
      });
    } catch (err) {
      logger.warn(
        { err: err?.message ?? String(err), subscriptionId: sub.id },
        `${TAG}: downgrade_event_write_failed`,
      );
    }
    report.downgraded++;
    return { downgraded: true, newSubscriptionId: result?.newSubId ?? null };
  } catch (err) {
    report.downgrade_failed++;
    logger.warn(
      {
        err: err?.message ?? String(err),
        subscriptionId: sub.id,
        corretoraId: sub.corretora_id,
      },
      `${TAG}: downgrade_failed`,
    );
    return { downgraded: false, error: err?.message ?? String(err) };
  }
}

async function notifyExpiredInPanel(sub, report) {
  try {
    const dup = await notifRepo.existsTodayByType({
      corretora_id: sub.corretora_id,
      type: NOTIF_TYPE,
    });
    if (dup) {
      report.panel_notif_skipped_duplicate++;
      return;
    }
    await notifRepo.create({
      corretora_id: sub.corretora_id,
      type: NOTIF_TYPE,
      title: "Seu teste gratuito acabou — plano FREE ativado",
      body:
        "Seu trial expirou e a conta foi movida automaticamente para o plano " +
        "FREE. Seus leads, contratos e equipe continuam aqui — apenas as " +
        "funcoes pagas ficam pausadas ate voce escolher um plano.",
      link: "/painel/corretora/planos",
      meta: {
        previous_plan_id: sub.plan_id,
        trial_ends_at: sub.trial_ends_at,
        source: "trial_reminder_job",
      },
    });
    report.panel_notif_sent++;
  } catch (err) {
    logger.warn(
      {
        err: err?.message ?? String(err),
        subscriptionId: sub.id,
        corretoraId: sub.corretora_id,
      },
      `${TAG}: panel_notif_failed`,
    );
  }
}

async function processBucket(bucket, report) {
  const rows = await subsRepo.listTrialsEndingOn(bucket.days);
  for (const sub of rows) {
    try {
      const already = await subEventsRepo.hasEventWithBucket(
        sub.id,
        "trial.reminder_sent",
        bucket.key,
      );
      if (already) {
        report.skipped++;
        continue;
      }

      // G4 — antes do email, tentamos rebaixar (so' bucket 'expired').
      // Se cancelPlan throw, NAO enviamos email expired (o copy nao reflete
      // a realidade). Outros caminhos (feature OFF, grace, already_free,
      // ja' downgradado) seguem para o email — mas com copy condicional
      // baseado em autoDowngraded.
      let downgradeResult = null;
      if (bucket.key === "expired") {
        downgradeResult = await maybeAutoDowngrade(sub, report);
        if (downgradeResult.error) {
          report.failed++;
          continue;
        }
      }

      const recipients = await collectRecipients(
        sub.corretora_id,
        sub.corretora_email,
      );
      if (recipients.length === 0) {
        report.no_recipients++;
        continue;
      }

      await mailService.sendCorretoraTrialEndingEmail({
        toEmail: recipients,
        corretoraName: sub.corretora_name,
        daysLeft: bucket.daysLeftForEmail,
        trialEndsAt: sub.trial_ends_at,
        // G4 — copy "FREE ativado" so' quando downgrade efetivamente
        // aconteceu (ou ja' estava free) nesta rodada. Caso contrario
        // mantem copy legado generico.
        autoDowngraded:
          bucket.key === "expired" &&
          !!downgradeResult &&
          (downgradeResult.downgraded ||
            downgradeResult.skipped_reason === "already_free"),
      });

      try {
        await subEventsRepo.create({
          corretora_id: sub.corretora_id,
          subscription_id: sub.id,
          event_type: "trial.reminder_sent",
          from_plan_id: sub.plan_id,
          to_plan_id: sub.plan_id,
          from_status: "trialing",
          to_status: "trialing",
          meta: {
            bucket: bucket.key,
            trial_ends_at: sub.trial_ends_at,
            recipients_count: recipients.length,
            auto_downgraded: !!downgradeResult?.downgraded,
          },
          actor_type: "system",
          actor_id: null,
        });
      } catch (err) {
        // Gravação de event não bloqueia — mas loga pra analisar.
        logger.warn(
          { err: err?.message ?? String(err), subscriptionId: sub.id },
          `${TAG}: event_write_failed`,
        );
      }

      // G4 — notif no painel da corretora APENAS apos downgrade efetivo
      // (ou quando ja' estava FREE — significa que o trial encerrou).
      if (
        bucket.key === "expired" &&
        downgradeResult &&
        (downgradeResult.downgraded || downgradeResult.skipped_reason === "already_free")
      ) {
        await notifyExpiredInPanel(sub, report);
      }

      report.sent++;
      report.by_bucket[bucket.key] =
        (report.by_bucket[bucket.key] ?? 0) + 1;
    } catch (err) {
      report.failed++;
      logger.warn(
        {
          err: err?.message ?? String(err),
          subscriptionId: sub.id,
          bucket: bucket.key,
        },
        `${TAG}: send_failed`,
      );
    }
  }
}

async function runOnce() {
  const report = {
    sent: 0,
    skipped: 0,
    no_recipients: 0,
    failed: 0,
    by_bucket: {},
    // G4 — contadores especificos do auto-downgrade
    downgraded: 0,
    downgrade_skipped_grace: 0,
    downgrade_skipped_idempotent: 0,
    downgrade_already_free: 0,
    downgrade_failed: 0,
    panel_notif_sent: 0,
    panel_notif_skipped_duplicate: 0,
    auto_downgrade_enabled: autoDowngradeEnabled(),
    startedAt: new Date().toISOString(),
  };
  for (const bucket of BUCKETS) {
    await processBucket(bucket, report);
  }
  report.finishedAt = new Date().toISOString();
  logger.info(report, `${TAG}: run`);
  return report;
}

module.exports = { runOnce };
