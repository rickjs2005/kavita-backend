"use strict";

// bootstrap/workers.js
// Starts background workers after the HTTP server is listening.

let startAbandonedCartNotificationsWorker;
try {
  ({ startAbandonedCartNotificationsWorker } = require("../workers/abandonedCartNotificationsWorker"));
} catch (err) {
  console.warn(
    "⚠️ Worker de notificações não carregado (arquivo ausente ou erro no require):",
    err.message
  );
}

function startWorkers() {
  const disableNotifs =
    String(process.env.DISABLE_NOTIFICATIONS || "false") === "true";

  if (disableNotifs) {
    console.warn("🚫 Notificações automáticas DESABILITADAS (DISABLE_NOTIFICATIONS=true)");
    return;
  }

  if (typeof startAbandonedCartNotificationsWorker === "function") {
    startAbandonedCartNotificationsWorker();
    console.info("📨 Worker de notificações de carrinho abandonado iniciado");
  } else {
    console.warn(
      "⚠️ Worker de notificações NÃO iniciado (função startAbandonedCartNotificationsWorker indisponível)."
    );
  }
}

module.exports = { startWorkers };
