require("dotenv").config();
const mysql = require("mysql2/promise");

// Cria a conexão com base nas variáveis de ambiente
const toNumber = (value, fallback) => {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toBoolean = (value, fallback) => {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  if (typeof value === "boolean") return value;
  return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
};

const pool = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "kavita",
  port: toNumber(process.env.DB_PORT, 3306),
  connectionLimit: toNumber(process.env.DB_CONNECTION_LIMIT, 10),
  waitForConnections: toBoolean(process.env.DB_WAIT_FOR_CONNECTIONS, true),
  queueLimit: toNumber(process.env.DB_QUEUE_LIMIT, 0),
  maxIdle: toNumber(process.env.DB_MAX_IDLE, 10),
  idleTimeout: toNumber(process.env.DB_IDLE_TIMEOUT, 60000),
  enableKeepAlive: toBoolean(process.env.DB_ENABLE_KEEP_ALIVE, true),
  keepAliveInitialDelay: toNumber(process.env.DB_KEEP_ALIVE_DELAY, 0),
});

if (toBoolean(process.env.DB_POOL_LOGGING, false)) {
  const log = (...args) => console.info("[db:pool]", ...args);

  pool.on("connection", (connection) => {
    log("nova conexão estabelecida", { threadId: connection.threadId });
  });

  pool.on("acquire", (connection) => {
    log("conexão adquirida", { threadId: connection.threadId });
  });

  pool.on("release", (connection) => {
    log("conexão liberada", { threadId: connection.threadId });
  });

  const metricsInterval = toNumber(process.env.DB_POOL_METRICS_INTERVAL, 30000);
  if (metricsInterval > 0) {
    setInterval(() => {
      const stats = {
        size: pool.pool._allConnections.length,
        available: pool.pool._freeConnections.length,
        acquiring: pool.pool._acquiringConnections.length,
        queue: pool.pool._connectionQueue.length,
      };
      log("estatísticas", stats);
    }, metricsInterval).unref();
  }
}

module.exports = pool;
