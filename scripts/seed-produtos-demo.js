"use strict";

// scripts/seed-produtos-demo.js
//
// Popula o backend de demo com produtos a partir de
// scripts/data/produtos-demo.csv. Faz login admin, garante categorias,
// cria produtos.
//
// Uso:
//   ADMIN_EMAIL=... ADMIN_PASSWORD=... node scripts/seed-produtos-demo.js
//
// Variáveis opcionais:
//   API_BASE  — default "https://kavita-backend.up.railway.app"

const fs = require("node:fs");
const path = require("node:path");

const API_BASE = process.env.API_BASE || "https://kavita-backend.up.railway.app";
const CSV_PATH = path.join(__dirname, "data", "produtos-demo.csv");

const CATEGORIAS_FIXAS = [
  "Insumos Agrícolas",
  "Cafeicultura",
  "Pecuária e Leiteria",
  "Ferramentas e Equipamentos",
  "Irrigação e Hidráulica",
];

// ---------------------------------------------------------------------------
// Cookie jar mínimo (sem deps) — captura Set-Cookie e devolve em Cookie:.
// ---------------------------------------------------------------------------

const cookies = new Map();

function captureSetCookie(res) {
  const list = typeof res.headers.getSetCookie === "function"
    ? res.headers.getSetCookie()
    : [];
  for (const line of list) {
    const [pair] = line.split(";");
    const eq = pair.indexOf("=");
    if (eq < 0) continue;
    const name = pair.slice(0, eq).trim();
    const value = pair.slice(eq + 1).trim();
    cookies.set(name, value);
  }
}

