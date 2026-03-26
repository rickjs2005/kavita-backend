"use strict";

// config/cors.js
// CORS configuration for Express.
// Two configs: withCredentials (for /api) and withoutCredentials (for /uploads).

const config = require("./env");

function normalizeOrigin(origin) {
  if (!origin) return null;
  return origin.replace(/\/$/, "").trim();
}

const rawOrigins = [
  process.env.ALLOWED_ORIGINS,
  config.appUrl,
  config.backendUrl,
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:5000",
  "http://127.0.0.1:5000",
];

const ALLOWED_ORIGINS = Array.from(
  new Set(
    rawOrigins
      .filter(Boolean)
      .flatMap((value) => String(value).split(","))
      .map((s) => normalizeOrigin(s))
      .filter(Boolean)
  )
);

function originFn(origin, cb) {
  if (!origin) return cb(null, true);

  const normalized = normalizeOrigin(origin);
  if (normalized && ALLOWED_ORIGINS.includes(normalized)) {
    return cb(null, true);
  }

  const msg = `CORS bloqueado para origem: ${origin}`;
  if (process.env.NODE_ENV !== "production") {
    console.warn(msg, { normalized, ALLOWED_ORIGINS });
  }

  return cb(new Error(msg));
}

const withCredentials = { origin: originFn, credentials: true };
const withoutCredentials = { origin: originFn };

module.exports = { ALLOWED_ORIGINS, withCredentials, withoutCredentials };
