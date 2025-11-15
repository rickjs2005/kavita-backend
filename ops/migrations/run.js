#!/usr/bin/env node

require("dotenv").config();

const fs = require("fs/promises");
const path = require("path");
const mysql = require("mysql2/promise");

const migrationsDir = process.env.MIGRATIONS_DIR
  ? path.resolve(process.cwd(), process.env.MIGRATIONS_DIR)
  : path.join(process.cwd(), "migrations");

async function loadSqlFiles() {
  try {
    const files = await fs.readdir(migrationsDir);
    return files
      .filter((file) => file.endsWith(".sql"))
      .sort((a, b) => a.localeCompare(b));
  } catch (err) {
    if (err.code === "ENOENT") {
      return [];
    }
    throw err;
  }
}

async function main() {
  const files = await loadSqlFiles();
  if (!files.length) {
    console.info("ℹ️  Nenhuma migration SQL encontrada em", migrationsDir);
    return;
  }

  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || "localhost",
    port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "kavita",
    multipleStatements: true,
  });

  await connection.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id INT AUTO_INCREMENT PRIMARY KEY,
      filename VARCHAR(255) NOT NULL UNIQUE,
      executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB;
  `);

  const [executedRows] = await connection.query("SELECT filename FROM schema_migrations");
  const executed = new Set(executedRows.map((row) => row.filename));

  for (const file of files) {
    if (executed.has(file)) {
      console.info(`⏭️  Migration já executada, pulando: ${file}`);
      continue;
    }

    const filePath = path.join(migrationsDir, file);
    const sql = await fs.readFile(filePath, "utf8");

    console.info(`🚚 Executando migration ${file}`);
    await connection.beginTransaction();
    try {
      await connection.query(sql);
      await connection.query("INSERT INTO schema_migrations (filename) VALUES (?)", [file]);
      await connection.commit();
      console.info(`✅ Migration concluída: ${file}`);
    } catch (err) {
      await connection.rollback();
      console.error(`❌ Falha na migration ${file}:`, err.message);
      throw err;
    }
  }

  await connection.end();
}

main().catch((err) => {
  console.error("❌ Erro ao rodar migrations:", err);
  process.exitCode = 1;
});
