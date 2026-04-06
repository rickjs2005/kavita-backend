"use strict";

// bootstrap/workers.js
// Starts background workers and scheduled jobs after the HTTP server is listening.

let startAbandonedCartNotificationsWorker;
try {
  ({ startAbandonedCartNotificationsWorker } = require("../workers/abandonedCartNotificationsWorker"));
} catch (err) {
  console.warn(
    "⚠️ Worker de notificações não carregado (arquivo ausente ou erro no require):",
    err.message
  );
}

let climaSyncJob;
try {
  climaSyncJob = require("../jobs/climaSyncJob");
} catch (err) {
  console.warn(
    "⚠️ Job de sync do clima não carregado (arquivo ausente ou erro no require):",
    err.message
  );
}

let cotacoesSyncJob;
try {
  cotacoesSyncJob = require("../jobs/cotacoesSyncJob");
} catch (err) {
  console.warn(
    "⚠️ Job de sync de cotações não carregado (arquivo ausente ou erro no require):",
    err.message
  );
}

function startWorkers() {
  // --- Abandoned cart notifications ---
  const disableNotifs =
    String(process.env.DISABLE_NOTIFICATIONS || "false") === "true";

  if (disableNotifs) {
    console.warn("🚫 Notificações automáticas DESABILITADAS (DISABLE_NOTIFICATIONS=true)");
  } else if (typeof startAbandonedCartNotificationsWorker === "function") {
    startAbandonedCartNotificationsWorker();
    console.info("📨 Worker de notificações de carrinho abandonado iniciado");
  } else {
    console.warn(
      "⚠️ Worker de notificações NÃO iniciado (função startAbandonedCartNotificationsWorker indisponível)."
    );
  }

  // --- Clima auto-sync (cron) ---
  if (climaSyncJob && typeof climaSyncJob.register === "function") {
    climaSyncJob.register().catch((err) => {
      console.error("⚠️ Falha ao registrar clima sync job:", err?.message || err);
    });
  }

  // --- Cotações auto-sync (cron) ---
  if (cotacoesSyncJob && typeof cotacoesSyncJob.register === "function") {
    cotacoesSyncJob.register().catch((err) => {
      console.error("⚠️ Falha ao registrar cotações sync job:", err?.message || err);
    });
  }
}

module.exports = { startWorkers };
