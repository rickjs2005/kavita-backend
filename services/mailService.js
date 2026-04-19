// services/mailService.js
//
// Envio de todos os e-mails transacionais do Kavita. O transporter
// é resolvido em lazy-init pela factory em `services/mail/transport.js`
// — permite trocar provider (SendGrid, SMTP genérico, Gmail legado,
// stub em dev) apenas via env, sem editar este arquivo.
//
// Regras importantes:
//   - Nenhuma das 10+ funções abaixo quebra API pública — os callers
//     (controllers, workers, services) continuam chamando exatamente
//     como antes.
//   - O campo `from:` sempre passa pelo helper `buildFrom(nome)` pra
//     centralizar o endereço remetente. Nome é contextual por função
//     (ex.: "Curadoria Kavita — Mercado do Café") mas o endereço
//     vem de MAIL_FROM / SMTP_FROM / EMAIL_USER.
//   - Falhas de envio NÃO devem reverter transações. Os callers já
//     tratam fire-and-forget e logam; este arquivo só precisa lançar
//     o erro pro caller decidir.

"use strict";

const config = require("../config/env");
const { createMailTransport, buildFrom } = require("./mail/transport");

// Lazy init: chamamos createMailTransport() no primeiro uso e
// cacheamos. Evita quebrar o boot em dev quando provider está
// misconfigurado — o erro só aparece quando algo realmente tentar
// mandar e-mail.
let _transporter = null;
function transporter() {
  if (!_transporter) {
    _transporter = createMailTransport();
  }
  return _transporter;
}

// Atalho interno pra reduzir diff das funções abaixo — elas chamavam
// `transporter.sendMail(...)` como singleton. Mantém a mesma forma.
const transporterProxy = {
  sendMail: (opts) => transporter().sendMail(opts),
};

/**
 * Envia o e-mail de redefinição de senha
 */
