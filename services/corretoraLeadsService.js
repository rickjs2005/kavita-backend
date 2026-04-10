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
    source_ip: meta?.ip,
    user_agent: meta?.userAgent,
  });

  // Notificação fire-and-forget — nunca falha a criação do lead por causa
  // de um problema de e-mail.
  notifyCorretoraOfNewLead(corretora, { id: leadId, ...data }).catch((err) => {
    logger.warn(
      { err, corretora_id: corretora.id, leadId },
      "corretoraLeads: falha ao notificar novo lead"
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

async function notifyCorretoraOfNewLead(corretora, lead) {
  if (!corretora?.email) return; // nada para notificar

  const subject = `Novo contato recebido — ${lead.nome}`;
  const html = `
    <div style="font-family: system-ui, -apple-system, sans-serif; max-width: 560px;">
      <h2 style="color:#15803d;margin:0 0 12px;">☕ Novo contato no Mercado do Café</h2>
      <p>Olá ${escapeHtml(corretora.contact_name || corretora.name)},</p>
      <p>Um produtor entrou em contato com a <strong>${escapeHtml(corretora.name)}</strong>
         pela sua página no Kavita:</p>
      <div style="background:#f4f4f5;border-radius:12px;padding:16px;margin:16px 0;">
        <p style="margin:4px 0"><strong>Nome:</strong> ${escapeHtml(lead.nome)}</p>
        <p style="margin:4px 0"><strong>Telefone:</strong> ${escapeHtml(lead.telefone)}</p>
        ${lead.cidade ? `<p style="margin:4px 0"><strong>Cidade:</strong> ${escapeHtml(lead.cidade)}</p>` : ""}
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
  const text = [
    `Novo contato para ${corretora.name}`,
    ``,
    `Nome: ${lead.nome}`,
    `Telefone: ${lead.telefone}`,
    lead.cidade ? `Cidade: ${lead.cidade}` : null,
    lead.mensagem ? `Mensagem: ${lead.mensagem}` : null,
    ``,
    `Responder pelo painel: ${process.env.APP_URL || ""}/painel/corretora/leads`,
  ]
    .filter(Boolean)
    .join("\n");

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
  }

  return leadsRepo.findByIdForCorretora(leadId, corretoraId);
}

module.exports = {
  createLeadFromPublic,
  listLeadsForCorretora,
  getSummary,
  updateLead,
};
