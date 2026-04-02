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
  "MP_WEBHOOK_SECRET",      // sem isso o webhook falha fechado (401) — não processa pagamentos
  "CPF_ENCRYPTION_KEY",     // sem isso CPFs ficam em plaintext — risco LGPD
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

  const missingProd = REQUIRED_IN_PRODUCTION.filter((key) =>
    typeof process.env[key] === "undefined"
  );

  if (missingProd.length > 0) {
    const msg =
      `⚠️  Variáveis ausentes que são obrigatórias em produção: ${missingProd.join(", ")}.`;
    if (isProduction) {
      throw new Error(msg + " Configure antes de iniciar em produção.");
    } else {
      console.warn(msg + " Em produção o servidor irá recusar o startup.");
    }
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
