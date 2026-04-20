// services/contratoSignerService.js
//
// Orquestrador da assinatura digital. Isola o contratoService da
// escolha do provedor (stub | clicksign) e traduz webhook em
// transição de status no contrato.
//
// Responsabilidades:
//   - enviarParaClickSign(contrato) — sobe PDF, cria envelope, salva IDs
//   - processarEventoWebhook(domainEvent) — aplica status_hint no contrato
//     e, quando `signed`, baixa o PDF carimbado para signed_pdf_url
"use strict";

const fs = require("fs/promises");
const crypto = require("crypto");
const path = require("path");

const AppError = require("../errors/AppError");
const ERROR_CODES = require("../constants/ErrorCodes");
const logger = require("../lib/logger");

const contratoRepo = require("../repositories/contratoRepository");
const leadsRepo = require("../repositories/corretoraLeadsRepository");
const publicCorretorasRepo = require("../repositories/corretorasPublicRepository");
const leadEventsRepo = require("../repositories/corretoraLeadEventsRepository");
const clicksignAdapter = require("./contratos/clicksignAdapter");

const STORAGE_ROOT = path.join(process.cwd(), "storage", "contratos");

function _sha256Hex(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

/**
 * Monta a lista de signatários a partir do lead + corretora.
 * Produtor precisa de email — se não tiver, erro explícito para a
 * corretora completar o cadastro antes de enviar.
 */
async function _buildSigners({ contrato, corretoraId }) {
  const lead = await leadsRepo.findByIdForCorretora(
    contrato.lead_id,
    corretoraId,
  );
  if (!lead) {
    throw new AppError(
      "Lead do contrato não encontrado.",
      ERROR_CODES.NOT_FOUND,
      404,
    );
  }
  if (!lead.email) {
    throw new AppError(
      "Produtor sem e-mail — cadastre o e-mail antes de enviar o contrato.",
      ERROR_CODES.VALIDATION_ERROR,
      400,
    );
  }

  const corretora = await publicCorretorasRepo.findById(corretoraId);
  if (!corretora?.email) {
    throw new AppError(
      "Corretora sem e-mail de responsável cadastrado.",
      ERROR_CODES.VALIDATION_ERROR,
      400,
    );
  }

  return [
    {
      name: corretora.contact_name || corretora.name,
      email: corretora.email,
      role: "corretora",
    },
    {
      name: lead.nome,
      email: lead.email,
      role: "produtor",
    },
  ];
}

async function _readDraftPdf(contrato) {
  const abs = path.resolve(process.cwd(), contrato.pdf_url);
  if (!abs.startsWith(STORAGE_ROOT)) {
    throw new AppError(
      "Caminho do contrato inválido.",
      ERROR_CODES.SERVER_ERROR,
      500,
    );
  }
  return fs.readFile(abs);
}

async function _persistSignedPdf({ contrato, signedBuffer }) {
  const dir = path.join(STORAGE_ROOT, String(contrato.corretora_id));
  await fs.mkdir(dir, { recursive: true });
  const filename = `${contrato.qr_verification_token}_signed.pdf`;
  const absPath = path.join(dir, filename);
  await fs.writeFile(absPath, signedBuffer);
  const relPath = path
    .relative(process.cwd(), absPath)
    .split(path.sep)
    .join("/");
  return relPath;
}

// ---------------------------------------------------------------------------
// API pública
// ---------------------------------------------------------------------------

/**
 * Envia contrato (já em draft com PDF no disco) para a ClickSign.
 * Persiste envelope_id, document_id e transita status → sent.
 * Chamado pelo contratoService.enviarParaAssinatura quando
 * CONTRATO_SIGNER_PROVIDER=clicksign.
 */
async function enviarParaClickSign({ contrato, actor }) {
  if (!clicksignAdapter.isConfigured()) {
    throw new AppError(
      "ClickSign não configurado — defina CLICKSIGN_API_TOKEN e CLICKSIGN_HMAC_SECRET.",
      ERROR_CODES.CONFLICT,
      409,
    );
  }

  const signers = await _buildSigners({
    contrato,
    corretoraId: contrato.corretora_id,
  });

  const pdfBuffer = await _readDraftPdf(contrato);
  const nomeEnvelope =
    contrato.data_fields?.__numero_externo || `Contrato-${contrato.id}`;

  let envelope;
  try {
    envelope = await clicksignAdapter.criarEnvelopeCompleto({
      nomeEnvelope,
      pdfBuffer,
      signers,
    });
  } catch (err) {
    logger.error(
      { err: err?.message, contratoId: contrato.id },
      "contrato.clicksign.envelope_failed",
    );
    throw new AppError(
      "Falha ao enviar contrato para ClickSign.",
      ERROR_CODES.SERVER_ERROR,
      502,
    );
  }

  await contratoRepo.updateStatus(contrato.id, "sent", {
    signer_provider: "clicksign",
    signer_envelope_id: envelope.envelopeId,
    signer_document_id: envelope.documentId,
    sent_at: new Date(),
  });

  await leadEventsRepo
    .create({
      lead_id: contrato.lead_id,
      corretora_id: contrato.corretora_id,
      actor_user_id: actor?.userId ?? null,
      actor_type: "corretora_user",
      event_type: "contract_sent",
      title: "Contrato enviado para assinatura (ClickSign)",
      meta: {
        contrato_id: contrato.id,
        provider: "clicksign",
        envelope_id: envelope.envelopeId,
        document_id: envelope.documentId,
      },
    })
    .catch((err) => {
      logger.warn(
        { err, contratoId: contrato.id },
        "contrato.event_create_failed",
      );
    });

  logger.info(
    {
      contratoId: contrato.id,
      envelopeId: envelope.envelopeId,
      documentId: envelope.documentId,
    },
    "contrato.clicksign.enviado",
  );

  return {
    id: contrato.id,
    status: "sent",
    signer_provider: "clicksign",
    envelope_id: envelope.envelopeId,
    document_id: envelope.documentId,
  };
}

/**
 * Aplica um domainEvent traduzido pelo adapter. Idempotente: se o
 * contrato já está no status alvo, apenas registra um log.
 *
 * Quando status alvo é "signed" e há document_id, baixa o PDF
 * assinado e persiste como artefato separado.
 */
async function processarEventoWebhook(domainEvent) {
  if (!domainEvent?.document_id) {
    logger.warn(
      { eventType: domainEvent?.event_type },
      "contrato.clicksign.webhook.no_document_id",
    );
    return { applied: false, reason: "no_document_id" };
  }

  const contrato = await contratoRepo.findBySignerDocumentId(
    domainEvent.document_id,
  );
  if (!contrato) {
    logger.warn(
      { documentId: domainEvent.document_id },
      "contrato.clicksign.webhook.contrato_not_found",
    );
    return { applied: false, reason: "contrato_not_found" };
  }

  if (!domainEvent.status_hint) {
    // Evento informativo (sign parcial, add_signer). Persistir já
    // foi feito em webhook_events — nada a transicionar.
    return { applied: true, reason: "no_transition" };
  }

  if (contrato.status === domainEvent.status_hint) {
    // Idempotência — ClickSign reenviou evento já aplicado.
    return { applied: true, reason: "already_at_target_status" };
  }

  const patch = {};
  let eventType;
  let title;

  if (domainEvent.status_hint === "signed") {
    patch.signed_at = new Date();
    eventType = "contract_signed";
    title = "Contrato assinado (ClickSign)";

    try {
      const signedBuffer = await clicksignAdapter.baixarPdfAssinado(
        domainEvent.document_id,
      );
      patch.signed_pdf_url = await _persistSignedPdf({
        contrato,
        signedBuffer,
      });
      patch.signed_hash_sha256 = _sha256Hex(signedBuffer);
    } catch (err) {
      // Não abortamos — o fato legal é a assinatura; o PDF pode ser
      // baixado depois por cron. Registramos o erro para reconciliação.
      logger.error(
        {
          err: err?.message ?? String(err),
          contratoId: contrato.id,
          documentId: domainEvent.document_id,
        },
        "contrato.clicksign.signed_pdf_download_failed",
      );
    }
  } else if (domainEvent.status_hint === "cancelled") {
    patch.cancelled_at = new Date();
    patch.cancel_reason = domainEvent.cancel_reason ?? "cancelado via ClickSign";
    eventType = "contract_cancelled";
    title = "Contrato cancelado (ClickSign)";
  } else if (domainEvent.status_hint === "expired") {
    eventType = "contract_expired";
    title = "Contrato expirado sem assinatura";
  }

  await contratoRepo.updateStatus(
    contrato.id,
    domainEvent.status_hint,
    patch,
  );

  await leadEventsRepo
    .create({
      lead_id: contrato.lead_id,
      corretora_id: contrato.corretora_id,
      actor_user_id: null,
      actor_type: "system",
      event_type: eventType,
      title,
      meta: {
        contrato_id: contrato.id,
        provider: "clicksign",
        document_id: domainEvent.document_id,
        occurred_at: domainEvent.occurred_at,
      },
    })
    .catch((err) => {
      logger.warn(
        { err, contratoId: contrato.id },
        "contrato.event_create_failed",
      );
    });

  logger.info(
    {
      contratoId: contrato.id,
      transition: `${contrato.status} → ${domainEvent.status_hint}`,
    },
    "contrato.clicksign.webhook.applied",
  );

  return { applied: true, reason: "transitioned", contrato_id: contrato.id };
}

module.exports = {
  enviarParaClickSign,
  processarEventoWebhook,
  // para teste
  _internals: { _sha256Hex },
};
