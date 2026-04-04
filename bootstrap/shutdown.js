"use strict";

// bootstrap/shutdown.js
// Graceful shutdown handler: drains active connections, closes DB pool.

const pool = require("../config/pool");

let climaSyncJob;
try {
  climaSyncJob = require("../jobs/climaSyncJob");
} catch { /* optional dependency */ }

function registerShutdownHandlers(server) {
  const shutdown = async (signal) => {
    console.warn(`[${signal}] Sinal recebido. Iniciando graceful shutdown...`);

    const forceExit = setTimeout(() => {
      console.error("[shutdown] Timeout de 30s atingido. Forçando saída.");
      process.exit(1);
    }, 30_000);
    forceExit.unref();

    // Stop cron jobs first (non-blocking)
    if (climaSyncJob && typeof climaSyncJob.stop === "function") {
      climaSyncJob.stop();
    }

    server.close(async () => {
      console.info("[shutdown] Servidor HTTP encerrado.");

      try {
        await pool.end();
        console.info("[shutdown] Pool MySQL encerrado.");
      } catch (err) {
        console.error("[shutdown] Erro ao encerrar pool MySQL:", err.message);
      }

      console.info("[shutdown] Processo encerrado com sucesso.");
      process.exit(0);
    });
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT",  () => shutdown("SIGINT"));
}

module.exports = { registerShutdownHandlers };
