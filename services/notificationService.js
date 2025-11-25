// services/notificationService.js
require("dotenv").config();

/**
 * Serviço responsável por ENVIAR as notificações.
 *
 * ✅ Ideia:
 * - Aqui você pluga Twilio, Z-API, Gupshup, SMTP, SendGrid, SES, etc.
 * - Por enquanto, vamos só fazer console.log (modo MOCK).
 *
 * Controle:
 * - Se DISABLE_NOTIFICATIONS = "true" no .env,
 *   ele NÃO chama nenhum provedor real, só loga.
 */

const USE_MOCK = process.env.DISABLE_NOTIFICATIONS === "true";

/**
 * Envia mensagem de carrinho abandonado por WhatsApp
 * @param {Object} payload
 * @param {Object} payload.usuario
 * @param {Object} payload.carrinho
 * @param {Array}  payload.itens
 */
async function sendAbandonedCartWhatsApp({ usuario, carrinho, itens }) {
  if (USE_MOCK) {
    console.log("[MOCK] WhatsApp carrinho abandonado", {
      usuario,
      carrinho,
      itensCount: itens.length,
    });
    return;
  }

  // 👉 Aqui entra a integração real com API de WhatsApp
  console.log("[WhatsApp] Enviando mensagem de carrinho abandonado para:", {
    telefone: usuario.telefone,
    nome: usuario.nome,
    carrinho_id: carrinho.id,
    total_estimado: carrinho.total_estimado,
  });

  // Exemplo de mensagem (para usar depois na API real):
  // const msg = `Olá ${usuario.nome}, você deixou alguns produtos no carrinho na Kavita. Quer concluir sua compra?`;
}

/**
 * Envia e-mail de carrinho abandonado
 * @param {Object} payload
 * @param {Object} payload.usuario
 * @param {Object} payload.carrinho
 * @param {Array}  payload.itens
 */
async function sendAbandonedCartEmail({ usuario, carrinho, itens }) {
  if (USE_MOCK) {
    console.log("[MOCK] E-mail carrinho abandonado", {
      usuario,
      carrinho,
      itensCount: itens.length,
    });
    return;
  }

  // 👉 Aqui entra seu provedor de e-mail (SMTP, SendGrid, SES…)
  console.log("[Email] Enviando e-mail de carrinho abandonado para:", {
    email: usuario.email,
    nome: usuario.nome,
    carrinho_id: carrinho.id,
    total_estimado: carrinho.total_estimado,
  });
}

module.exports = {
  sendAbandonedCartWhatsApp,
  sendAbandonedCartEmail,
};
