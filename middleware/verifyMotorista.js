// middleware/verifyMotorista.js
//
// Valida cookie `motoristaToken` e injeta req.motorista.
// Espelha o padrao de verifyProducer/verifyCorretora/verifyAdmin.
"use strict";

const AppError = require("../errors/AppError");
const ERROR_CODES = require("../constants/ErrorCodes");
const authService = require("../services/motoristaAuthService");

const COOKIE_NAME = "motoristaToken";

async function verifyMotorista(req, _res, next) {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) {
    return next(
      new AppError("Nao autenticado.", ERROR_CODES.UNAUTHORIZED, 401),
    );
  }
  const motorista = await authService.verifyMotoristaToken(token);
  if (!motorista) {
    return next(
      new AppError(
        "Sessao invalida. Faca login novamente.",
        ERROR_CODES.AUTH_ERROR,
        401,
      ),
    );
  }
  req.motorista = motorista;
  next();
}

verifyMotorista.COOKIE_NAME = COOKIE_NAME;

module.exports = verifyMotorista;
