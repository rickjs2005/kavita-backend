/**
 * test/integration/publicContato.int.test.js
 *
 * Rotas testadas (routes/public/publicContato.js):
 *   POST /api/public/contato
 *   POST /api/public/contato/event
 *   GET  /api/public/contato/metrics
 *
 * Padrao: controller mockado, foco em wiring de rota + Zod validation.
 */

"use strict";

const request = require("supertest");
const { makeTestApp } = require("../testUtils");

describe("Public Contato routes (routes/public/publicContato.js)", () => {
  const MOUNT_PATH = "/api/public/contato";

  class FakeAppError extends Error {
    constructor(message, code, status, details) {
      super(message);
      this.name = "AppError";
      this.code = code;
      this.status = status;
      if (details !== undefined) this.details = details;
    }
  }

  let app;
  let mockCtrl;

  beforeEach(() => {
    jest.resetModules();

    mockCtrl = {
      createMensagem: jest.fn((req, res) =>
        res.status(201).json({ ok: true, data: { id: 1 }, message: "ok" })
      ),
      trackEvent: jest.fn((req, res) => res.status(200).json({ ok: true })),
      getMetrics: jest.fn((req, res) =>
        res.status(200).json({
          ok: true,
          data: { total_mensagens: 10, taxa_resposta: 90, tempo_medio: "4h" },
        })
      ),
    };

    const appErrorPath = require.resolve("../../errors/AppError");
    const ctrlPath = require.resolve("../../controllers/contatoController");

    jest.doMock(appErrorPath, () => FakeAppError);
    jest.doMock(ctrlPath, () => mockCtrl);

    const router = require("../../routes/public/publicContato");
    app = makeTestApp(MOUNT_PATH, router);
  });

  // -------------------------------------------------------------------------
  // POST /
  // -------------------------------------------------------------------------

  describe("POST /", () => {
    const VALID_BODY = {
      nome: "Rick Sanchez",
      email: "rick@example.com",
      telefone: "31999990000",
      assunto: "Duvida sobre pedido",
      mensagem: "Quando chega meu pedido numero 123?",
    };

    test("payload valido → 201", async () => {
      const res = await request(app).post(MOUNT_PATH).send(VALID_BODY);

      expect(res.status).toBe(201);
      expect(mockCtrl.createMensagem).toHaveBeenCalledTimes(1);
    });

    test("payload sem telefone (opcional) → 201", async () => {
      const { telefone, ...body } = VALID_BODY;
      const res = await request(app).post(MOUNT_PATH).send(body);

      expect(res.status).toBe(201);
      expect(mockCtrl.createMensagem).toHaveBeenCalledTimes(1);
    });

    test("nome ausente → 400 com fields", async () => {
      const { nome, ...body } = VALID_BODY;
      const res = await request(app).post(MOUNT_PATH).send(body);

      expect(res.status).toBe(400);
      expect(res.body.ok).toBe(false);
      expect(res.body.details.fields).toBeDefined();
      expect(mockCtrl.createMensagem).not.toHaveBeenCalled();
    });

    test("nome muito curto (<2 chars) → 400", async () => {
      const res = await request(app).post(MOUNT_PATH).send({ ...VALID_BODY, nome: "A" });

      expect(res.status).toBe(400);
    });

    test("email invalido → 400", async () => {
      const res = await request(app).post(MOUNT_PATH).send({ ...VALID_BODY, email: "invalid" });

      expect(res.status).toBe(400);
      expect(mockCtrl.createMensagem).not.toHaveBeenCalled();
    });

    test("assunto ausente → 400", async () => {
      const { assunto, ...body } = VALID_BODY;
      const res = await request(app).post(MOUNT_PATH).send(body);

      expect(res.status).toBe(400);
    });

    test("mensagem muito curta (<10 chars) → 400", async () => {
      const res = await request(app).post(MOUNT_PATH).send({ ...VALID_BODY, mensagem: "oi" });

      expect(res.status).toBe(400);
    });

    test("mensagem muito longa (>5000 chars) → 400", async () => {
      const res = await request(app).post(MOUNT_PATH).send({ ...VALID_BODY, mensagem: "a".repeat(5001) });

      expect(res.status).toBe(400);
    });

    test("body vazio → 400 com array de fields", async () => {
      const res = await request(app).post(MOUNT_PATH).send({});

      expect(res.status).toBe(400);
      expect(Array.isArray(res.body.details.fields)).toBe(true);
      expect(res.body.details.fields.length).toBeGreaterThan(0);
    });
  });

  // -------------------------------------------------------------------------
  // POST /event
  // -------------------------------------------------------------------------

  describe("POST /event", () => {
    test("evento valido faq_topic_view → 200", async () => {
      const res = await request(app)
        .post(`${MOUNT_PATH}/event`)
        .send({ event: "faq_topic_view", value: "Politica de Entrega" });

      expect(res.status).toBe(200);
      expect(mockCtrl.trackEvent).toHaveBeenCalledTimes(1);
    });

    test("evento valido sem value → 200", async () => {
      const res = await request(app)
        .post(`${MOUNT_PATH}/event`)
        .send({ event: "form_start" });

      expect(res.status).toBe(200);
    });

    test("evento desconhecido → 400", async () => {
      const res = await request(app)
        .post(`${MOUNT_PATH}/event`)
        .send({ event: "hack_event" });

      expect(res.status).toBe(400);
      expect(mockCtrl.trackEvent).not.toHaveBeenCalled();
    });

    test("body vazio → 400", async () => {
      const res = await request(app).post(`${MOUNT_PATH}/event`).send({});

      expect(res.status).toBe(400);
    });
  });

  // -------------------------------------------------------------------------
  // GET /metrics
  // -------------------------------------------------------------------------

  describe("GET /metrics", () => {
    test("retorna metricas → 200", async () => {
      const res = await request(app).get(`${MOUNT_PATH}/metrics`);

      expect(res.status).toBe(200);
      expect(mockCtrl.getMetrics).toHaveBeenCalledTimes(1);
      expect(res.body.ok).toBe(true);
    });
  });
});
