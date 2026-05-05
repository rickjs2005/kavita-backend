require("dotenv").config();

const REQUIRED_VARS = [
  "JWT_SECRET",
  "EMAIL_USER",
  "EMAIL_PASS",
  "APP_URL",
  "BACKEND_URL",
  "DB_HOST",
  "DB_USER",
  "DB_PASSWORD",
  "DB_NAME",
];

// Variáveis obrigatórias APENAS em produção.
// Em desenvolvimento, ausência gera aviso (não erro) para não bloquear setup local.
const REQUIRED_IN_PRODUCTION = [
  "MP_ACCESS_TOKEN",        // sem isso payment/start falha — não inicia pagamentos
  "MP_WEBHOOK_SECRET",      // sem isso o webhook falha fechado (401) — não processa pagamentos
  "MP_WEBHOOK_URL",         // sem isso, MP não envia webhook — pedidos pagos ficam "pendente" para sempre
  "CPF_ENCRYPTION_KEY",     // sem isso CPFs ficam em plaintext — risco LGPD
  "MFA_ENCRYPTION_KEY",     // F1.6 — cifra admins.mfa_secret em repouso (AES-256-GCM)
];

// Validações de formato para envs obrigatórias em produção.
// Cada entrada: { key, predicate, errorMsg }. Predicate retorna true se o valor é válido.
const PRODUCTION_FORMAT_VALIDATORS = [
  {
    key: "MP_WEBHOOK_URL",
    predicate: (v) => typeof v === "string" && /^https:\/\//i.test(v.trim()),
    errorMsg:
      "MP_WEBHOOK_URL deve começar com 'https://' (ex.: https://api.kavita.com.br/api/payment/webhook). " +
      "Sem URL pública HTTPS, o Mercado Pago não consegue entregar webhooks.",
  },
];

