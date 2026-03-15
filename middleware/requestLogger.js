"use strict";
// middleware/requestLogger.js
// Adiciona correlation ID (requestId) a cada request e loga entrada/saída.
//
// MONTAR em server.js ANTES de todas as rotas:
//   const requestLogger = require("./middleware/requestLogger");
//   app.use(requestLogger);
//
// Disponibiliza req.log em qualquer handler com requestId automático:
//   req.log.info({ produtoId }, "produto criado");

const { randomUUID } = require("crypto");
const logger         = require("../lib/logger");

module.exports = function requestLogger(req, res, next) {
  const requestId = randomUUID();
  req.requestId   = requestId;

  // Child logger com requestId — use req.log dentro dos handlers
  const child = logger.child({ requestId });
  req.log = child;

  const start = Date.now();

  child.debug({ method: req.method, url: req.originalUrl }, "→ request");

  res.on("finish", () => {
    const ms    = Date.now() - start;
    const level = res.statusCode >= 500 ? "error"
                : res.statusCode >= 400 ? "warn"
                : "debug";

    child[level](
      { method: req.method, url: req.originalUrl, status: res.statusCode, ms },
      "← response"
    );
  });

  next();
};
