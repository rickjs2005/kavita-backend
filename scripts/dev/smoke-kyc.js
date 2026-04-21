// scripts/dev/smoke-kyc.js
//
// Smoke test end-to-end do fluxo KYC (Fase 10.2).
//
// Cobre todo o FSM: pending_verification → under_review → (rejected
// → under_review → verified). Inclui o gate de emissão de contrato
// (invocação direta do contratoService — 403 quando kyc_status ≠ verified).
//
// Uso:
//   node scripts/dev/smoke-kyc.js --corretora 4
//
// Pré-requisitos:
//   - migrations 006 + 007 aplicadas (npm run db:migrate)
//   - backend rodando em $API (default http://localhost:5000)
//   - admin com role=master no DB (admin padrão id=8 funciona)
//   - KYC_PROVIDER=mock no .env (ou ausente — default é mock)
//
// O script reseta a corretora alvo para pending_verification e restaura
// para verified no final, evitando efeito colateral em ambiente.

"use strict";

require("dotenv").config();

const jwt = require("jsonwebtoken");
const pool = require("../../config/pool");

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i += 2) {
    const key = argv[i]?.replace(/^--/, "");
    out[key] = argv[i + 1];
  }
  return out;
}
const args = parseArgs(process.argv);
const API = (args.api || "http://localhost:5000").replace(/\/$/, "");
const CORRETORA_ID = Number(args.corretora || 4);

const CNPJ_VALID = "12345678000195";
const CNPJ_INATIVA = "12345678000000"; // termina em 0000 no mock
const CNPJ_INVALID = "000"; // erro de formato

// ── Cookie jar ──────────────────────────────────────────────────────
const jar = new Map();
function absorbCookies(res) {
  const list =
    typeof res.headers.getSetCookie === "function"
      ? res.headers.getSetCookie()
      : [];
  for (const raw of list) {
    const [kv] = raw.split(";");
    const eq = kv.indexOf("=");
    if (eq > 0) jar.set(kv.slice(0, eq).trim(), kv.slice(eq + 1).trim());
  }
}
function cookieHeader() {
  return Array.from(jar.entries())
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
}

async function api(path, { method = "GET", body = null, extraHeaders = {} } = {}) {
  const headers = { "Content-Type": "application/json", ...extraHeaders };
  if (jar.size > 0) headers.Cookie = cookieHeader();
  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  absorbCookies(res);
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text }; }
  return { status: res.status, json };
}

let step = 0;
function h(label) { step += 1; console.log(`\n▶ [${step}] ${label}`); }
function ok(msg, extra) {
  console.log(`  ✓ ${msg}`);
  if (extra) {
    const body = JSON.stringify(extra, null, 2).split("\n").slice(0, 6).join("\n");
    console.log("   " + body.replace(/\n/g, "\n    "));
  }
}
function fail(msg, status, json) {
  console.error(`  ✗ ${msg} — HTTP ${status}`);
  console.error("   ", JSON.stringify(json, null, 2).slice(0, 500));
  process.exit(2);
}

