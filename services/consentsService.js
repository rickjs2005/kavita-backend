"use strict";

// services/consentsService.js
//
// Camada de aplicação para registro de aceite LGPD.
// Wrapper sobre `consentsRepository.recordConsent` que:
//   1. Aplica as versões correntes dos termos (lib/legal/versions.js).
//   2. Extrai ip e user-agent do request automaticamente.
//   3. Tolera falha de gravação (best-effort) — NÃO bloqueia o cadastro
//      por causa de erro no log de consent. Em caso de erro, registra
//      WARN no logger; o titular não fica preso por causa de bug em
//      log de auditoria. (A coleta de consent permanece via checkbox
//      obrigatório no frontend + validação Zod no schema.)

const consentsRepo = require("../repositories/consentsRepository");
const {
  TERMS_VERSION,
  PRIVACY_VERSION,
  SOURCES,
} = require("../lib/legal/versions");
const logger = require("../lib/logger");

/**
 * Registra um aceite de termos para um titular.
 *
 * @param {import("express").Request} req — usado p/ extrair ip + user-agent
 * @param {object} args
 * @param {"user"|"corretora"|"corretora_lead"|"drone_lead"} args.subject_type
 * @param {number|null} [args.subject_id]
 * @param {string|null} [args.subject_email]
 * @param {string} args.source — uma das chaves de SOURCES
 * @param {string} [args.terms_version] — override (se quiser registrar versão antiga)
 * @param {string} [args.privacy_version]
 * @returns {Promise<number|null>} id do registro, ou null se falhou
 */
async function record(req, {
  subject_type,
  subject_id = null,
  subject_email = null,
  source,
  terms_version = TERMS_VERSION,
  privacy_version = PRIVACY_VERSION,
}) {
  try {
    const ip = req?.ip || null;
    const user_agent = req?.get?.("user-agent") || null;

    const id = await consentsRepo.recordConsent({
      subject_type,
      subject_id,
      subject_email,
      terms_version,
      privacy_version,
      source,
      ip,
      user_agent,
    });

    logger.info(
      {
        consent_id: id,
        subject_type,
        subject_id,
        source,
        terms_version,
        privacy_version,
      },
      "consent.recorded",
    );

    return id;
  } catch (err) {
    // Não rethrow — registro de consent é best-effort. O dado de aceite
    // ainda está implícito no checkbox obrigatório da requisição;
    // o log forense é desejável mas não pode quebrar o cadastro.
    logger.warn({ err, subject_type, source }, "consent.record_failed");
    return null;
  }
}

module.exports = {
  record,
  // Re-export pra controllers/rotas usarem nos schemas / responses
  TERMS_VERSION,
  PRIVACY_VERSION,
  SOURCES,
};
