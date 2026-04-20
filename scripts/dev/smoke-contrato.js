// scripts/dev/smoke-contrato.js
//
// Smoke test do fluxo de contrato (Fase 10.1): login corretora →
// CSRF → gerar contrato → enviar para assinatura. A partir do envio,
// o rito é assíncrono (ClickSign manda email, usuário assina, webhook
// atualiza status) — este script para depois do enviar.
//
// Uso:
//   node scripts/dev/smoke-contrato.js \
//     --email rickjanuario0@gmail.com \
//     --senha '***' \
//     --lead 1 \
//     [--api http://localhost:5000] \
//     [--tipo disponivel]
//
// Senha fica no seu shell — não envia por chat, não grava em log.
"use strict";

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
const SENHA = args.senha;
const LEAD_ID = Number(args.lead);
const TIPO = args.tipo || "disponivel";

if (!EMAIL || !SENHA || !Number.isInteger(LEAD_ID) || LEAD_ID <= 0) {
  console.error(
    "Uso: node scripts/dev/smoke-contrato.js --email <email> --senha <senha> --lead <id> [--api http://localhost:5000] [--tipo disponivel|entrega_futura]",
  );
  process.exit(1);
}

// Cookie jar mínimo. O backend usa 2 cookies relevantes:
//   corretoraToken (HttpOnly)  — sessão
//   csrf_token     (não-HttpOnly) — double-submit CSRF
const jar = new Map();

function absorbCookies(res) {
  const list =
    typeof res.headers.getSetCookie === "function"
      ? res.headers.getSetCookie()
      : [];
  for (const raw of list) {
    const [kv] = raw.split(";");
    const eq = kv.indexOf("=");
    if (eq > 0) {
      jar.set(kv.slice(0, eq).trim(), kv.slice(eq + 1).trim());
    }
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
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  return { status: res.status, json };
}

function step(label) {
  console.log(`\n▶ ${label}`);
}

function ok(label, data) {
  console.log(`  ✓ ${label}`);
  if (data) console.log("   ", JSON.stringify(data, null, 2).replace(/\n/g, "\n    "));
}

function fail(label, status, json) {
  console.error(`  ✗ ${label} — HTTP ${status}`);
  console.error("   ", JSON.stringify(json, null, 2));
  process.exit(2);
}

(async () => {
  // ── 1. LOGIN ──────────────────────────────────────────────────────
  step(`Login como ${EMAIL}`);
  const loginRes = await api("/api/corretora/login", {
    method: "POST",
    body: { email: EMAIL, senha: SENHA },
  });
  if (loginRes.status !== 200 || !loginRes.json?.ok) {
    fail("login falhou", loginRes.status, loginRes.json);
  }
  ok("login ok", {
    corretora_id: loginRes.json?.data?.corretoraUser?.corretora_id,
    user_id: loginRes.json?.data?.corretoraUser?.id,
    role: loginRes.json?.data?.corretoraUser?.role,
  });

  // ── 2. CSRF ───────────────────────────────────────────────────────
  step("Pegando CSRF token");
  const csrfRes = await api("/api/csrf-token");
  const csrfToken = csrfRes.json?.csrfToken;
  if (!csrfToken) fail("csrf não retornado", csrfRes.status, csrfRes.json);
  ok("csrf ok", { token_len: csrfToken.length });

  // ── 3. GERAR CONTRATO ─────────────────────────────────────────────
  step(`Gerando contrato (tipo=${TIPO}, lead=${LEAD_ID})`);
  const dataFields =
    TIPO === "disponivel"
      ? {
          safra: "2025/2026",
          bebida_laudo: "Dura",
          quantidade_sacas: 200,
          preco_saca: 1450,
          prazo_pagamento_dias: 15,
          nome_armazem_ou_fazenda: "Armazém Geral Manhuaçu",
        }
      : {
          safra: "2025/2026",
          safra_futura: "2026/2027",
          bebida_laudo: "Arábica especial",
          quantidade_sacas: 500,
          diferencial_basis: -25,
          data_referencia_cepea: new Date().toISOString().slice(0, 10),
          nome_armazem_ou_fazenda: "Fazenda Santa Rita",
        };

  const startGen = Date.now();
  const genRes = await api("/api/corretora/contratos", {
    method: "POST",
    body: { lead_id: LEAD_ID, tipo: TIPO, data_fields: dataFields },
    extraHeaders: { "x-csrf-token": csrfToken },
  });
  const genMs = Date.now() - startGen;
  if (genRes.status !== 201 || !genRes.json?.ok) {
    fail("geração falhou", genRes.status, genRes.json);
  }
  const contrato = genRes.json.data;
  ok(`contrato gerado em ${genMs}ms`, {
    id: contrato.id,
    status: contrato.status,
    hash_sha256: contrato.hash_sha256,
    numero_externo: contrato.numero_externo,
    verify_url: contrato.verify_url,
    token: contrato.qr_verification_token,
  });

  // ── 4. ENVIAR PARA ASSINATURA ────────────────────────────────────
  step(`Enviando contrato ${contrato.id} para ClickSign`);
  const sendRes = await api(
    `/api/corretora/contratos/${contrato.id}/enviar`,
    {
      method: "POST",
      extraHeaders: { "x-csrf-token": csrfToken },
    },
  );
  if (sendRes.status !== 200 || !sendRes.json?.ok) {
    fail("envio falhou", sendRes.status, sendRes.json);
  }
  ok("envio ok", sendRes.json.data);

  console.log("\n──────────────────────────────────────────────");
  console.log("✅ Envio concluído. Próximos passos MANUAIS:");
  console.log(`   1) Abra o email ${EMAIL} — devem chegar 2 convites da ClickSign`);
  console.log(`      (um como corretora, outro como produtor)`);
  console.log(`   2) Clique nos links e assine as duas partes`);
  console.log(`   3) Olhe o log do 'npm run dev' procurando por:`);
  console.log(`        clicksign.webhook.applied   transition: sent → signed`);
  console.log(`   4) Confirme no banco: status = 'signed' em contratos.id = ${contrato.id}`);
  console.log("──────────────────────────────────────────────");
  process.exit(0);
})().catch((err) => {
  console.error("\n✗ ERRO FATAL:", err?.message ?? err);
  process.exit(3);
});
