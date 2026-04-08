"use strict";

// bootstrap/shutdown.js
// Graceful shutdown handler: drains active connections, closes DB pool.

const pool = require("../config/pool");
const redis = require("../lib/redis");
const logger = require("../lib/logger");

let climaSyncJob;
try {
  climaSyncJob = require("../jobs/climaSyncJob");
} catch { /* optional dependency */ }

let cotacoesSyncJob;
try {
  cotacoesSyncJob = require("../jobs/cotacoesSyncJob");
} catch { /* optional dependency */ }

function registerShutdownHandlers(server) {
  const shutdown = async (signal) => {
    logger.info({ signal }, "graceful shutdown initiated");

    const forceExit = setTimeout(() => {
      logger.error("shutdown timeout (30s) — forcing exit");
      process.exit(1);
    }, 30_000);
    forceExit.unref();

    // Stop cron jobs first (non-blocking)
    if (climaSyncJob && typeof climaSyncJob.stop === "function") {
      climaSyncJob.stop();
    }
    if (cotacoesSyncJob && typeof cotacoesSyncJob.stop === "function") {
      cotacoesSyncJob.stop();
    }

    server.close(async () => {
      logger.info("HTTP server closed");

      try {
        await pool.end();
        logger.info("MySQL pool closed");
      } catch (err) {
        logger.error({ err }, "MySQL pool close error");
      }

      if (redis.client) {
        try {
          await redis.client.quit();
          logger.info("Redis closed");
        } catch (err) {
          logger.error({ err }, "Redis close error");
        }
      }

      logger.info("shutdown complete");
      process.exit(0);
    });
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT",  () => shutdown("SIGINT"));
}

module.exports = { registerShutdownHandlers };
