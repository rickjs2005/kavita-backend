"use strict";

// controllers/publicLegalController.js
//
// Endpoint público que devolve as versões correntes dos termos legais.
// Frontend chama isto antes de submeter formulários com aceite, embute
// a versão como hidden field, e o backend valida no schema (matching
// versão atual). Isso garante que o titular aceita exatamente a versão
// que o servidor está cobrando, mesmo se a aba do cliente esteve
// aberta enquanto deploy alterou os termos.

const { response } = require("../lib");
const {
  TERMS_VERSION,
  PRIVACY_VERSION,
  TERMS_URL,
  PRIVACY_URL,
} = require("../lib/legal/versions");

async function getVersions(_req, res) {
  return response.ok(res, {
    terms: { version: TERMS_VERSION, url: TERMS_URL },
    privacy: { version: PRIVACY_VERSION, url: PRIVACY_URL },
  });
}

module.exports = { getVersions };
