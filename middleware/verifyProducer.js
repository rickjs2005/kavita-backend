// middleware/verifyProducer.js
//
// Valida cookie `producerToken` e injeta req.producer.
// Espelha o padrão de verifyCorretora/verifyAdmin.
"use strict";

const AppError = require("../errors/AppError");
const ERROR_CODES = require("../constants/ErrorCodes");
const authService = require("../services/producerAuthService");

const COOKIE_NAME = "producerToken";

async function verifyProducer(req, _res, next) {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) {
    return next(
      new AppError("Não autenticado.", ERROR_CODES.UNAUTHORIZED, 401),
    );
  }
  const user = await authService.verifyProducerToken(token);
  if (!user) {
    return next(
      new AppError(
        "Sessão inválida. Faça login novamente.",
        ERROR_CODES.AUTH_ERROR,
        401,
      ),
    );
  }
  req.producer = user;
  next();
}

verifyProducer.COOKIE_NAME = COOKIE_NAME;

module.exports = verifyProducer;
