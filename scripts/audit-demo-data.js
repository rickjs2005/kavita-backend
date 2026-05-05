"use strict";

// scripts/audit-demo-data.js
//
// Lista (audit, default) ou remove (--apply) resíduos do antigo
// seed-demo.js e seed-produtos-demo.js que possam ter contaminado o
// banco em qualquer ambiente (incluindo produção via Railway).
//
// Critérios:
//   - admins  : email termina em '@kavita.local'
//   - usuarios: email termina em '@kavita.local'
//   - produtos: nome bate exatamente com linha do scripts/data/produtos-demo.csv
//
// Uso (audit / read-only):
//   node scripts/audit-demo-data.js
//   railway run node scripts/audit-demo-data.js
//
// Uso (apply / remove admins+usuarios @kavita.local sem pedidos):
//   node scripts/audit-demo-data.js --apply
//
// Uso (também remove produtos do CSV):
//   node scripts/audit-demo-data.js --apply --include-products
//
// O script NUNCA apaga usuários que tenham pedidos associados — eles
// são reportados e pulados, para você decidir manualmente.

require("dotenv").config();
const fs = require("node:fs");
const path = require("node:path");
const mysql = require("mysql2/promise");

const args = new Set(process.argv.slice(2));
const APPLY = args.has("--apply");
const INCLUDE_PRODUCTS = args.has("--include-products");

const PRODUCTS_TABLE = process.env.PRODUCTS_TABLE || "products";
const CSV_PATH = path.join(__dirname, "data", "produtos-demo.csv");

function parseCsvNames(filePath) {
  if (!fs.existsSync(filePath)) {
    console.log(`(aviso) CSV não encontrado em ${filePath} — pulando produtos.`);
    return [];
  }
  const text = fs.readFileSync(filePath, "utf8");
  const lines = text.split(/\r?\n/).slice(1);
  const names = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    const m = line.match(/^"([^"]+)"|^([^,]+)/);
    if (m) names.push(m[1] ?? m[2]);
  }
  return names;
}

