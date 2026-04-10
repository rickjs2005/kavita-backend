// middleware/verifyTurnstile.js
//
// Verificação server-side do token do Cloudflare Turnstile.
//
// Comportamento:
//   - Sem TURNSTILE_SECRET_KEY no env → pula (modo dev).
//   - Com secret, exige token no body (`cf-turnstile-response`) e valida
//     contra challenges.cloudflare.com/turnstile/v0/siteverify.
//   - Fail-closed: erro de rede vira 503. Não abrimos a porta por
//     indisponibilidade da Cloudflare.
//   - Ao passar, remove o campo do body para não vazar downstream.
//
// Uso:
//   router.post("/path", rateLimit, verifyTurnstile, validate(schema), ctrl);
//
// Para trocar por hCaptcha no futuro: mudar SITEVERIFY_URL e o nome do
// campo esperado no body. O contrato de resposta é idêntico.
"use strict";

const AppError = require("../errors/AppError");
const ERROR_CODES = require("../constants/ErrorCodes");
const logger = require("../lib/logger");

const SITEVERIFY_URL =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const TIMEOUT_MS = 5000;
const TOKEN_FIELDS = ["cf-turnstile-response", "turnstile_token"];

function extractToken(body) {
  if (!body || typeof body !== "object") return null;
  for (const f of TOKEN_FIELDS) {
    const v = body[f];
    if (typeof v === "string" && v.trim().length > 0) return v.trim();
  }
  return null;
}

function stripToken(body) {
  if (!body || typeof body !== "object") return;
  for (const f of TOKEN_FIELDS) {
    if (f in body) delete body[f];
  }
}

async function verifyTurnstile(req, _res, next) {
  const secret = process.env.TURNSTILE_SECRET_KEY;

  // Modo dev / ambiente sem Turnstile configurado.
  // A ausência é LOUD (warn) em produção para ninguém subir sem proteção.
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      logger.warn(
        "Turnstile: TURNSTILE_SECRET_KEY não configurado em produção. Formulário público desprotegido."
      );
    }
    stripToken(req.body);
    return next();
  }

  const token = extractToken(req.body);
  if (!token) {
    return next(
      new AppError(
        "Verificação anti-bot obrigatória. Recarregue a página e tente novamente.",
        ERROR_CODES.FORBIDDEN,
        403
      )
    );
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let response;
  try {
    const params = new URLSearchParams();
    params.append("secret", secret);
    params.append("response", token);
    if (req.ip) params.append("remoteip", req.ip);

    response = await fetch(SITEVERIFY_URL, {
      method: "POST",
      body: params,
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timeoutId);
    logger.error({ err }, "Turnstile: erro de rede no siteverify");
    // Fail-closed: indisponibilidade vira 503 para não abrir brecha
    // automática em ataque combinado (DDoS na Cloudflare + spam no form).
    return next(
      new AppError(
        "Não foi possível verificar o desafio anti-bot agora. Tente novamente em instantes.",
        ERROR_CODES.SERVER_ERROR,
        503
      )
    );
  } finally {
    clearTimeout(timeoutId);
  }

  let result;
  try {
    result = await response.json();
  } catch (err) {
    logger.error({ err }, "Turnstile: resposta não-JSON do siteverify");
    return next(
      new AppError(
        "Resposta inválida do provedor anti-bot.",
        ERROR_CODES.SERVER_ERROR,
        503
      )
    );
  }

  if (!result?.success) {
    logger.warn(
      { codes: result?.["error-codes"], ip: req.ip },
      "Turnstile: verificação rejeitada"
    );
    return next(
      new AppError(
        "Verificação anti-bot falhou. Recarregue a página e tente novamente.",
        ERROR_CODES.FORBIDDEN,
        403
      )
    );
  }

  // Sucesso — remove o campo para não confundir o Zod downstream e não
  // vazar o token para controllers/repositories.
  stripToken(req.body);
  return next();
}

module.exports = verifyTurnstile;
