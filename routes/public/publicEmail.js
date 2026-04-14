"use strict";

// routes/public/publicEmail.js
//
// Endpoints de gestão de preferência de email pelo próprio usuário.
// Sem auth — protegidos por token HMAC no parâmetro.
//
//   GET  /api/public/email/unsubscribe?email=&token=  — confirma e registra
//   POST /api/public/email/resubscribe                — reverte (mesma validação)

const router = require("express").Router();
const AppError = require("../../errors/AppError");
const ERROR_CODES = require("../../constants/ErrorCodes");
const { response } = require("../../lib");
const { verifyUnsubToken } = require("../../lib/unsubscribeTokens");
const emailSuppressionsRepo = require("../../repositories/emailSuppressionsRepository");
const logger = require("../../lib/logger");

function validate(req) {
  const email = String(req.query.email || req.body.email || "").trim().toLowerCase();
  const token = String(req.query.token || req.body.token || "");
  const scope = String(req.query.scope || req.body.scope || "marketing");
  if (!email || !token) {
    throw new AppError("Parâmetros ausentes.", ERROR_CODES.VALIDATION_ERROR, 400);
  }
  if (!verifyUnsubToken(email, scope, token)) {
    throw new AppError("Token inválido.", ERROR_CODES.UNAUTHORIZED, 401);
  }
  return { email, scope };
}

// One-click unsubscribe — GET é intencional para funcionar direto do clique
// do cliente de email (List-Unsubscribe-Post seria ideal futuramente).
router.get("/unsubscribe", async (req, res, next) => {
  try {
    const { email, scope } = validate(req);
    await emailSuppressionsRepo.suppress({
      email,
      scope,
      reason: "user_unsubscribe",
      note: `ip:${req.ip}`,
    });
    logger.info({ email, scope }, "email.unsubscribed");
    return response.ok(res, { email, scope, suppressed: true }, "Você foi descadastrado.");
  } catch (err) {
    return next(err);
  }
});

router.post("/resubscribe", async (req, res, next) => {
  try {
    const { email, scope } = validate(req);
    await emailSuppressionsRepo.unsuppress({ email, scope });
    logger.info({ email, scope }, "email.resubscribed");
    return response.ok(res, { email, scope, suppressed: false }, "Inscrição reativada.");
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