async function sendResetPasswordEmail(toEmail, token) {
  const resetLink = `${config.appUrl.replace(/\/$/, "")}/reset-password?token=${token}`;

  await transporterProxy.sendMail({
    from: buildFrom("Kavita — Suporte"),
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

  await transporterProxy.sendMail({
    from: buildFrom("Kavita — Mercado do Café"),
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
  const loginUrl = `${config.appUrl.replace(/\/$/, "")}/painel/corretora/login`;
  const safeName = corretoraName || "sua corretora";

  await transporterProxy.sendMail({
    from: buildFrom("Kavita — Mercado do Café"),
    to: toEmail,
    subject: `Bem-vinda à mesa do Kavita — ${safeName}`,
    html: `
      <div style="font-family: system-ui, -apple-system, sans-serif; max-width: 560px; color:#1c1917;">
        <h2 style="color:#b45309;margin:0 0 12px;">☕ Sua sala no Mercado do Café está pronta</h2>
        <p>Olá,</p>
        <p>O acesso ao painel da <strong>${safeName}</strong> foi criado. É aqui que você vai receber os contatos de produtores da Zona da Mata, fazer propostas, acompanhar amostras e registrar lotes fechados.</p>
        <p>Para entrar pela primeira vez, defina uma senha:</p>
        <p style="margin:24px 0;">
          <a href="${link}"
             style="display:inline-block;background:#b45309;color:white;
                    padding:12px 26px;border-radius:10px;text-decoration:none;
                    font-weight:600;font-size:15px;">
            Definir minha senha
          </a>
        </p>
        <div style="background:#fef3c7;border-left:3px solid #b45309;border-radius:6px;padding:10px 14px;margin:20px 0;font-size:13px;color:#44403c;">
          <strong>O link vale por 7 dias.</strong> Se vencer antes que você consiga abrir, é só pedir um novo em <em>painel &rsaquo; esqueci a senha</em> que reenviamos.
        </div>
        <p style="color:#57534e;font-size:13px;line-height:1.6;">
          Depois de definir a senha, você entra sempre por
          <a href="${loginUrl}" style="color:#b45309;">${loginUrl}</a>.
        </p>
        <p style="color:#78716c;font-size:12px;margin-top:24px;">
          Se você não estava esperando este e-mail, pode ignorar — a conta só fica ativa depois que você mesma criar a senha.
        </p>
        <p style="color:#78716c;font-size:12px;margin-top:28px;">
          — Curadoria Kavita · Mercado do Café<br/>
          <span style="color:#a8a29e;">Zona da Mata mineira</span>
        </p>
        <p style="color:#a1a1aa;font-size:11px;word-break:break-all;margin-top:16px;">
          Link direto: ${link}
        </p>
      </div>
    `,
    text: [
      "Olá,",
      "",
      `O acesso ao painel da ${safeName} foi criado no Kavita.`,
      "É aqui que você vai receber contatos de produtores, fazer propostas e registrar lotes fechados.",
      "",
      "Defina sua senha (o link vale por 7 dias):",
      link,
      "",
      `Depois de definir a senha, você entra sempre por ${loginUrl}`,
      "",
      "Se o link vencer antes que você consiga abrir, é só pedir um novo na tela de login em \"esqueci a senha\".",
      "",
      "— Curadoria Kavita · Mercado do Café",
    ].join("\n"),
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

  await transporterProxy.sendMail({
    from: buildFrom("Curadoria Kavita — Mercado do Café"),
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

  await transporterProxy.sendMail({
    from: buildFrom("Kavita — Mercado do Café"),
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
    ? `A corretora <strong>${safeCorretora}</strong> foi avisada e deve retornar por <strong>${safeRetorno}</strong>. Normalmente o retorno chega no mesmo dia útil.`
    : `A corretora <strong>${safeCorretora}</strong> foi avisada e deve retornar pelo canal que você escolheu. Normalmente o retorno chega no mesmo dia útil.`;

  await transporterProxy.sendMail({
    from: buildFrom("Kavita — Mercado do Café"),
    to: toEmail,
    subject: `Seu pedido de contato chegou na ${corretoraNome || "corretora"}`,
    html: `
      <div style="font-family: system-ui, -apple-system, sans-serif; max-width: 560px; color:#1c1917;">
        <h2 style="color:#b45309;margin:0 0 12px;">☕ Recebemos seu pedido de contato</h2>
        <p>Olá, ${safeProdutor}.</p>
        <p>${retornoLine}</p>
        <p style="margin-top:16px;">Enquanto isso, se quiser, você pode rever a página da corretora ou chamar direto pelos canais dela:</p>
        <p style="margin:22px 0;">
          <a href="${corretoraUrl}"
             style="display:inline-block;background:#b45309;color:white;
                    padding:12px 24px;border-radius:10px;text-decoration:none;
                    font-weight:600;">
            Abrir a página da corretora
          </a>
        </p>
        ${
          statusUrl
            ? `<div style="background:#fef3c7;border-left:3px solid #b45309;border-radius:6px;padding:12px 14px;margin:18px 0;">
                 <p style="margin:0 0 6px;color:#44403c;font-size:13px;line-height:1.5;">
                   <strong>Acompanhe o andamento a qualquer momento.</strong>
                   Este link privado mostra se a corretora já respondeu e se o lote foi fechado.
                 </p>
                 <p style="margin:0;">
                   <a href="${statusUrl}"
                      style="color:#b45309;font-weight:600;text-decoration:underline;">
                     Ver status do meu contato
                   </a>
                 </p>
               </div>`
            : ""
        }
        <p style="color:#57534e;font-size:13px;line-height:1.6;margin-top:20px;">
          <strong>Não ouviu nada em um dia útil?</strong> Responda este e-mail. A curadoria da Kavita entra em contato com a corretora e te ajuda a destravar a conversa.
        </p>
        <p style="color:#78716c;font-size:12px;margin-top:28px;">
          — Kavita · Mercado do Café<br/>
          <span style="color:#a8a29e;">Zona da Mata mineira</span>
        </p>
      </div>
    `,
    text: [
      `Olá, ${produtorNome || "produtor(a)"}.`,
      "",
      retornoLabel
        ? `A corretora ${corretoraNome || ""} foi avisada e deve retornar por ${retornoLabel}. Normalmente o retorno chega no mesmo dia útil.`
        : `A corretora ${corretoraNome || ""} foi avisada e deve retornar pelo canal que você escolheu. Normalmente o retorno chega no mesmo dia útil.`,
      "",
      `Abrir a página da corretora: ${corretoraUrl}`,
      statusUrl ? `Ver status do meu contato: ${statusUrl}` : null,
      "",
      "Não ouviu nada em um dia útil? Responda este e-mail que a curadoria ajuda a destravar a conversa.",
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

  await transporterProxy.sendMail({
    from: buildFrom("Kavita — Segurança"),
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

/**
 * ETAPA 3.4 — convite editorial pro admin chamar corretora a
 * completar o perfil regional. Tom respeitoso/relacional (não
 * cobrança), explica por que cada campo ajuda o produtor.
 */
async function sendRegionalBackfillInviteEmail({
  toEmail,
  corretoraName,
  contactName,
}) {
  const appUrl = config.appUrl.replace(/\/$/, "");
  const perfilUrl = `${appUrl}/painel/corretora/perfil`;
  const safeName = corretoraName || "sua corretora";
  const greeting = contactName ? `Olá, ${contactName}` : "Olá";

  await transporterProxy.sendMail({
    from: buildFrom("Curadoria Kavita — Mercado do Café"),
    to: toEmail,
    subject: `Complete o perfil regional da ${safeName} (2 minutos)`,
    html: `
      <div style="font-family: system-ui, -apple-system, sans-serif; max-width: 560px; color:#1c1917;">
        <h2 style="color:#92400e; margin:0 0 12px;">☕ Produtor está olhando sua ficha</h2>
        <p>${greeting},</p>
        <p>
          A ficha da <strong>${safeName}</strong> já está ativa, mas ainda falta
          preencher os sinais que o produtor da Zona da Mata olha primeiro:
        </p>
        <ul style="color:#44403c;font-size:14px;line-height:1.7;">
          <li><strong>Endereço</strong> da mesa — aparece com mapa</li>
          <li><strong>Volume mínimo</strong> de saca que vocês aceitam</li>
          <li>Se compram <strong>café especial</strong> (arábica SCA 80+)</li>
          <li>Se fazem <strong>retirada de amostra</strong></li>
          <li>Se trabalham com <strong>exportação</strong></li>
          <li>Se atendem <strong>cooperativas</strong></li>
        </ul>
        <p style="color:#44403c;font-size:14px;">
          Cada sinal vira um chip na sua ficha pública — reduz fricção na
          decisão do produtor e aumenta a taxa de contato. Leva 2 minutos:
        </p>
        <p style="margin:24px 0;">
          <a href="${perfilUrl}"
             style="display:inline-block; background:#b45309; color:white; padding:12px 24px; border-radius:8px; text-decoration:none; font-weight:600;">
            Completar perfil regional
          </a>
        </p>
        <p style="color:#78716c; font-size:12px;">
          Precisa de ajuda? Responda este e-mail e a Curadoria Kavita dá suporte.
        </p>
      </div>
    `,
  });
}

/**
 * Bloco 3 — fim de trial. Uma única função cobre os 3 avisos progressivos
 * (7d, 3d, 1d) + a notificação de trial expirado. Parametrizada por
 * `daysLeft`: números positivos = dias antes do fim; 0 ou negativo =
 * já expirou. A escolha do momento de envio fica com o caller (job
 * `trialEndingJob.js` que roda 1x por dia).
 *
 * `toEmail` é array quando queremos atingir todos os usuários ativos da
 * corretora, string quando é um caso singular (ex.: só o owner).
 *
 * Copy muda o tom conforme urgência — aviso "calmo" em 7d vira
 * "último dia" em 1d e "serviço pausado" em expirado.
 */
async function sendCorretoraTrialEndingEmail({
  toEmail,
  corretoraName,
  daysLeft,
  trialEndsAt,
}) {
  const appUrl = config.appUrl.replace(/\/$/, "");
  const planosUrl = `${appUrl}/painel/corretora/planos`;
  const safeName = corretoraName || "sua corretora";
  const expired = daysLeft <= 0;

  // Formato de data human-friendly (ex.: "21 de abril").
  const endDate = trialEndsAt ? new Date(trialEndsAt) : null;
  const endLabel =
    endDate && !Number.isNaN(endDate.getTime())
      ? endDate.toLocaleDateString("pt-BR", {
          day: "2-digit",
          month: "long",
        })
      : null;

  let subject;
  let headline;
  let body;
  let ctaLabel;
  let kickerColor;
  if (expired) {
    subject = `${safeName}: seu teste gratuito expirou`;
    headline = "Seu teste gratuito acabou";
    body = `O período gratuito da <strong>${safeName}</strong> terminou${endLabel ? ` em ${endLabel}` : ""}. Os leads continuam chegando na sua página, mas o painel entra em modo limitado até você escolher um plano. Assine agora para manter o histórico e responder produtores sem interrupção.`;
    ctaLabel = "Reativar minha conta";
    kickerColor = "#be123c";
  } else if (daysLeft <= 1) {
    subject = `${safeName}: último dia do teste gratuito`;
    headline = "Último dia do seu teste gratuito";
    body = `Amanhã o teste gratuito da <strong>${safeName}</strong> acaba${endLabel ? ` (${endLabel})` : ""}. Assine hoje para manter tudo funcionando — leads, timeline, propostas e equipe — sem interrupção.`;
    ctaLabel = "Assinar agora";
    kickerColor = "#b45309";
  } else if (daysLeft <= 3) {
    subject = `${safeName}: seu teste gratuito acaba em ${daysLeft} dias`;
    headline = `Seu teste acaba em ${daysLeft} dias`;
    body = `O teste gratuito da <strong>${safeName}</strong> termina em ${daysLeft} dias${endLabel ? ` (${endLabel})` : ""}. Vale a pena escolher o plano agora com calma — sua operação segue exatamente com os leads e histórico que você já tem hoje.`;
    ctaLabel = "Ver planos";
    kickerColor = "#b45309";
  } else {
    subject = `${safeName}: seu teste gratuito acaba em ${daysLeft} dias`;
    headline = `Seu teste gratuito acaba em ${daysLeft} dias`;
    body = `Você está usando o Mercado do Café no período de teste gratuito da <strong>${safeName}</strong>. Faltam ${daysLeft} dias${endLabel ? ` (termina em ${endLabel})` : ""}. Quando for a hora, dá pra escolher o plano direto pelo painel — sem perder o histórico.`;
    ctaLabel = "Conhecer os planos";
    kickerColor = "#b45309";
  }

  const toList = Array.isArray(toEmail)
    ? toEmail.filter(Boolean)
    : toEmail
      ? [toEmail]
      : [];
  if (toList.length === 0) return { sent: 0 };

  const html = `
    <div style="font-family: system-ui, -apple-system, sans-serif; max-width: 560px; color:#1c1917;">
      <p style="color:${kickerColor};font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.14em;margin:0 0 6px;">
        ${expired ? "Teste expirado" : "Teste gratuito"}
      </p>
      <h2 style="color:#1c1917;margin:0 0 14px;font-size:20px;">☕ ${headline}</h2>
      <p style="font-size:14px;line-height:1.55;margin:0 0 18px;">${body}</p>
      <p style="margin:22px 0;">
        <a href="${planosUrl}"
           style="display:inline-block;background:${expired ? "#be123c" : "#b45309"};color:white;
                  padding:12px 24px;border-radius:10px;text-decoration:none;
                  font-weight:600;">
          ${ctaLabel}
        </a>
      </p>
      <p style="color:#57534e;font-size:13px;line-height:1.6;">
        Qualquer dúvida sobre qual plano escolher, é só responder este e-mail que a curadoria da Kavita ajuda a decidir.
      </p>
      <p style="color:#78716c;font-size:12px;margin-top:28px;">
        — Curadoria Kavita · Mercado do Café<br/>
        <span style="color:#a8a29e;">Zona da Mata mineira</span>
      </p>
    </div>
  `;

  const text = [
    headline,
    "",
    body.replace(/<[^>]+>/g, ""),
    "",
    `${ctaLabel}: ${planosUrl}`,
    "",
    "Qualquer dúvida sobre qual plano escolher, é só responder este e-mail.",
    "",
    "— Curadoria Kavita · Mercado do Café",
  ].join("\n");

  await transporterProxy.sendMail({
    from: buildFrom("Kavita — Mercado do Café"),
    to: toList,
    subject,
    html,
    text,
  });

  return { sent: toList.length };
}

async function sendTransactionalEmail(to, subject, html, text = null) {
  const mailOptions = {
    from: buildFrom("Kavita"),
    to,
    subject,
    html,
  };
  if (text) mailOptions.text = text;
  await transporterProxy.sendMail(mailOptions);
}

module.exports = {
  sendResetPasswordEmail,
  sendCorretoraResetPasswordEmail,
  sendCorretoraInviteEmail,
  sendCorretoraApprovedEmail,
  sendCorretoraRejectionEmail,
  sendLeadProducerConfirmationEmail,
  sendCorretoraNewIpAlertEmail,
  sendRegionalBackfillInviteEmail,
  sendCorretoraTrialEndingEmail,
  sendTransactionalEmail,
};
