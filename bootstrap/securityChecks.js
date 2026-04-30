"use strict";

// bootstrap/securityChecks.js
//
// F1 — checagens de segurança no boot. Roda APÓS o servidor iniciar
// (não bloqueia o boot) porque depende de DB. Os achados são
// reportados em logger.error + Sentry.captureMessage para que o time
// veja imediatamente.
//
// Hoje cobre:
//   * Admins ativos sem 2FA (mfa_active=0). Em produção, o middleware
//     requireTotpForSensitiveOps já bloqueia rotas críticas — esta
//     checagem é o sinal de boot que diz "vá ativar 2FA".

const pool = require("../config/pool");
const logger = require("../lib/logger");

function captureSentry(message, extra) {
  try {
    const sentry = require("../lib/sentry");
    if (sentry && typeof sentry.captureMessage === "function") {
      sentry.captureMessage(message, "warning", {
        tags: { domain: "security.startup_check" },
        extra,
      });
    }
  } catch {
    // sentry indisponível — log já registrou
  }
}

/**
 * Conta admins ativos (ativo=1) sem 2FA. Em prod, loga ERROR + Sentry
 * para forçar atenção. Em dev, INFO discreto.
 */
async function reportAdminsWithoutMfa() {
  let rows;
  try {
    [rows] = await pool.query(
      `SELECT id, email, role
         FROM admins
        WHERE ativo = 1 AND (mfa_active = 0 OR mfa_active IS NULL)
        ORDER BY id`,
    );
  } catch (err) {
    logger.warn({ err }, "securityChecks: failed to query admins MFA status");
    return;
  }

  if (rows.length === 0) {
    logger.info("securityChecks: all active admins have 2FA enabled");
    return;
  }

  const isProd = process.env.NODE_ENV === "production";
  const summary = {
    total: rows.length,
    sample: rows.slice(0, 5).map((r) => ({ id: r.id, email: r.email, role: r.role })),
  };

  if (isProd) {
    const msg =
      `securityChecks: ${rows.length} admins ATIVOS estão SEM 2FA em produção. ` +
      "Operações sensíveis (contratos, monetização, usuários, roles, permissões) " +
      "estão sendo bloqueadas com 403 para esses admins até ativarem 2FA. " +
      "Refs: F1 / requireTotpForSensitiveOps.";
    logger.error(summary, msg);
    captureSentry(msg, summary);
  } else {
    logger.info(
      summary,
      `securityChecks: ${rows.length} admin(s) sem 2FA em ${process.env.NODE_ENV || "dev"}. ` +
        "Em prod isso bloquearia rotas sensíveis com 403.",
    );
  }
}

/**
 * Roda todas as checagens de segurança. Não throw — apenas loga.
 */
async function runStartupSecurityChecks() {
  await reportAdminsWithoutMfa();
}

module.exports = { runStartupSecurityChecks, reportAdminsWithoutMfa };