function ensureRequiredEnv() {
  const missing = REQUIRED_VARS.filter((key) =>
    typeof process.env[key] === "undefined"
  );

  if (missing.length > 0) {
    throw new Error(
      `Variáveis de ambiente ausentes: ${missing.join(", ")}. ` +
        "Defina-as antes de iniciar a aplicação."
    );
  }

  const isProduction = process.env.NODE_ENV === "production";

  // Considera ausente também se a string estiver vazia/whitespace —
  // em prod, "" é tão perigoso quanto undefined (silently breaks payments).
  const missingProd = REQUIRED_IN_PRODUCTION.filter((key) => {
    const v = process.env[key];
    return typeof v === "undefined" || (typeof v === "string" && v.trim() === "");
  });

  if (missingProd.length > 0) {
    const msg =
      `⚠️  Variáveis ausentes que são obrigatórias em produção: ${missingProd.join(", ")}.`;
    if (isProduction) {
      throw new Error(msg + " Configure antes de iniciar em produção.");
    } else {
      console.warn(msg + " Em produção o servidor irá recusar o startup.");
    }
  }

  // Em produção, valida formato de envs sensíveis. Falha rápida no boot.
  if (isProduction) {
    for (const v of PRODUCTION_FORMAT_VALIDATORS) {
      const value = process.env[v.key];
      if (typeof value === "undefined") continue; // já capturado acima
      if (!v.predicate(value)) {
        throw new Error(`⚠️  ${v.key} inválida: ${v.errorMsg}`);
      }
    }

    // Mercado Pago — token de produção começa com "APP_USR-".
    // Tokens "TEST-..." só funcionam em sandbox e cobrariam cartão real
    // se aceitos com NODE_ENV=production. Bloquear no boot.
    const mpToken = (process.env.MP_ACCESS_TOKEN || "").trim();
    if (!mpToken.startsWith("APP_USR-")) {
      throw new Error(
        "⚠️  MP_ACCESS_TOKEN inválido em produção: precisa começar com 'APP_USR-' " +
          "(token de produção do Mercado Pago). Tokens 'TEST-...' são de sandbox " +
          "e estão bloqueados em prod."
      );
    }

    // Bloco específico de assinatura digital — em produção EXIGIR ClickSign.
    // Stub gera contratos com signer_document_id="stub-<uuid>" sem validade
    // jurídica. Aceitar stub em prod = vender produto enganoso.
    const signerProvider = (process.env.CONTRATO_SIGNER_PROVIDER || "").trim().toLowerCase();
    if (signerProvider !== "clicksign") {
      throw new Error(
        "⚠️  CONTRATO_SIGNER_PROVIDER deve ser 'clicksign' em produção " +
          `(atual: '${process.env.CONTRATO_SIGNER_PROVIDER || "(vazio)"}'). ` +
          "Modo 'stub' gera contratos sem validade jurídica e está bloqueado em prod."
      );
    }

    const clicksignToken = (process.env.CLICKSIGN_API_TOKEN || "").trim();
    if (!clicksignToken) {
      throw new Error(
        "⚠️  CLICKSIGN_API_TOKEN ausente em produção. " +
          "Obtenha em: ClickSign painel → Configurações → API Access."
      );
    }

    const clicksignHmac = (process.env.CLICKSIGN_HMAC_SECRET || "").trim();
    if (!clicksignHmac) {
      throw new Error(
        "⚠️  CLICKSIGN_HMAC_SECRET ausente em produção. " +
          "Configure no ClickSign painel → Webhooks → segredo HMAC e copie aqui."
      );
    }

    const clicksignUrl = (process.env.CLICKSIGN_API_URL || "").trim().toLowerCase();
    if (clicksignUrl && /sandbox/.test(clicksignUrl)) {
      throw new Error(
        `⚠️  CLICKSIGN_API_URL='${process.env.CLICKSIGN_API_URL}' aponta para sandbox em produção. ` +
          "Use https://app.clicksign.com (produção) — sandbox gera contratos sem validade jurídica."
      );
    }

    // Provider de e-mail — "disabled" é útil em dev (logs em vez de envio
    // real), em produção significa que nenhum e-mail transacional sai
    // (recuperação de senha, magic-link, contrato, etc).
    const mailProvider = (process.env.MAIL_PROVIDER || "").trim().toLowerCase();
    if (mailProvider === "disabled") {
      throw new Error(
        "⚠️  MAIL_PROVIDER='disabled' em produção. Configure 'sendgrid' ou 'smtp' " +
          "antes de subir — sem isso, nenhum e-mail transacional é enviado."
      );
    }

    // KYC — provider 'mock' devolve dados sintéticos e nunca pode rodar em prod.
    const kycProvider = (process.env.KYC_PROVIDER || "").trim().toLowerCase();
    if (kycProvider === "mock" || kycProvider === "") {
      throw new Error(
        "⚠️  KYC_PROVIDER inválido em produção " +
          `(atual: '${process.env.KYC_PROVIDER || "(vazio)"}'). ` +
          "Configure 'bigdatacorp' (ou outro provedor real) — 'mock' está bloqueado em prod."
      );
    }

    // URLs públicas — localhost em prod indica .env não atualizado no
    // Railway/Render/Docker host. Quebra CORS, links de e-mail, redirects MP.
    const URL_KEYS = ["APP_URL", "BACKEND_URL", "PUBLIC_SITE_URL"];
    for (const key of URL_KEYS) {
      const v = (process.env[key] || "").trim().toLowerCase();
      if (!v) continue; // ausência já é capturada por REQUIRED_VARS quando aplicável
      if (/localhost|127\.0\.0\.1/.test(v)) {
        throw new Error(
          `⚠️  ${key}='${process.env[key]}' aponta para localhost em produção. ` +
            "Configure a URL pública (ex.: https://kavita.com.br)."
        );
      }
    }
  }

  // Aviso para módulos opcionais com gate de configuração.
  if (process.env.COTACOES_PROVIDER_ENABLED !== "true") {
    console.warn(
      "⚠️  COTACOES_PROVIDER_ENABLED não está definida como \"true\". " +
        "O módulo de cotações NÃO sincronizará preços com fontes externas. " +
        "Defina COTACOES_PROVIDER_ENABLED=true no .env para habilitar."
    );
  }
}

ensureRequiredEnv();

const config = {
  appUrl: process.env.APP_URL,
  backendUrl: process.env.BACKEND_URL,
  email: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
  jwt: {
    secret: process.env.JWT_SECRET,
    expiresIn: process.env.JWT_EXPIRATION || "7d",
  },
  db: {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
  },
};

module.exports = config;
