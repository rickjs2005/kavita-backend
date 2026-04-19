#!/usr/bin/env node
// scripts/backup-mysql.js
//
// Faz dump gzipped do banco MySQL e aplica retenção (delete > N dias).
// Cross-platform (Windows + Linux + macOS) — usa child_process spawn
// e streams de compressão do Node. Não depende de bash nem de gzip
// no PATH — tudo via APIs nativas.
//
// Uso:
//   node scripts/backup-mysql.js              # dump + gzip + retention
//   npm run db:backup                         # idem (wrapper)
//
// Env vars relevantes:
//   DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME  (já existem)
//   BACKUP_DIR                 diretório destino (default: ./backups)
//   BACKUP_RETENTION_DAYS      apaga arquivos mais antigos (default: 30)
//   MYSQLDUMP_PATH             caminho explícito se mysqldump não
//                              estiver no PATH (Windows típico)
//
// Saída: backups/kavita-YYYY-MM-DDTHH-MM-SS.sql.gz
//
// Exit codes:
//   0  sucesso
//   1  erro de uso / config
//   2  mysqldump falhou
//   3  erro de IO (disco cheio, permissão)
//
// Upload remoto: esta primeira versão só faz backup local. Integração
// com S3/R2 fica para quando o storageAdapter estiver ativo (P0-03)
// — a cron pode chamar um post-hook (ex.: aws s3 cp) depois.

"use strict";

require("dotenv").config();

const path = require("node:path");
const fs = require("node:fs");
const zlib = require("node:zlib");
const { spawn } = require("node:child_process");

function fail(msg, code = 1) {
  console.error(`[backup] ${msg}`);
  process.exit(code);
}

// ---------------------------------------------------------------------------
// Resolve config
// ---------------------------------------------------------------------------

const DB_HOST = process.env.DB_HOST;
const DB_PORT = process.env.DB_PORT || "3306";
const DB_USER = process.env.DB_USER;
const DB_PASSWORD = process.env.DB_PASSWORD;
const DB_NAME = process.env.DB_NAME;

if (!DB_HOST || !DB_USER || !DB_NAME) {
  fail(
    "DB_HOST, DB_USER e DB_NAME são obrigatórios. Confira o .env.",
  );
}

const BACKUP_DIR = path.resolve(process.env.BACKUP_DIR || "./backups");
const RETENTION_DAYS = Number(process.env.BACKUP_RETENTION_DAYS || 30);
if (!Number.isFinite(RETENTION_DAYS) || RETENTION_DAYS < 1) {
  fail("BACKUP_RETENTION_DAYS inválido (deve ser número >= 1).");
}

// Windows tipicamente precisa de caminho absoluto pro mysqldump. Linux
// pega direto do PATH via "mysqldump".
const MYSQLDUMP = process.env.MYSQLDUMP_PATH || "mysqldump";

// ---------------------------------------------------------------------------
// Nome do arquivo com timestamp ISO sem chars inválidos em Windows
// ---------------------------------------------------------------------------

const now = new Date();
const stamp = now
  .toISOString()
  .replace(/\..+$/, "") // descarta ms + Z
  .replace(/:/g, "-"); // : é inválido em FAT32/NTFS
const fileName = `kavita-${stamp}.sql.gz`;
const outPath = path.join(BACKUP_DIR, fileName);

// Cria diretório se não existir (recursive cobre pais inexistentes).
fs.mkdirSync(BACKUP_DIR, { recursive: true });

// ---------------------------------------------------------------------------
// Dump: mysqldump → gzip → arquivo
// ---------------------------------------------------------------------------
//
// Por que não passar --password na linha de comando: fica visível em
// `ps` em Linux. Usa MYSQL_PWD no env do child process.
//
// Flags escolhidas:
//   --single-transaction   consistente em InnoDB sem lockar DDL
//   --quick                stream row-by-row (não materializa tudo em RAM)
//   --set-gtid-purged=OFF  evita complicação com replicação que não usamos
//   --default-character-set=utf8mb4  consistente com o schema
//   --no-tablespaces       dispensa PROCESS privilege em MySQL 8+
//   --routines / --triggers / --events  preserva lógica do schema

const args = [
  `--host=${DB_HOST}`,
  `--port=${DB_PORT}`,
  `--user=${DB_USER}`,
  "--single-transaction",
  "--quick",
  "--set-gtid-purged=OFF",
  "--default-character-set=utf8mb4",
  "--no-tablespaces",
  "--routines",
  "--triggers",
  "--events",
  DB_NAME,
];

console.log(
  `[backup] Dump começando: ${DB_NAME}@${DB_HOST}:${DB_PORT} → ${outPath}`,
);

const dumpEnv = { ...process.env };
if (DB_PASSWORD) {
  dumpEnv.MYSQL_PWD = DB_PASSWORD;
  // Remove do logging pra não vazar se alguém tiver pino com trace.
  delete dumpEnv.DB_PASSWORD;
}

const dump = spawn(MYSQLDUMP, args, { env: dumpEnv });
const gzip = zlib.createGzip({ level: 9 });
const out = fs.createWriteStream(outPath);

dump.stdout.pipe(gzip).pipe(out);

// Captura stderr do mysqldump pra log (errors + warnings sobre
// SSL/collations/etc entram aqui).
let stderrBuf = "";
dump.stderr.on("data", (chunk) => {
  stderrBuf += chunk.toString();
});

dump.on("error", (err) => {
  fail(`mysqldump falhou ao iniciar: ${err.message}. ` +
       "Está instalado? Em Windows, configure MYSQLDUMP_PATH no .env.", 2);
});

dump.on("exit", (code) => {
  if (code !== 0) {
    // Descarta arquivo parcial — sem ele, cron pode aparentar OK com
    // backup truncado.
    try { fs.unlinkSync(outPath); } catch { /* arquivo talvez nem existiu */ }
    fail(
      `mysqldump saiu com código ${code}. stderr:\n${stderrBuf.trim() || "(vazio)"}`,
      2,
    );
  }
});

out.on("error", (err) => fail(`erro ao escrever ${outPath}: ${err.message}`, 3));

out.on("finish", () => {
  const stats = fs.statSync(outPath);
  const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
  console.log(`[backup] OK — ${outPath} (${sizeMB} MB)`);

  applyRetention();
  process.exit(0);
});

// ---------------------------------------------------------------------------
// Retenção: apaga backups com mtime > N dias
// ---------------------------------------------------------------------------

function applyRetention() {
  const cutoff = Date.now() - RETENTION_DAYS * 86_400_000;
  let deleted = 0;
  let kept = 0;

  try {
    const entries = fs.readdirSync(BACKUP_DIR);
    for (const name of entries) {
      // Só mexe em arquivos no nosso padrão de nome pra não apagar
      // arquivo alheio (ex.: o operador colocou um .sql manual lá).
      if (!/^kavita-.+\.sql\.gz$/.test(name)) continue;
      const full = path.join(BACKUP_DIR, name);
      const st = fs.statSync(full);
      if (st.mtimeMs < cutoff) {
        fs.unlinkSync(full);
        deleted++;
      } else {
        kept++;
      }
    }
  } catch (err) {
    console.warn(
      `[backup] Aviso: retenção parcial — ${err.message}. Backups antigos podem acumular.`,
    );
    return;
  }

  console.log(
    `[backup] Retenção: ${kept} mantidos, ${deleted} apagados (> ${RETENTION_DAYS}d).`,
  );
}
