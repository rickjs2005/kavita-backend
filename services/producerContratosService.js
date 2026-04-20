// services/producerContratosService.js
//
// Regras de negócio dos endpoints de contratos do painel do produtor
// (Fase 10.1 - PR 4). Traduz linhas cruas do repositório em projeção
// amigável para o frontend, sem vazar metadata interna do contrato.
"use strict";

const path = require("path");

const AppError = require("../errors/AppError");
const ERROR_CODES = require("../constants/ErrorCodes");
const contratoRepo = require("../repositories/contratoRepository");

const STORAGE_ROOT = path.join(process.cwd(), "storage", "contratos");

/**
 * Converte linha do repo em payload de frontend. Expõe apenas o
 * essencial — produtor não precisa ver IDs de envelope/provider,
 * nem pdf_url local (acessa via endpoint autenticado).
 */
function _project(row) {
  const df = row.data_fields || {};
  return {
    id: row.id,
    tipo: row.tipo,
    status: row.status,
    hash_sha256: row.hash_sha256,
    qr_verification_token: row.qr_verification_token,
    has_signed_pdf: Boolean(row.has_signed_pdf),
    created_at: row.created_at,
    sent_at: row.sent_at,
    signed_at: row.signed_at,
    cancelled_at: row.cancelled_at,
    cancel_reason: row.cancel_reason,
    corretora: {
      id: row.corretora_id,
      name: row.corretora_name,
      slug: row.corretora_slug,
      logo_path: row.corretora_logo ?? null,
    },
    resumo: {
      safra: df.safra ?? df.safra_futura ?? null,
      quantidade_sacas: df.quantidade_sacas ?? null,
      bebida_laudo: df.bebida_laudo ?? null,
      nome_armazem_ou_fazenda: df.nome_armazem_ou_fazenda ?? null,
    },
  };
}

async function listForProducer(producerEmail) {
  const rows = await contratoRepo.listByProducerEmail(producerEmail);
  return rows.map(_project);
}

/**
 * Retorna path absoluto do PDF (signed quando disponível, senão
 * draft). Escopado pelo email da sessão — IDOR-safe.
 *
 * `variant`:
 *   - "auto" (default) → signed se existir, caso contrário draft
 *   - "signed" → só signed_pdf_url; erro se não existir
 *   - "draft" → sempre o PDF original gerado
 */
async function getPdfPathForProducer({ id, producerEmail, variant = "auto" }) {
  const contrato = await contratoRepo.findByIdForProducer(id, producerEmail);
  if (!contrato) {
    throw new AppError(
      "Contrato não encontrado.",
      ERROR_CODES.NOT_FOUND,
      404,
    );
  }

  let relPath;
  if (variant === "signed") {
    if (!contrato.signed_pdf_url) {
      throw new AppError(
        "Versão assinada ainda não disponível.",
        ERROR_CODES.NOT_FOUND,
        404,
      );
    }
    relPath = contrato.signed_pdf_url;
  } else if (variant === "draft") {
    relPath = contrato.pdf_url;
  } else {
    relPath = contrato.signed_pdf_url || contrato.pdf_url;
  }

  const abs = path.resolve(process.cwd(), relPath);
  // Defesa em profundidade contra path-traversal (mesmo padrão do
  // endpoint da corretora).
  if (!abs.startsWith(STORAGE_ROOT)) {
    throw new AppError(
      "Caminho de contrato inválido.",
      ERROR_CODES.SERVER_ERROR,
      500,
    );
  }
  return { absPath: abs, contrato };
}

module.exports = {
  listForProducer,
  getPdfPathForProducer,
};
