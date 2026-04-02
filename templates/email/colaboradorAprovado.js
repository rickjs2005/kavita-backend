"use strict";
// templates/email/colaboradorAprovado.js
// Template de e-mail: notificação de aprovação de cadastro de colaborador.
// Consumidor: services/colaboradoresAdminService.js → verify()

/**
 * @param {{ nome: string }} colaborador
 * @returns {{ subject: string, html: string }}
 */
module.exports = function colaboradorAprovadoEmail({ nome }) {
  return {
    subject: "Kavita - Seu cadastro foi aprovado!",
    html: `
      <p>Olá ${nome},</p>
      <p>Seu cadastro na Kavita foi <strong>aprovado</strong>! 🎉</p>
      <p>Você já está disponível para receber solicitações de serviço pela plataforma.</p>
      <p>Equipe Kavita</p>
    `,
  };
};
