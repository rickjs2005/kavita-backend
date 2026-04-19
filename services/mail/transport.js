// services/mail/transport.js
//
// Factory de transporter de e-mail com provider configurável via env.
// Objetivos:
//   1. Separar a decisão "qual provider" do resto do mailService,
//      que fica simples e trata só de templates + envio.
//   2. Permitir trocar Gmail → SendGrid → SMTP genérico sem editar
//      código (só env var).
//   3. Falhar cedo em produção quando nada está configurado (evita
//      e-mails "perdidos no vácuo" por config esquecida).
//
// Decisão (ordem):
//   - MAIL_PROVIDER explícito: disabled | sendgrid | smtp.
//   - Autodiscovery (compat): se SENDGRID_API_KEY existe → sendgrid;
//     senão se SMTP_HOST existe → smtp genérico; senão se EMAIL_USER
//     + EMAIL_PASS → Gmail legado (com warning em produção).
//   - Nada configurado: stub em dev (só loga), throw em produção.
//
// "disabled" = útil pra rodar testes / dev offline sem quicar SMTP.

"use strict";

const nodemailer = require("nodemailer");
const logger = require("../../lib/logger");

const PROVIDERS = {
  DISABLED: "disabled",
  SENDGRID: "sendgrid",
  SMTP: "smtp",
  GMAIL_LEGACY: "gmail-legacy",
  STUB: "stub",
};

/**
 * Stub transporter — não envia nada, só loga. Usado em dev offline
 * ou quando `MAIL_PROVIDER=disabled` está setado explicitamente.
 * A API bate com um Transporter real do nodemailer pra não quebrar
 * os callers (sendMail → Promise<info>).
 */
function createStubTransport() {
  return {
    __provider: PROVIDERS.STUB,
    async sendMail(options) {
      logger.info(
        {
          mailStub: true,
          to: options.to,
          subject: options.subject,
          from: options.from,
          hasText: Boolean(options.text),
          htmlBytes: options.html ? Buffer.byteLength(options.html) : 0,
        },
        "mail.stub.not_sent",
      );
      return {
        accepted: Array.isArray(options.to) ? options.to : [options.to],
        rejected: [],
        messageId: `<stub-${Date.now()}@kavita.local>`,
        response: "stub transport — message not sent (dev mode)",
      };
    },
    verify: async () => true,
  };
}

/**
 * SendGrid via SMTP relay — não exige nova dependência npm.
 * Auth fixo em user="apikey", pass=SENDGRID_API_KEY (formato padrão
 * deles). Porta 587 com STARTTLS.
 */
function createSendGridTransport(apiKey) {
  if (!apiKey || typeof apiKey !== "string" || apiKey.trim().length === 0) {
    throw new Error(
      "SENDGRID_API_KEY ausente ou vazia. Configure a chave em https://app.sendgrid.com/settings/api_keys.",
    );
  }
  return Object.assign(
    nodemailer.createTransport({
      host: "smtp.sendgrid.net",
      port: 587,
      secure: false, // STARTTLS upgrade automático
      auth: { user: "apikey", pass: apiKey.trim() },
    }),
    { __provider: PROVIDERS.SENDGRID },
  );
}

/**
 * SMTP genérico (qualquer provider compatível — AWS SES, Mailgun,
 * Postmark, Mailtrap, Resend via SMTP, SMTP corporativo, etc).
 * Valida as vars essenciais antes de construir.
 */
function createSmtpTransport() {
  const host = (process.env.SMTP_HOST || "").trim();
  if (!host) {
    throw new Error(
      "SMTP_HOST ausente. Configure SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS ou troque MAIL_PROVIDER.",
    );
  }
  const port = Number(process.env.SMTP_PORT || 587);
  // SMTP_SECURE: "true" = TLS direto (465); omitted/false = STARTTLS
  // quando suportado (587/25).
  const secure = String(process.env.SMTP_SECURE || "").toLowerCase() === "true";
  const user = (process.env.SMTP_USER || "").trim() || undefined;
  const pass = (process.env.SMTP_PASS || "").trim() || undefined;

  const opts = { host, port, secure };
  if (user && pass) opts.auth = { user, pass };

  return Object.assign(nodemailer.createTransport(opts), {
    __provider: PROVIDERS.SMTP,
  });
}

/**
 * Gmail legado — `service: "Gmail"` + EMAIL_USER/EMAIL_PASS.
 * Mantido pra não quebrar deploys antigos, mas com warning
 * se rodar em produção. Deprecação planejada.
 */
