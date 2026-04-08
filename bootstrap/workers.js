"use strict";

// bootstrap/workers.js
// Starts background workers and scheduled jobs after the HTTP server is listening.

const logger = require("../lib/logger");

let startAbandonedCartNotificationsWorker;
try {
  ({ startAbandonedCartNotificationsWorker } = require("../workers/abandonedCartNotificationsWorker"));
} catch (err) {
  logger.warn({ err }, "abandoned cart worker not loaded");
}

let climaSyncJob;
try {
  climaSyncJob = require("../jobs/climaSyncJob");
} catch (err) {
  logger.warn({ err }, "clima sync job not loaded");
}

let cotacoesSyncJob;
try {
  cotacoesSyncJob = require("../jobs/cotacoesSyncJob");
} catch (err) {
  logger.warn({ err }, "cotacoes sync job not loaded");
}

function startWorkers() {
  const disableNotifs =
    String(process.env.DISABLE_NOTIFICATIONS || "false") === "true";

  if (disableNotifs) {
    logger.info("abandoned cart notifications disabled (DISABLE_NOTIFICATIONS=true)");
  } else if (typeof startAbandonedCartNotificationsWorker === "function") {
    startAbandonedCartNotificationsWorker();
    logger.info("abandoned cart notification worker started");
  } else {
    logger.warn("abandoned cart worker unavailable — skipped");
  }

  if (climaSyncJob && typeof climaSyncJob.register === "function") {
    climaSyncJob.register().catch((err) => {
      logger.error({ err }, "clima sync job registration failed");
    });
  }

  if (cotacoesSyncJob && typeof cotacoesSyncJob.register === "function") {
    cotacoesSyncJob.register().catch((err) => {
      logger.error({ err }, "cotacoes sync job registration failed");
    });
  }
}

module.exports = { startWorkers };
