"use strict";

// scripts/ops/disable-admin-2fa.runner.js — payload Node do procedimento
// de emergência F1.5. Não chamar diretamente; entrada autorizada via
// scripts/ops/disable-admin-2fa.sh (que faz confirmação dupla, motivo,
// operador, etc).
//
// Lê EMAIL, MOTIVO, OPERATOR_EMAIL do environment.
//
// Exit codes:
//   0  — admin tinha 2FA ativo e foi resetado
//   10 — admin já estava sem 2FA (idempotente, audit gravado mesmo assim)
//   20 — admin alvo não encontrado
//   30 — operador não encontrado / sem permissão
//   40 — erro de banco
//   50 — outro erro

require("dotenv").config();

const pool = require("../../config/pool");

function captureSentry(message, extra) {
  try {
    const sentry = require("../../lib/sentry");
    if (sentry && typeof sentry.captureMessage === "function") {
      sentry.captureMessage(message, "warning", {
        tags: { domain: "security.totp_emergency_reset" },
        extra,
      });
    }
  } catch {
    // sentry indisponível — log já registrou
  }
}

async function main() {
  const targetEmail = String(process.env.EMAIL || "").trim().toLowerCase();
  const motivo = String(process.env.MOTIVO || "").trim();
  const operatorEmail = String(process.env.OPERATOR_EMAIL || "").trim().toLowerCase();

  if (!targetEmail || motivo.length < 10 || !operatorEmail) {
    console.error("runner: variáveis de entrada incompletas (esperado EMAIL, MOTIVO ≥10 chars, OPERATOR_EMAIL).");
    process.exit(50);
  }

  // 1) Procura operador (precisa existir, ativo, role master)
  const [opRows] = await pool.query(
    "SELECT id, email, role, ativo FROM admins WHERE email = ?",
    [operatorEmail]
  );
  const operator = opRows[0];
  if (!operator) {
    console.error(`runner: operador '${operatorEmail}' não encontrado.`);
    process.exit(30);
  }
  if (!operator.ativo) {
    console.error(`runner: operador '${operatorEmail}' não está ativo.`);
    process.exit(30);
  }
  if (operator.role !== "master") {
    console.error(`runner: operador '${operatorEmail}' não tem role master (atual: '${operator.role}').`);
    process.exit(30);
  }

  // 2) Procura admin alvo
  const [tgRows] = await pool.query(
    "SELECT id, email, role, ativo, mfa_active FROM admins WHERE email = ?",
    [targetEmail]
  );
  const target = tgRows[0];
  if (!target) {
    console.error(`runner: admin alvo '${targetEmail}' não encontrado.`);
    process.exit(20);
  }

  const wasActive = Boolean(target.mfa_active);

  // 3) Reset (idempotente). Mesmo se mfa_active já era 0, apaga
  //    backup codes e bumpa tokenVersion como precaução — força logout.
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query(
      "UPDATE admins SET mfa_secret = NULL, mfa_active = 0 WHERE id = ?",
      [target.id]
    );
    await conn.query(
      "DELETE FROM admin_backup_codes WHERE admin_id = ?",
      [target.id]
    );
    await conn.query(
      "UPDATE admins SET tokenVersion = COALESCE(tokenVersion, 0) + 1 WHERE id = ?",
      [target.id]
    );

    // 4) Audit log
    await conn.query(
      `INSERT INTO admin_audit_logs
         (admin_id, admin_nome, action, target_type, target_id, meta, ip, user_agent, created_at)
       VALUES (?, ?, ?, 'admin', ?, ?, ?, ?, NOW())`,
      [
        operator.id,
        operator.email,
        "totp_admin_reset_emergency",
        target.id,
        JSON.stringify({
          target_email: target.email,
          target_role: target.role,
          target_was_mfa_active: wasActive,
          motivo,
          script: "disable-admin-2fa.sh",
        }),
        "operator-shell",
        "scripts/ops/disable-admin-2fa.sh",
      ]
    );

    await conn.commit();
  } catch (err) {
    try { await conn.rollback(); } catch { /* noop */ }
    console.error(`runner: erro de banco — ${err.message}`);
    process.exit(40);
  } finally {
    conn.release();
  }

  // 5) Sentry alert (não bloqueia se falhar)
  captureSentry(
    `2FA admin resetado emergencialmente — ${target.email} (was_active=${wasActive})`,
    {
      target_admin_id: target.id,
      target_email: target.email,
      operator_admin_id: operator.id,
      operator_email: operator.email,
      motivo,
      was_active: wasActive,
    }
  );

  console.log(JSON.stringify({
    target: { id: target.id, email: target.email, was_mfa_active: wasActive },
    operator: { id: operator.id, email: operator.email },
    motivo,
    audit_logged: true,
    sentry_dispatched: true,
    next_steps: [
      "Admin alvo abre /admin/login normalmente — não vai pedir MFA.",
      "Após login, admin alvo refaz POST /api/admin/totp/setup → confirma → guarda backup codes.",
    ],
  }, null, 2));

  // exit 10 se já estava sem 2FA (sinaliza idempotência para o .sh)
  process.exit(wasActive ? 0 : 10);
}

main().catch((err) => {
  console.error(`runner: erro inesperado — ${err.message}`);
  process.exit(50);
});
