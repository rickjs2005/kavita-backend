// controllers/corretoraPanel/accountCorretoraController.js
//
// Encerramento de conta self-service. A corretora (owner) pode fechar
// a própria operação no Kavita sem depender do admin — exige senha +
// motivo opcional. O service cancela plano, arquiva corretora e força
// logout de todos os users do time.
"use strict";

const { response } = require("../../lib");
const AppError = require("../../errors/AppError");
const ERROR_CODES = require("../../constants/ErrorCodes");
const corretorasService = require("../../services/corretorasService");

async function deactivateMyAccount(req, res, next) {
  try {
    const password =
      typeof req.body?.password === "string" ? req.body.password : "";
    const reason =
      typeof req.body?.reason === "string" ? req.body.reason : undefined;

    const result = await corretorasService.deactivateOwnAccount({
      corretoraId: req.corretoraUser.corretora_id,
      userId: req.corretoraUser.id,
      password,
      reason,
    });

    // Limpa cookie de sessão — UX: o user fica fora imediatamente.
    // O incrementTokenVersion no service já invalidaria o JWT, mas
    // limpar o cookie localmente evita requests zumbi na aba.
    res.clearCookie("corretoraToken", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
    });

    const msg = result.already_archived
      ? "Conta já havia sido encerrada."
      : "Sua conta foi encerrada. Esperamos te ver em breve.";

    return response.ok(res, result, msg);
  } catch (err) {
    next(
      err instanceof AppError
        ? err
        : new AppError(
            "Erro ao encerrar conta.",
            ERROR_CODES.SERVER_ERROR,
            500,
          ),
    );
  }
}

module.exports = { deactivateMyAccount };
