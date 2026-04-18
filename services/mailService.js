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
 * Envia o e-mail de "sua conta foi aprovada" para corretoras que
 * passaram pelo fluxo novo (senha no cadastro). A corretora já
 * definiu a senha no form público — esse e-mail apenas confirma
 * que a análise foi concluída e o acesso já está liberado.
 *
 * Diferente de sendCorretoraInviteEmail, NÃO contém link de
 * definir senha — a senha já existe. Só tem CTA "Entrar no painel".
 */
async function sendCorretoraApprovedEmail(toEmail, corretoraName) {
  const loginUrl = `${config.appUrl.replace(/\/$/, "")}/painel/corretora/login`;
  const safeName = corretoraName || "sua corretora";

  await transporter.sendMail({
    from: `"Kavita — Mercado do Café" <${config.email.user}>`,
    to: toEmail,
    subject: "Seu cadastro foi aprovado — bem-vinda ao Mercado do Café",
    html: `
      <div style="font-family: system-ui, -apple-system, sans-serif; max-width: 560px;">
        <h2 style="color:#15803d;margin:0 0 12px;">☕ Cadastro aprovado</h2>
        <p>Boas notícias! A <strong>${safeName}</strong> foi aprovada e já aparece na vitrine pública do Mercado do Café.</p>
        <p>Seu acesso ao painel privado também está pronto. Use o e-mail deste cadastro e a senha que você definiu no formulário para entrar.</p>
        <p style="margin:24px 0;">
          <a href="${loginUrl}"
             style="display:inline-block;background:#15803d;color:white;
                    padding:12px 24px;border-radius:8px;text-decoration:none;
                    font-weight:600;">
            Entrar no painel
          </a>
        </p>
        <p style="color:#71717a;font-size:13px;">
          No painel você gerencia os contatos recebidos de produtores, atualiza
          seu perfil público e acompanha sua atividade.
        </p>
        <p style="color:#71717a;font-size:12px;margin-top:24px;">
          Esqueceu a senha que criou? Use a opção "Esqueci minha senha" na tela de login.
        </p>
        <p style="color:#a1a1aa;font-size:11px;word-break:break-all;margin-top:16px;">
          Link direto: ${loginUrl}
        </p>
      </div>
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
 * Envia e-mail editorial quando a submissão da corretora é rejeitada.
 *
 * Tom: assinado pela "Curadoria Kavita", transforma o "não" em convite
 * para ajustar e reenviar. O mercado de corretoras da Zona da Mata é
 * pequeno e movido a relacionamento — uma rejeição fria queima ponte
 * que pode ser útil no futuro. O CTA primário leva de volta ao
 * formulário de cadastro; o secundário abre canal de suporte.
 */
async function sendCorretoraRejectionEmail(toEmail, corretoraName, reason) {
  const appUrl = config.appUrl.replace(/\/$/, "");
  const cadastroUrl = `${appUrl}/mercado-do-cafe/corretoras/cadastro`;
  const safeName = corretoraName || "sua corretora";
  // HTML-escape mínimo para o motivo — o admin digita em textarea livre.
  const safeReason = String(reason || "Motivo não informado.")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  await transporter.sendMail({
    from: `"Curadoria Kavita — Mercado do Café" <${config.email.user}>`,
    to: toEmail,
    subject: "Sobre sua solicitação no Mercado do Café",
    html: `
      <div style="font-family: system-ui, -apple-system, sans-serif; max-width: 560px; color:#1c1917;">
        <h2 style="color:#92400e;margin:0 0 12px;">☕ Sobre o cadastro de ${safeName}</h2>
        <p>Olá,</p>
        <p>Agradecemos o interesse em participar do Mercado do Café. Neste momento, a curadoria da Kavita <strong>não aprovou a solicitação</strong> pelo motivo abaixo:</p>
        <blockquote style="margin:16px 0;padding:12px 16px;background:#fef3c7;border-left:3px solid #b45309;border-radius:6px;color:#44403c;font-size:14px;line-height:1.5;">
          ${safeReason}
        </blockquote>
        <p>Isso não é um encerramento — é um convite para ajustar. Você pode revisar as informações, adequar os pontos sinalizados e enviar um novo cadastro a qualquer momento.</p>
        <p style="margin:24px 0;">
          <a href="${cadastroUrl}"
             style="display:inline-block;background:#b45309;color:white;
                    padding:12px 24px;border-radius:8px;text-decoration:none;
                    font-weight:600;">
            Reenviar cadastro ajustado
          </a>
        </p>
        <p style="color:#57534e;font-size:13px;line-height:1.6;">
          Se quiser conversar antes de reenviar, responda este e-mail. A curadoria da Kavita acompanha pessoalmente cada corretora que se apresenta à plataforma, e queremos ver você na vitrine do Mercado do Café em breve.
        </p>
        <p style="color:#78716c;font-size:12px;margin-top:28px;">
          — Equipe de Curadoria · Mercado do Café<br/>
          <span style="color:#a8a29e;">Kavita · Zona da Mata mineira</span>
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
 * Sprint 1 — Confirmação ao produtor quando ele envia um lead público
 * a uma corretora. Fecha o loop "mandei, sumiu" transformando o ato
 * de enviar mensagem em experiência observável pelo produtor.
 *
 * `retornoLabel` descreve o canal escolhido (WhatsApp/Ligação/E-mail)
 * em texto legível — já pré-formatado pela camada que chama esta
 * função, pra não duplicar o mapa de enums aqui.
 */
async function sendLeadProducerConfirmationEmail({
  toEmail,
  produtorNome,
  corretoraNome,
  corretoraSlug,
  retornoLabel,
  leadId,
  statusToken,
}) {
  const appUrl = config.appUrl.replace(/\/$/, "");
  const corretoraUrl = corretoraSlug
    ? `${appUrl}/mercado-do-cafe/corretoras/${corretoraSlug}`
    : `${appUrl}/mercado-do-cafe/corretoras`;
  // Link único para consultar status do lead (Sprint 7). Emitido só
  // quando o caller forneceu leadId + statusToken; ausência não
  // bloqueia o envio do e-mail.
  const statusUrl =
    leadId && statusToken
      ? `${appUrl}/mercado-do-cafe/lead-status/${leadId}/${statusToken}`
      : null;

  const safeProdutor = (produtorNome || "produtor(a)")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  const safeCorretora = (corretoraNome || "a corretora")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  const safeRetorno = retornoLabel
    ? String(retornoLabel)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
    : null;

  const retornoLine = safeRetorno
    ? `A corretora recebeu o seu contato e vai retornar por <strong>${safeRetorno}</strong> em breve.`
    : "A corretora recebeu o seu contato e vai retornar pelo canal que você escolheu em breve.";

  await transporter.sendMail({
    from: `"Kavita — Mercado do Café" <${config.email.user}>`,
    to: toEmail,
    subject: `Seu interesse foi enviado para ${corretoraNome || "a corretora"}`,
    html: `
      <div style="font-family: system-ui, -apple-system, sans-serif; max-width: 560px; color:#1c1917;">
        <h2 style="color:#15803d;margin:0 0 12px;">☕ Contato registrado</h2>
        <p>Olá, ${safeProdutor}.</p>
        <p>${retornoLine}</p>
        <p>Enquanto isso, você pode conferir novamente a página da <strong>${safeCorretora}</strong> e, se quiser, chamar direto pelo WhatsApp:</p>
        <p style="margin:24px 0;">
          <a href="${corretoraUrl}"
             style="display:inline-block;background:#15803d;color:white;
                    padding:12px 24px;border-radius:8px;text-decoration:none;
                    font-weight:600;">
            Ver a corretora
          </a>
        </p>
        ${
          statusUrl
            ? `<p style="margin:16px 0 0;color:#57534e;font-size:13px;line-height:1.6;">
                 Para acompanhar o status do seu contato a qualquer momento:
               </p>
               <p style="margin:8px 0 0;">
                 <a href="${statusUrl}"
                    style="color:#b45309;font-weight:600;text-decoration:underline;">
                   Acompanhar meu contato
                 </a>
               </p>`
            : ""
        }
        <p style="color:#57534e;font-size:13px;line-height:1.6;margin-top:20px;">
          Se a corretora não retornar em um dia útil, responda este e-mail que a equipe de curadoria da Kavita ajuda a destravar o contato.
        </p>
        <p style="color:#78716c;font-size:12px;margin-top:28px;">
          — Kavita · Mercado do Café<br/>
          <span style="color:#a8a29e;">Zona da Mata mineira</span>
        </p>
      </div>
    `,
    text: [
      `Olá, ${produtorNome || "produtor(a)"}.`,
      retornoLabel
        ? `A corretora ${corretoraNome || ""} recebeu seu contato e vai retornar por ${retornoLabel} em breve.`
        : `A corretora ${corretoraNome || ""} recebeu seu contato e vai retornar em breve.`,
      "",
      `Ver a corretora: ${corretoraUrl}`,
      statusUrl ? `Acompanhar meu contato: ${statusUrl}` : null,
      "",
      "— Kavita · Mercado do Café",
    ]
      .filter(Boolean)
      .join("\n"),
  });
}

/**
 * Envia e-mails transacionais (confirmação, comprovante, envio, notificações…)
 * @param {string} to
 * @param {string} subject
 * @param {string} html
 * @param {string} [text] - fallback plaintext opcional (melhora score anti-spam)
 */
/**
 * ETAPA 2.3 — alerta de novo IP. Dispara quando o login vem de um
 * IP diferente do last_login_ip do user. Tom neutro/informativo:
 * não acusa fraude; orienta checar e (se não reconhece) resetar
 * senha + ligar 2FA. Fire-and-forget no caller — falha de SMTP
 * nunca bloqueia login.
 */
async function sendCorretoraNewIpAlertEmail({
  toEmail,
  corretoraName,
  ip,
  userAgent,
  when,
}) {
  const appUrl = config.appUrl.replace(/\/$/, "");
  const seguranca = `${appUrl}/painel/corretora/perfil/seguranca`;
  const safeIp = String(ip || "desconhecido").replace(/[^\d.:a-f]/gi, "");
  const safeUA = String(userAgent || "desconhecido")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .slice(0, 200);
  const whenLabel = when
    ? new Date(when).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })
    : new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });

  await transporter.sendMail({
    from: `"Kavita — Segurança" <${config.email.user}>`,
    to: toEmail,
    subject: `Novo acesso detectado em ${corretoraName || "sua conta"}`,
    html: `
      <div style="font-family: system-ui, -apple-system, sans-serif; max-width: 560px; color:#1c1917;">
        <h2 style="color:#b45309; margin:0 0 12px;">🔒 Acesso de um novo dispositivo</h2>
        <p>Olá,</p>
        <p>Detectamos um novo login na conta da corretora${corretoraName ? ` <strong>${corretoraName}</strong>` : ""}:</p>
        <div style="background:#fef3c7; border-left:3px solid #b45309; padding:14px 16px; border-radius:6px; font-size:13px; color:#44403c; margin:16px 0;">
          <p style="margin:4px 0"><strong>Quando:</strong> ${whenLabel}</p>
          <p style="margin:4px 0"><strong>IP:</strong> ${safeIp}</p>
          <p style="margin:4px 0"><strong>Dispositivo:</strong> ${safeUA}</p>
        </div>
        <p><strong>Foi você?</strong> Pode ignorar este e-mail.</p>
        <p><strong>Não foi você?</strong> Acesse a área de segurança, troque a senha e ative o 2FA:</p>
        <p style="margin:20px 0;">
          <a href="${seguranca}"
             style="display:inline-block; background:#b45309; color:white; padding:10px 20px; border-radius:8px; text-decoration:none; font-weight:600;">
            Abrir segurança do painel
          </a>
        </p>
        <p style="color:#78716c; font-size:12px;">Kavita · Mercado do Café</p>
      </div>
    `,
  });
}

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
  sendCorretoraApprovedEmail,
  sendCorretoraRejectionEmail,
  sendLeadProducerConfirmationEmail,
  sendCorretoraNewIpAlertEmail,
  sendTransactionalEmail,
};
