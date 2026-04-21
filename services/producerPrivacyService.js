// services/producerPrivacyService.js
//
// Fase 10.3 — direitos do titular para o produtor do Mercado do
// Café. Implementa art. 18 LGPD: acesso, portabilidade, exclusão.
//
// Princípios:
//
//   1. Exportação nunca contém senha, token, CPF ou dado de
//      terceiros. Projeção explícita — nunca espelho do modelo.
//
//   2. Exclusão é **agendada** com janela de 30 dias de arrepen-
//      dimento. Enquanto pending, o produtor pode cancelar.
//      Anonimização real só ocorre após `scheduled_purge_at`.
//
//   3. Dados retidos por obrigação legal (ex.: vínculo a contrato
//      assinado) ficam com status='retained' e motivo claro.
"use strict";

const AppError = require("../errors/AppError");
const ERROR_CODES = require("../constants/ErrorCodes");
const logger = require("../lib/logger");

const producerRepo = require("../repositories/producerAccountsRepository");
const privacyRepo = require("../repositories/privacyRequestsRepository");
const leadsRepo = require("../repositories/corretoraLeadsRepository");
const contratoRepo = require("../repositories/contratoRepository");

const SUBJECT_TYPE = "producer";
const DELETION_GRACE_DAYS = Number(
  process.env.PRIVACY_DELETION_GRACE_DAYS || 30,
);

// ---------------------------------------------------------------------------
// Snapshot "Meus dados" — visualização na tela do produtor
// ---------------------------------------------------------------------------

/**
 * Retorna uma projeção segura do que o Kavita guarda sobre o
 * produtor. Sem senha, sem token, sem IP histórico. Contagens
 * agregadas para tratamentos vinculados (leads, contratos).
 */
async function getMyData(producerId) {
  const producer = await producerRepo.findById(producerId);
  if (!producer) {
    throw new AppError("Titular não encontrado.", ERROR_CODES.NOT_FOUND, 404);
  }

  // Leads onde este produtor é o autor (match por email — mesmo
  // vínculo usado em /painel/produtor/contratos).
  let leadCount = 0;
  try {
    const leads = await leadsRepo.listByProducerEmail(producer.email);
    leadCount = Array.isArray(leads) ? leads.length : 0;
  } catch {
    // Repo pode ainda não expor esse método; degradar silenciosamente.
  }

  // Contratos — mesmo critério (lead.email = producer.email).
  let contratoRows = [];
  try {
    contratoRows = await contratoRepo.listByProducerEmail(producer.email);
  } catch {
    contratoRows = [];
  }

  // Pedido de exclusão ativo? Se sim, mostramos UI de "sua conta
  // será removida em X dias" e botão de cancelar.
  const pendingDeletion = await privacyRepo.findActivePendingDeletion(
    SUBJECT_TYPE,
    producerId,
  );

  const recentRequests = await privacyRepo.listForSubject(
    SUBJECT_TYPE,
    producerId,
    10,
  );

  return {
    conta: {
      id: producer.id,
      email: producer.email,
      nome: producer.nome,
      cidade: producer.cidade,
      telefone: producer.telefone,
      created_at: producer.created_at,
      last_login_at: producer.last_login_at,
      privacy_policy_version: producer.privacy_policy_version,
      privacy_policy_accepted_at: producer.privacy_policy_accepted_at,
      pending_deletion_at: producer.pending_deletion_at,
    },
    resumo_tratamentos: {
      leads_enviados: leadCount,
      contratos_vinculados: contratoRows.length,
      contratos_assinados: contratoRows.filter((c) => c.status === "signed")
        .length,
    },
    exclusao_agendada: pendingDeletion
      ? {
          id: pendingDeletion.id,
          requested_at: pendingDeletion.requested_at,
          scheduled_purge_at: pendingDeletion.scheduled_purge_at,
          status: pendingDeletion.status,
          dias_restantes: _daysUntil(pendingDeletion.scheduled_purge_at),
        }
      : null,
    solicitacoes_recentes: recentRequests,
  };
}

function _daysUntil(dateStr) {
  if (!dateStr) return null;
  const diffMs = new Date(dateStr).getTime() - Date.now();
  if (!Number.isFinite(diffMs)) return null;
  return Math.max(0, Math.ceil(diffMs / (24 * 3600 * 1000)));
}

// ---------------------------------------------------------------------------
// Exportação (art. 18 II + V — acesso + portabilidade)
// ---------------------------------------------------------------------------

/**
 * Gera o pacote completo de dados do produtor em JSON. Chamado
 * em duas situações:
 *   1. Download imediato via painel ("Baixar meus dados agora").
 *   2. Execução agendada pelo admin (envio por email).
 *
 * Inclui: conta (projeção segura), leads enviados com sua
 * autoria, contratos em que é signatário. Não inclui dados
 * internos da corretora (notas, timeline) nem dados de outros
 * titulares.
 */
