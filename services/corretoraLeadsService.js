// services/corretoraLeadsService.js
//
// Regra de negócio da captura e gestão de leads da corretora.
// Também dispara a notificação por e-mail (reutiliza mailService).
"use strict";

const AppError = require("../errors/AppError");
const ERROR_CODES = require("../constants/ErrorCodes");
const leadsRepo = require("../repositories/corretoraLeadsRepository");
const publicCorretorasRepo = require("../repositories/corretorasPublicRepository");
const mailService = require("./mailService");
const analyticsService = require("./analyticsService");
const logger = require("../lib/logger");

// ---------------------------------------------------------------------------
// Criação de lead a partir do formulário público.
// ---------------------------------------------------------------------------

async function createLeadFromPublic({ slug, data, meta }) {
  const corretora = await publicCorretorasRepo.findBySlug(slug);
  if (!corretora) {
    throw new AppError("Corretora não encontrada.", ERROR_CODES.NOT_FOUND, 404);
  }

  if (corretora.status !== "active") {
    throw new AppError(
      "Esta corretora não está recebendo contatos no momento.",
      ERROR_CODES.CONFLICT,
      409
    );
  }

  const leadId = await leadsRepo.create({
    corretora_id: corretora.id,
    nome: data.nome,
    telefone: data.telefone,
    cidade: data.cidade,
    mensagem: data.mensagem,
    objetivo: data.objetivo,
    tipo_cafe: data.tipo_cafe,
    volume_range: data.volume_range,
    canal_preferido: data.canal_preferido,
    source_ip: meta?.ip,
    user_agent: meta?.userAgent,
  });

  logger.info(
    {
      leadId,
      corretoraId: corretora.id,
      corretoraSlug: slug,
      hasMessage: Boolean(data.mensagem),
      hasCidade: Boolean(data.cidade),
      objetivo: data.objetivo ?? null,
      volumeRange: data.volume_range ?? null,
      ip: meta?.ip,
    },
    "corretora.lead.created"
  );

  // Notificação fire-and-forget — nunca falha a criação do lead por causa
  // de um problema de e-mail.
  notifyCorretoraOfNewLead(corretora, { id: leadId, ...data }).catch((err) => {
    logger.warn(
      {
        err: err?.message ?? String(err),
        errCode: err?.code,
        corretoraId: corretora.id,
        corretoraEmail: corretora.email,
        leadId,
      },
      "corretora.lead.email_failed"
    );
  });

  analyticsService.track({
    name: "lead_created",
    actorType: "anonymous",
    corretoraId: corretora.id,
    props: {
      lead_id: leadId,
      cidade: data.cidade ?? null,
      has_message: Boolean(data.mensagem),
    },
    // req não está disponível aqui — passamos IP/UA inline via "req-shim"
    req: {
      ip: meta?.ip,
      get: (h) => (h === "user-agent" ? meta?.userAgent : null),
    },
  });

  return { id: leadId, corretora_id: corretora.id };
}

// Labels human-readable dos enums qualificados — sincronizados com
// o catálogo em kavita-frontend/src/lib/regioes.ts (fonte única lá).
const LABEL_OBJETIVO = {
  vender: "Vender café",
  comprar: "Comprar café",
  cotacao: "Consultar cotação",
  outro: "Outro assunto",
};
const LABEL_TIPO_CAFE = {
  arabica_comum: "Arábica comum",
  arabica_especial: "Arábica especial",
  natural: "Natural",
  cereja_descascado: "Cereja descascado",
  ainda_nao_sei: "Ainda não sei",
};
const LABEL_VOLUME = {
  ate_50: "Até 50 sacas",
  "50_200": "50 a 200 sacas",
  "200_500": "200 a 500 sacas",
  "500_mais": "Mais de 500 sacas",
};
const LABEL_CANAL = {
  whatsapp: "WhatsApp",
  ligacao: "Ligação",
  email: "E-mail",
};

