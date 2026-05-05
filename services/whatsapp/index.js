"use strict";
// services/whatsapp/index.js
//
// Facade do envio de WhatsApp. Resolve qual adapter usar via env
// var WHATSAPP_PROVIDER. Reutilizado pelo modulo Pedidos
// (comunicacaoService) e pelo modulo Motorista (magic-link).
//
// O whatsappService novo da corretora (Etapa 3 da reativacao) NAO
// usa este facade — chama o adapter diretamente para preservar a
// semantica do status (queued_stub) na tabela whatsapp_messages.
//
// Adapters:
//   - manual: gera link wa.me e retorna pra admin clicar
//             (default — funciona sem credencial nenhuma)
//   - api:    integração WhatsApp Business Cloud (B3 — implementação real)
//   - stub:   simulado (Etapa 3 da reativacao). Nao envia, nao gera
//             link wa.me. Aqui no facade legado, o status retornado
//             e' "manual_pending" para preservar o contrato dos
//             callers historicos (comunicacaoService espera apenas
//             "sent" | "manual_pending" | "error").
//
// API pública:
//   sendWhatsapp({ telefone, mensagem, options? }) → Promise<SendResult>
//   buildWaMeLink({ telefone, mensagem }) → string|null
//   normalizePhoneBR(raw) → string|null
//   getProvider() → "manual" | "api" | "stub"
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
const stubAdapter = require("./adapters/stub");
const { normalizePhoneBR, buildWaMeLink } = require("../../lib/waLink");

function getProvider() {
  const v = String(process.env.WHATSAPP_PROVIDER || "manual").toLowerCase();
  if (v === "api") return "api";
  if (v === "stub") return "stub";
  return "manual";
}

function getAdapter() {
  const p = getProvider();
  if (p === "api") return apiAdapter;
  if (p === "stub") return stubAdapter;
  return manualAdapter;
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
  const result = await adapter.send({ destino, mensagem, options });

  // Compat com callers historicos (comunicacaoService trata apenas
  // sent | manual_pending | error). Quando o adapter stub retorna
  // queued_stub, o facade traduz para manual_pending — modulo
  // Pedidos registra como "envio simulado pendente" sem quebrar a
  // FSM existente.
  if (result.status === "queued_stub") {
    return { ...result, status: "manual_pending" };
  }
  return result;
}

module.exports = {
  sendWhatsapp,
  buildWaMeLink,
  normalizePhoneBR,
  getProvider,
};
