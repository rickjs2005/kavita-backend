"use strict";

// scripts/ops/audit-legacy-fixtures.js
//
// Audita (e opcionalmente remove) resíduos de fixtures de
// desenvolvimento que possam ter contaminado o banco em qualquer
// ambiente, incluindo produção.
//
// Critérios cobertos:
//   - admins             email LIKE '%kavita.local'
//   - usuarios           email LIKE '%kavita.local'
//   - producer_accounts  email LIKE '%kavita.local'
//   - corretora_users    email LIKE '%kavita.local'
//   - corretoras         nome  LIKE '%(Demo)%'
//   - corretora_leads    vinculados às corretoras acima
//   - products           nome bate exatamente com produtos-local.csv
//
// Uso (report-only, default):
//   node scripts/ops/audit-legacy-fixtures.js
//   railway run node scripts/ops/audit-legacy-fixtures.js
//
// Uso (--apply remove admins/usuarios/producer/corretora-users +
//                 corretoras (Demo) + leads vinculados):
//   node scripts/ops/audit-legacy-fixtures.js --apply
//
// Uso (--apply --include-products também apaga produtos do CSV):
//   node scripts/ops/audit-legacy-fixtures.js --apply --include-products
//
// Salvaguardas no modo --apply:
//   - exige ao menos 1 admin real ativo cujo email NÃO termine em
//     'kavita.local' (impede locking-out)
//   - usa transação para corretoras+leads (delete em cascata lógica)
//   - usuarios com pedidos são reportados e pulados

require("dotenv").config();

const fs = require("node:fs");
const path = require("node:path");
const mysql = require("mysql2/promise");

const args = new Set(process.argv.slice(2));
const APPLY = args.has("--apply");
const INCLUDE_PRODUCTS = args.has("--include-products");

const PRODUCTS_TABLE = process.env.PRODUCTS_TABLE || "products";
const CSV_PATH = path.join(
  __dirname,
  "..",
  "dev",
  "data",
  "produtos-local.csv",
);

const KAVITA_LOCAL_LIKE = "%kavita.local";
const CORRETORA_DEMO_LIKE = "%(Demo)%";

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