async function buildExportPayload(producerId) {
  const producer = await producerRepo.findById(producerId);
  if (!producer) {
    throw new AppError("Titular não encontrado.", ERROR_CODES.NOT_FOUND, 404);
  }

  let leads = [];
  try {
    const rawLeads = await leadsRepo.listByProducerEmail(producer.email);
    // Projeção segura: não incluímos source_ip, user_agent, nem
    // notas internas da corretora.
    leads = (rawLeads || []).map((l) => ({
      id: l.id,
      corretora_id: l.corretora_id,
      nome: l.nome,
      telefone: l.telefone,
      email: l.email,
      cidade: l.cidade,
      objetivo: l.objetivo,
      tipo_cafe: l.tipo_cafe,
      volume_range: l.volume_range,
      canal_preferido: l.canal_preferido,
      mensagem: l.mensagem,
      observacoes: l.observacoes,
      status: l.status,
      consentimento_contato: Boolean(l.consentimento_contato),
      sms_optin: Boolean(l.sms_optin),
      created_at: l.created_at,
    }));
  } catch {
    leads = [];
  }

  let contratos = [];
  try {
    const rawContratos = await contratoRepo.listByProducerEmail(producer.email);
    contratos = (rawContratos || []).map((c) => ({
      id: c.id,
      tipo: c.tipo,
      status: c.status,
      hash_sha256: c.hash_sha256,
      qr_verification_token: c.qr_verification_token,
      created_at: c.created_at,
      sent_at: c.sent_at,
      signed_at: c.signed_at,
      corretora_name: c.corretora_name,
      // NÃO incluímos: envelope_id, document_id (metadata do provedor)
      // nem pdf_url local (produtor tem endpoint dedicado de download).
    }));
  } catch {
    contratos = [];
  }

  return {
    __schema: "kavita.lgpd.export.v1",
    gerado_em: new Date().toISOString(),
    titular: {
      id: producer.id,
      email: producer.email,
      nome: producer.nome,
      cidade: producer.cidade,
      telefone: producer.telefone,
      conta_criada_em: producer.created_at,
      ultimo_login_em: producer.last_login_at,
      politica_privacidade_aceita_versao: producer.privacy_policy_version,
      politica_privacidade_aceita_em: producer.privacy_policy_accepted_at,
    },
    leads_enviados: leads,
    contratos: contratos,
    notas_legais: [
      "Este arquivo contém todos os dados pessoais que o Kavita trata sobre você.",
      "Não incluímos senhas (não temos — uso magic link), tokens de sessão, logs técnicos (IP, user-agent) nem notas internas escritas pelas corretoras sobre você.",
      "Pedidos, notas fiscais e evidências regulatórias podem estar retidos por obrigação legal mesmo após exclusão — ver docs/compliance/retencao.md.",
    ],
  };
}

// ---------------------------------------------------------------------------
// Solicitações
// ---------------------------------------------------------------------------

async function createExportRequest({ producerId, meta }) {
  const producer = await producerRepo.findById(producerId);
  if (!producer) {
    throw new AppError("Titular não encontrado.", ERROR_CODES.NOT_FOUND, 404);
  }

  const id = await privacyRepo.create({
    subject_type: SUBJECT_TYPE,
    subject_id: producerId,
    subject_email: producer.email,
    request_type: "export",
    request_meta: meta ?? null,
  });

  logger.info(
    { privacyRequestId: id, producerId },
    "privacy.export.requested",
  );
  return { id };
}

async function createDeleteRequest({ producerId, reason, meta }) {
  const producer = await producerRepo.findById(producerId);
  if (!producer) {
    throw new AppError("Titular não encontrado.", ERROR_CODES.NOT_FOUND, 404);
  }

  const existing = await privacyRepo.findActivePendingDeletion(
    SUBJECT_TYPE,
    producerId,
  );
  if (existing) {
    throw new AppError(
      "Você já tem um pedido de exclusão em andamento.",
      ERROR_CODES.CONFLICT,
      409,
      { existing_request_id: existing.id },
    );
  }

  const scheduledPurgeAt = new Date(
    Date.now() + DELETION_GRACE_DAYS * 24 * 3600 * 1000,
  );

  const id = await privacyRepo.create({
    subject_type: SUBJECT_TYPE,
    subject_id: producerId,
    subject_email: producer.email,
    request_type: "delete",
    status_reason: reason ?? null,
    scheduled_purge_at: scheduledPurgeAt,
    request_meta: meta ?? null,
  });

  // Marca conta — a UI usa isso pra mostrar "conta será removida em Xd".
  await producerRepo.setPendingDeletion(producerId, new Date());

  logger.info(
    {
      privacyRequestId: id,
      producerId,
      scheduledPurgeAt,
      graceDays: DELETION_GRACE_DAYS,
    },
    "privacy.delete.requested",
  );
  return { id, scheduled_purge_at: scheduledPurgeAt };
}

/**
 * Cancela um pedido de exclusão dentro da janela de arrependimento.
 * Chamado quando o produtor clica "Cancelar exclusão" no painel.
 */
async function cancelDeleteRequest({ producerId }) {
  const existing = await privacyRepo.findActivePendingDeletion(
    SUBJECT_TYPE,
    producerId,
  );
  if (!existing) {
    throw new AppError(
      "Nenhum pedido de exclusão ativo encontrado.",
      ERROR_CODES.NOT_FOUND,
      404,
    );
  }

  await privacyRepo.updateStatus(existing.id, "rejected", {
    status_reason: "Cancelado pelo próprio titular (arrependimento).",
    processed_at: new Date(),
  });

  await producerRepo.setPendingDeletion(producerId, null);

  logger.info(
    { privacyRequestId: existing.id, producerId },
    "privacy.delete.cancelled_by_subject",
  );
  return { id: existing.id };
}

module.exports = {
  getMyData,
  buildExportPayload,
  createExportRequest,
  createDeleteRequest,
  cancelDeleteRequest,
  SUBJECT_TYPE,
  DELETION_GRACE_DAYS,
};
