"use strict";
// templates/email/pedidoEnviado.js
// Template de e-mail: pedido enviado para entrega.
// Consumidor: routes/admin/_legacy/adminComunicacao.js → buildEmailFromTemplate

/**
 * @param {{ id, usuario_nome, status_entrega }} pedido
 * @returns {{ subject: string, html: string }}
 */
module.exports = function pedidoEnviadoEmail(pedido) {
  return {
    subject: `Kavita - Seu pedido #${pedido.id} foi enviado`,
    html: `
          <p>Olá ${pedido.usuario_nome},</p>
          <p>O seu pedido <strong>#${pedido.id}</strong> já foi <strong>enviado</strong> 🚚.</p>
          <p>Status de entrega atual: <strong>${pedido.status_entrega}</strong></p>
          <p>Em breve ele chega até você.</p>
          <p>Equipe Kavita</p>
        `,
  };
};
