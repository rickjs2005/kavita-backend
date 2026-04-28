/**
 * test/integration/requestTimeout.int.test.js
 *
 * Testa o middleware requestTimeout via HTTP.
 *
 * Cenários:
 *   - Request rápida → 200 (timeout não dispara)
 *   - Request lenta → 503 com Retry-After header
 *   - Response já enviada antes do timeout → sem duplo envio
 */

"use strict";

const request = require("supertest");
const express = require("express");
const requestTimeout = require("../../middleware/requestTimeout");

function buildApp(timeoutMs = 100) {
  const app = express();
  app.use(requestTimeout(timeoutMs));

  app.get("/fast", (_req, res) => res.json({ ok: true }));

  app.get("/slow", (_req, res) => {
    setTimeout(() => {
      if (!res.headersSent) res.json({ ok: true });
    }, timeoutMs + 100);
  });

  // Error handler
   
  app.use((err, _req, res, _next) => {
    res.status(err.status || 500).json({ ok: false, code: err.code, message: err.message });
  });

  return app;
}

describe("requestTimeout middleware", () => {
  test("request rápida → 200 (sem timeout)", async () => {
    const app = buildApp(200);
    const res = await request(app).get("/fast");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  test("request lenta → 503 com Retry-After", async () => {
    const app = buildApp(50); // 50ms timeout

    const res = await request(app).get("/slow");

    expect(res.status).toBe(503);
    expect(res.body.ok).toBe(false);
    expect(res.body.code).toBe("SERVER_ERROR");
    expect(res.body.message).toContain("tempo limite");
    expect(res.headers["retry-after"]).toBe("5");
  });
});
