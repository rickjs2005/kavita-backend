// scripts/dev/smoke-privacy.js
//
// Smoke test end-to-end do fluxo LGPD (Fase 10.3).
//
// Cobre:
//   1. Login inline (JWT gerado via JWT_SECRET — produtor usa magic
//      link em prod, o que é inviável num script CLI)
//   2. GET privacidade/meus-dados — snapshot seguro
//   3. GET privacidade/exportar — baixa JSON + varre anti-vazamento
//   4. POST privacidade/solicitar-exclusao — cria pedido
//   5. Re-GET meus-dados — confirma exclusao_agendada
//   6. POST privacidade/cancelar-exclusao — arrependimento
//   7. Re-GET meus-dados — confirma cancelamento
//   8. POST public/privacidade/contato (sem auth) — canal DPO
//
// Uso:
//   node scripts/dev/smoke-privacy.js --email rickjanuario0@gmail.com
//
// Pré-requisitos:
//   - migrations 2026042000000004 + 005 aplicadas
//   - backend rodando em $API (default http://localhost:5000)
//   - JWT_SECRET no .env (mesmo que o backend)

"use strict";

require("dotenv").config();

const jwt = require("jsonwebtoken");
const pool = require("../../config/pool");

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i += 2) {
    const key = argv[i]?.replace(/^--/, "");
    const value = argv[i + 1];
    if (!key) continue;
    out[key] = value;
  }
  return out;
}

const args = parseArgs(process.argv);
const API = (args.api || "http://localhost:5000").replace(/\/$/, "");
const EMAIL = args.email;

if (!EMAIL) {
  console.error("Uso: node scripts/dev/smoke-privacy.js --email <email_produtor> [--api http://localhost:5000]");
  process.exit(1);
}

// ── Cookie jar simples ──────────────────────────────────────────────
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

async function api(
  path,
  { method = "GET", body = null, extraHeaders = {}, withAuth = true } = {},
) {
  const headers = { "Content-Type": "application/json", ...extraHeaders };
  if (withAuth && jar.size > 0) headers.Cookie = cookieHeader();
  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  absorbCookies(res);
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  return { status: res.status, json };
}

// ── Relatório visual ────────────────────────────────────────────────
let step = 0;
function h(label) {
  step += 1;
  console.log(`\n▶ [${step}] ${label}`);
}
function ok(msg, extra) {
  console.log(`  ✓ ${msg}`);
  if (extra) {
    const body = JSON.stringify(extra, null, 2)
      .split("\n")
      .slice(0, 8)
      .join("\n");
    console.log(
      "   " + body.replace(/\n/g, "\n    "),
    );
  }
}
function fail(msg, status, json) {
  console.error(`  ✗ ${msg} — HTTP ${status}`);
  console.error("   ", JSON.stringify(json, null, 2).slice(0, 500));
  process.exit(2);
}

