require("dotenv").config();
const mysql = require("mysql2/promise");

const TABLES = [
  "admin_logs",
  "admin_permissions",
  "admin_role_permissions",
  "admin_roles",
  "admins",
  "avaliacoes_servico",
  "carrinho_itens",
  "carrinhos",
  "carrinhos_abandonados",
  "carrinhos_abandonados_notifications",
  "categories",
  "colaborador_images",
  "colaboradores",
  "comunicacoes_enviadas",
  "cupons",
  "drone_comment_media",
  "drone_comments",
  "drone_gallery_items",
  "drone_model_media_selections",
  "drone_models",
  "drone_page_settings",
  "drone_representatives",
  "enderecos_usuario",
  "especialidades",
  "favorites",
  "news_clima",
  "news_cotacoes",
  "news_cotacoes_history",
  "news_posts",
  "password_reset_tokens",
  "payment_methods",
  "pedidos",
  "pedidos_produtos",
  "product_categories",
  "product_images",
  "product_promotions",
  "products",
  "produto_avaliacoes",
  "shipping_rates",
  "shipping_zone_cities",
  "shipping_zones",
  "shop_settings",
  "site_hero_settings",
  "solicitacoes_servico",
  "usuarios",
];

/**
 * Normaliza SHOW CREATE TABLE para reduzir falso-positivo:
 * - remove AUTO_INCREMENT variável
 * - remove "CHARACTER SET utf8mb4" explícito (quando aparece junto com COLLATE)
 * - remove constraint órfã conhecida: REFERENCES services (tabela não existe no dump)
 * - normaliza whitespace/linhas vazias
 */
function normalizeShowCreate(s) {
  return String(s)
    // variação de auto increment
    .replace(/AUTO_INCREMENT=\d+\s*/gi, "")
    // variação de output do MySQL: às vezes imprime o charset explicitamente
    .replace(/\s+CHARACTER SET\s+utf8mb4\b/gi, "")
    // ignora FK/constraint órfã conhecida no schema real (REFERENCES services)
    .split("\n")
    .filter((line) => !/REFERENCES\s+`?services`?\b/i.test(line))
    .join("\n")
    // normaliza espaços e linhas
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n+/g, "\n")
    .trim();
}

function simpleLineDiff(a, b, context = 3) {
  const A = a.split("\n");
  const B = b.split("\n");
  const max = Math.max(A.length, B.length);

  for (let i = 0; i < max; i++) {
    if (A[i] !== B[i]) {
      const start = Math.max(0, i - context);
      const end = Math.min(max, i + context + 1);

      const out = [];
      out.push(`Primeira diferença na linha ${i + 1}:`);
      out.push("--- REAL (kavita)");
      for (let j = start; j < end; j++) out.push(`${String(j + 1).padStart(4)} | ${A[j] ?? ""}`);
      out.push("--- MIGRADO (kavita_migrations_test)");
      for (let j = start; j < end; j++) out.push(`${String(j + 1).padStart(4)} | ${B[j] ?? ""}`);

      return out.join("\n");
    }
  }
  return null;
}

async function getShowCreate(conn, table) {
  const [rows] = await conn.query(`SHOW CREATE TABLE \`${table}\``);
  const key = Object.keys(rows[0]).find((k) => k.toLowerCase().includes("create table"));
  return rows[0][key];
}

async function main() {
  const realDb = process.env.AUDIT_REAL_DB || process.env.DB_REAL || process.env.DB_NAME || "kavita";
  const testDb = process.env.AUDIT_TEST_DB || process.env.DB_TEST || process.env.DB_NAME_TEST || "kavita_migrations_test";

  const baseConfig = {
    host: process.env.DB_HOST || "127.0.0.1",
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    multipleStatements: true,
  };

  const connReal = await mysql.createConnection({ ...baseConfig, database: realDb });
  const connTest = await mysql.createConnection({ ...baseConfig, database: testDb });

  const diffs = [];

  try {
    for (const t of TABLES) {
      const real = normalizeShowCreate(await getShowCreate(connReal, t));
      const test = normalizeShowCreate(await getShowCreate(connTest, t));

      if (real !== test) {
        diffs.push({ table: t, diff: simpleLineDiff(real, test, 3) || "(strings diferem)" });
      }
    }
  } finally {
    await connReal.end();
    await connTest.end();
  }

  if (diffs.length) {
    console.error(`\n❌ Divergências encontradas: ${diffs.length}\n`);
    for (const x of diffs) {
      console.error(`==== TABELA: ${x.table} ====`);
      console.error(x.diff);
      console.error("");
    }
    process.exit(1);
  }

  console.log("✅ Auditoria OK: 0 divergências (SHOW CREATE TABLE normalizado idêntico).");
  process.exit(0);
}

main().catch((e) => {
  console.error("ERRO audit:", e);
  process.exit(1);
});