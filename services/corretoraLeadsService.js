// services/corretoraLeadsService.js
//
// Regra de negócio da captura e gestão de leads da corretora.
// Também dispara a notificação por e-mail (reutiliza mailService).
"use strict";

const AppError = require("../errors/AppError");
const ERROR_CODES = require("../constants/ErrorCodes");
const leadsRepo = require("../repositories/corretoraLeadsRepository");
const publicCorretorasRepo = require("../repositories/corretorasPublicRepository");
const notificationsRepo = require("../repositories/corretoraNotificationsRepository");
const mailService = require("./mailService");
const analyticsService = require("./analyticsService");
const logger = require("../lib/logger");
const { normalizePhone } = require("../lib/phoneNormalize");
const { isCorregoEspecial } = require("../lib/corregosEspeciais");
const { verifyLoteToken, generateLoteToken } = require("../lib/corretoraLeadTokens");

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

  const telefone_normalizado = normalizePhone(data.telefone);

  const leadId = await leadsRepo.create({
    corretora_id: corretora.id,
    nome: data.nome,
    telefone: data.telefone,
    telefone_normalizado,
    cidade: data.cidade,
    mensagem: data.mensagem,
    objetivo: data.objetivo,
    tipo_cafe: data.tipo_cafe,
    volume_range: data.volume_range,
    canal_preferido: data.canal_preferido,
    corrego_localidade: data.corrego_localidade,
    safra_tipo: data.safra_tipo,
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

  // Sprint 7 — Se o produtor enviou e-mail no formulário (canal_preferido
  // = email OU mensagem incluiu e-mail), enviamos um e-mail leve a ele
  // com o link de "lote vendido". Sem e-mail no lead, não há como
  // contactar — o produtor vai precisar abrir o app/site para sinalizar.
  // Nesta versão, o link é injetado na cópia do email que vai à corretora
  // (no rodapé como sugestão de URL para passar ao produtor) e fica
  // pronto para a v2 quando capturarmos email do produtor.

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

  // In-panel notification (Sprint 6B+7) — fire-and-forget como email.
  // Pertence à corretora, toda a equipe vê; marcação de leitura é
  // por-usuário via tabela corretora_notification_reads.
  //
  // Sprint 7: alta prioridade também se vier de córrego mapeado como
  // região de café especial (gera prioridade qualitativa, não só
  // quantitativa).
  const isHighVolume =
    data.volume_range === "200_500" || data.volume_range === "500_mais";
  const isCorregoPremium = isCorregoEspecial(data.corrego_localidade);
  const isHighPriority = isHighVolume || isCorregoPremium;

  const cityPart = data.cidade ? ` · ${data.cidade}` : "";
  const corregoPart = data.corrego_localidade
    ? ` (${data.corrego_localidade})`
    : "";
  const bodyParts = [data.nome];
  if (data.volume_range) {
    bodyParts.push(`${data.volume_range.replace("_", "–")} sacas`);
  }
  if (isCorregoPremium) {
    bodyParts.push("café especial");
  }

  notificationsRepo
    .create({
      corretora_id: corretora.id,
      type: "lead.new",
      title: isHighPriority
        ? `Novo lead alta prioridade${cityPart}${corregoPart}`
        : `Novo lead${cityPart}${corregoPart}`,
      body: bodyParts.join(" · "),
      link: "/painel/corretora/leads",
      meta: {
        lead_id: leadId,
        nome: data.nome,
        cidade: data.cidade ?? null,
        corrego: data.corrego_localidade ?? null,
        is_corrego_premium: isCorregoPremium,
      },
    })
    .catch((err) => {
      logger.warn(
        { err: err?.message ?? String(err), corretoraId: corretora.id, leadId },
        "corretora.lead.notification_failed",
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

  // Identifica "prioridade" para destacar leads com volume alto OU
  // córrego mapeado como região de café especial (Sprint 7).
  const isHighPriority =
    lead.volume_range === "200_500" ||
    lead.volume_range === "500_mais" ||
    isCorregoEspecial(lead.corrego_localidade);
  const priorityBadge = isHighPriority
    ? `<span style="background:#b45309;color:white;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;">Alta prioridade</span>`
    : "";

  const subject = isHighPriority
    ? `[Alta prioridade] Novo contato — ${lead.nome}`
    : `Novo contato recebido — ${lead.nome}`;

  const qualFields = [
    lead.objetivo && { label: "Objetivo", value: LABEL_OBJETIVO[lead.objetivo] },
    lead.corrego_localidade && {
      label: "Córrego/localidade",
      value: lead.corrego_localidade,
    },
    lead.safra_tipo && {
      label: "Safra",
      value: lead.safra_tipo === "atual" ? "Atual" : "Estoque (remanescente)",
    },
    lead.tipo_cafe && { label: "Tipo de café", value: LABEL_TIPO_CAFE[lead.tipo_cafe] },
    lead.volume_range && { label: "Volume estimado", value: LABEL_VOLUME[lead.volume_range] },
    lead.canal_preferido && { label: "Prefere", value: LABEL_CANAL[lead.canal_preferido] },
  ].filter(Boolean);

  // Sprint 7 — link de "lote vendido" que a corretora pode passar ao
  // produtor (via WhatsApp, ligação ou email pessoal).
  const appUrl = process.env.APP_URL?.replace(/\/$/, "") || "";
  const loteToken = generateLoteToken(lead.id);
  const loteVendidoUrl = `${appUrl}/mercado-do-cafe/lote-vendido/${lead.id}/${loteToken}`;

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
        <a href="${appUrl}/painel/corretora/leads"
           style="display:inline-block;background:#15803d;color:white;
                  padding:10px 20px;border-radius:8px;text-decoration:none;">
          Abrir painel
        </a>
      </p>

      <div style="margin-top:24px;padding-top:16px;border-top:1px solid #e4e4e7;">
        <p style="margin:0 0 8px;font-size:12px;color:#71717a;">
          <strong>Tip · Sprint 7:</strong> Compartilhe este link com o
          produtor para ele sinalizar caso já tenha vendido o lote
          (libera espaço na sua mesa de amostras):
        </p>
        <p style="margin:4px 0;font-size:11px;word-break:break-all;">
          <a href="${loteVendidoUrl}" style="color:#b45309;">${loteVendidoUrl}</a>
        </p>
      </div>

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
    amostra_status: query.amostra_status,
    bebida_classificacao: query.bebida_classificacao,
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

/**
 * Sprint 7 — Confirmação pública de "lote vendido" pelo produtor.
 * Valida HMAC token, identifica telefone normalizado do lead alvo
 * e marca todos os leads do mesmo produtor (em qualquer corretora)
 * como lote_disponivel = false. Cria notificação in-panel para cada
 * corretora afetada.
 *
 * Idempotente: clicar 2x no link não causa estado divergente
 * (broadcast filtra lote_disponivel = 1 antes do update).
 */
async function confirmLoteVendidoFromPublic({ leadId, token }) {
  if (!verifyLoteToken(leadId, token)) {
    throw new AppError(
      "Link inválido ou expirado.",
      ERROR_CODES.UNAUTHORIZED,
      401,
    );
  }

  const lead = await leadsRepo.findByIdRaw(leadId);
  if (!lead) {
    throw new AppError("Lead não encontrado.", ERROR_CODES.NOT_FOUND, 404);
  }

  if (!lead.telefone_normalizado) {
    throw new AppError(
      "Telefone do lead não normalizado — broadcast indisponível.",
      ERROR_CODES.UNPROCESSABLE_ENTITY,
      422,
    );
  }

  const affected = await leadsRepo.broadcastLoteVendido(
    lead.telefone_normalizado,
  );

  if (affected.length === 0) {
    // Já estava marcado — devolve sucesso silencioso (idempotente).
    return { affected_count: 0, already_marked: true };
  }

  // Notificações in-panel para cada corretora atingida.
  // Fire-and-forget; não falha se uma der erro.
  for (const target of affected) {
    notificationsRepo
      .create({
        corretora_id: target.corretora_id,
        type: "lead.lote_vendido",
        title: `Lote vendido — ${target.nome}`,
        body: `O produtor confirmou que já fechou negócio${target.cidade ? ` em ${target.cidade}` : ""}. A amostra não precisa mais ser cobrada.`,
        link: "/painel/corretora/leads",
        meta: {
          lead_id: target.id,
          telefone_normalizado: lead.telefone_normalizado,
        },
      })
      .catch((err) => {
        logger.warn(
          {
            err: err?.message ?? String(err),
            corretoraId: target.corretora_id,
            leadId: target.id,
          },
          "corretora.lead.lote_vendido_notif_failed",
        );
      });
  }

  logger.info(
    {
      leadIdSeed: leadId,
      affectedCount: affected.length,
      telefone_normalizado: lead.telefone_normalizado,
    },
    "corretora.lead.lote_vendido_broadcast",
  );

  analyticsService.track({
    name: "lead_lote_vendido",
    actorType: "anonymous",
    props: {
      affected_count: affected.length,
    },
  });

  return { affected_count: affected.length, already_marked: false };
}

module.exports = {
  createLeadFromPublic,
  listLeadsForCorretora,
  getSummary,
  updateLead,
  confirmLoteVendidoFromPublic,
  // Helper exportado p/ uso em controller que precisa devolver o
  // token gerado (ex: dev/admin debug, no futuro uso real é gerar
  // do lado do email enviado ao produtor).
  generateLoteToken,
};