function cookieHeader() {
  return [...cookies.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

async function call(method, p, { body, headers = {} } = {}) {
  const init = {
    method,
    headers: {
      ...(cookies.size ? { Cookie: cookieHeader() } : {}),
      ...headers,
    },
  };
  if (body !== undefined) {
    init.headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(body);
  }
  const res = await fetch(`${API_BASE}${p}`, init);
  captureSetCookie(res);
  const text = await res.text();
  let data = null;
  if (text) {
    try { data = JSON.parse(text); } catch { data = text; }
  }
  return { ok: res.ok, status: res.status, data };
}

// ---------------------------------------------------------------------------
// Auth + CSRF
// ---------------------------------------------------------------------------

async function login(email, senha) {
  const { ok, status, data } = await call("POST", "/api/admin/login", {
    body: { email, senha },
  });
  if (!ok) {
    throw new Error(`Login falhou (${status}): ${JSON.stringify(data)}`);
  }
  if (data?.data?.mfaRequired) {
    throw new Error(
      "Admin tem 2FA ativo — este script não suporta MFA. Use credenciais sem 2FA.",
    );
  }
}

async function getCsrfToken() {
  const { ok, status, data } = await call("GET", "/api/csrf-token");
  if (!ok || !data?.csrfToken) {
    throw new Error(`Falha ao obter CSRF token (${status}): ${JSON.stringify(data)}`);
  }
  return data.csrfToken;
}

// ---------------------------------------------------------------------------
// Categorias
// ---------------------------------------------------------------------------

function normalizeName(name) {
  return String(name)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

async function ensureCategorias(csrfToken) {
  const { ok, status, data } = await call("GET", "/api/admin/categorias");
  if (!ok) {
    throw new Error(`Falha ao listar categorias (${status}): ${JSON.stringify(data)}`);
  }
  const lista = Array.isArray(data?.data) ? data.data : [];
  const map = new Map();
  for (const cat of lista) map.set(normalizeName(cat.name), cat.id);

  for (const nome of CATEGORIAS_FIXAS) {
    const key = normalizeName(nome);
    if (map.has(key)) {
      console.log(`= Categoria já existe: ${nome} (id ${map.get(key)})`);
      continue;
    }
    const r = await call("POST", "/api/admin/categorias", {
      headers: { "x-csrf-token": csrfToken },
      body: { name: nome },
    });
    if (!r.ok) {
      throw new Error(`Falha ao criar categoria "${nome}" (${r.status}): ${JSON.stringify(r.data)}`);
    }
    const id = r.data?.data?.id;
    if (!id) {
      throw new Error(`Resposta sem id ao criar categoria "${nome}": ${JSON.stringify(r.data)}`);
    }
    map.set(key, id);
    console.log(`✓ Categoria criada: ${nome} (id ${id})`);
  }
  return map;
}

// ---------------------------------------------------------------------------
// CSV parser (suporta aspas duplas e vírgulas dentro de campos quoted)
// ---------------------------------------------------------------------------

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else {
        field += c;
      }
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ",") { row.push(field); field = ""; }
      else if (c === "\n") { row.push(field); field = ""; rows.push(row); row = []; }
      else if (c !== "\r") field += c;
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  while (rows.length && rows[rows.length - 1].length === 1 && rows[rows.length - 1][0] === "") {
    rows.pop();
  }
  return rows;
}

function loadCsv(filePath) {
  const text = fs.readFileSync(filePath, "utf8");
  const rows = parseCsv(text);
  if (!rows.length) throw new Error(`CSV vazio: ${filePath}`);

  const expected = ["nome", "preco", "categoria", "estoque", "descricao"];
  const header = rows[0].map((h) => h.trim());
  if (header.join(",") !== expected.join(",")) {
    throw new Error(
      `Cabeçalho inesperado.\n  Esperado: ${expected.join(",")}\n  Obtido:   ${header.join(",")}`,
    );
  }
  return rows.slice(1).map((r, idx) => {
    const obj = { _line: idx + 2 };
    expected.forEach((k, i) => { obj[k] = (r[i] ?? "").trim(); });
    return obj;
  });
}

// ---------------------------------------------------------------------------
// Produtos
// ---------------------------------------------------------------------------

function parsePrice(raw) {
  if (raw === undefined || raw === null) return NaN;
  let v = String(raw).trim().replace(/[R$\s]/g, "");
  const lc = v.lastIndexOf(",");
  const ld = v.lastIndexOf(".");
  if (lc > -1 && ld > -1) {
    if (lc > ld) v = v.replace(/\./g, "").replace(",", ".");
    else v = v.replace(/,/g, "");
  } else if (lc > -1) {
    v = v.replace(/\./g, "").replace(",", ".");
  }
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

async function loadExistingProductNames() {
  const { ok, status, data } = await call("GET", "/api/admin/produtos");
  if (!ok) {
    throw new Error(`Falha ao listar produtos (${status}): ${JSON.stringify(data)}`);
  }
  const lista = Array.isArray(data?.data) ? data.data : [];
  const set = new Set();
  for (const p of lista) if (p?.name) set.add(normalizeName(p.name));
  return set;
}

async function createProduto(row, catMap, existingNames, csrfToken) {
  const { nome, preco, categoria, estoque, descricao } = row;

  if (!nome) return { ok: false, nome: `(linha ${row._line})`, motivo: "nome vazio" };

  const nomeKey = normalizeName(nome);
  if (existingNames.has(nomeKey)) {
    return { ok: true, skipped: true, nome };
  }

  const priceNum = parsePrice(preco);
  if (!Number.isFinite(priceNum) || priceNum <= 0) {
    return { ok: false, nome, motivo: `preço inválido: "${preco}"` };
  }

  const categoriaId = catMap.get(normalizeName(categoria));
  if (!categoriaId) {
    return { ok: false, nome, motivo: `categoria não mapeada: "${categoria}"` };
  }

  const qty = Number.parseInt(estoque, 10);
  if (!Number.isFinite(qty) || qty < 0) {
    return { ok: false, nome, motivo: `estoque inválido: "${estoque}"` };
  }

  const body = {
    name: nome,
    description: descricao || "",
    price: priceNum.toFixed(2),
    quantity: String(qty),
    category_id: String(categoriaId),
    shippingFree: "0",
    shippingFreeFromQtyStr: "",
    shippingPrazoDiasStr: "",
    reorderPoint: "",
  };

  const r = await call("POST", "/api/admin/produtos", {
    headers: { "x-csrf-token": csrfToken },
    body,
  });
  if (!r.ok) {
    return { ok: false, nome, motivo: `${r.status} ${JSON.stringify(r.data)}` };
  }
  existingNames.add(nomeKey);
  return { ok: true, nome, id: r.data?.data?.id };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

(async function main() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) {
    console.error("Defina ADMIN_EMAIL e ADMIN_PASSWORD no ambiente.");
    process.exit(1);
  }

  if (!fs.existsSync(CSV_PATH)) {
    console.error(`CSV não encontrado: ${CSV_PATH}`);
    process.exit(1);
  }

  console.log(`API: ${API_BASE}`);
  console.log(`CSV: ${CSV_PATH}\n`);

  await login(email, password);
  console.log("✓ Login OK");

  const csrf = await getCsrfToken();
  console.log("✓ CSRF token obtido\n");

  const catMap = await ensureCategorias(csrf);
  console.log("");

  const existingNames = await loadExistingProductNames();
  console.log(`Produtos já existentes: ${existingNames.size}\n`);

  const rows = loadCsv(CSV_PATH);
  console.log(`Lidas ${rows.length} linhas do CSV.\n`);

  const fails = [];
  let created = 0;
  let skipped = 0;
  for (const row of rows) {
    const r = await createProduto(row, catMap, existingNames, csrf);
    if (r.ok && r.skipped) {
      console.log(`[SKIP] ${r.nome} — já existe`);
      skipped++;
    } else if (r.ok) {
      console.log(`[OK] ${r.nome} (id ${r.id})`);
      created++;
    } else {
      console.log(`[FAIL] ${r.nome} — ${r.motivo}`);
      fails.push(r);
    }
  }

  console.log(`\nResumo: ${created} criados, ${skipped} pulados, ${fails.length} falhos`);
  if (fails.length) {
    console.log("Falhos:");
    for (const f of fails) console.log(`  - ${f.nome}: ${f.motivo}`);
    process.exit(1);
  }
  process.exit(0);
})().catch((err) => {
  console.error("ERRO:", err.message || err);
  process.exit(1);
});