(async () => {
  // 0. Bootstrap — admin JWT
  h("Bootstrap — localiza admin master e emite JWT");
  const [admins] = await pool.query(
    "SELECT id, email, role, ativo, tokenVersion FROM admins WHERE role='master' AND ativo=1 LIMIT 1",
  );
  const admin = admins[0];
  if (!admin) {
    console.error("  ✗ Nenhum admin com role=master encontrado.");
    process.exit(3);
  }
  if (!process.env.JWT_SECRET) {
    console.error("  ✗ JWT_SECRET ausente.");
    process.exit(3);
  }
  const adminToken = jwt.sign(
    { id: admin.id, tokenVersion: admin.tokenVersion ?? 0 },
    process.env.JWT_SECRET,
    { expiresIn: "1h" },
  );
  jar.set("adminToken", adminToken);
  ok(`admin id=${admin.id} (${admin.email}, role=${admin.role})`);

  // 0b. Confirma corretora + estado inicial salvo para restauração
  const [corrRows] = await pool.query(
    "SELECT id, name, kyc_status, kyc_verified_at FROM corretoras WHERE id=?",
    [CORRETORA_ID],
  );
  const originalCorretora = corrRows[0];
  if (!originalCorretora) {
    console.error(`  ✗ Corretora id=${CORRETORA_ID} não existe.`);
    process.exit(3);
  }
  ok(
    `corretora alvo: #${originalCorretora.id} ${originalCorretora.name} ` +
      `(atual: ${originalCorretora.kyc_status})`,
  );

  // Reset: pending_verification, snapshot limpo
  await pool.query(
    "UPDATE corretoras SET kyc_status='pending_verification', kyc_verified_at=NULL WHERE id=?",
    [CORRETORA_ID],
  );
  await pool.query("DELETE FROM corretora_kyc WHERE corretora_id=?", [
    CORRETORA_ID,
  ]);

  // 1. CSRF
  h("CSRF");
  const csrfRes = await api("/api/csrf-token");
  const csrf = csrfRes.json?.csrfToken;
  if (!csrf) fail("CSRF ausente", csrfRes.status, csrfRes.json);
  const CSRF = { "x-csrf-token": csrf };
  ok("csrf obtido");

  // 2. GET status — pending_verification, snapshot null
  h(`GET kyc status (esperado: pending_verification)`);
  const s1 = await api(`/api/admin/mercado-do-cafe/corretoras/${CORRETORA_ID}/kyc`);
  if (s1.status !== 200 || s1.json?.data?.kyc_status !== "pending_verification") {
    fail("estado inicial inválido", s1.status, s1.json);
  }
  if (s1.json?.data?.snapshot !== null) {
    fail("snapshot deveria ser null", s1.status, s1.json);
  }
  ok("pending_verification + snapshot limpo");

  // 3. run-check com CNPJ inválido → 400 VALIDATION
  h("run-check com CNPJ inválido — esperado 400");
  const badCheck = await api(
    `/api/admin/mercado-do-cafe/corretoras/${CORRETORA_ID}/kyc/run-check`,
    { method: "POST", body: { cnpj: CNPJ_INVALID }, extraHeaders: CSRF },
  );
  if (badCheck.status !== 400) {
    fail("deveria rejeitar CNPJ inválido", badCheck.status, badCheck.json);
  }
  ok("CNPJ inválido rejeitado", { code: badCheck.json?.code });

  // 4. run-check com CNPJ INATIVA
  h(`run-check com CNPJ ${CNPJ_INATIVA} — esperado INATIVA`);
  const inativaCheck = await api(
    `/api/admin/mercado-do-cafe/corretoras/${CORRETORA_ID}/kyc/run-check`,
    { method: "POST", body: { cnpj: CNPJ_INATIVA }, extraHeaders: CSRF },
  );
  if (inativaCheck.status !== 200 || !inativaCheck.json?.ok) {
    fail("run-check INATIVA falhou", inativaCheck.status, inativaCheck.json);
  }
  if (inativaCheck.json?.data?.situacao_cadastral !== "INATIVA") {
    fail("situacao deveria ser INATIVA", inativaCheck.status, inativaCheck.json);
  }
  ok("under_review com situacao=INATIVA", inativaCheck.json.data);

  // 5. approve automático — deve falhar 409 (situacao ≠ ATIVA)
  h("approve automático — esperado 409 (situacao não é ATIVA)");
  const badApprove = await api(
    `/api/admin/mercado-do-cafe/corretoras/${CORRETORA_ID}/kyc/approve`,
    { method: "POST", body: {}, extraHeaders: CSRF },
  );
  if (badApprove.status !== 409) {
    fail("deveria recusar approve com INATIVA", badApprove.status, badApprove.json);
  }
  ok("approve bloqueado corretamente (sanidade ATIVA)");

  // 6. reject com motivo
  h("reject com motivo");
  const rej = await api(
    `/api/admin/mercado-do-cafe/corretoras/${CORRETORA_ID}/kyc/reject`,
    {
      method: "POST",
      body: { reason: "Smoke test — CNPJ inativo detectado pelo mock" },
      extraHeaders: CSRF,
    },
  );
  if (rej.status !== 200 || rej.json?.data?.status !== "rejected") {
    fail("reject falhou", rej.status, rej.json);
  }
  ok("rejected");

  // 7. GET status — confirma rejected_reason visível
  h("GET status — esperado rejected com motivo");
  const s2 = await api(`/api/admin/mercado-do-cafe/corretoras/${CORRETORA_ID}/kyc`);
  if (s2.json?.data?.kyc_status !== "rejected") {
    fail("deveria estar rejected", s2.status, s2.json);
  }
  if (!s2.json?.data?.snapshot?.rejected_reason) {
    fail("rejected_reason ausente no snapshot", s2.status, s2.json);
  }
  ok("rejected persistido com motivo", {
    rejected_reason: s2.json.data.snapshot.rejected_reason,
  });

  // 8. Gate de emissão — corretora rejected NÃO emite contrato.
  // Limpamos contratos ativos do lead alvo para não bater em
  // hasActiveForLead (409) e mascarar o gate KYC (403).
  h("Gate de emissão — contratoService.gerarContrato deve lançar 403");
  await pool.query(
    "DELETE FROM contratos WHERE corretora_id=? AND lead_id=1 AND status IN ('draft','sent','signed','cancelled','expired')",
    [CORRETORA_ID],
  );
  const contratoService = require("../../services/contratoService");
  let gateBlocked = false;
  try {
    await contratoService.gerarContrato({
      leadId: 1,
      corretoraId: CORRETORA_ID,
      tipo: "disponivel",
      dataFields: {
        safra: "2025/2026",
        bebida_laudo: "Dura",
        quantidade_sacas: 100,
        preco_saca: 1500,
        prazo_pagamento_dias: 15,
        nome_armazem_ou_fazenda: "Smoke Test",
      },
      createdByUserId: null,
    });
  } catch (err) {
    if (err?.status === 403 && /KYC/i.test(err?.message || "")) {
      gateBlocked = true;
    } else {
      console.error("  ✗ erro inesperado:", err?.message, "status=", err?.status);
      process.exit(4);
    }
  }
  if (!gateBlocked) {
    console.error("  ✗ GATE FALHOU: contrato foi emitido com kyc_status=rejected!");
    process.exit(4);
  }
  ok("gate ativo: contrato recusado com 403");

  // 9. re-submit: run-check com CNPJ válido — rejected → under_review
  h(`run-check com CNPJ válido ${CNPJ_VALID} — esperado ATIVA`);
  const goodCheck = await api(
    `/api/admin/mercado-do-cafe/corretoras/${CORRETORA_ID}/kyc/run-check`,
    { method: "POST", body: { cnpj: CNPJ_VALID }, extraHeaders: CSRF },
  );
  if (goodCheck.status !== 200 || goodCheck.json?.data?.situacao_cadastral !== "ATIVA") {
    fail("re-check ATIVA falhou", goodCheck.status, goodCheck.json);
  }
  ok("under_review com situacao=ATIVA");

  // 10. approve automático — vira verified
  h("approve automático — esperado verified");
  const appr = await api(
    `/api/admin/mercado-do-cafe/corretoras/${CORRETORA_ID}/kyc/approve`,
    { method: "POST", body: {}, extraHeaders: CSRF },
  );
  if (appr.status !== 200 || appr.json?.data?.status !== "verified") {
    fail("approve falhou", appr.status, appr.json);
  }
  ok("verified", { verified_at: appr.json.data.verified_at });

  // 11. FSM: aprovar denovo (já verified) deve ser conflito
  h("approve em verified — esperado 409 (terminal)");
  const reAppr = await api(
    `/api/admin/mercado-do-cafe/corretoras/${CORRETORA_ID}/kyc/approve`,
    { method: "POST", body: {}, extraHeaders: CSRF },
  );
  // Transição verified→verified é tratada como no-op silencioso no service
  // (_assertTransition retorna antes se from === to). O endpoint pode
  // retornar 200 com data.status=verified. Aceitamos qualquer das duas.
  if (![200, 409].includes(reAppr.status)) {
    fail("comportamento inesperado", reAppr.status, reAppr.json);
  }
  ok(`approve em verified → ${reAppr.status} (idempotente)`);

  // 12. Cleanup — não restaura estado inicial (mantém verified, que é o
  //    estado do grandfather). Isto garante que outros smokes que
  //    dependem de contratos emitidos continuem funcionando.
  console.log("\n──────────────────────────────────────────────");
  console.log("✅ Smoke KYC completo — 11 checkpoints passaram.");
  console.log(`   Corretora ${CORRETORA_ID} mantida como verified.`);
  console.log("──────────────────────────────────────────────");
  process.exit(0);
})().catch((err) => {
  console.error("\n✗ ERRO FATAL:", err?.message ?? err);
  console.error(err?.stack?.split("\n").slice(0, 6).join("\n"));
  process.exit(1);
});
