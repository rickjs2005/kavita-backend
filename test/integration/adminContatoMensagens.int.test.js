/**
 * test/integration/adminContatoMensagens.int.test.js
 *
 * Rotas testadas (routes/admin/adminContatoMensagens.js):
 *   GET    /              → list (com filtro/paginacao)
 *   GET    /stats         → stats por status
 *   GET    /analytics     → analytics agregado
 *   GET    /:id           → detalhe
 *   PATCH  /:id/status    → update status
 *   DELETE /:id           → remove
 *
 * Os middlewares verifyAdmin e validateCSRF nao sao aplicados aqui (testamos so o router).
 */

"use strict";

const request = require("supertest");
const { makeTestApp } = require("../testUtils");

describe("Admin Contato Mensagens routes", () => {
  const MOUNT_PATH = "/api/admin/contato-mensagens";

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
      listMensagens: jest.fn((req, res) =>
        res.status(200).json({ ok: true, data: [], meta: { total: 0, page: 1, limit: 25, pages: 0 } })
      ),
      getStats: jest.fn((req, res) =>
        res.status(200).json({
          ok: true,
          data: { nova: 2, lida: 1, respondida: 3, arquivada: 0, total: 6 },
        })
      ),
      getAnalytics: jest.fn((req, res) =>
        res.status(200).json({
          ok: true,
          data: { topTopics: [], topSearches: [], eventCounts: [] },
        })
      ),
      getMensagem: jest.fn((req, res) =>
        res.status(200).json({ ok: true, data: { id: req.params.id } })
      ),
      updateStatus: jest.fn((req, res) =>
        res.status(200).json({ ok: true, message: "Status atualizado." })
      ),
      deleteMensagem: jest.fn((req, res) => res.status(204).end()),
    };

    const appErrorPath = require.resolve("../../errors/AppError");
    const ctrlPath = require.resolve("../../controllers/contatoAdminController");

    jest.doMock(appErrorPath, () => FakeAppError);
    jest.doMock(ctrlPath, () => mockCtrl);

    const router = require("../../routes/admin/adminContatoMensagens");
    app = makeTestApp(MOUNT_PATH, router);
  });

  // -------------------------------------------------------------------------
  // GET /
  // -------------------------------------------------------------------------

  describe("GET /", () => {
    test("sem filtros → 200", async () => {
      const res = await request(app).get(MOUNT_PATH);
      expect(res.status).toBe(200);
      expect(mockCtrl.listMensagens).toHaveBeenCalledTimes(1);
    });

    test("filtro por status valido → 200", async () => {
      const res = await request(app).get(MOUNT_PATH).query({ status: "nova" });
      expect(res.status).toBe(200);
      expect(mockCtrl.listMensagens).toHaveBeenCalledTimes(1);
    });

    test("paginacao explicita → 200", async () => {
      const res = await request(app).get(MOUNT_PATH).query({ page: "2", limit: "50" });
      expect(res.status).toBe(200);
    });

    test("status invalido → schema normaliza para undefined, retorna 200", async () => {
      // ContatoListQuerySchema usa preprocess que filtra status invalido
      const res = await request(app).get(MOUNT_PATH).query({ status: "hack" });
      expect(res.status).toBe(200);
      expect(mockCtrl.listMensagens).toHaveBeenCalledTimes(1);
    });

    test("retorna shape esperado com data + meta", async () => {
      const res = await request(app).get(MOUNT_PATH);
      expect(res.body.ok).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.meta).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // GET /stats
  // -------------------------------------------------------------------------

  describe("GET /stats", () => {
    test("retorna stats por status → 200", async () => {
      const res = await request(app).get(`${MOUNT_PATH}/stats`);
      expect(res.status).toBe(200);
      expect(mockCtrl.getStats).toHaveBeenCalledTimes(1);
      expect(res.body.data).toEqual(
        expect.objectContaining({ nova: expect.any(Number), total: expect.any(Number) })
      );
    });
  });

  // -------------------------------------------------------------------------
  // GET /analytics
  // -------------------------------------------------------------------------

  describe("GET /analytics", () => {
    test("retorna analytics → 200", async () => {
      const res = await request(app).get(`${MOUNT_PATH}/analytics`);
      expect(res.status).toBe(200);
      expect(mockCtrl.getAnalytics).toHaveBeenCalledTimes(1);
      expect(res.body.data).toEqual(
        expect.objectContaining({
          topTopics: expect.any(Array),
          topSearches: expect.any(Array),
          eventCounts: expect.any(Array),
        })
      );
    });
  });

  // -------------------------------------------------------------------------
  // GET /:id
  // -------------------------------------------------------------------------

  describe("GET /:id", () => {
    test("ID valido → 200", async () => {
      const res = await request(app).get(`${MOUNT_PATH}/42`);
      expect(res.status).toBe(200);
      expect(mockCtrl.getMensagem).toHaveBeenCalledTimes(1);
    });

    test("ID nao numerico → 400", async () => {
      const res = await request(app).get(`${MOUNT_PATH}/abc`);
      expect(res.status).toBe(400);
      expect(mockCtrl.getMensagem).not.toHaveBeenCalled();
    });

    test("ID negativo → 400", async () => {
      const res = await request(app).get(`${MOUNT_PATH}/-1`);
      expect(res.status).toBe(400);
    });
  });

  // -------------------------------------------------------------------------
  // PATCH /:id/status
  // -------------------------------------------------------------------------

  describe("PATCH /:id/status", () => {
    test("status valido → 200", async () => {
      const res = await request(app)
        .patch(`${MOUNT_PATH}/42/status`)
        .send({ status: "lida" });
      expect(res.status).toBe(200);
      expect(mockCtrl.updateStatus).toHaveBeenCalledTimes(1);
    });

    test.each(["nova", "lida", "respondida", "arquivada"])(
      "aceita status valido %s",
      async (status) => {
        const res = await request(app)
          .patch(`${MOUNT_PATH}/42/status`)
          .send({ status });
        expect(res.status).toBe(200);
      }
    );

    test("status invalido → 400", async () => {
      const res = await request(app)
        .patch(`${MOUNT_PATH}/42/status`)
        .send({ status: "hack" });
      expect(res.status).toBe(400);
      expect(mockCtrl.updateStatus).not.toHaveBeenCalled();
    });

    test("body sem status → 400", async () => {
      const res = await request(app)
        .patch(`${MOUNT_PATH}/42/status`)
        .send({});
      expect(res.status).toBe(400);
    });

    test("ID invalido → 400", async () => {
      const res = await request(app)
        .patch(`${MOUNT_PATH}/abc/status`)
        .send({ status: "lida" });
      expect(res.status).toBe(400);
    });
  });

  // -------------------------------------------------------------------------
  // DELETE /:id
  // -------------------------------------------------------------------------

  describe("DELETE /:id", () => {
    test("ID valido → 204", async () => {
      const res = await request(app).delete(`${MOUNT_PATH}/42`);
      expect(res.status).toBe(204);
      expect(mockCtrl.deleteMensagem).toHaveBeenCalledTimes(1);
    });

    test("ID invalido → 400", async () => {
      const res = await request(app).delete(`${MOUNT_PATH}/abc`);
      expect(res.status).toBe(400);
      expect(mockCtrl.deleteMensagem).not.toHaveBeenCalled();
    });
  });
});
