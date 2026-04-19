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
const mailService = require("./mailService");
const logger = require("../lib/logger");

const TAG = "trial-reminder";

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