async function main() {
  if (!process.env.DB_HOST || !process.env.DB_NAME) {
    console.error("ERRO: DB_HOST/DB_NAME ausentes no ambiente. Carregue o .env certo.");
    process.exit(1);
  }

  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: Number(process.env.DB_PORT || 3306),
    multipleStatements: false,
  });

  console.log("===========================================");
  console.log("  audit-demo-data");
  console.log("-------------------------------------------");
  console.log(`  Host    : ${process.env.DB_HOST}`);
  console.log(`  Database: ${process.env.DB_NAME}`);
  console.log(`  Modo    : ${APPLY ? "APPLY (vai apagar)" : "AUDIT (somente leitura)"}`);
  if (APPLY && INCLUDE_PRODUCTS) console.log("  Inclui  : produtos do CSV");
  console.log("===========================================\n");

  // -----------------------------------------------------------------
  // 1) Admins demo (@kavita.local)
  // -----------------------------------------------------------------
  const [demoAdmins] = await conn.query(
    "SELECT id, email, role, ativo, criado_em FROM admins WHERE email LIKE '%@kavita.local' ORDER BY id",
  );
  console.log(`Admins com @kavita.local: ${demoAdmins.length}`);
  for (const a of demoAdmins) {
    console.log(`  id=${a.id}  ${a.email}  role=${a.role}  ativo=${a.ativo}`);
  }

  // -----------------------------------------------------------------
  // 2) Usuarios demo (@kavita.local) + contagem de pedidos
  // -----------------------------------------------------------------
  const [demoUsers] = await conn.query(
    `SELECT u.id, u.email, u.nome,
            (SELECT COUNT(*) FROM pedidos p WHERE p.usuario_id = u.id) AS pedidos
       FROM usuarios u
      WHERE u.email LIKE '%@kavita.local'
      ORDER BY u.id`,
  );
  console.log(`\nUsuários com @kavita.local: ${demoUsers.length}`);
  for (const u of demoUsers) {
    const flag = u.pedidos > 0 ? "  ⚠ TEM PEDIDOS" : "";
    console.log(`  id=${u.id}  ${u.email}  pedidos=${u.pedidos}${flag}`);
  }

  // -----------------------------------------------------------------
  // 3) Produtos com nome do CSV
  // -----------------------------------------------------------------
  const csvNames = parseCsvNames(CSV_PATH);
  let demoProducts = [];
  if (csvNames.length) {
    const placeholders = csvNames.map(() => "?").join(",");
    const [rows] = await conn.query(
      `SELECT id, name, created_at FROM \`${PRODUCTS_TABLE}\`
        WHERE name IN (${placeholders}) ORDER BY id`,
      csvNames,
    );
    demoProducts = rows;
  }
  console.log(`\nProdutos com nome do CSV demo: ${demoProducts.length}/${csvNames.length}`);
  const showLimit = 15;
  for (const p of demoProducts.slice(0, showLimit)) {
    console.log(`  id=${p.id}  ${p.name}`);
  }
  if (demoProducts.length > showLimit) {
    console.log(`  ... e mais ${demoProducts.length - showLimit}`);
  }

  // -----------------------------------------------------------------
  // Audit only — sai aqui.
  // -----------------------------------------------------------------
  if (!APPLY) {
    console.log("\n[audit] nada foi alterado.");
    console.log("[audit] para remover admins+usuarios sem pedidos:");
    console.log("        node scripts/audit-demo-data.js --apply");
    console.log("[audit] para também remover produtos do CSV:");
    console.log("        node scripts/audit-demo-data.js --apply --include-products");
    await conn.end();
    return;
  }

  // -----------------------------------------------------------------
  // APPLY
  // -----------------------------------------------------------------
  console.log("\n=== APPLY ===\n");

  // Admins — apaga direto.
  if (demoAdmins.length) {
    const ids = demoAdmins.map((a) => a.id);
    const [r] = await conn.query("DELETE FROM admins WHERE id IN (?)", [ids]);
    console.log(`✓ admins removidos: ${r.affectedRows}`);
  } else {
    console.log("- admins: nada a fazer");
  }

  // Usuários — só os sem pedidos.
  let usersDeleted = 0;
  let usersSkipped = 0;
  for (const u of demoUsers) {
    if (u.pedidos > 0) {
      console.log(`! pulado ${u.email} (id=${u.id}): tem ${u.pedidos} pedido(s)`);
      usersSkipped++;
      continue;
    }
    try {
      // Limpa carrinhos antes para evitar FK
      await conn.query("DELETE FROM carrinhos WHERE usuario_id = ?", [u.id]);
      await conn.query("DELETE FROM usuarios WHERE id = ?", [u.id]);
      console.log(`✓ removido usuario ${u.email} (id=${u.id})`);
      usersDeleted++;
    } catch (err) {
      console.log(`! erro ao remover ${u.email}: ${err.code || err.message}`);
      usersSkipped++;
    }
  }
  console.log(`Usuários: ${usersDeleted} removidos, ${usersSkipped} pulados`);

  // Produtos — só se opt-in explícito.
  if (INCLUDE_PRODUCTS) {
    let ok = 0;
    let fail = 0;
    for (const p of demoProducts) {
      try {
        // Tenta limpar imagens antes (se a tabela existir).
        try {
          await conn.query(
            "DELETE FROM product_images WHERE product_id = ?",
            [p.id],
          );
        } catch {
          // tabela diferente ou sem FK — ignore
        }
        await conn.query(`DELETE FROM \`${PRODUCTS_TABLE}\` WHERE id = ?`, [p.id]);
        ok++;
      } catch (err) {
        console.log(`! produto "${p.name}" (id=${p.id}): ${err.code || err.message}`);
        fail++;
      }
    }
    console.log(`Produtos: ${ok} removidos, ${fail} falhos`);
    if (fail > 0) {
      console.log(
        "(produtos com falha provavelmente têm referência em pedidos_produtos — apague o pedido primeiro ou ignore)",
      );
    }
  } else if (demoProducts.length) {
    console.log(
      `\n(produtos não tocados — rode com --include-products para apagar os ${demoProducts.length} matches do CSV)`,
    );
  }

  await conn.end();
  console.log("\nFeito.");
}

main().catch((err) => {
  console.error("\nFALHA:", err.message);
  process.exit(1);
});
