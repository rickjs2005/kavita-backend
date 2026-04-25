"use strict";
// controllers/motorista/motoristaAuthController.js
//
// Endpoints PUBLICOS de auth do motorista. Sem CSRF — magic-link e'
// idempotente e o consume retorna o JWT + cookie. Frontend seta cookie
// httpOnly via Set-Cookie no consume.

const { response } = require("../../lib");
const AppError = require("../../errors/AppError");
const ERROR_CODES = require("../../constants/ErrorCodes");
const authService = require("../../services/motoristaAuthService");

async function requestMagicLink(req, res, next) {
  try {
    const { telefone } = req.body;
    const result = await authService.requestMagicLink({ telefone });
    // Resposta agnostica: nao revela se telefone existe ou nao.
    return response.ok(res, {
      sent: true,
      // expor link APENAS em dev pra facilitar smoke; em prod, frontend
      // confia na entrega via WhatsApp.
      ...(process.env.NODE_ENV !== "production" && result.link
        ? { dev_link: result.link, dev_whatsapp: result.whatsapp }
        : {}),
    });
  } catch (err) {
    return next(err);
  }
}

async function consumeMagicLink(req, res, next) {
  try {
    const token = req.body?.token || req.query?.token;
    if (!token) {
      throw new AppError("Token ausente.", ERROR_CODES.VALIDATION_ERROR, 400);
    }
    const result = await authService.consumeMagicLink({ token });

    // Seta cookie HttpOnly de sessao
    res.cookie(result.cookie.name, result.cookie.value, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: result.cookie.maxAgeSeconds * 1000,
      path: "/",
    });

    return response.ok(res, { motorista: result.motorista }, "Login efetuado.");
  } catch (err) {
    return next(err);
  }
}

async function logout(_req, res, next) {
  try {
    res.clearCookie("motoristaToken", { path: "/" });
    return response.noContent(res);
  } catch (err) {
    return next(err);
  }
}

module.exports = { requestMagicLink, consumeMagicLink, logout };