async function tableHasColumn(conn, table, column) {
  const [rows] = await conn.query(
    `SELECT COUNT(*) AS n FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column],
  );
  return rows[0].n > 0;
}

async function hasRealAdmin(conn) {
  const [rows] = await conn.query(
    `SELECT id, email FROM admins
      WHERE ativo = 1 AND email NOT LIKE ? ORDER BY id LIMIT 5`,
    [KAVITA_LOCAL_LIKE],
  );
  return rows;
}

async function main() {
  if (!process.env.DB_HOST || !process.env.DB_NAME) {
    console.error("ERRO: DB_HOST/DB_NAME ausentes no ambiente.");
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
  console.log("  audit-legacy-fixtures");
  console.log("-------------------------------------------");
  console.log(`  Host    : ${process.env.DB_HOST}`);
  console.log(`  Database: ${process.env.DB_NAME}`);
  console.log(`  Modo    : ${APPLY ? "APPLY (vai apagar)" : "REPORT (somente leitura)"}`);
  if (APPLY && INCLUDE_PRODUCTS) console.log("  Inclui  : produtos do CSV");
  console.log("===========================================\n");

  // -----------------------------------------------------------------
  // Inventário (sempre roda)
  // -----------------------------------------------------------------

  const [demoAdmins] = await conn.query(
    "SELECT id, email, role, ativo FROM admins WHERE email LIKE ? ORDER BY id",
    [KAVITA_LOCAL_LIKE],
  );

  const [demoUsers] = await conn.query(
    `SELECT u.id, u.email, u.nome,
            (SELECT COUNT(*) FROM pedidos p WHERE p.usuario_id = u.id) AS pedidos
       FROM usuarios u
      WHERE u.email LIKE ? ORDER BY u.id`,
    [KAVITA_LOCAL_LIKE],
  );

  const hasProducerTable = await tableHasColumn(conn, "producer_accounts", "email");
  let demoProducers = [];
  if (hasProducerTable) {
    const [rows] = await conn.query(
      "SELECT id, email, nome FROM producer_accounts WHERE email LIKE ? ORDER BY id",
      [KAVITA_LOCAL_LIKE],
    );
    demoProducers = rows;
  }

  const hasCorretoraUsersTable = await tableHasColumn(conn, "corretora_users", "email");
  let demoCorretoraUsers = [];
  if (hasCorretoraUsersTable) {
    const [rows] = await conn.query(
      `SELECT id, email, corretora_id, role FROM corretora_users
        WHERE email LIKE ? ORDER BY id`,
      [KAVITA_LOCAL_LIKE],
    );
    demoCorretoraUsers = rows;
  }

  const hasCorretorasTable = await tableHasColumn(conn, "corretoras", "nome");
  let demoCorretoras = [];
  if (hasCorretorasTable) {
    const [rows] = await conn.query(
      `SELECT id, nome, slug, kyc_status FROM corretoras
        WHERE nome LIKE ? ORDER BY id`,
      [CORRETORA_DEMO_LIKE],
    );
    demoCorretoras = rows;
  }

  let demoLeads = [];
  if (demoCorretoras.length) {
    const ids = demoCorretoras.map((c) => c.id);
    const placeholders = ids.map(() => "?").join(",");
    const [rows] = await conn.query(
      `SELECT id, corretora_id, nome, status FROM corretora_leads
        WHERE corretora_id IN (${placeholders}) ORDER BY corretora_id, id`,
      ids,
    );
    demoLeads = rows;
  }

  const csvNames = parseCsvNames(CSV_PATH);
  let demoProducts = [];
  if (csvNames.length) {
    const placeholders = csvNames.map(() => "?").join(",");
    const [rows] = await conn.query(
      `SELECT id, name FROM \`${PRODUCTS_TABLE}\`
        WHERE name IN (${placeholders}) ORDER BY id`,
      csvNames,
    );
    demoProducts = rows;
  }

  // -----------------------------------------------------------------
  // Relatório por tabela
  // -----------------------------------------------------------------

  console.log(`Admins  @kavita.local: ${demoAdmins.length}`);
  for (const a of demoAdmins) console.log(`  id=${a.id}  ${a.email}  role=${a.role}  ativo=${a.ativo}`);

  console.log(`\nUsuarios @kavita.local: ${demoUsers.length}`);
  for (const u of demoUsers) {
    const flag = u.pedidos > 0 ? "  ⚠ tem pedidos" : "";
    console.log(`  id=${u.id}  ${u.email}  pedidos=${u.pedidos}${flag}`);
  }

  console.log(`\nProducer accounts @kavita.local: ${demoProducers.length}`);
  for (const p of demoProducers) console.log(`  id=${p.id}  ${p.email}  ${p.nome ?? ""}`);

  console.log(`\nCorretora users @kavita.local: ${demoCorretoraUsers.length}`);
  for (const u of demoCorretoraUsers) console.log(`  id=${u.id}  ${u.email}  corretora_id=${u.corretora_id}  role=${u.role}`);

  console.log(`\nCorretoras com (Demo) no nome: ${demoCorretoras.length}`);
  for (const c of demoCorretoras) console.log(`  id=${c.id}  ${c.nome}  slug=${c.slug}  kyc=${c.kyc_status}`);

  console.log(`\nLeads vinculados a corretoras (Demo): ${demoLeads.length}`);
  for (const l of demoLeads.slice(0, 10)) console.log(`  id=${l.id}  corretora_id=${l.corretora_id}  status=${l.status}  ${l.nome ?? ""}`);
  if (demoLeads.length > 10) console.log(`  ... +${demoLeads.length - 10}`);

  console.log(`\nProdutos do CSV local: ${demoProducts.length}/${csvNames.length}`);
  for (const p of demoProducts.slice(0, 15)) console.log(`  id=${p.id}  ${p.name}`);
  if (demoProducts.length > 15) console.log(`  ... +${demoProducts.length - 15}`);

  // -----------------------------------------------------------------
  // Report-only — sai aqui
  // -----------------------------------------------------------------
  if (!APPLY) {
    console.log("\n[report] nada foi alterado.");
    console.log("[report] para remover fixtures (preserva usuarios com pedidos):");
    console.log("         node scripts/ops/audit-legacy-fixtures.js --apply");
    console.log("[report] para também remover produtos do CSV:");
    console.log("         node scripts/ops/audit-legacy-fixtures.js --apply --include-products");
    await conn.end();
    return;
  }

  // -----------------------------------------------------------------
  // APPLY — salvaguarda: exigir admin real ativo
  // -----------------------------------------------------------------
  console.log("\n=== APPLY ===\n");

  const realAdmins = await hasRealAdmin(conn);
  if (realAdmins.length === 0) {
    console.error(
      "ABORT: nenhum admin ativo fora do domínio kavita.local foi encontrado.\n" +
        "       Cadastre um admin real (com 2FA) antes de remover fixtures.\n" +
        "       Sem isso, removeríamos a única forma de entrar no painel.",
    );
    await conn.end();
    process.exit(2);
  }
  console.log(`✓ Admin real ativo confirmado: ${realAdmins[0].email} (id=${realAdmins[0].id})`);
  if (realAdmins.length > 1) console.log(`  (+${realAdmins.length - 1} outros admins reais ativos)`);

  // ---- admins -----
  if (demoAdmins.length) {
    const ids = demoAdmins.map((a) => a.id);
    const [r] = await conn.query("DELETE FROM admins WHERE id IN (?)", [ids]);
    console.log(`✓ admins removidos: ${r.affectedRows}`);
  } else {
    console.log("- admins: nada a fazer");
  }

  // ---- usuarios (sem pedidos) -----
  let usersDeleted = 0;
  let usersSkipped = 0;
  for (const u of demoUsers) {
    if (u.pedidos > 0) {
      console.log(`! pulado usuario ${u.email} (id=${u.id}): ${u.pedidos} pedido(s)`);
      usersSkipped++;
      continue;
    }
    try {
      await conn.query("DELETE FROM carrinhos WHERE usuario_id = ?", [u.id]);
      await conn.query("DELETE FROM usuarios WHERE id = ?", [u.id]);
      console.log(`✓ removido usuario ${u.email} (id=${u.id})`);
      usersDeleted++;
    } catch (err) {
      console.log(`! erro ao remover usuario ${u.email}: ${err.code || err.message}`);
      usersSkipped++;
    }
  }
  console.log(`Usuários: ${usersDeleted} removidos, ${usersSkipped} pulados`);

  // ---- producer_accounts -----
  let producersDeleted = 0;
  if (demoProducers.length) {
    for (const p of demoProducers) {
      try {
        await conn.query("DELETE FROM producer_accounts WHERE id = ?", [p.id]);
        console.log(`✓ removido producer ${p.email} (id=${p.id})`);
        producersDeleted++;
      } catch (err) {
        console.log(`! erro ao remover producer ${p.email}: ${err.code || err.message}`);
      }
    }
    console.log(`Producers: ${producersDeleted}/${demoProducers.length} removidos`);
  }

  // ---- corretora_users -----
  let corrUsersDeleted = 0;
  if (demoCorretoraUsers.length) {
    for (const u of demoCorretoraUsers) {
      try {
        await conn.query("DELETE FROM corretora_users WHERE id = ?", [u.id]);
        console.log(`✓ removido corretora_user ${u.email} (id=${u.id})`);
        corrUsersDeleted++;
      } catch (err) {
        console.log(`! erro corretora_user ${u.email}: ${err.code || err.message}`);
      }
    }
    console.log(`Corretora users: ${corrUsersDeleted}/${demoCorretoraUsers.length} removidos`);
  }

  // ---- corretoras + leads em transação -----
  if (demoCorretoras.length) {
    await conn.beginTransaction();
    try {
      const cids = demoCorretoras.map((c) => c.id);
      const placeholders = cids.map(() => "?").join(",");
      const [leadRes] = await conn.query(
        `DELETE FROM corretora_leads WHERE corretora_id IN (${placeholders})`,
        cids,
      );
      const [corrRes] = await conn.query(
        `DELETE FROM corretoras WHERE id IN (${placeholders})`,
        cids,
      );
      await conn.commit();
      console.log(
        `✓ removidos: ${corrRes.affectedRows} corretoras (Demo) + ${leadRes.affectedRows} leads vinculados`,
      );
    } catch (err) {
      await conn.rollback();
      console.log(`! erro ao remover corretoras/leads: ${err.code || err.message}`);
      console.log("  rollback executado — nada foi apagado neste bloco.");
    }
  }

  // ---- produtos (opt-in) -----
  if (INCLUDE_PRODUCTS) {
    let ok = 0;
    let fail = 0;
    for (const p of demoProducts) {
      try {
        try {
          await conn.query(
            "DELETE FROM product_images WHERE product_id = ?",
            [p.id],
          );
        } catch {
          // tabela sem FK ou ausente — ignora
        }
        await conn.query(`DELETE FROM \`${PRODUCTS_TABLE}\` WHERE id = ?`, [p.id]);
        ok++;
      } catch (err) {
        console.log(`! produto "${p.name}" (id=${p.id}): ${err.code || err.message}`);
        fail++;
      }
    }
    console.log(`Produtos: ${ok} removidos, ${fail} falhos`);
  } else if (demoProducts.length) {
    console.log(
      `\n(produtos não removidos — use --include-products para apagar os ${demoProducts.length} matches do CSV)`,
    );
  }

  await conn.end();
  console.log("\nFeito.");
}

main().catch((err) => {
  console.error("\nFALHA:", err.message);
  process.exit(1);
});
