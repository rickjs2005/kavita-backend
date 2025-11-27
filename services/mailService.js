// services/mailService.js
const nodemailer = require("nodemailer");
const config = require("../config/env");

/**
 * Transporter global de e-mail (Gmail ou SMTP)
 * Usa a mesma configuração para reset de senha e e-mails transacionais.
 */
const transporter = nodemailer.createTransport({
  service: "Gmail",
  auth: {
    user: config.email.user,
    pass: config.email.pass,
  },
});

/**
 * Envia o e-mail de redefinição de senha
 */
async function sendResetPasswordEmail(toEmail, token) {
  const resetLink = `${config.appUrl.replace(/\/$/, "")}/reset-password?token=${token}`;

  await transporter.sendMail({
    from: `"Suporte" <${config.email.user}>`,
    to: toEmail,
    subject: "Redefinição de Senha",
    html: `
      <p>Você solicitou a redefinição de senha.</p>
      <p>Clique no link para criar uma nova senha:</p>
      <p><a href="${resetLink}">${resetLink}</a></p>
      <p>Se você não solicitou isso, ignore este e-mail.</p>
    `,
  });
}

/**
 * Envia e-mails transacionais do admin (confirmação, comprovante, envio…)
 */
async function sendTransactionalEmail(to, subject, html) {
  await transporter.sendMail({
    from: `"Kavita" <${config.email.user}>`,
    to,
    subject,
    html,
  });
}

module.exports = {
  sendResetPasswordEmail,
  sendTransactionalEmail,
};
