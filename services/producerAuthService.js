// services/producerAuthService.js
//
// Auth passwordless para o produtor via magic link por email.
// Fluxo:
//   1. POST /api/public/produtor/magic-link  body: { email }
//      → cria conta se não existe + envia email com link único
//   2. Produtor clica no link /produtor/entrar?token=...
//   3. Frontend chama POST /api/public/produtor/consume-token body: { token }
//      → backend valida, emite JWT em cookie HttpOnly, retorna user
"use strict";

const jwt = require("jsonwebtoken");
const AppError = require("../errors/AppError");
const ERROR_CODES = require("../constants/ErrorCodes");
const producerRepo = require("../repositories/producerAccountsRepository");
const tokenService = require("./passwordResetTokenService");
const mailService = require("./mailService");
const logger = require("../lib/logger");

const SCOPE = "producer_magic";
const MAGIC_TTL_MINUTES = 30;
const JWT_TTL_DAYS = 30;

function buildJwt(user) {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET ausente.");
  return jwt.sign(
    {
      sub: user.id,
      kind: "producer",
      v: user.token_version,
    },
    secret,
    { expiresIn: `${JWT_TTL_DAYS}d` },
  );
}

function verifyJwt(token) {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET ausente.");
  try {
    return jwt.verify(token, secret);
  } catch {
    return null;
  }
}

/**
 * Requisita magic link. Se conta não existe, cria (silenciosamente
 * — mesmo shape de resposta para evitar email enumeration).
 */
async function requestMagicLink({ email }) {
  const normalized = String(email).trim().toLowerCase();
  if (!normalized.includes("@")) {
    throw new AppError("E-mail inválido.", ERROR_CODES.VALIDATION_ERROR, 400);
  }

  let user = await producerRepo.findByEmail(normalized);
  if (!user) {
    const id = await producerRepo.create({ email: normalized });
    user = await producerRepo.findById(id);
    logger.info({ producerId: id, email: normalized }, "producer.account.created");
  }

  // Revoga magic links pendentes anteriores (uso único real).
  await tokenService.revokeAllForUser(user.id, SCOPE);

  const token = tokenService.generateToken();
  const expiresAt = new Date(Date.now() + MAGIC_TTL_MINUTES * 60 * 1000);
  await tokenService.storeToken(user.id, token, expiresAt, SCOPE);

  // Fire-and-forget — evita expor falha de mailer ao frontend.
  sendMagicLinkEmail({ email: normalized, token }).catch((err) => {
    logger.warn(
      { err: err?.message ?? String(err), producerId: user.id },
      "producer.magic_link.email_failed",
    );
  });

  return { sent: true };
}

async function sendMagicLinkEmail({ email, token }) {
  const appUrl = process.env.APP_URL?.replace(/\/$/, "") || "";
  const link = `${appUrl}/produtor/entrar?token=${token}`;
  const subject = "Seu acesso ao Mercado do Café · Kavita";
  const html = `
    <div style="font-family: system-ui, -apple-system, sans-serif; max-width: 520px;">
      <h2 style="color:#b45309;margin:0 0 12px;">☕ Entrar no Kavita · Mercado do Café</h2>
      <p>Clique no botão abaixo para entrar. O link vale por ${MAGIC_TTL_MINUTES} minutos
         e só pode ser usado uma vez.</p>
      <p>
        <a href="${link}" style="display:inline-block;background:#b45309;color:white;
                  padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;">
          Entrar no Kavita
        </a>
      </p>
      <p style="color:#71717a;font-size:12px;margin-top:16px;">
        Se não foi você que pediu, pode ignorar este e-mail — ninguém entra
        sem clicar no link acima.
      </p>
      <p style="color:#71717a;font-size:12px;margin-top:24px;">
        Kavita · Mercado do Café · Zona da Mata Mineira
      </p>
    </div>
  `;
  const text = [
    `Entrar no Kavita · Mercado do Café`,
    ``,
    `Clique para entrar: ${link}`,
    `Link válido por ${MAGIC_TTL_MINUTES} minutos. Uso único.`,
    ``,
    `Se não pediu, ignore.`,
  ].join("\n");

  await mailService.sendTransactionalEmail(email, subject, html, text);
}

/**
 * Consome magic link. Retorna { user, jwt } para frontend setar cookie.
 */
async function consumeMagicLink({ token }) {
  if (!token || typeof token !== "string") {
    throw new AppError(
      "Link inválido.",
      ERROR_CODES.VALIDATION_ERROR,
      400,
    );
  }
  const row = await tokenService.findValidToken(token, SCOPE);
  if (!row) {
    throw new AppError(
      "Link inválido ou expirado.",
      ERROR_CODES.UNAUTHORIZED,
      401,
    );
  }

  const user = await producerRepo.findById(row.user_id);
  if (!user || !user.is_active) {
    throw new AppError(
      "Conta inválida.",
      ERROR_CODES.UNAUTHORIZED,
      401,
    );
  }

  // Revoga este token específico (uso único).
  await tokenService.revokeToken(row.id);
  await producerRepo.touchLastLogin(user.id);

  const fresh = await producerRepo.findById(user.id);
  const token_jwt = buildJwt(fresh);

  logger.info({ producerId: user.id }, "producer.auth.login");

  return { user: sanitizeUser(fresh), jwt: token_jwt };
}

/**
 * Verifica JWT do cookie e busca user atualizado do banco.
 * Retorna null em falha (middleware decide HTTP status).
 */
async function verifyProducerToken(jwtToken) {
  const payload = verifyJwt(jwtToken);
  if (!payload || payload.kind !== "producer" || !payload.sub) return null;
  const user = await producerRepo.findById(payload.sub);
  if (!user || !user.is_active) return null;
  if (user.token_version !== payload.v) return null;
  return sanitizeUser(user);
}

function sanitizeUser(user) {
  return {
    id: user.id,
    email: user.email,
    nome: user.nome,
    cidade: user.cidade,
    telefone: user.telefone,
    telefone_normalizado: user.telefone_normalizado,
  };
}

module.exports = {
  requestMagicLink,
  consumeMagicLink,
  verifyProducerToken,
  SCOPE,
  JWT_TTL_DAYS,
};