async function notifyCorretoraOfNewLead(corretora, lead) {
  if (!corretora?.email) return; // nada para notificar

  // Identifica "prioridade" para destacar leads com volume alto.
  const isHighPriority =
    lead.volume_range === "200_500" || lead.volume_range === "500_mais";
  const priorityBadge = isHighPriority
    ? `<span style="background:#b45309;color:white;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;">Alta prioridade</span>`
    : "";

  const subject = isHighPriority
    ? `[Alta prioridade] Novo contato — ${lead.nome}`
    : `Novo contato recebido — ${lead.nome}`;

  const qualFields = [
    lead.objetivo && { label: "Objetivo", value: LABEL_OBJETIVO[lead.objetivo] },
    lead.tipo_cafe && { label: "Tipo de café", value: LABEL_TIPO_CAFE[lead.tipo_cafe] },
    lead.volume_range && { label: "Volume estimado", value: LABEL_VOLUME[lead.volume_range] },
    lead.canal_preferido && { label: "Prefere", value: LABEL_CANAL[lead.canal_preferido] },
  ].filter(Boolean);

  const qualHtml = qualFields.length
    ? `<div style="margin:12px 0;padding-top:12px;border-top:1px solid #e4e4e7;">
         ${qualFields
           .map(
             (f) =>
               `<p style="margin:4px 0"><strong>${escapeHtml(f.label)}:</strong> ${escapeHtml(f.value)}</p>`,
           )
           .join("")}
       </div>`
    : "";

  const html = `
    <div style="font-family: system-ui, -apple-system, sans-serif; max-width: 560px;">
      <div style="display:flex;align-items:center;gap:8px;margin:0 0 12px;">
        <h2 style="color:#15803d;margin:0;">☕ Novo contato no Mercado do Café</h2>
        ${priorityBadge}
      </div>
      <p>Olá ${escapeHtml(corretora.contact_name || corretora.name)},</p>
      <p>Um produtor entrou em contato com a <strong>${escapeHtml(corretora.name)}</strong>
         pela sua página no Kavita:</p>
      <div style="background:#f4f4f5;border-radius:12px;padding:16px;margin:16px 0;">
        <p style="margin:4px 0"><strong>Nome:</strong> ${escapeHtml(lead.nome)}</p>
        <p style="margin:4px 0"><strong>Telefone:</strong> ${escapeHtml(lead.telefone)}</p>
        ${lead.cidade ? `<p style="margin:4px 0"><strong>Cidade:</strong> ${escapeHtml(lead.cidade)}</p>` : ""}
        ${qualHtml}
        ${lead.mensagem ? `<p style="margin:12px 0 4px"><strong>Mensagem:</strong><br/>${escapeHtml(lead.mensagem)}</p>` : ""}
      </div>
      <p>Acesse seu painel para responder e atualizar o status:</p>
      <p>
        <a href="${process.env.APP_URL?.replace(/\/$/, "") || ""}/painel/corretora/leads"
           style="display:inline-block;background:#15803d;color:white;
                  padding:10px 20px;border-radius:8px;text-decoration:none;">
          Abrir painel
        </a>
      </p>
      <p style="color:#71717a;font-size:12px;margin-top:24px;">
        Kavita • Mercado do Café
      </p>
    </div>
  `;

  const textLines = [
    `Novo contato para ${corretora.name}${isHighPriority ? " [ALTA PRIORIDADE]" : ""}`,
    ``,
    `Nome: ${lead.nome}`,
    `Telefone: ${lead.telefone}`,
    lead.cidade ? `Cidade: ${lead.cidade}` : null,
    lead.objetivo ? `Objetivo: ${LABEL_OBJETIVO[lead.objetivo]}` : null,
    lead.tipo_cafe ? `Tipo de café: ${LABEL_TIPO_CAFE[lead.tipo_cafe]}` : null,
    lead.volume_range ? `Volume estimado: ${LABEL_VOLUME[lead.volume_range]}` : null,
    lead.canal_preferido ? `Prefere contato por: ${LABEL_CANAL[lead.canal_preferido]}` : null,
    lead.mensagem ? `Mensagem: ${lead.mensagem}` : null,
    ``,
    `Responder pelo painel: ${process.env.APP_URL || ""}/painel/corretora/leads`,
  ];
  const text = textLines.filter(Boolean).join("\n");

  await mailService.sendTransactionalEmail(corretora.email, subject, html, text);
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

// ---------------------------------------------------------------------------
// Ações da corretora logada sobre seus próprios leads.
// ---------------------------------------------------------------------------

async function listLeadsForCorretora(corretoraId, query) {
  return leadsRepo.list({
    corretoraId,
    status: query.status,
    page: query.page,
    limit: query.limit,
  });
}

async function getSummary(corretoraId) {
  return leadsRepo.summary(corretoraId);
}

async function updateLead(leadId, corretoraId, data, actor = {}) {
  const current = await leadsRepo.findByIdForCorretora(leadId, corretoraId);
  if (!current) {
    // Sinal importante: pode ser bug de UI (lead deletado/stale) OU
    // tentativa de acessar lead de outra corretora. Worth a warn.
    logger.warn(
      { leadId, corretoraId, actorId: actor.userId ?? null },
      "corretora.lead.update_not_found"
    );
    throw new AppError("Lead não encontrado.", ERROR_CODES.NOT_FOUND, 404);
  }

  const affected = await leadsRepo.update(leadId, corretoraId, data);
  if (affected === 0) {
    throw new AppError(
      "Nada para atualizar.",
      ERROR_CODES.VALIDATION_ERROR,
      400
    );
  }

  // Só emite lead_status_updated quando realmente houve mudança de status.
  // Mudanças apenas de nota_interna não poluem o funil.
  if (data.status && data.status !== current.status) {
    logger.info(
      {
        leadId,
        corretoraId,
        actorId: actor.userId ?? null,
        fromStatus: current.status,
        toStatus: data.status,
      },
      "corretora.lead.status_changed"
    );
    analyticsService.track({
      name: "lead_status_updated",
      actorType: "corretora_user",
      actorId: actor.userId ?? null,
      corretoraId,
      props: {
        lead_id: leadId,
        from_status: current.status,
        to_status: data.status,
      },
    });

    // ─── SLA tracking (Sprint 3) ──────────────────────────────────
    // Grava o 1º response quando lead SAI DE "new" pela primeira vez.
    // Guard: first_response_at NULL (nunca foi respondido antes).
    // Motivo: correções de status posteriores não devem sobrescrever
    // o SLA real do primeiro atendimento.
    if (current.status === "new" && !current.first_response_at) {
      const responseSeconds = Math.max(
        0,
        Math.floor(
          (Date.now() - new Date(current.created_at).getTime()) / 1000,
        ),
      );
      try {
        await leadsRepo.markFirstResponse(
          leadId,
          corretoraId,
          responseSeconds,
        );
        logger.info(
          { leadId, corretoraId, responseSeconds },
          "corretora.lead.first_response_tracked",
        );
      } catch (err) {
        // Erro no tracking de SLA não deve falhar o update principal.
        logger.warn(
          {
            err: err?.message ?? String(err),
            leadId,
            corretoraId,
          },
          "corretora.lead.first_response_tracking_failed",
        );
      }
    }
  }

  return leadsRepo.findByIdForCorretora(leadId, corretoraId);
}

module.exports = {
  createLeadFromPublic,
  listLeadsForCorretora,
  getSummary,
  updateLead,
};