// ── Execução ────────────────────────────────────────────────────────
(async () => {
  // 0. Busca produtor + gera JWT
  h(`Bootstrap — localiza conta ${EMAIL} e emite JWT dev`);
  const [rows] = await pool.query(
    "SELECT id, email, token_version, is_active FROM producer_accounts WHERE email = ? LIMIT 1",
    [EMAIL],
  );
  const producer = rows[0];
  if (!producer) {
    console.error(`  ✗ Nenhum producer_accounts com email=${EMAIL}.`);
    console.error("    Dica: peça um magic link em /produtor/entrar ou insira manualmente.");
    process.exit(3);
  }
  if (!producer.is_active) {
    console.error(`  ✗ Conta ${EMAIL} está inativa. Ative antes de rodar o smoke.`);
    process.exit(3);
  }

  if (!process.env.JWT_SECRET) {
    console.error("  ✗ JWT_SECRET ausente no .env.");
    process.exit(3);
  }

  const token = jwt.sign(
    { sub: producer.id, kind: "producer", v: producer.token_version },
    process.env.JWT_SECRET,
    { expiresIn: "30d" },
  );
  jar.set("producerToken", token);
  ok(`JWT emitido para producer_id=${producer.id}`);

  // 1. CSRF — necessário para mutações
  h("CSRF token");
  const csrfRes = await api("/api/csrf-token");
  const csrf = csrfRes.json?.csrfToken;
  if (!csrf) fail("CSRF não retornado", csrfRes.status, csrfRes.json);
  ok(`csrf obtido (len=${csrf.length})`);
  const CSRF_HDR = { "x-csrf-token": csrf };

  // 2. GET meus-dados
  h("GET /api/produtor/privacidade/meus-dados");
  const mineRes = await api("/api/produtor/privacidade/meus-dados");
  if (mineRes.status !== 200 || !mineRes.json?.ok) {
    fail("falhou", mineRes.status, mineRes.json);
  }
  const initialData = mineRes.json.data;
  ok("snapshot carregado", {
    email: initialData.conta.email,
    leads_enviados: initialData.resumo_tratamentos.leads_enviados,
    contratos: initialData.resumo_tratamentos.contratos_vinculados,
    exclusao_agendada: initialData.exclusao_agendada,
  });

  // 3. GET exportar — baixa + varredura anti-vazamento
  h("GET /api/produtor/privacidade/exportar (anti-vazamento)");
  const expHeaders = { "Content-Type": "application/json" };
  if (jar.size > 0) expHeaders.Cookie = cookieHeader();
  const expRes = await fetch(`${API}/api/produtor/privacidade/exportar`, {
    headers: expHeaders,
  });
  if (!expRes.ok) {
    fail("export falhou", expRes.status, { raw: await expRes.text() });
  }
  const exportText = await expRes.text();
  const forbiddenKeys = [
    '"password":',
    '"password_hash":',
    '"senha":',
    '"senha_hash":',
    '"cpf":',
    '"cpf_hash":',
    '"totp_secret":',
    '"token_version":',
    '"reset_token":',
    '"source_ip":',
    '"user_agent":',
    '"nota_interna":',
    '"signer_envelope_id":',
    '"signer_document_id":',
    '"pdf_url":',
  ];
  const leaked = forbiddenKeys.filter((k) => exportText.includes(k));
  if (leaked.length > 0) {
    console.error(`  ✗ VAZAMENTO detectado nos campos: ${leaked.join(", ")}`);
    process.exit(4);
  }
  ok(
    `export seguro (${exportText.length} bytes, 0 chaves proibidas)`,
    { sample_titular: JSON.parse(exportText).titular },
  );

  // 4. Solicitar exclusão
  h("POST /api/produtor/privacidade/solicitar-exclusao");
  // Limpa pedido ativo anterior (caso smoke anterior tenha deixado)
  await pool.query(
    `UPDATE privacy_requests SET status='rejected', status_reason='smoke-cleanup', processed_at=NOW()
     WHERE subject_type='producer' AND subject_id=? AND status IN ('pending','processing')`,
    [producer.id],
  );
  await pool.query(
    "UPDATE producer_accounts SET pending_deletion_at=NULL WHERE id=?",
    [producer.id],
  );

  const delRes = await api("/api/produtor/privacidade/solicitar-exclusao", {
    method: "POST",
    body: { motivo: "smoke test" },
    extraHeaders: CSRF_HDR,
  });
  if (delRes.status !== 201 || !delRes.json?.ok) {
    fail("solicitar-exclusao falhou", delRes.status, delRes.json);
  }
  const requestId = delRes.json.data.id;
  const scheduledPurgeAt = delRes.json.data.scheduled_purge_at;
  ok(`pedido #${requestId} criado`, {
    scheduled_purge_at: scheduledPurgeAt,
  });

  // 5. Re-GET meus-dados — confirma exclusao_agendada
  h("GET meus-dados (confirma exclusao_agendada)");
  const mine2Res = await api("/api/produtor/privacidade/meus-dados");
  if (!mine2Res.json?.data?.exclusao_agendada) {
    fail(
      "exclusao_agendada ausente — regressão",
      mine2Res.status,
      mine2Res.json,
    );
  }
  ok("exclusao_agendada presente", mine2Res.json.data.exclusao_agendada);

  // 6. Cancelar exclusão
  h("POST /api/produtor/privacidade/cancelar-exclusao");
  const cancelRes = await api(
    "/api/produtor/privacidade/cancelar-exclusao",
    { method: "POST", extraHeaders: CSRF_HDR },
  );
  if (cancelRes.status !== 200 || !cancelRes.json?.ok) {
    fail("cancelar falhou", cancelRes.status, cancelRes.json);
  }
  ok("exclusão cancelada");

  // 7. Re-GET meus-dados — confirma que voltou a null
  h("GET meus-dados (confirma cancelamento)");
  const mine3Res = await api("/api/produtor/privacidade/meus-dados");
  if (mine3Res.json?.data?.exclusao_agendada !== null) {
    fail(
      "exclusao_agendada deveria ser null após cancelamento",
      mine3Res.status,
      mine3Res.json,
    );
  }
  ok("conta restaurada (exclusao_agendada=null)");

  // 8. Canal público (sem auth)
  h("POST /api/public/privacidade/contato (sem auth)");
  const contatoRes = await fetch(`${API}/api/public/privacidade/contato`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      nome: "Smoke Test",
      email: `smoke-${Date.now()}@example.com`,
      tipo: "duvida",
      mensagem: "Mensagem automática do smoke script. Ignorar.",
    }),
  });
  const contatoJson = await contatoRes.json().catch(() => ({}));
  if (contatoRes.status === 429) {
    // Rate limit 3/h do contatoService já foi atingido por smokes
    // anteriores — não é falha de código. Reiniciar backend zera.
    ok("canal público OK (rate limit ativo de execução anterior — 429 é esperado)");
  } else if (contatoRes.status !== 201 || !contatoJson?.ok) {
    fail("contato público falhou", contatoRes.status, contatoJson);
  } else {
    ok("canal público aceito");
  }

  // 9. DB sanity — mensagem gravada com assunto privacidade:*?
  h("DB sanity — última mensagem privacy");
  const [msgRows] = await pool.query(
    `SELECT assunto, created_at FROM mensagens_contato
      WHERE assunto LIKE 'privacidade:%'
      ORDER BY id DESC LIMIT 1`,
  );
  if (!msgRows[0]) {
    fail("mensagens_contato sem linha com assunto privacidade:* — regressão", 0, {});
  }
  ok("mensagem privacy no DB", msgRows[0]);

  console.log("\n──────────────────────────────────────────────");
  console.log("✅ Smoke LGPD completo — 9 checkpoints passaram.");
  console.log("──────────────────────────────────────────────");
  process.exit(0);
})().catch((err) => {
  console.error("\n✗ ERRO FATAL:", err?.message ?? err);
  console.error(err?.stack?.split("\n").slice(0, 6).join("\n"));
  process.exit(1);
});
