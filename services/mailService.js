const nodemailer = require('nodemailer');
const config = require('../config/env');

async function sendResetPasswordEmail(toEmail, token) {
  const resetLink = `${config.appUrl.replace(/\/$/, '')}/reset-password?token=${token}`;

  const transporter = nodemailer.createTransport({
    service: 'Gmail',
    auth: {
      user: config.email.user,
      pass: config.email.pass,
    },
  });

  await transporter.sendMail({
    from: `"Suporte" <${config.email.user}>`,
    to: toEmail,
    subject: 'Redefinição de Senha',
    html: `
      <p>Você solicitou a redefinição de senha.</p>
      <p>Clique no link para criar uma nova senha:
         <a href="${resetLink}">${resetLink}</a>
      </p>
      <p>Se você não solicitou isso, ignore este e-mail.</p>
    `,
  });
}

module.exports = { sendResetPasswordEmail };
