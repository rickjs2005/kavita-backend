"use strict";
// services/whatsapp/index.js
//
// Facade do envio de WhatsApp. Resolve qual adapter usar (manual ou
// API oficial) via env var WHATSAPP_PROVIDER.
//
// Adapters:
//   - manual: gera link wa.me e retorna pra admin clicar
//             (default — funciona sem credencial nenhuma)
//   - api:    integração WhatsApp Business Cloud (B3 — implementação real)
//
// API pública:
//   sendWhatsapp({ telefone, mensagem, options? }) → Promise<SendResult>
//   buildWaMeLink({ telefone, mensagem }) → string|null
//   normalizePhoneBR(raw) → string|null
//   getProvider() → "manual" | "api"
//
// options (opcional, usado SÓ pelo adapter api):
//   {
//     templateId?:    string,         // nome do template aprovado pela Meta
//     templateLang?:  string,         // default "pt_BR"
//     templateParams?: string[],      // params do body em ordem
//   }
//
//   Sem templateId, adapter api manda texto livre (só funciona dentro
//   da janela de 24h após cliente responder — fora disso Meta rejeita).
//
// SendResult:
//   {
//     provider: "manual" | "api",
//     status: "sent" | "manual_pending" | "error",
//     url:     string | null,    // wa.me link (sempre presente em manual)
//     destino: string,           // telefone normalizado E.164 sem "+"
//     mensagem: string,
//     erro:    string | null,
//     messageId?: string,        // (api only) id retornado pela Meta
//   }
//
// O service NÃO loga em comunicacoes_enviadas — quem chama (comunicacaoService)
// é responsável pelo log. Aqui só envia.

const manualAdapter = require("./adapters/manual");
const apiAdapter = require("./adapters/api");
const { normalizePhoneBR, buildWaMeLink } = require("../../lib/waLink");

function getProvider() {
  const v = String(process.env.WHATSAPP_PROVIDER || "manual").toLowerCase();
  return v === "api" ? "api" : "manual";
}

function getAdapter() {
  return getProvider() === "api" ? apiAdapter : manualAdapter;
}

/**
 * Envia (ou prepara) uma mensagem de WhatsApp.
 *
 * Modo manual (default): NÃO envia mensagem real. Retorna link wa.me
 * e marca status como "manual_pending". `options` é ignorado.
 *
 * Modo api: chama Meta Cloud API. Se `options.templateId` presente,
 * envia template aprovado (recomendado fora da janela 24h). Senão,
 * envia texto livre (limitado a janela 24h pela Meta).
 */
async function sendWhatsapp({ telefone, mensagem, options = {} } = {}) {
  const destino = normalizePhoneBR(telefone);
  if (!destino) {
    return {
      provider: getProvider(),
      status: "error",
      url: null,
      destino: "",
      mensagem,
      erro: "Telefone inválido ou ausente.",
    };
  }
  const adapter = getAdapter();
  return adapter.send({ destino, mensagem, options });
}

module.exports = {
  sendWhatsapp,
  buildWaMeLink,
  normalizePhoneBR,
  getProvider,
};
