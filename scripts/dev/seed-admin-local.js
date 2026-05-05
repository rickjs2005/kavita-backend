"use strict";

// scripts/dev/seed-admin-local.js
//
// Seed de desenvolvimento local. Cria fixtures para o dev rodar o
// projeto sem precisar cadastrar admin/cliente manualmente:
//   - 1 admin master:   admin-local@kavita.local
//   - 1 cliente loja:   cliente-local@kavita.local
//   - senha (ambos):    localdev1234
//
// Idempotente: re-rodar não duplica. Pula se o e-mail já existir.
//
// Uso (apenas dev local):
//   node scripts/dev/seed-admin-local.js
//
// Salvaguardas:
//   - aborta se NODE_ENV=production
//   - aborta se DB_HOST não for localhost/127.0.0.1/host.docker.internal
//     (impede rodar contra Railway/RDS/etc por .env mal-configurado)

require("dotenv").config();

if (process.env.NODE_ENV === "production") {
  console.error("Seed bloqueado em produção (NODE_ENV=production).");
  process.exit(1);
}

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "host.docker.internal"]);
const dbHost = (process.env.DB_HOST || "").trim().toLowerCase();
if (!LOCAL_HOSTS.has(dbHost)) {
  console.error(
    `Seed bloqueado: DB_HOST='${process.env.DB_HOST}' não é local. ` +
      "Esperado: localhost, 127.0.0.1 ou host.docker.internal. " +
      "Ajuste o .env para apontar para o MySQL local antes de rodar.",
  );
  process.exit(1);
}

const bcrypt = require("bcrypt");
const mysql = require("mysql2/promise");

const ADMIN_EMAIL = "admin-local@kavita.local";
const CLIENT_EMAIL = "cliente-local@kavita.local";
const SENHA = "localdev1234";

(async () => {
  const c = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: Number(process.env.DB_PORT || 3306),
  });

  const hash = await bcrypt.hash(SENHA, 10);

  // ---- Admin
  const [a] = await c.query("SELECT id FROM admins WHERE email = ?", [ADMIN_EMAIL]);
  if (a.length === 0) {
    await c.query(
      "INSERT INTO admins (nome, email, senha, role, ativo) VALUES (?, ?, ?, 'master', 1)",
      ["Admin Local", ADMIN_EMAIL, hash]
    );
    console.log(`✓ Admin criado: ${ADMIN_EMAIL} / ${SENHA}`);
  } else {
    console.log(`= Admin já existe: ${ADMIN_EMAIL}`);
  }

  // ---- Cliente loja
  const [u] = await c.query("SELECT id FROM usuarios WHERE email = ?", [CLIENT_EMAIL]);
  if (u.length === 0) {
    await c.query(
      "INSERT INTO usuarios (nome, email, senha, telefone) VALUES (?, ?, ?, ?)",
      ["Cliente Local", CLIENT_EMAIL, hash, "11999990000"]
    );
    console.log(`✓ Cliente criado: ${CLIENT_EMAIL} / ${SENHA}`);
  } else {
    console.log(`= Cliente já existe: ${CLIENT_EMAIL}`);
  }

  await c.end();
  console.log("\nLogins locais:");
  console.log(`  Admin painel: ${ADMIN_EMAIL}    senha: ${SENHA}`);
  console.log(`  Cliente loja: ${CLIENT_EMAIL}   senha: ${SENHA}`);
})().catch((err) => {
  console.error("seed falhou:", err.message);
  process.exit(1);
});
