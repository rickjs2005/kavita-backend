"use strict";
// services/whatsapp/templateMap.js
//
// B3 — mapeamento de evento de comunicação → template aprovado da Meta.
//
// Decisão de produto (2026-04-25):
//   - APENAS UTILITY de pedidos entra na ativação inicial.
//   - Carrinho abandonado (MARKETING) continua em modo manual até
//     aprovação dedicada da Meta + opt-in do cliente.
//
// Como funciona:
//   - Cada evento aponta para 1 nome de template (configurável via env).
//   - Sem env setada → função retorna null → caller (comunicacaoService)
//     manda texto livre via adapter api. Texto livre só funciona dentro
//     da janela de 24h e a Meta rejeita fora dela. Por isso, ATIVAR
//     templates é obrigatório antes de mudar WHATSAPP_PROVIDER=api.
//
// Convenção dos templates (cabeçalho/body que você submete na Meta):
//
//   pedido_recebido_v1 (UTILITY):
//     Body: "Olá {{1}}! Recebemos seu pedido #{{2}} no valor de R$ {{3}}.
//            Assim que o pagamento for confirmado, começamos a separar."
//     Params: [firstName, pedidoId, totalFormatadoBR]
//
//   pedido_pago_v1 (UTILITY):
//     Body: "Olá {{1}}! O pagamento do pedido #{{2}} foi confirmado.
//            Nossa equipe já começou a separar."
//     Params: [firstName, pedidoId]
//
//   pedido_em_separacao_v1 (UTILITY):
//     Body: "Olá {{1}}! Seu pedido #{{2}} está sendo separado pela
//            nossa equipe."
//     Params: [firstName, pedidoId]
//
//   pedido_enviado_v1 (UTILITY):
//     Body: "Olá {{1}}! Seu pedido #{{2}} saiu pra entrega. Em breve
//            chega na sua propriedade."
//     Params: [firstName, pedidoId]
//
//   pedido_entregue_v1 (UTILITY):
//     Body: "Olá {{1}}! O pedido #{{2}} consta como entregue. Se tiver
//            qualquer problema, fale com a gente."
//     Params: [firstName, pedidoId]
//
//   pedido_cancelado_v1 (UTILITY):
//     Body: "Olá {{1}}. Seu pedido #{{2}} foi cancelado. Estamos por
//            aqui pra ajudar."
//     Params: [firstName, pedidoId]
//
// Linguagem default: pt_BR.

/**
 * Helpers para extrair os parâmetros do pedido na ordem que cada
 * template espera. Determinístico (mesmo pedido → mesmos params).
 */
function firstNameOf(usuarioNome) {
  return String(usuarioNome || "").trim().split(/\s+/)[0] || "amigo(a)";
}

function formatTotalBR(total) {
  const n = Number(total ?? 0);
  if (Number.isNaN(n)) return "0,00";
  return n.toFixed(2).replace(".", ",");
}

/**
 * Mapeamento estático evento → (env var + função extratora de params).
 *
 * Eventos NÃO listados aqui (ex: ocorrencia_*, MARKETING de carrinho)
 * NÃO terão template — caller deve mandar texto livre ou cair em
 * fallback manual.
 */
const EVENT_TEMPLATES = {
  pedido_criado: {
    envVar: "WHATSAPP_TEMPLATE_PEDIDO_CRIADO",
    paramsFromPedido: (p) => [
      firstNameOf(p.usuario_nome),
      String(p.id),
      formatTotalBR(p.total),
    ],
  },
  pagamento_aprovado: {
    envVar: "WHATSAPP_TEMPLATE_PAGAMENTO_APROVADO",
    paramsFromPedido: (p) => [firstNameOf(p.usuario_nome), String(p.id)],
  },
  pedido_em_separacao: {
    envVar: "WHATSAPP_TEMPLATE_PEDIDO_EM_SEPARACAO",
    paramsFromPedido: (p) => [firstNameOf(p.usuario_nome), String(p.id)],
  },
  pedido_enviado: {
    envVar: "WHATSAPP_TEMPLATE_PEDIDO_ENVIADO",
    paramsFromPedido: (p) => [firstNameOf(p.usuario_nome), String(p.id)],
  },
  pedido_entregue: {
    envVar: "WHATSAPP_TEMPLATE_PEDIDO_ENTREGUE",
    paramsFromPedido: (p) => [firstNameOf(p.usuario_nome), String(p.id)],
  },
  pedido_cancelado: {
    envVar: "WHATSAPP_TEMPLATE_PEDIDO_CANCELADO",
    paramsFromPedido: (p) => [firstNameOf(p.usuario_nome), String(p.id)],
  },
};

/**
 * Resolve template aprovado para um evento + pedido.
 *
 * Retorna `{ templateId, templateLang, templateParams }` se a env var
 * correspondente estiver setada; caso contrário retorna null
 * (caller decide enviar como texto livre ou pular).
 *
 * @param {string} tipoEvento  ex: "pedido_criado"
 * @param {object} pedido      payload do repo.getPedidoBasico
 * @returns {{ templateId: string, templateLang: string, templateParams: string[] } | null}
 */
function resolveTemplateForEvent(tipoEvento, pedido) {
  const cfg = EVENT_TEMPLATES[tipoEvento];
  if (!cfg) return null;

  const templateId = process.env[cfg.envVar];
  if (!templateId) return null;

  return {
    templateId,
    templateLang: process.env.WHATSAPP_TEMPLATE_LANG || "pt_BR",
    templateParams: cfg.paramsFromPedido(pedido),
  };
}

/**
 * Lista de eventos cobertos pelo mapa (útil pra docs/admin painel).
 */
function listSupportedEvents() {
  return Object.keys(EVENT_TEMPLATES);
}

module.exports = {
  resolveTemplateForEvent,
  listSupportedEvents,
};
