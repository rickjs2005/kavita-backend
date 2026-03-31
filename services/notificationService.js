// services/notificationService.js
//
// ⚠️  STUB — NÃO É UMA INTEGRAÇÃO REAL
//
// Este arquivo é um placeholder estrutural criado para reservar o contrato
// das funções de notificação (WhatsApp, e-mail de carrinho abandonado).
// Nenhuma das funções aqui envia mensagem de verdade: ambas só fazem
// console.log, independente do valor de DISABLE_NOTIFICATIONS.
//
// Estado atual (2026-03):
//   - Nenhum provedor real está integrado (sem Twilio, Z-API, SendGrid, etc.)
//   - Este arquivo NÃO é importado por nenhum módulo do projeto.
//     O worker de carrinho abandonado (workers/abandonedCartNotificationsWorker.js)
//     usa mailService.js diretamente para e-mail.
//   - sendAbandonedCartEmail() é redundante com mailService.sendTransactionalEmail().
//
// TODO (quando for implementar):
//   1. Decidir o provedor de WhatsApp (Twilio, Z-API, Gupshup…)
//   2. Implementar sendAbandonedCartWhatsApp() com a SDK escolhida
//   3. Avaliar se sendAbandonedCartEmail() deve delegar a mailService ou ser removida
//   4. Importar este serviço no worker e/ou nos controllers relevantes
//   5. Escrever testes de integração com o provedor escolhido
//
require("dotenv").config();

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
