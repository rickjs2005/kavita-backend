#!/usr/bin/env node
// scripts/send-test-email.js
//
// Uso: node scripts/send-test-email.js <destino@exemplo.com> [template]
//
// Dispara um e-mail de teste pelo provider atualmente configurado
// (MAIL_PROVIDER / SENDGRID_API_KEY / SMTP_HOST / EMAIL_USER).
// Serve pra validar em dev ou staging que:
//   1. O provider certo foi detectado;
//   2. A autenticação passa;
//   3. O From está coerente (MAIL_FROM apontando pra domínio verificado);
//   4. O e-mail chega no inbox (não cai no spam com este From/subject).
//
// Templates disponíveis:
//   - plain (default): e-mail curto textual
//   - approved:        simula o e-mail de "cadastro aprovado"
//   - invite:          simula o e-mail de "primeiro acesso"
//   - trial:           simula o e-mail de "trial acabando em 3 dias"
//
// Em produção (NODE_ENV=production), o script REJEITA rodar sem passar
// `--allow-prod` explicitamente — evita spam acidental de usuários
// reais em teste de smoke.
//
// Exemplos:
//   npm run mail:test -- rick@kavita.com.br
//   node scripts/send-test-email.js rick@kavita.com.br invite
//   node scripts/send-test-email.js rick@kavita.com.br trial --allow-prod

"use strict";

require("dotenv").config();

const to = process.argv[2];
const template = (process.argv[3] || "plain").toLowerCase();
const allowProd = process.argv.includes("--allow-prod");

function fail(msg, code = 1) {
  console.error(`[send-test-email] ${msg}`);
  process.exit(code);
}

if (!to) {
  fail(
    "uso: node scripts/send-test-email.js <destino> [plain|approved|invite|trial] [--allow-prod]",
  );
}

if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) {
  fail(`destinatário inválido: "${to}"`);
}

if (process.env.NODE_ENV === "production" && !allowProd) {
  fail(
    "NODE_ENV=production detectado. Passe --allow-prod se você realmente quer enviar um teste em produção.",
    2,
  );
}

async function main() {
  const mailService = require("../services/mailService");
  const { createMailTransport, buildFrom } = require("../services/mail/transport");

  // Força instanciar pra ver qual provider foi escolhido (log do próprio
  // transport.js imprime no boot). Qualquer erro aqui indica config.
  const transporter = createMailTransport();
  const providerLabel = transporter.__provider || "unknown";

  console.log(
    `[send-test-email] provider=${providerLabel} from="${buildFrom("Kavita — Smoke test")}" to=${to} template=${template}`,
  );

  try {
    switch (template) {
      case "approved":
        await mailService.sendCorretoraApprovedEmail(
          to,
          "Corretora de Teste · Kavita",
        );
        break;

      case "invite":
        await mailService.sendCorretoraInviteEmail(
          to,
          "FAKE-TOKEN-SMOKE-TEST-123",
          "Corretora de Teste · Kavita",
        );
        break;

      case "trial":
        await mailService.sendCorretoraTrialEndingEmail({
          toEmail: to,
          corretoraName: "Corretora de Teste · Kavita",
          daysLeft: 3,
          trialEndsAt: new Date(Date.now() + 3 * 86_400_000).toISOString(),
        });
        break;

      case "plain":
      default:
        await mailService.sendTransactionalEmail(
          to,
          "Smoke test do Kavita",
          `<p>Se você recebeu este e-mail, o provider <strong>${providerLabel}</strong> está configurado corretamente.</p>
           <p>Hora do envio: ${new Date().toISOString()}</p>`,
          `Se você recebeu este e-mail, o provider ${providerLabel} está configurado corretamente.\nHora: ${new Date().toISOString()}`,
        );
        break;
    }

    console.log("[send-test-email] OK — e-mail enviado (ou stubado).");
    process.exit(0);
  } catch (err) {
    console.error("[send-test-email] FALHOU:", err?.message ?? err);
    if (err?.responseCode) {
      console.error(`  SMTP response code: ${err.responseCode}`);
    }
    if (err?.response) {
      console.error(`  SMTP response: ${err.response}`);
    }
    process.exit(3);
  }
}

main();
