require("dotenv").config();
const mysql = require("mysql2/promise");

const DB_HOST = process.env.DB_HOST || "127.0.0.1";
const DB_PORT = Number(process.env.DB_PORT || 3306);
const DB_USER = process.env.DB_USER || "root";

// ✅ aqui tem que ser DB_PASSWORD (não DB_PASS)
const DB_PASS = process.env.DB_PASSWORD || "";

const DB_NAME_TEST = process.env.DB_NAME_TEST || "kavita_migrations_test";

(async () => {
  console.log("🧹 Resetando DB de teste:", DB_NAME_TEST);

  const conn = await mysql.createConnection({
    host: DB_HOST,
    port: DB_PORT,
    user: DB_USER,
    password: DB_PASS, // ✅
    multipleStatements: true,
  });

  await conn.query(`
    DROP DATABASE IF EXISTS \`${DB_NAME_TEST}\`;
    CREATE DATABASE \`${DB_NAME_TEST}\`
      CHARACTER SET utf8mb4
      COLLATE utf8mb4_0900_ai_ci;
  `);

  await conn.end();
  console.log("✅ DB recriado com sucesso.");
})().catch((err) => {
  console.error("❌ Falha ao resetar DB de teste:", err?.message || err);
  process.exit(1);
});