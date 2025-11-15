#!/usr/bin/env node

require("dotenv").config();

const fs = require("fs/promises");
const os = require("os");
const path = require("path");
const zlib = require("zlib");
const { promisify } = require("util");
const { spawn } = require("child_process");
const storageService = require("../../services/storage");

const gzip = promisify(zlib.gzip);

async function ensureDumpFile(filePath) {
  const host = process.env.DB_HOST || "localhost";
  const user = process.env.DB_USER || "root";
  const database = process.env.DB_NAME || "kavita";
  const port = process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306;
  const password = process.env.DB_PASSWORD || "";

  await fs.mkdir(path.dirname(filePath), { recursive: true });

  await new Promise((resolve, reject) => {
    const args = [
      `-h${host}`,
      `-P${port}`,
      `-u${user}`,
      database,
    ];

    const child = spawn("mysqldump", args, {
      env: { ...process.env, MYSQL_PWD: password },
    });

    const output = fs.createWriteStream(filePath);
    child.stdout.pipe(output);
    child.stderr.on("data", (chunk) => process.stderr.write(chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`mysqldump exited with code ${code}`));
      }
    });
  });
}

async function main() {
  const timestamp = new Date().toISOString().replace(/[:T]/g, "-").replace(/\..+/, "");
  const dumpFilename = `kavita-backup-${timestamp}.sql`;
  const tmpFile = path.join(os.tmpdir(), dumpFilename);

  console.info(`📦 Gerando dump MySQL em ${tmpFile}`);
  await ensureDumpFile(tmpFile);

  const sqlBuffer = await fs.readFile(tmpFile);
  await fs.unlink(tmpFile).catch(() => {});

  console.info("🗜️  Compactando dump...");
  const gzBuffer = await gzip(sqlBuffer);

  const storageKey = `backups/${dumpFilename}.gz`;
  console.info(`☁️  Enviando backup para storage em ${storageKey}`);
  const uploaded = await storageService.uploadBuffer(
    gzBuffer,
    `${dumpFilename}.gz`,
    "application/gzip"
  );

  console.info("✅ Backup concluído com sucesso!", uploaded.url);
}

main().catch((err) => {
  console.error("❌ Falha ao executar backup:", err);
  process.exitCode = 1;
});
