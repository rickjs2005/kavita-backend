"use strict";
// services/staleLeadsScanService.js
//
// G2 (auditoria automação) — scan diário de leads parados no SaaS
// de corretoras de café.
//
// Regra (decisão 2026-04-25):
//   - Lead "parado" = status='new' + first_response_at IS NULL
//     + created_at < NOW() - 72h
//   - Conservador: NÃO inclui 'contacted' parado pra evitar falso
//     positivo na primeira versão. Pode evoluir depois.
//
// Pra cada corretora afetada:
//   1. Cria notificação no painel via corretora_notifications
//      (type='lead_stale_alert')
//   2. Pula se já existe notif do mesmo tipo HOJE (1 alerta/dia max)
//   3. Opcionalmente envia e-mail agregado (default DESLIGADO via
//      env STALE_LEADS_EMAIL_ENABLED)
//
// Nunca lança — falhas são logadas por canal. Cron continua agendado.

const pool = require("../config/pool");
const logger = require("../lib/logger");
const leadsRepo = require("../repositories/corretoraLeadsRepository");
const notifRepo = require("../repositories/corretoraNotificationsRepository");

const DEFAULT_THRESHOLD_HOURS = 72;
const TOP_LEADS_IN_NOTIFICATION = 5;

function emailEnabled() {
  return (
    String(process.env.STALE_LEADS_EMAIL_ENABLED || "false").toLowerCase() ===
    "true"
  );
}

/**
 * Busca dados leves da corretora (nome + email) só pra montar notif/email.
 * Retorna null se corretora não existe ou está inativa.
 */
async function getCorretoraInfo(corretoraId) {
  const [[row]] = await pool.query(
    "SELECT id, name, email, status FROM corretoras WHERE id = ? LIMIT 1",
    [corretoraId],
  );
  if (!row || row.status !== "active") return null;
  return row;
}

/**
 * Constrói o body da notificação no painel. Mostra contador + 1ª linha
 * com nome do lead mais antigo. Detalhes ficam no link pra `/painel/corretora/leads`.
 */
function buildNotificationBody(bucket) {
  const oldest = bucket.top_leads[0];
  const oldestName = oldest?.nome || "lead sem nome";
  const oldestCity = oldest?.cidade || null;
  const oldestSuffix = oldestCity ? ` (${oldestCity})` : "";

  if (bucket.total === 1) {
    return `1 lead aguardando primeiro contato há mais de 3 dias: ${oldestName}${oldestSuffix}.`;
  }
  return `${bucket.total} leads aguardando primeiro contato há mais de 3 dias. O mais antigo é ${oldestName}${oldestSuffix}.`;
}

/**
 * Roda 1 ciclo do scan. Não lança.
 *
 * @param {{hoursThreshold?: number}} [opts]
 * @returns {Promise<{
 *   buckets: number,            // corretoras com leads parados
 *   notified: number,           // notificações criadas
 *   skipped_duplicate: number,  // pulado porque ja tinha alerta hoje
 *   skipped_inactive: number,   // pulado porque corretora inativa/deletada
 *   emails_sent: number,        // emails efetivamente enviados
 *   total_leads: number,        // soma de todos os leads parados
 * }>}
 */
async function runOnce(opts = {}) {
  const hoursThreshold = Number(opts.hoursThreshold) || DEFAULT_THRESHOLD_HOURS;
  const report = {
    buckets: 0,
    notified: 0,
    skipped_duplicate: 0,
    skipped_inactive: 0,
    emails_sent: 0,
    total_leads: 0,
  };

  let buckets;
  try {
    buckets = await leadsRepo.listStaleLeadsByCorretora({ hoursThreshold });
  } catch (err) {
    logger.error({ err }, "stale-leads-scan.list_failed");
    return report;
  }

  report.buckets = buckets.length;
  report.total_leads = buckets.reduce((acc, b) => acc + b.total, 0);

  // E-mail é opt-in via env. Lazy require pra não acoplar com o mailService
  // se ele explodir no boot por alguma razão de transport.
  let mailService = null;
  if (emailEnabled()) {
    try {
      mailService = require("./mailService");
    } catch (err) {
      logger.warn({ err }, "stale-leads-scan.mail_service_unavailable");
    }
  }

  for (const bucket of buckets) {
    try {
      const info = await getCorretoraInfo(bucket.corretora_id);
      if (!info) {
        report.skipped_inactive += 1;
        continue;
      }

      // Anti-spam: se já tem notif do tipo hoje, pula
      const dup = await notifRepo.existsTodayByType({
        corretora_id: bucket.corretora_id,
        type: "lead_stale_alert",
      });
      if (dup) {
        report.skipped_duplicate += 1;
        continue;
      }

      const title =
        bucket.total === 1
          ? "1 lead aguardando contato há 3+ dias"
          : `${bucket.total} leads aguardando contato há 3+ dias`;

      await notifRepo.create({
        corretora_id: bucket.corretora_id,
        type: "lead_stale_alert",
        title,
        body: buildNotificationBody(bucket),
        link: "/painel/corretora/leads",
        meta: {
          total: bucket.total,
          threshold_hours: hoursThreshold,
          oldest_created_at: bucket.oldest_created_at,
          // top_leads enxuto: só id+nome+cidade (não vaza dados sensíveis
          // como telefone/email; o painel já mostra na lista)
          top_leads: bucket.top_leads
            .slice(0, TOP_LEADS_IN_NOTIFICATION)
            .map((l) => ({ id: l.id, nome: l.nome, cidade: l.cidade })),
        },
      });
      report.notified += 1;

      // E-mail opcional
      if (mailService && info.email) {
        try {
          await mailService.sendCorretoraStaleLeadsEmail({
            toEmail: info.email,
            corretoraName: info.name,
            total: bucket.total,
            topLeads: bucket.top_leads.slice(0, 10),
            thresholdHours: hoursThreshold,
          });
          report.emails_sent += 1;
        } catch (err) {
          logger.warn(
            { err, corretoraId: bucket.corretora_id },
            "stale-leads-scan.email_failed",
          );
        }
      }
    } catch (err) {
      // Falha em UMA corretora não deve quebrar as próximas.
      logger.error(
        { err, corretoraId: bucket.corretora_id },
        "stale-leads-scan.bucket_failed",
      );
    }
  }

  if (report.notified > 0 || report.emails_sent > 0) {
    logger.info(report, "stale-leads-scan.done");
  }

  return report;
}

module.exports = { runOnce, DEFAULT_THRESHOLD_HOURS };