function createGmailLegacyTransport(user, pass) {
  return Object.assign(
    nodemailer.createTransport({
      service: "Gmail",
      auth: { user, pass },
    }),
    { __provider: PROVIDERS.GMAIL_LEGACY },
  );
}

/**
 * Resolve o provider baseado em MAIL_PROVIDER explícito, ou faz
 * autodiscovery pela presença das vars conhecidas. Retorna o
 * transporter + o label do provider (pra log).
 */
function createMailTransport() {
  const raw = (process.env.MAIL_PROVIDER || "").trim().toLowerCase();
  const isProduction = process.env.NODE_ENV === "production";

  // 1. Explícito
  if (raw === PROVIDERS.DISABLED) {
    if (isProduction) {
      throw new Error(
        "MAIL_PROVIDER=disabled não é permitido em produção. " +
          "Configure sendgrid/smtp antes de subir NODE_ENV=production.",
      );
    }
    logger.warn(
      "mail.provider.disabled — e-mails serão logados no console e não enviados.",
    );
    return createStubTransport();
  }

  if (raw === PROVIDERS.SENDGRID) {
    const t = createSendGridTransport(process.env.SENDGRID_API_KEY);
    logger.info("mail.provider.sendgrid");
    return t;
  }

  if (raw === PROVIDERS.SMTP) {
    const t = createSmtpTransport();
    logger.info({ host: process.env.SMTP_HOST }, "mail.provider.smtp");
    return t;
  }

  // 2. Autodiscovery (compat com deploys sem MAIL_PROVIDER)
  if (process.env.SENDGRID_API_KEY) {
    const t = createSendGridTransport(process.env.SENDGRID_API_KEY);
    logger.info("mail.provider.sendgrid (auto)");
    return t;
  }

  if (process.env.SMTP_HOST) {
    const t = createSmtpTransport();
    logger.info(
      { host: process.env.SMTP_HOST },
      "mail.provider.smtp (auto)",
    );
    return t;
  }

  if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
    if (isProduction) {
      logger.warn(
        "mail.provider.gmail_legacy — Gmail direto em produção. " +
          "Migre para SendGrid (MAIL_PROVIDER=sendgrid + SENDGRID_API_KEY) " +
          "antes de escalar — o Gmail expira credenciais com frequência.",
      );
    } else {
      logger.info("mail.provider.gmail_legacy (dev)");
    }
    return createGmailLegacyTransport(
      process.env.EMAIL_USER,
      process.env.EMAIL_PASS,
    );
  }

  // 3. Nada configurado
  if (isProduction) {
    throw new Error(
      "Nenhum provider de e-mail configurado. " +
        "Defina MAIL_PROVIDER=sendgrid (+ SENDGRID_API_KEY) ou " +
        "MAIL_PROVIDER=smtp (+ SMTP_*) antes do startup em produção.",
    );
  }

  logger.warn(
    "mail.provider.none — nenhuma var configurada. Usando stub (dev).",
  );
  return createStubTransport();
}

/**
 * Constrói o campo From do e-mail. Centraliza a decisão do endereço
 * remetente para TODOS os templates usarem o mesmo. Nome é contextual
 * (cada template pode customizar, ex: "Curadoria Kavita", "Kavita —
 * Segurança"), endereço sempre vem do env.
 *
 * Precedência do endereço:
 *   1. MAIL_FROM (preferido — pode ser "no-reply@kavita.com.br")
 *   2. SMTP_FROM (legado — já existia no .env.example)
 *   3. EMAIL_USER (legado Gmail)
 */
function buildFrom(contextualName) {
  const address = (
    process.env.MAIL_FROM ||
    parseAddressFromSmtpFrom(process.env.SMTP_FROM) ||
    process.env.EMAIL_USER ||
    ""
  ).trim();

  if (!address) {
    // Retornar vazio faz o nodemailer falhar com mensagem clara na
    // hora do envio. Não quebramos no boot pra não tomar o servidor
    // refém de um bug de config num arquivo que talvez nem use email.
    return "";
  }

  const name =
    (contextualName && String(contextualName).trim()) ||
    process.env.MAIL_FROM_NAME ||
    "Kavita";

  return `"${name}" <${address}>`;
}

/**
 * SMTP_FROM legado vinha como `"Kavita <no-reply@x.com>"` em alguns
 * .env antigos. Aceitamos o formato e extraímos só o endereço.
 */
function parseAddressFromSmtpFrom(value) {
  if (!value) return null;
  const match = String(value).match(/<([^>]+)>/);
  if (match) return match[1].trim();
  if (value.includes("@")) return value.trim();
  return null;
}

module.exports = {
  createMailTransport,
  buildFrom,
  PROVIDERS,
};
