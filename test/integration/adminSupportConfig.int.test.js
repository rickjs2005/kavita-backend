/**
 * test/integration/adminSupportConfig.int.test.js
 *
 * Rotas testadas (routes/admin/adminSupportConfig.js):
 *   GET /  → getConfig
 *   PUT /  → updateConfig
 */

"use strict";

const request = require("supertest");
const { makeTestApp } = require("../testUtils");

describe("Admin Support Config routes", () => {
  const MOUNT_PATH = "/api/admin/support-config";

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
      getConfig: jest.fn((req, res) =>
        res.status(200).json({ ok: true, data: { hero_title: "Ola" } })
      ),
      updateConfig: jest.fn((req, res) =>
        res.status(200).json({ ok: true, data: { hero_title: "Novo" }, message: "ok" })
      ),
    };

    const appErrorPath = require.resolve("../../errors/AppError");
    const ctrlPath = require.resolve("../../controllers/supportConfigController");

    jest.doMock(appErrorPath, () => FakeAppError);
    jest.doMock(ctrlPath, () => mockCtrl);

    const router = require("../../routes/admin/adminSupportConfig");
    app = makeTestApp(MOUNT_PATH, router);
  });

  // -------------------------------------------------------------------------
  // GET /
  // -------------------------------------------------------------------------

  describe("GET /", () => {
    test("retorna config → 200", async () => {
      const res = await request(app).get(MOUNT_PATH);
      expect(res.status).toBe(200);
      expect(mockCtrl.getConfig).toHaveBeenCalledTimes(1);
    });
  });

  // -------------------------------------------------------------------------
  // PUT /
  // -------------------------------------------------------------------------

  describe("PUT /", () => {
    test("update parcial valido → 200", async () => {
      const res = await request(app)
        .put(MOUNT_PATH)
        .send({ hero_title: "Novo titulo" });
      expect(res.status).toBe(200);
      expect(mockCtrl.updateConfig).toHaveBeenCalledTimes(1);
    });

    test("body vazio → 200 (todos os campos opcionais)", async () => {
      const res = await request(app).put(MOUNT_PATH).send({});
      expect(res.status).toBe(200);
    });

    test("toggle de visibilidade → 200", async () => {
      const res = await request(app)
        .put(MOUNT_PATH)
        .send({ show_chatbot: false, show_faq: true });
      expect(res.status).toBe(200);
    });

    test("faq_topics como array → 200", async () => {
      const res = await request(app)
        .put(MOUNT_PATH)
        .send({
          faq_topics: [
            { title: "Entrega", description: "Sobre entregas", content: ["..."], icon: "truck", priority: 1, active: true, highlighted: true },
          ],
        });
      expect(res.status).toBe(200);
    });

    test("trust_items como array → 200", async () => {
      const res = await request(app)
        .put(MOUNT_PATH)
        .send({
          trust_items: [
            { label: "Rapido", desc: "24h", icon: "bolt", color: "text-amber-500" },
          ],
        });
      expect(res.status).toBe(200);
    });

    test("campo desconhecido (strict) → 400", async () => {
      const res = await request(app)
        .put(MOUNT_PATH)
        .send({ campo_inexistente: "x" });
      expect(res.status).toBe(400);
      expect(mockCtrl.updateConfig).not.toHaveBeenCalled();
    });

    test("hero_title ultrapassa limite (>200 chars) → 400", async () => {
      const res = await request(app)
        .put(MOUNT_PATH)
        .send({ hero_title: "a".repeat(201) });
      expect(res.status).toBe(400);
    });

    test("show_chatbot com tipo errado → 400", async () => {
      const res = await request(app)
        .put(MOUNT_PATH)
        .send({ show_chatbot: "yes" });
      expect(res.status).toBe(400);
    });

    test("faq_topics com item invalido (sem title) → 400", async () => {
      const res = await request(app)
        .put(MOUNT_PATH)
        .send({ faq_topics: [{ description: "sem titulo" }] });
      expect(res.status).toBe(400);
    });
  });
});
