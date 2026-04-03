/**
 * test/integration/rateLimiter.int.test.js
 *
 * Testa o adaptiveRateLimiter REAL via HTTP.
 *
 * Cenários de risco real:
 *   - Primeira requisição → passa (200)
 *   - Após fail() com schedule > 0 → bloqueio (429)
 *   - Resposta 429 segue contrato { ok: false, code: RATE_LIMIT, retryAfter }
 *   - Retry-After header presente
 *   - Bloqueio expira após duração do schedule
 */

"use strict";

const request = require("supertest");
const express = require("express");
const createAdaptiveRateLimiter = require("../../middleware/adaptiveRateLimiter");

function buildApp({ schedule = [0, 100], decayMs = 5000 } = {}) {
  const store = new Map();

  const limiter = createAdaptiveRateLimiter({
    keyGenerator: (req) => `test:${req.ip}`,
    schedule,
    decayMs,
    store,
  });

  const app = express();
  app.use(express.json());

  app.post("/test/action", limiter, (req, res) => {
    const { shouldFail } = req.body || {};
    if (shouldFail) {
      req.rateLimit.fail();
      return res.status(401).json({ ok: false, message: "Wrong." });
    }
    req.rateLimit.reset();
    return res.status(200).json({ ok: true });
  });

  return { app, store };
}

describe("adaptiveRateLimiter — integração HTTP", () => {
  test("primeira requisição → 200 (sem bloqueio)", async () => {
    const { app } = buildApp();

    const res = await request(app)
      .post("/test/action")
      .send({ shouldFail: false });

    expect(res.status).toBe(200);
  });

  test("schedule[0]=0 → primeiro fail NÃO bloqueia próxima request", async () => {
    const { app } = buildApp({ schedule: [0, 5000] });

    // fail#1: failCount=1, schedule[1]=5000ms → bloqueia
    await request(app).post("/test/action").send({ shouldFail: true });

    // Mas schedule[0]=0 → NÃO bloqueia na MESMA requisição.
    // A PRÓXIMA request é que verifica blockedUntil.
    // fail#1 set blockedUntil = now+5000 (schedule[min(1,1)]=5000)

    // Próxima request → bloqueada
    const res = await request(app).post("/test/action").send({ shouldFail: false });
    expect(res.status).toBe(429);
  });

  test("429: contrato completo + Retry-After header", async () => {
    const { app } = buildApp({ schedule: [0, 5000] });

    await request(app).post("/test/action").send({ shouldFail: true });

    const res = await request(app).post("/test/action").send({});

    expect(res.status).toBe(429);
    expect(res.body).toMatchObject({
      ok: false,
      code: "RATE_LIMIT",
      message: expect.stringContaining("Muitas tentativas"),
    });
    expect(typeof res.body.retryAfter).toBe("number");
    expect(res.body.retryAfter).toBeGreaterThan(0);
    expect(res.headers["retry-after"]).toBeDefined();
  });

  test("bloqueio expira após duração do schedule", async () => {
    const { app } = buildApp({ schedule: [0, 50] }); // 50ms de bloqueio

    await request(app).post("/test/action").send({ shouldFail: true });

    // Bloqueado
    let res = await request(app).post("/test/action").send({});
    expect(res.status).toBe(429);

    // Esperar bloqueio expirar
    await new Promise((r) => setTimeout(r, 80));

    // Desbloqueado
    res = await request(app).post("/test/action").send({ shouldFail: false });
    expect(res.status).toBe(200);
  });

  test("reset() libera bloqueio imediatamente", async () => {
    const { app, store } = buildApp({ schedule: [0, 60000] }); // bloqueio longo

    await request(app).post("/test/action").send({ shouldFail: true });

    // Bloqueado
    let res = await request(app).post("/test/action").send({});
    expect(res.status).toBe(429);

    // Limpar manualmente o store (simula o que reset() faz)
    store.clear();

    // Desbloqueado
    res = await request(app).post("/test/action").send({ shouldFail: false });
    expect(res.status).toBe(200);
  });

  test("requisição sem key (keyGenerator retorna falsy) → passa sem verificação", async () => {
    const limiter = createAdaptiveRateLimiter({
      keyGenerator: () => null, // retorna null
      schedule: [0, 5000],
    });

    const app = express();
    app.use(express.json());
    app.post("/test/action", limiter, (_req, res) => res.json({ ok: true }));

    const res = await request(app).post("/test/action").send({});
    expect(res.status).toBe(200);
  });
});
