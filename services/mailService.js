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
 * Envia o e-mail de primeiro acesso (convite) para uma corretora que
 * acabou de ganhar acesso pelo admin. Copy diferente do reset — dá
 * boas-vindas e instrui sobre o que fazer.
 *
 * O link aponta para /painel/corretora/primeiro-acesso?token=XXX.
 * Internamente, o token é o mesmo formato do reset (scope
 * corretora_user), só com TTL mais longo (7 dias vs 1h).
 */
async function sendCorretoraInviteEmail(toEmail, token, corretoraName) {
  const link = `${config.appUrl.replace(/\/$/, "")}/painel/corretora/primeiro-acesso?token=${token}`;
  const safeName = corretoraName || "sua corretora";

  await transporter.sendMail({
    from: `"Kavita — Mercado do Café" <${config.email.user}>`,
    to: toEmail,
    subject: "Bem-vinda ao Mercado do Café — defina sua senha",
    html: `
      <div style="font-family: system-ui, -apple-system, sans-serif; max-width: 560px;">
        <h2 style="color:#15803d;margin:0 0 12px;">☕ Bem-vinda ao Mercado do Café</h2>
        <p>Seu acesso ao painel da <strong>${safeName}</strong> foi criado no Kavita.</p>
        <p>Clique no botão abaixo para definir sua senha e entrar pela primeira vez. O link expira em <strong>7 dias</strong>.</p>
        <p style="margin:24px 0;">
          <a href="${link}"
             style="display:inline-block;background:#15803d;color:white;
                    padding:12px 24px;border-radius:8px;text-decoration:none;
                    font-weight:600;">
            Definir minha senha
          </a>
        </p>
        <p style="color:#71717a;font-size:13px;">
          Depois de definir a senha, você poderá acessar o painel a qualquer
          momento em <strong>${config.appUrl.replace(/\/$/, "")}/painel/corretora/login</strong>.
        </p>
        <p style="color:#71717a;font-size:12px;margin-top:24px;">
          Se você não estava esperando este e-mail, ignore esta mensagem —
          nenhuma conta foi ativada sem sua confirmação.
        </p>
        <p style="color:#a1a1aa;font-size:11px;word-break:break-all;margin-top:16px;">
          Link direto: ${link}
        </p>
      </div>
    `,
  });
}

/**
 * Envia o e-mail de redefinição de senha para usuário de corretora.
 * Link aponta para o painel da corretora, não para a loja.
 */
async function sendCorretoraResetPasswordEmail(toEmail, token) {
  const resetLink = `${config.appUrl.replace(/\/$/, "")}/painel/corretora/resetar-senha?token=${token}`;

  await transporter.sendMail({
    from: `"Kavita — Mercado do Café" <${config.email.user}>`,
    to: toEmail,
    subject: "Redefinir senha do painel da corretora",
    html: `
      <div style="font-family: system-ui, -apple-system, sans-serif; max-width: 560px;">
        <h2 style="color:#15803d;margin:0 0 12px;">☕ Redefinir senha</h2>
        <p>Você solicitou a redefinição de senha do seu painel no Mercado do Café.</p>
        <p>Clique no botão abaixo para criar uma nova senha. O link expira em 1 hora.</p>
        <p style="margin:20px 0;">
          <a href="${resetLink}"
             style="display:inline-block;background:#15803d;color:white;
                    padding:10px 20px;border-radius:8px;text-decoration:none;
                    font-weight:600;">
            Criar nova senha
          </a>
        </p>
        <p style="color:#71717a;font-size:12px;">
          Se você não solicitou isso, ignore este e-mail — nenhuma alteração será feita.
        </p>
        <p style="color:#71717a;font-size:12px;word-break:break-all;">
          Link direto: ${resetLink}
        </p>
      </div>
    `,
  });
}

/**
 * Envia e-mails transacionais (confirmação, comprovante, envio, notificações…)
 * @param {string} to
 * @param {string} subject
 * @param {string} html
 * @param {string} [text] - fallback plaintext opcional (melhora score anti-spam)
 */
async function sendTransactionalEmail(to, subject, html, text = null) {
  const mailOptions = {
    from: `"Kavita" <${config.email.user}>`,
    to,
    subject,
    html,
  };
  if (text) mailOptions.text = text;
  await transporter.sendMail(mailOptions);
}

module.exports = {
  sendResetPasswordEmail,
  sendCorretoraResetPasswordEmail,
  sendCorretoraInviteEmail,
  sendTransactionalEmail,
};
