"use strict";
// templates/email/confirmacaoContato.js
// Template de e-mail: confirmacao de recebimento de mensagem de contato.
// Consumidor: services/contatoService.js → createMensagem()

/**
 * @param {{ nome: string, assunto: string }} data
 * @returns {{ subject: string, html: string, text: string }}
 */
module.exports = function confirmacaoContatoEmail({ nome, assunto }) {
  const subject = "Kavita - Recebemos sua mensagem";

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; color: #1f2937;">
      <div style="background: linear-gradient(135deg, #083E46, #359293); padding: 32px 24px; border-radius: 12px 12px 0 0; text-align: center;">
        <h1 style="color: #ffffff; font-size: 22px; margin: 0; font-weight: 700;">Kavita</h1>
        <p style="color: rgba(255,255,255,0.8); font-size: 14px; margin: 8px 0 0;">Central de Atendimento</p>
      </div>

      <div style="background: #ffffff; padding: 32px 24px; border: 1px solid #e5e7eb; border-top: none;">
        <p style="font-size: 16px; margin: 0 0 16px;">Ola, <strong>${nome}</strong>!</p>

        <p style="font-size: 15px; line-height: 1.6; margin: 0 0 16px; color: #374151;">
          Recebemos sua mensagem sobre <strong>"${assunto}"</strong> e nossa equipe ja foi notificada.
        </p>

        <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 16px; margin: 0 0 20px;">
          <p style="font-size: 14px; color: #166534; margin: 0;">
            <strong>Prazo de resposta:</strong> ate 24 horas uteis.
          </p>
        </div>

        <p style="font-size: 14px; line-height: 1.6; color: #6b7280; margin: 0 0 8px;">
          Se precisar de atendimento mais rapido, fale conosco pelo WhatsApp durante o horario comercial (segunda a sexta, 8h as 18h).
        </p>

        <p style="font-size: 14px; color: #6b7280; margin: 24px 0 0;">
          Obrigado por entrar em contato.<br/>
          <strong>Equipe Kavita</strong>
        </p>
      </div>

      <div style="background: #f9fafb; padding: 16px 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px; text-align: center;">
        <p style="font-size: 12px; color: #9ca3af; margin: 0;">
          Este e-mail foi enviado automaticamente. Nao e necessario responder.
        </p>
      </div>
    </div>
  `;

  const text = `Ola, ${nome}!\n\nRecebemos sua mensagem sobre "${assunto}" e nossa equipe ja foi notificada.\n\nPrazo de resposta: ate 24 horas uteis.\n\nSe precisar de atendimento mais rapido, fale conosco pelo WhatsApp durante o horario comercial (segunda a sexta, 8h as 18h).\n\nObrigado por entrar em contato.\nEquipe Kavita`;

  return { subject, html, text };
};
