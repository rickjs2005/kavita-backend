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
  // Em produção não imprimimos os envs sensíveis (DB_*, JWT_SECRET_len etc).
  // Mesmo "_len" e nomes de host vazam topologia útil para um atacante com
  // acesso ao agregador de logs. Em dev/test mantemos o diagnóstico.
  if (process.env.NODE_ENV !== "production") {
    log(`[debug] DB_HOST=${process.env.DB_HOST ?? "MISSING"}`);
    log(`[debug] DB_PORT=${process.env.DB_PORT ?? "MISSING"}`);
    log(`[debug] DB_USER=${process.env.DB_USER ?? "MISSING"}`);
    log(`[debug] DB_NAME=${process.env.DB_NAME ?? "MISSING"}`);
    log(`[debug] DB_PASSWORD_len=${(process.env.DB_PASSWORD ?? "").length}`);
    log(`[debug] JWT_SECRET_len=${(process.env.JWT_SECRET ?? "").length}`);
  } else {
    log("envs sensíveis omitidas (NODE_ENV=production)");
  }

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

  log(`Migrations ok em ${Date.now() - start}ms.`);

  // Garante que o diretório de uploads existe e é gravável ANTES de subir
  // o server. Sem isso, mediaService falha silenciosamente em deploys onde
  // o volume está montado mas sem permissão de escrita.
  const fs = require('fs');

  const uploadsDir = process.env.UPLOADS_DIR || '/app/uploads';

  try {
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true, mode: 0o755 });
      console.log(`[entrypoint] Criado diretório ${uploadsDir}`);
    }

    // Tenta ajustar permissões (no-op se já estiver ok)
    try {
      fs.chmodSync(uploadsDir, 0o755);
    } catch (e) {
      console.warn(`[entrypoint] chmod warn em ${uploadsDir}:`, e.message);
    }

    // Testa escrita
    const testFile = path.join(uploadsDir, '.write-test');
    fs.writeFileSync(testFile, 'ok');
    fs.unlinkSync(testFile);
    console.log(`[entrypoint] ✓ ${uploadsDir} é gravável`);
  } catch (err) {
    console.error(`[entrypoint] ✗ ERRO no volume ${uploadsDir}:`, err.message);
    console.error(`[entrypoint]   Backend vai subir, mas uploads vão falhar até resolver permissões manualmente.`);
  }

  log("Iniciando server.");
  // require em vez de spawn — herda o process para o Node tratar
  // SIGTERM corretamente (bootstrap/shutdown.js já depende disso).
  require(path.resolve(__dirname, "..", "..", "server.js"));
}

main().catch((err) => {
  log(`✗ Entrypoint fatal: ${err.message}`);
  process.exit(1);
});
