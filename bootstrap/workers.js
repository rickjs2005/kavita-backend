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

let leadFollowupJob;
try {
  leadFollowupJob = require("../jobs/leadFollowupJob");
} catch (err) {
  logger.warn({ err }, "lead follow-up job not loaded");
}

let trialReminderJob;
try {
  trialReminderJob = require("../jobs/trialReminderJob");
} catch (err) {
  logger.warn({ err }, "trial reminder job not loaded");
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

  if (leadFollowupJob && typeof leadFollowupJob.register === "function") {
    leadFollowupJob.register().catch((err) => {
      logger.error({ err }, "lead follow-up job registration failed");
    });
  }

  if (trialReminderJob && typeof trialReminderJob.register === "function") {
    trialReminderJob.register().catch((err) => {
      logger.error({ err }, "trial reminder job registration failed");
    });
  }
}

module.exports = { startWorkers };
