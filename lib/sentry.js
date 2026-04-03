"use strict";
// lib/sentry.js
// Minimal Sentry integration — opt-in via SENTRY_DSN env var.
// If SENTRY_DSN is not set, all exports are safe no-ops.
//
// Usage:
//   require("../lib/sentry").init();              // call once in server.js
//   require("../lib/sentry").captureException(err); // in error handler
//
// Install: npm install @sentry/node (only when ready to use)

let _initialized = false;
let _Sentry = null;

function init() {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;

  try {
    _Sentry = require("@sentry/node");
    _Sentry.init({
      dsn,
      environment: process.env.NODE_ENV || "development",
      // Only send 5xx errors in production, not validation errors
      beforeSend(event) {
        const status = event?.extra?.status || event?.contexts?.response?.status_code;
        if (status && status < 500) return null;
        return event;
      },
      // Sample 100% of errors, 10% of transactions (if tracing enabled)
      sampleRate: 1.0,
      tracesSampleRate: parseFloat(process.env.SENTRY_TRACES_RATE || "0.1"),
    });
    _initialized = true;
    console.info("[sentry] Initialized with DSN (environment:", process.env.NODE_ENV, ")");
  } catch (err) {
    console.warn("[sentry] @sentry/node not installed — error tracking disabled.", err.message);
  }
}

function captureException(err, context = {}) {
  if (!_initialized || !_Sentry) return;
  _Sentry.withScope((scope) => {
    if (context.user) scope.setUser(context.user);
    if (context.tags) Object.entries(context.tags).forEach(([k, v]) => scope.setTag(k, v));
    if (context.extra) Object.entries(context.extra).forEach(([k, v]) => scope.setExtra(k, v));
    _Sentry.captureException(err);
  });
}

function captureMessage(msg, level = "warning") {
  if (!_initialized || !_Sentry) return;
  _Sentry.captureMessage(msg, level);
}

module.exports = { init, captureException, captureMessage };
