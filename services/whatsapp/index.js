"use strict";
// services/whatsapp/index.js
//
// Facade do envio de WhatsApp. Resolve qual adapter usar (manual ou
// API oficial) via env var WHATSAPP_PROVIDER.
//
// Adapters:
//   - manual: gera link wa.me e retorna pra admin clicar
//             (default — funciona sem credencial nenhuma)
//   - api:    integração WhatsApp Business Cloud (placeholder hoje)
//
// API pública:
//   sendWhatsapp({ telefone, mensagem }) → Promise<SendResult>
//   buildWaMeLink({ telefone, mensagem }) → string|null
//   normalizePhoneBR(raw) → string|null
//   getProvider() → "manual" | "api"
//
// SendResult:
//   {
//     provider: "manual" | "api",
//     status: "sent" | "manual_pending" | "error",
//     url:     string | null,    // wa.me link (sempre presente em manual)
//     destino: string,           // telefone normalizado E.164 sem "+"
//     mensagem: string,          // texto efetivamente enviado
//     erro:    string | null
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
 * e marca status como "manual_pending" — o painel admin mostra o link
 * pro operador clicar e enviar pelo próprio aplicativo.
 *
 * Modo api: chama WhatsApp Business Cloud (não implementado ainda;
 * lança no try/catch do adapter retornando status="error").
 */
async function sendWhatsapp({ telefone, mensagem }) {
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
  return adapter.send({ destino, mensagem });
}

module.exports = {
  sendWhatsapp,
  buildWaMeLink,
  normalizePhoneBR,
  getProvider,
};
