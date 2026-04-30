"use strict";

// scripts/demo/seed-demo.js
//
// Seed mínimo para DEMO. Cria:
//   - 1 admin master:   demo-admin@kavita.local       senha: demo1234
//   - 1 cliente loja:   demo-cliente@kavita.local     senha: demo1234
//
// Idempotente: re-rodar não duplica. Pula se o e-mail já existir.
//
// Uso (Railway):
//   railway run node scripts/demo/seed-demo.js
// OU (local com .env apontando pro DB Railway):
//   node scripts/demo/seed-demo.js

require("dotenv").config();
const bcrypt = require("bcrypt");
const mysql = require("mysql2/promise");

const ADMIN_EMAIL = "demo-admin@kavita.local";
const CLIENT_EMAIL = "demo-cliente@kavita.local";
const SENHA = "demo1234";

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
      ["Demo Admin", ADMIN_EMAIL, hash]
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
      ["Demo Cliente", CLIENT_EMAIL, hash, "11999990000"]
    );
    console.log(`✓ Cliente criado: ${CLIENT_EMAIL} / ${SENHA}`);
  } else {
    console.log(`= Cliente já existe: ${CLIENT_EMAIL}`);
  }

  await c.end();
  console.log("\nLogins da demo:");
  console.log(`  Admin painel: ${ADMIN_EMAIL}    senha: ${SENHA}`);
  console.log(`  Cliente loja: ${CLIENT_EMAIL}   senha: ${SENHA}`);
})().catch((err) => {
  console.error("seed falhou:", err.message);
  process.exit(1);
});
