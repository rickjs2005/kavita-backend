// services/corretoraLeadsService.js
//
// Regra de negócio da captura e gestão de leads da corretora.
// Também dispara a notificação por e-mail (reutiliza mailService).
"use strict";

const AppError = require("../errors/AppError");
const ERROR_CODES = require("../constants/ErrorCodes");
const leadsRepo = require("../repositories/corretoraLeadsRepository");
const notesRepo = require("../repositories/corretoraLeadNotesRepository");
const eventsRepo = require("../repositories/corretoraLeadEventsRepository");
const publicCorretorasRepo = require("../repositories/corretorasPublicRepository");
const notificationsRepo = require("../repositories/corretoraNotificationsRepository");
const usersRepo = require("../repositories/corretoraUsersRepository");
const smsService = require("./smsService");
const mailService = require("./mailService");
const analyticsService = require("./analyticsService");
const logger = require("../lib/logger");
const { normalizePhone } = require("../lib/phoneNormalize");
const { isCorregoEspecial } = require("../lib/corregosEspeciais");
const {
  verifyLoteToken,
  generateLoteToken,
  verifyStatusToken,
  generateStatusToken,
} = require("../lib/corretoraLeadTokens");

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

  // Fase 2 dedupe — se o mesmo produtor (telefone_normalizado) já
  // contactou essa corretora nas últimas 24h, NÃO criamos lead novo.
  // Em vez disso, incrementamos recontact_count no lead existente e
  // avisamos a corretora que o produtor voltou a chamar (sinal de
  // interesse forte). Evita ruído no CRM e SLA artificialmente quebrado.
  if (telefone_normalizado) {
    const existing = await leadsRepo.findRecentByCorretoraAndPhone({
      corretora_id: corretora.id,
      telefone_normalizado,
      hours: 24,
    });
    if (existing) {
      await leadsRepo.markRecontactAttempt(existing.id).catch((err) => {
        logger.warn(
          { err, leadId: existing.id, corretoraId: corretora.id },
          "corretora.lead.recontact_update_failed",
        );
      });
      logger.info(
        {
          leadId: existing.id,
          corretoraId: corretora.id,
          corretoraSlug: slug,
          ageMinutes: Math.floor(
            (Date.now() - new Date(existing.created_at).getTime()) / 60000,
          ),
        },
        "corretora.lead.deduped",
      );
      notificationsRepo
        .create({
          corretora_id: corretora.id,
          type: "lead.recontato",
          title: `Produtor voltou a chamar — ${data.nome}`,
          body: `O mesmo contato (${data.telefone}) tentou falar com você de novo. Pode ser hora de um retorno proativo.`,
          link: "/painel/corretora/leads",
          meta: { lead_id: existing.id, source: "recontact_dedupe" },
        })
        .catch((err) => {
          logger.warn(
            { err, corretoraId: corretora.id, leadId: existing.id },
            "corretora.lead.recontact_notification_failed",
          );
        });
      return {
        id: existing.id,
        corretora_id: corretora.id,
        deduplicated: true,
      };
    }
  }

  const leadId = await leadsRepo.create({
    corretora_id: corretora.id,
    nome: data.nome,
    telefone: data.telefone,
    telefone_normalizado,
    email: data.email,
    cidade: data.cidade,
    mensagem: data.mensagem,
    objetivo: data.objetivo,
    tipo_cafe: data.tipo_cafe,
    volume_range: data.volume_range,
    canal_preferido: data.canal_preferido,
    corrego_localidade: data.corrego_localidade,
    safra_tipo: data.safra_tipo,
    possui_amostra: data.possui_amostra,
    possui_laudo: data.possui_laudo,
    bebida_percebida: data.bebida_percebida,
    preco_esperado_saca: data.preco_esperado_saca,
    urgencia: data.urgencia,
    observacoes: data.observacoes,
    consentimento_contato: data.consentimento_contato === true,
    sms_optin: data.sms_optin === true,
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

  // Fase 3 — primeira entrada na timeline. Actor "system" porque vem
  // do form público, sem usuário da corretora logado. Fire-and-forget.
  eventsRepo
    .create({
      lead_id: leadId,
      corretora_id: corretora.id,
      actor_user_id: null,
      actor_type: "system",
      event_type: "lead_created",
      title: `Lead recebido${data.cidade ? ` de ${data.cidade}` : ""}`,
      meta: {
        volume_range: data.volume_range ?? null,
        objetivo: data.objetivo ?? null,
        tipo_cafe: data.tipo_cafe ?? null,
        urgencia: data.urgencia ?? null,
      },
    })
    .catch((err) =>
      logger.warn(
        { err, leadId, corretoraId: corretora.id },
        "corretora.lead.event_create_failed",
      ),
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

  // Sprint 1 — Confirmação ao produtor. Dispara só se o produtor
  // deixou e-mail no formulário. Fire-and-forget: falha não impede a
  // criação do lead nem a notificação à corretora.
  if (data.email) {
    const retornoLabel = data.canal_preferido
      ? LABEL_CANAL[data.canal_preferido]
      : null;
    mailService
      .sendLeadProducerConfirmationEmail({
        toEmail: data.email,
        produtorNome: data.nome,
        corretoraNome: corretora.name,
        corretoraSlug: corretora.slug,
        retornoLabel,
        // Sprint 7 — link autenticado por HMAC para o produtor
        // acompanhar o status do próprio lead sem login.
        leadId,
        statusToken: generateStatusToken(leadId),
      })
      .catch((err) => {
        logger.warn(
          {
            err: err?.message ?? String(err),
            leadId,
            corretoraId: corretora.id,
            produtorEmail: data.email,
          },
          "corretora.lead.producer_confirmation_failed"
        );
      });
  }

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

/**
 * Coleta destinatários do e-mail operacional de um novo lead.
 * Inclui o e-mail institucional da corretora (quando existe) + todos
 * os corretora_users com is_active=true E password_hash != null
 * (ativados, com senha definida — quem pode entrar no painel).
 *
 * Dedupe case-insensitive: se o institucional bate com um user, só
 * manda uma vez. Usuários pendentes de primeiro acesso ficam fora —
 * receber notificação operacional sem conseguir abrir o painel cria
 * confusão e pode até expor informação antes da ativação.
 */
async function collectLeadRecipients(corretora) {
  const emails = [];
  const seen = new Set();

  function push(email) {
    if (!email || typeof email !== "string") return;
    const norm = email.trim().toLowerCase();
    if (!norm || seen.has(norm)) return;
    seen.add(norm);
    emails.push(email.trim());
  }

  // E-mail institucional (fallback histórico — preserva comportamento
  // pré-expansão para corretoras sem users ativados).
  push(corretora?.email);

  // Todos os users ativos e ativados. Falha aqui é logada mas não
  // bloqueia o envio para o institucional.
  if (corretora?.id) {
    try {
      const team = await usersRepo.listTeamByCorretoraId(corretora.id);
      for (const u of team) {
        if (u.is_active && u.activated) push(u.email);
      }
    } catch (err) {
      logger.warn(
        { err: err?.message ?? String(err), corretoraId: corretora.id },
        "corretora.lead.team_lookup_failed",
      );
    }
  }

  return emails;
}

async function notifyCorretoraOfNewLead(corretora, lead) {
  const recipients = await collectLeadRecipients(corretora);
  if (recipients.length === 0) return; // nada para notificar

  // Identifica "prioridade" para destacar leads com volume alto OU
  // córrego mapeado como região de café especial (Sprint 7).
  const isHighPriority =
    lead.volume_range === "200_500" ||
    lead.volume_range === "500_mais" ||
    isCorregoEspecial(lead.corrego_localidade);
  const priorityBadge = isHighPriority
    ? "<span style=\"background:#b45309;color:white;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;\">Alta prioridade</span>"
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
    "",
    `Nome: ${lead.nome}`,
    `Telefone: ${lead.telefone}`,
    lead.cidade ? `Cidade: ${lead.cidade}` : null,
    lead.objetivo ? `Objetivo: ${LABEL_OBJETIVO[lead.objetivo]}` : null,
    lead.tipo_cafe ? `Tipo de café: ${LABEL_TIPO_CAFE[lead.tipo_cafe]}` : null,
    lead.volume_range ? `Volume estimado: ${LABEL_VOLUME[lead.volume_range]}` : null,
    lead.canal_preferido ? `Prefere contato por: ${LABEL_CANAL[lead.canal_preferido]}` : null,
    lead.mensagem ? `Mensagem: ${lead.mensagem}` : null,
    "",
    `Responder pelo painel: ${process.env.APP_URL || ""}/painel/corretora/leads`,
  ];
  const text = textLines.filter(Boolean).join("\n");

  // Envia individualmente para cada destinatário. Loop sequencial para
  // não estourar throttle do transporte; falha por destinatário é
  // logada sem derrubar os demais. Resposta geral é bem-sucedida se
  // ao menos um envio passou — o caller (createLeadFromPublic) já
  // trata tudo como fire-and-forget.
  const failures = [];
  for (const to of recipients) {
    try {
      await mailService.sendTransactionalEmail(to, subject, html, text);
    } catch (err) {
      failures.push({ to, error: err?.message ?? String(err) });
    }
  }
  if (failures.length > 0) {
    logger.warn(
      {
        corretoraId: corretora.id,
        leadId: lead.id,
        totalRecipients: recipients.length,
        failures,
      },
      "corretora.lead.notification_partial_failure",
    );
    // Se TODOS falharam, propaga erro para o caller logar como falha
    // total (padrão pré-existente).
    if (failures.length === recipients.length) {
      throw new Error("Todos os envios falharam");
    }
  }
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

// ---------------------------------------------------------------------------
// Score de prioridade (Sprint 6 — Onda 2).
// ---------------------------------------------------------------------------
//
// Heurística simples derivada dos sinais que já coletamos. Não substitui o
// julgamento do corretor — serve como rank sugestivo e filtro preset na UI.
// Todos os pesos ficam aqui para o admin ajustar em um só lugar.
const PRIORITY_WEIGHTS = {
  volume_500_mais: 35,
  volume_200_500: 20,
  corrego_especial: 20,
  aging_24h: 15, // status=new há > 24h
  aging_48h: 30, // status=new há > 48h (acumulativo com 24h seria 45, mas só uma faixa aplica)
  recorrente: 10, // mesmo telefone já procurou antes
};

function computePriorityScore(lead) {
  let score = 0;

  if (lead.volume_range === "500_mais") score += PRIORITY_WEIGHTS.volume_500_mais;
  else if (lead.volume_range === "200_500") score += PRIORITY_WEIGHTS.volume_200_500;

  if (isCorregoEspecial(lead.corrego_localidade)) {
    score += PRIORITY_WEIGHTS.corrego_especial;
  }

  if (lead.status === "new" && lead.created_at) {
    const ageMs = Date.now() - new Date(lead.created_at).getTime();
    const ageHours = ageMs / 3_600_000;
    if (ageHours >= 48) score += PRIORITY_WEIGHTS.aging_48h;
    else if (ageHours >= 24) score += PRIORITY_WEIGHTS.aging_24h;
  }

  if (lead.previous_contacts_count > 0) {
    score += PRIORITY_WEIGHTS.recorrente;
  }

  return score;
}

async function listLeadsForCorretora(corretoraId, query) {
  const result = await leadsRepo.list({
    corretoraId,
    status: query.status,
    amostra_status: query.amostra_status,
    bebida_classificacao: query.bebida_classificacao,
    page: query.page,
    limit: query.limit,
  });
  // Injeta priority_score em cada lead. Cálculo é barato (sem I/O)
  // — feito no service em vez de no repo porque depende de lógica
  // (isCorregoEspecial, aging) fora do SQL.
  result.items = result.items.map((lead) => ({
    ...lead,
    priority_score: computePriorityScore(lead),
  }));
  return result;
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
    // ETAPA 3.2 — SMS "corretora respondeu" quando status vai
    // new → contacted (primeira resposta) + produtor fez opt-in +
    // ainda não enviamos esse SMS antes. Tudo fire-and-forget:
    // falha de SMS nunca derruba o update de status.
    if (
      current.status === "new" &&
      data.status === "contacted" &&
      current.sms_optin &&
      !current.sms_sent_contacted_at
    ) {
      // Busca nome da corretora (current só tem colunas do lead).
      publicCorretorasRepo
        .findById(current.corretora_id)
        .then((corretora) => {
          const corretoraName = corretora?.name || "a corretora";
          const firstName =
            String(current.nome ?? "").split(" ")[0] || "produtor";
          return smsService.send({
            to: current.telefone,
            text: `Oi ${firstName}, a ${corretoraName} recebeu seu contato no Kavita e vai retornar em breve.`,
            context: "lead.contacted",
          });
        })
        .then((r) => {
          if (r?.sent) {
            return leadsRepo.markSmsContactedSent(leadId);
          }
          return undefined;
        })
        .catch((err) =>
          logger.warn(
            { err: err?.message ?? String(err), leadId },
            "corretora.lead.sms_send_failed",
          ),
        );
    }

    // Fase 3 — timeline. Mapeia status→event_type pra UI distinguir
    // "ganho" / "perdido" de mudança neutra e pintar a linha
    // correspondente (verde pra won, rose pra lost).
    const eventType =
      data.status === "closed"
        ? "deal_won"
        : data.status === "lost"
          ? "deal_lost"
          : "status_changed";
    eventsRepo
      .create({
        lead_id: leadId,
        corretora_id: corretoraId,
        actor_user_id: actor.userId ?? null,
        actor_type: actor.userId ? "corretora_user" : "system",
        event_type: eventType,
        title: `Status: ${current.status} → ${data.status}`,
        meta: { from: current.status, to: data.status },
      })
      .catch((err) =>
        logger.warn(
          { err, leadId, corretoraId },
          "corretora.lead.event_status_failed",
        ),
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

/**
 * Sprint 7 — Consulta pública do status do lead pelo produtor.
 * Reutiliza o padrão HMAC do lote-vendido: link na mensagem de
 * confirmação + endpoint sem login que valida o par (leadId, token).
 *
 * Retorno é deliberadamente mínimo: status operacional + corretora
 * + canal preferido + datas. Não expõe nota interna, laudo, volume
 * ou qualquer campo que a corretora preenche no painel.
 */
async function getPublicLeadStatus({ leadId, token }) {
  if (!verifyStatusToken(leadId, token)) {
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

  const corretora = await publicCorretorasRepo.findById(lead.corretora_id);
  // findById pode retornar null se a corretora ficou inativa/arquivada
  // depois que o lead foi criado. Ainda retornamos status do lead —
  // só omitimos os canais de contato (produtor não deve ser orientado
  // a chamar um telefone que já não está mais sendo atendido).
  const corretoraBlock = corretora
    ? {
        name: corretora.name,
        slug: corretora.slug,
        whatsapp: corretora.whatsapp ?? null,
        phone: corretora.phone ?? null,
        email: corretora.email ?? null,
      }
    : null;

  return {
    id: lead.id,
    status: lead.status,
    canal_preferido: lead.canal_preferido ?? null,
    created_at: lead.created_at,
    first_response_at: lead.first_response_at ?? null,
    updated_at: lead.updated_at,
    corretora: corretoraBlock,
  };
}

// ---------------------------------------------------------------------------
// Fase 3 — Detalhe do lead, notas datadas, proposta, próxima ação.
// ---------------------------------------------------------------------------

/**
 * Detalhe completo do lead para a página /painel/corretora/leads/[id].
 * Traz lead + notas + eventos (timeline) + previous_contacts_count.
 * Escopo obrigatório por corretora_id — o controller passa o tenant
 * do req.corretoraUser; aqui só propagamos para evitar vazamento.
 */
async function getLeadDetail(leadId, corretoraId) {
  const lead = await leadsRepo.findByIdForCorretora(leadId, corretoraId);
  if (!lead) {
    throw new AppError("Lead não encontrado.", ERROR_CODES.NOT_FOUND, 404);
  }

  const [notes, events, previousCount] = await Promise.all([
    notesRepo.listForLead({ leadId, corretoraId }),
    eventsRepo.listForLead({ leadId, corretoraId }),
    leadsRepo.countPreviousFromSameProducer({
      lead_id: leadId,
      corretora_id: corretoraId,
      telefone_normalizado: lead.telefone_normalizado,
    }),
  ]);

  return {
    lead: {
      ...lead,
      previous_contacts_count: previousCount,
      priority_score: computePriorityScore({
        ...lead,
        previous_contacts_count: previousCount,
      }),
    },
    notes,
    events,
  };
}

/**
 * Adiciona nota datada à timeline do lead. Também emite evento
 * note_added no events repo para aparecer na timeline unificada.
 * Actor é o user logado da corretora.
 */
async function addLeadNote({ leadId, corretoraId, actor, body }) {
  const lead = await leadsRepo.findByIdForCorretora(leadId, corretoraId);
  if (!lead) {
    throw new AppError("Lead não encontrado.", ERROR_CODES.NOT_FOUND, 404);
  }
  const id = await notesRepo.create({
    lead_id: leadId,
    corretora_id: corretoraId,
    author_user_id: actor?.userId ?? null,
    body,
  });
  eventsRepo
    .create({
      lead_id: leadId,
      corretora_id: corretoraId,
      actor_user_id: actor?.userId ?? null,
      actor_type: "corretora_user",
      event_type: "note_added",
      title: "Nota adicionada",
      meta: { note_id: id, preview: body.slice(0, 80) },
    })
    .catch((err) =>
      logger.warn(
        { err, leadId, corretoraId },
        "corretora.lead.event_note_failed",
      ),
    );
  return { id };
}

async function deleteLeadNote({ leadId, corretoraId, noteId }) {
  const affected = await notesRepo.deleteById({
    id: noteId,
    lead_id: leadId,
    corretora_id: corretoraId,
  });
  if (affected === 0) {
    throw new AppError("Nota não encontrada.", ERROR_CODES.NOT_FOUND, 404);
  }
}

/**
 * Registra/atualiza campos de proposta no lead. Emite evento de
 * timeline adequado ao "salto" feito (proposal_sent quando um preço
 * proposto aparece pela primeira vez, deal_won quando preco_fechado
 * aparece). Mantém update atômico via o repo.update padrão.
 */
async function updateLeadProposal({ leadId, corretoraId, actor, data }) {
  const current = await leadsRepo.findByIdForCorretora(leadId, corretoraId);
  if (!current) {
    throw new AppError("Lead não encontrado.", ERROR_CODES.NOT_FOUND, 404);
  }

  const patch = {};
  if (data.preco_proposto !== undefined) patch.preco_proposto = data.preco_proposto;
  if (data.preco_fechado !== undefined) patch.preco_fechado = data.preco_fechado;
  if (data.data_compra !== undefined) patch.data_compra = data.data_compra;
  if (data.destino_venda !== undefined) patch.destino_venda = data.destino_venda;

  const affected = await leadsRepo.update(leadId, corretoraId, patch);
  if (affected === 0) {
    throw new AppError(
      "Nada para atualizar.",
      ERROR_CODES.VALIDATION_ERROR,
      400,
    );
  }

  // Emissão de evento com granularidade:
  //   - preço proposto apareceu pela 1ª vez => proposal_sent
  //   - preço fechado apareceu pela 1ª vez => deal_won
  //   - alteração de proposto/fechado existente => proposal_updated
  // Fire-and-forget.
  let eventType = "proposal_updated";
  let title = "Proposta atualizada";
  if (data.preco_fechado != null && current.preco_fechado == null) {
    eventType = "deal_won";
    title = `Compra fechada${
      data.preco_fechado ? ` — R$ ${Number(data.preco_fechado).toFixed(2)}/sc` : ""
    }`;
  } else if (data.preco_proposto != null && current.preco_proposto == null) {
    eventType = "proposal_sent";
    title = `Proposta enviada — R$ ${Number(data.preco_proposto).toFixed(2)}/sc`;
  }

  eventsRepo
    .create({
      lead_id: leadId,
      corretora_id: corretoraId,
      actor_user_id: actor?.userId ?? null,
      actor_type: "corretora_user",
      event_type: eventType,
      title,
      meta: {
        preco_proposto: data.preco_proposto ?? null,
        preco_fechado: data.preco_fechado ?? null,
        data_compra: data.data_compra ?? null,
        destino_venda: data.destino_venda ?? null,
      },
    })
    .catch((err) =>
      logger.warn(
        { err, leadId, corretoraId },
        "corretora.lead.event_proposal_failed",
      ),
    );

  return leadsRepo.findByIdForCorretora(leadId, corretoraId);
}

/**
 * Fase 4 — snapshot operacional do dashboard. Agrega 3 blocos:
 *   - overdue: próximas ações vencidas (máx 10)
 *   - stale: leads parados > 48h sem primeira resposta (máx 10)
 *   - pipeline: valor em negociação + fechadas no mês
 * Paralelo, escopado por corretora.
 */
async function getDashboardRisks(corretoraId) {
  const [overdue, stale, pipeline] = await Promise.all([
    leadsRepo.listOverdueNextActions({ corretoraId }),
    leadsRepo.listStaleNewLeads({ corretoraId }),
    leadsRepo.getPipelineValue(corretoraId),
  ]);
  return { overdue, stale, pipeline };
}

async function updateLeadNextAction({ leadId, corretoraId, actor, data }) {
  const current = await leadsRepo.findByIdForCorretora(leadId, corretoraId);
  if (!current) {
    throw new AppError("Lead não encontrado.", ERROR_CODES.NOT_FOUND, 404);
  }

  const patch = {};
  if (data.next_action_text !== undefined) {
    patch.next_action_text = data.next_action_text;
  }
  if (data.next_action_at !== undefined) {
    patch.next_action_at = data.next_action_at;
  }
  if (Object.keys(patch).length === 0) {
    throw new AppError(
      "Informe ao menos um campo para atualizar.",
      ERROR_CODES.VALIDATION_ERROR,
      400,
    );
  }

  await leadsRepo.update(leadId, corretoraId, patch);

  eventsRepo
    .create({
      lead_id: leadId,
      corretora_id: corretoraId,
      actor_user_id: actor?.userId ?? null,
      actor_type: "corretora_user",
      event_type: "next_action_set",
      title: patch.next_action_text
        ? `Próxima ação: ${patch.next_action_text}`
        : "Próxima ação limpa",
      meta: {
        text: patch.next_action_text ?? null,
        due_at: patch.next_action_at ?? null,
      },
    })
    .catch((err) =>
      logger.warn(
        { err, leadId, corretoraId },
        "corretora.lead.event_next_action_failed",
      ),
    );

  return leadsRepo.findByIdForCorretora(leadId, corretoraId);
}

module.exports = {
  createLeadFromPublic,
  listLeadsForCorretora,
  getSummary,
  updateLead,
  getLeadDetail,
  getDashboardRisks,
  addLeadNote,
  deleteLeadNote,
  updateLeadProposal,
  updateLeadNextAction,
  confirmLoteVendidoFromPublic,
  getPublicLeadStatus,
  // Helpers exportados p/ uso em controller que precisa devolver o
  // token gerado (ex: dev/admin debug, no futuro uso real é gerar
  // do lado do email enviado ao produtor).
  generateLoteToken,
  generateStatusToken,
};
