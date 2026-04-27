"use strict";
// lib/logger.js
// Instância única de logger para todo o projeto.
// Em produção: JSON puro (para Datadog / CloudWatch / Loki).
// Em desenvolvimento: output legível via pino-pretty.
//
// USO:
//   const logger = require("../lib/logger");
//   logger.info({ userId }, "user logged in");
//   logger.error({ err }, "database error");
//
// Em handlers Express, prefira req.log (inclui requestId automático):
//   req.log.info({ produtoId }, "produto criado");

const pino = require("pino");

const IS_PROD = process.env.NODE_ENV === "production";
const level   = process.env.LOG_LEVEL || (IS_PROD ? "info" : "debug");

let transport;
if (IS_PROD) {
  transport = undefined; // JSON puro
} else {
  try {
    require.resolve("pino-pretty");
    transport = {
      target: "pino-pretty",
      options: {
        colorize:      true,
        translateTime: "HH:MM:ss.l",
        ignore:        "pid,hostname",
      },
    };
  } catch {
    transport = undefined; // pino-pretty not installed — fall back to JSON
  }
}

// Redact paths cobrem campos sensíveis embutidos em logs estruturados.
// Pino redact é literal (não recursivo) — listamos níveis explicitamente.
// Convenção: campos sensíveis viram `_meta.<nome>` no objeto logado;
// a redação cobre o path conhecido + paths legacy (`payload._signature`).
const REDACT_PATHS = [
  "_meta.signature",
  "*._meta.signature",
  "*.*._meta.signature",
  "payload._signature",
];

const logger = pino({
  level,
  transport,
  redact: {
    paths: REDACT_PATHS,
    censor: "[redacted]",
    remove: false,
  },
});

module.exports = logger;
