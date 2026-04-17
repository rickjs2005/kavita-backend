// middleware/verifyCorretora.js
//
// Autenticação do usuário de corretora (Mercado do Café Fase 2).
// Cookie HttpOnly "corretoraToken" — scope "corretora" no payload JWT.
// Permite acesso apenas a corretora com status "active" e usuário is_active=1.
"use strict";

const jwt = require("jsonwebtoken");
const AppError = require("../errors/AppError");
const ERROR_CODES = require("../constants/ErrorCodes");
const authService = require("../services/corretoraAuthService");
const subsRepo = require("../repositories/subscriptionsRepository");
const planService = require("../services/planService");
const logger = require("../lib/logger");

const SECRET_KEY = process.env.JWT_SECRET;

async function verifyCorretora(req, _res, next) {
  if (!SECRET_KEY) {
    logger.error("JWT_SECRET não configurado");
    return next(
      new AppError(
        "Erro de configuração de autenticação.",
        ERROR_CODES.SERVER_ERROR,
        500
      )
    );
  }

  const token = req.cookies?.corretoraToken || null;
  if (!token) {
    return next(
      new AppError("Token não fornecido.", ERROR_CODES.AUTH_ERROR, 401)
    );
  }

  let decoded;
  try {
    decoded = jwt.verify(token, SECRET_KEY);
  } catch (err) {
    logger.warn({ err }, "verifyCorretora: token inválido");
    return next(
      new AppError("Token inválido ou expirado.", ERROR_CODES.AUTH_ERROR, 401)
    );
  }

  if (decoded?.scope !== "corretora") {
    return next(
      new AppError("Token inválido.", ERROR_CODES.AUTH_ERROR, 401)
    );
  }

  try {
    const user = await authService.findUserById(decoded.id);
    if (!user) {
      logger.warn(
        { userId: decoded.id, ip: req.ip },
        "verifyCorretora.rejected: user_not_found"
      );
      return next(
        new AppError("Usuário não encontrado.", ERROR_CODES.AUTH_ERROR, 401)
      );
    }
    if (!user.is_active) {
      logger.warn(
        { userId: user.id, corretoraId: user.corretora_id, ip: req.ip },
        "verifyCorretora.rejected: user_inactive"
      );
      return next(
        new AppError("Usuário inativo.", ERROR_CODES.AUTH_ERROR, 401)
      );
    }
    if (user.corretora_status !== "active") {
      logger.warn(
        { userId: user.id, corretoraId: user.corretora_id, ip: req.ip },
        "verifyCorretora.rejected: corretora_inactive"
      );
      return next(
        new AppError(
          "Corretora inativa. Entre em contato com o administrador.",
          ERROR_CODES.AUTH_ERROR,
          401
        )
      );
    }

    const dbVersion = user.token_version ?? 0;
    const jwtVersion = decoded.tokenVersion ?? 0;
    if (jwtVersion !== dbVersion) {
      logger.warn(
        { userId: user.id, corretoraId: user.corretora_id, ip: req.ip },
        "verifyCorretora.rejected: token_version_mismatch"
      );
      return next(
        new AppError(
          "Sessão inválida. Faça login novamente.",
          ERROR_CODES.AUTH_ERROR,
          401
        )
      );
    }

    // ── Expiração de trial ───────────────────────────────────
    // Se a subscription está em "trialing" e trial_ends_at < agora,
    // marca como "expired" e bloqueia acesso. Isso transforma o
    // trial_ends_at de campo decorativo em controle real.
    const sub = await subsRepo.getCurrentForCorretora(user.corretora_id);
    if (sub && sub.status === "trialing" && sub.trial_ends_at) {
      const trialEnd = new Date(sub.trial_ends_at);
      if (trialEnd < new Date()) {
        // markExpired atualiza status + grava subscription_event —
        // mantém a trilha de churn legível fora do log do processo.
        await planService.markExpired(sub.id, user.corretora_id);
        logger.info(
          { userId: user.id, corretoraId: user.corretora_id, subId: sub.id },
          "verifyCorretora: trial expired auto"
        );
        return next(
          new AppError(
            "Seu período de teste gratuito expirou. Entre em contato com a equipe Kavita para continuar usando a plataforma.",
            ERROR_CODES.FORBIDDEN ?? "FORBIDDEN",
            403
          )
        );
      }
    }

    req.corretoraUser = {
      id: user.id,
      corretora_id: user.corretora_id,
      nome: user.nome,
      email: user.email,
      role: user.role ?? "owner",
      corretora_name: user.corretora_name,
      corretora_slug: user.corretora_slug,
      // Propaga claim de impersonação (quando presente no JWT). O painel
      // usa para renderizar banner persistente e o controller de saída
      // bloqueia sessões normais.
      impersonation: decoded?.impersonation ?? null,
    };

    return next();
  } catch (err) {
    logger.error({ err }, "verifyCorretora: erro ao validar no banco");
    return next(
      new AppError(
        "Erro ao validar sessão da corretora.",
        ERROR_CODES.SERVER_ERROR,
        500
      )
    );
  }
}

module.exports = verifyCorretora;
