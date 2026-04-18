#!/usr/bin/env node
// scripts/deploy/entrypoint.js
//
// ETAPA 1 — entrypoint unificado de produção.
//
// Roda migrations pendentes ANTES de subir o HTTP server. Se as
// migrations falharem, processo sai com exit=1 — Docker/PM2/Railway
// reinicia e o deploy só completa quando o schema está atualizado.
//
// Pode ser desligado via `SKIP_DB_MIGRATE=1` quando se quer subir
// uma réplica de emergência sem tocar no schema. Default é rodar.
//
// Log intencionalmente verboso — deploys de produção precisam deixar
// rastro claro de "migrations X rodadas antes do server Y".

"use strict";

const { spawn } = require("node:child_process");
const path = require("node:path");

function log(msg, ...rest) {
  console.log(`[entrypoint] ${msg}`, ...rest);
}

function runStep(command, args, stepName) {
  return new Promise((resolve, reject) => {
    log(`▶ ${stepName}: ${command} ${args.join(" ")}`);
    const child = spawn(command, args, {
      stdio: "inherit",
      shell: process.platform === "win32",
      cwd: path.resolve(__dirname, "..", ".."),
    });
    child.on("exit", (code) => {
      if (code === 0) {
        log(`✓ ${stepName} concluído`);
        resolve();
      } else {
        reject(new Error(`${stepName} falhou com código ${code}`));
      }
    });
    child.on("error", reject);
  });
}

async function main() {
  const start = Date.now();
  log(`NODE_ENV=${process.env.NODE_ENV ?? "undefined"}`);

  if (process.env.SKIP_DB_MIGRATE === "1") {
    log("SKIP_DB_MIGRATE=1 — pulando migrations (deploy de emergência).");
  } else {
    try {
      await runStep(
        "npx",
        ["sequelize-cli", "db:migrate"],
        "db:migrate",
      );
    } catch (err) {
      log(`✗ Falha crítica: ${err.message}`);
      log(
        "Migrations não aplicadas. Server NÃO vai subir — " +
          "resolva o erro antes de tentar novamente.",
      );
      process.exit(1);
    }
  }

  log(`Migrations ok em ${Date.now() - start}ms. Iniciando server.`);
  // require em vez de spawn — herda o process para o Node tratar
  // SIGTERM corretamente (bootstrap/shutdown.js já depende disso).
  require(path.resolve(__dirname, "..", "..", "server.js"));
}

main().catch((err) => {
  log(`✗ Entrypoint fatal: ${err.message}`);
  process.exit(1);
});
