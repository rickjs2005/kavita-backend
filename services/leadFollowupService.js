"use strict";

// services/leadFollowupService.js
//
// Gera e envia o email de follow-up 7d pós-lead, pedindo review.
//
// Disciplina seguida (inspirada em Intercom/HubSpot/Stripe):
//   1. Idempotência via UNIQUE(lead_id, kind) + INSERT — nunca envia 2x.
//   2. Respeita lista de supressão (email_suppressions) — CAN-SPAM.
//   3. Quiet hours — cron roda 10:00 BRT; mesmo assim o service rejeita
//      se hora atual fora de [8,20) (defense in depth).
//   4. Rate limit local — máximo N emails por tick, para não estourar
//      quota do provider. Excedente roda no próximo tick.
//   5. Cada envio é fire-and-forget + registra error_at em falha.
//   6. Todo link tem unsubscribe one-click (HMAC).

const logger = require("../lib/logger");
const mailService = require("./mailService");
const leadFollowupsRepo = require("../repositories/leadFollowupsRepository");
const emailSuppressionsRepo = require("../repositories/emailSuppressionsRepository");
const { generateUnsubToken } = require("../lib/unsubscribeTokens");

const KIND = "review_request_7d";
const DEFAULT_MAX_PER_TICK = 100;
const WINDOW_START_DAYS = 7;
const WINDOW_END_DAYS = 8; // janela de 24h: leads criados há 7-8 dias

function withinQuietHours(now = new Date()) {
  // BRT — 08:00 a 19:59 OK; resto é quiet.
  // Como o cron já roda 10:00, isto é defesa extra.
  const h = now.getHours();
  return h < 8 || h >= 20;
}

function buildUnsubscribeUrl(email) {
  const appUrl = (process.env.APP_URL || "").replace(/\/$/, "");
  const token = generateUnsubToken(email, "marketing");
  const params = new URLSearchParams({ email, token });
  return `${appUrl}/email/descadastrar?${params.toString()}`;
}

function buildReviewUrl({ corretoraSlug }) {
  const appUrl = (process.env.APP_URL || "").replace(/\/$/, "");
  return `${appUrl}/mercado-do-cafe/${corretoraSlug}?avaliar=1`;
}

function buildEmail({ leadId, leadNome, corretoraNome, corretoraSlug, producerEmail }) {
  const unsubUrl = buildUnsubscribeUrl(producerEmail);
  const reviewUrl = buildReviewUrl({ corretoraSlug });

  // 2026-05-08 — copy humanizada via engine. Variantes deterministicas
  // por leadId garantem que o produtor recebe sempre a mesma versao
  // (caso o email seja reenviado por bug operacional, parece "do mesmo
  // remetente humano"), mas leads diferentes recebem versoes
  // diferentes, evitando aparencia de broadcast.
  const humanizer = require("./messaging/humanMessageBuilder");
  const ctx = humanizer.buildContext({
    lead: { id: leadId, nome: leadNome },
    corretora: { name: corretoraNome },
  });
  const corpoTexto = humanizer.humanize("produtor_followup_7d", ctx) || "";

  // Subject com 3 variantes — leve variacao reduz aparencia robotica.
  const subjectVariations = [
    `Como foi seu contato com ${corretoraNome}?`,
    `${leadNome ? leadNome.split(" ")[0] + ", " : ""}sua experiência com ${corretoraNome}`,
    `Avaliação rápida do contato com ${corretoraNome}`,
  ];
  const subject = humanizer.pickVariation(subjectVariations, leadId);

  // Quebra o corpo humanizado em paragrafos HTML.
  const corpoHtml = corpoTexto
    .split(/\n+/)
    .filter(Boolean)
    .map((line) => `<p style="margin:0 0 12px;line-height:1.55;">${escapeHtml(line)}</p>`)
    .join("");

  const html = `
    <div style="font-family: system-ui, -apple-system, sans-serif; max-width: 540px; color:#1c1917;">
      <p style="color:#b45309;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.18em;margin:0 0 10px;">☕ Kavita · Mercado do Café</p>
      ${corpoHtml}
      <p style="margin:18px 0;">
        <a href="${reviewUrl}" style="display:inline-block;background:#b45309;color:white;
                  padding:12px 24px;border-radius:10px;text-decoration:none;font-weight:600;">
          Deixar avaliação (1 minuto)
        </a>
      </p>
      <p style="color:#71717a;font-size:12px;margin-top:24px;">
        Kavita · Mercado do Café · Zona da Mata mineira
      </p>
      <p style="color:#71717a;font-size:11px;margin-top:8px;">
        Não quer mais receber estes lembretes?
        <a href="${unsubUrl}" style="color:#71717a;">Descadastrar</a>.
      </p>
    </div>
  `;
  const text = [
    corpoTexto,
    "",
    `Avaliar: ${reviewUrl}`,
    "",
    `Descadastrar: ${unsubUrl}`,
  ].join("\n");
  return { subject, html, text };
}

function escapeHtml(str) {
  if (str == null) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Uma passada do cron. Retorna relatório p/ o runtime state do job.
 */
async function runOnce({ maxPerTick = DEFAULT_MAX_PER_TICK, now = new Date() } = {}) {
  const startedAt = Date.now();

  if (withinQuietHours(now)) {
    logger.info("lead-followup: quiet hours — skipping tick");
    return { skipped: true, reason: "quiet_hours", sent: 0, suppressed: 0, failed: 0, total: 0 };
  }

  const toDate = new Date(now.getTime() - WINDOW_START_DAYS * 24 * 60 * 60 * 1000);
  const fromDate = new Date(now.getTime() - WINDOW_END_DAYS * 24 * 60 * 60 * 1000);

  const candidates = await leadFollowupsRepo.findEligibleForReviewRequest7d({
    from: fromDate,
    to: toDate,
    limit: maxPerTick,
  });

  const report = {
    skipped: false,
    total: candidates.length,
    sent: 0,
    suppressed: 0,
    failed: 0,
    durationMs: 0,
  };

  for (const row of candidates) {
    const email = row.producer_email;
    try {
      // Supressão primeiro — se opted out, ainda marca como "sent" no followups
      // para não reprocessar indefinidamente. Reason: error_message="suppressed".
      const suppressed = await emailSuppressionsRepo.isSuppressed(email, "marketing");
      if (suppressed) {
        await leadFollowupsRepo.recordError({
          leadId: row.lead_id,
          kind: KIND,
          message: "suppressed",
        });
        report.suppressed += 1;
        continue;
      }

      // Tenta gravar ANTES do envio — ganha a corrida contra outro processo.
      const inserted = await leadFollowupsRepo.recordSent({ leadId: row.lead_id, kind: KIND });
      if (!inserted) {
        // Outro processo enviou antes — pula silenciosamente.
        continue;
      }

      const { subject, html, text } = buildEmail({
        leadId: row.lead_id,
        leadNome: row.lead_nome,
        corretoraNome: row.corretora_nome,
        corretoraSlug: row.corretora_slug,
        producerEmail: email,
      });

      await mailService.sendTransactionalEmail(email, subject, html, text);
      report.sent += 1;
    } catch (err) {
      report.failed += 1;
      await leadFollowupsRepo
        .recordError({
          leadId: row.lead_id,
          kind: KIND,
          message: err?.message || "unknown_error",
        })
        .catch(() => {});
      logger.warn(
        { leadId: row.lead_id, err: err?.message || String(err) },
        "lead-followup.send_failed",
      );
    }
  }

  report.durationMs = Date.now() - startedAt;
  logger.info({ report }, "lead-followup.tick_complete");
  return report;
}

module.exports = { runOnce, KIND };
