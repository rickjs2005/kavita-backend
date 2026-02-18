/**
 * teste/integration/adminDrones.int.test.js
 *
 * Rotas testadas (routes/adminDrones.js):
 * - PAGE (legado + alias):
 *   - GET    /api/admin/drones/page
 *   - PUT    /api/admin/drones/page               (multipart: heroVideo, heroImageFallback)
 *   - POST   /api/admin/drones/page              (multipart: heroVideo, heroImageFallback)
 *   - DELETE /api/admin/drones/page
 *   - GET    /api/admin/drones/page-settings
 *   - PUT    /api/admin/drones/page-settings      (multipart)
 *   - POST   /api/admin/drones/page-settings     (multipart)
 *
 * - CONFIG:
 *   - GET    /api/admin/drones/config
 *   - PUT    /api/admin/drones/config            (multipart)
 *
 * - MODELS:
 *   - GET    /api/admin/drones/models
 *   - POST   /api/admin/drones/models            (json)
 *   - GET    /api/admin/drones/models/:modelKey
 *   - PUT    /api/admin/drones/models/:modelKey  (json)
 *   - DELETE /api/admin/drones/models/:modelKey
 *
 * - MODEL GALLERY:
 *   - GET    /api/admin/drones/models/:modelKey/gallery
 *   - POST   /api/admin/drones/models/:modelKey/gallery         (multipart: media)
 *   - PUT    /api/admin/drones/models/:modelKey/gallery/:id      (multipart: media opcional)
 *   - PUT    /api/admin/drones/models/:modelKey/media-selection  (json)
 *   - DELETE /api/admin/drones/models/:modelKey/gallery/:id
 *
 * - LEGADO /galeria:
 *   - GET    /api/admin/drones/galeria
 *   - POST   /api/admin/drones/galeria           (multipart: media)
 *   - PUT    /api/admin/drones/galeria/:id       (multipart: media opcional)
 *   - DELETE /api/admin/drones/galeria/:id
 *
 * - REPRESENTANTES:
 *   - GET    /api/admin/drones/representantes
 *   - POST   /api/admin/drones/representantes    (json)
 *   - PUT    /api/admin/drones/representantes/:id (json)
 *   - DELETE /api/admin/drones/representantes/:id
 *
 * - COMENTÁRIOS (moderação):
 *   - GET    /api/admin/drones/comentarios
 *   - PUT    /api/admin/drones/comentarios/:id/aprovar
 *   - PUT    /api/admin/drones/comentarios/:id/reprovar
 *   - DELETE /api/admin/drones/comentarios/:id
 *
 * Regras (obrigatórias):
 * - Sem MySQL real: mock pool/getConnection/conn.query + makeMockConn()
 * - Sem rede externa: qualquer integração deve ser mockada (aqui não há chamadas diretas na rota)
 * - Auth mock: verifyAdmin fica no mount em routes/index.js; aqui simulamos no WRAPPER do router
 * - AAA (Arrange -> Act -> Assert) em todos os testes
 * - ENV controlado + jest.resetModules() antes de importar a rota
 * - Sem snapshots
 * - Sem SQL “solto”: este arquivo testa a camada de rotas; controllers são mockados (não há SQL)
 *
 * Observação importante:
 * - routes/adminDrones.js NÃO monta verifyAdmin internamente (padrão do seu projeto).
 *   Por isso, para testar 401/403, este teste embrulha o router com um middleware verifyAdmin mockado.
 */

const request = require("supertest");
const express = require("express");
const { makeTestApp, makeMockConn } = require("../testUtils");

describe("Admin Drones routes (routes/adminDrones.js)", () => {
  const originalEnv = process.env;
  const MOUNT_PATH = "/api/admin/drones";

  /**
   * Helper para simular erro AppError-like que seu error-handler de teste transforma em:
   * { code, message }
   */
  function makeAppError(message, statusCode, code, details) {
    const err = new Error(message);
    err.statusCode = statusCode;
    err.code = code;
    if (details !== undefined) err.details = details;
    return err;
  }

  function setupModuleWithMocks() {
    jest.resetModules();

    // IMPORTANT: set env before requiring the router module
    process.env = {
      ...originalEnv,
      NODE_ENV: "test",
    };

    // --- MySQL pool mock (obrigatório no seu padrão) ---
    const mockConn = makeMockConn();
    const poolMock = {
      getConnection: jest.fn().mockResolvedValue(mockConn),
    };

    // --- Auth mock: verifyAdmin (montado normalmente em routes/index.js) ---
    const verifyAdminMock = jest.fn((req, _res, next) => {
      req.user = { id: 999, role: "admin" };
      next();
    });

    // --- mediaService.upload mock (para evitar multer real e filesystem) ---
    const uploadMock = {
      single: jest.fn(() => (req, _res, next) => {
        // simula que multer rodou
        req.file = req.file || { fieldname: "media", originalname: "fake.png" };
        next();
      }),
      fields: jest.fn(() => (req, _res, next) => {
        // simula que multer rodou
        req.files = req.files || {};
        next();
      }),
    };

    // --- Controller mock (rota é “integration de rotas”, controller fica isolado) ---
    const controllerMock = {
      // page
      getPage: jest.fn(),
      upsertPage: jest.fn(),
      resetPageToDefault: jest.fn(),

      // config
      getLandingConfig: jest.fn(),
      upsertLandingConfig: jest.fn(),

      // models
      listModels: jest.fn(),
      createModel: jest.fn(),
      getModelAggregate: jest.fn(),
      upsertModelInfo: jest.fn(),
      deleteModel: jest.fn(),

      // model gallery
      listModelGallery: jest.fn(),
      createModelGalleryItem: jest.fn(),
      updateModelGalleryItem: jest.fn(),
      setModelMediaSelection: jest.fn(),
      deleteModelGalleryItem: jest.fn(),

      // legado galeria
      listGallery: jest.fn(),
      createGalleryItem: jest.fn(),
      updateGalleryItem: jest.fn(),
      deleteGalleryItem: jest.fn(),

      // representantes
      listRepresentatives: jest.fn(),
      createRepresentative: jest.fn(),
      updateRepresentative: jest.fn(),
      deleteRepresentative: jest.fn(),

      // comentarios
      listComments: jest.fn(),
      approveComment: jest.fn(),
      rejectComment: jest.fn(),
      deleteComment: jest.fn(),
    };

    // resolve absolute paths so the mock matches what the router resolves internally
    const pathPool = require.resolve("../../config/pool");
    const pathController = require.resolve("../../controllers/dronesAdminController");
    const pathMediaService = require.resolve("../../services/mediaService");

    jest.doMock(pathPool, () => poolMock, { virtual: false });
    jest.doMock(pathController, () => controllerMock, { virtual: false });
    jest.doMock(
      pathMediaService,
      () => ({
        upload: uploadMock,
      }),
      { virtual: false }
    );

    // require router after mocks
    const router = require("../../routes/adminDrones");

    // wrap router with auth mock (simula mount em routes/index.js)
    const wrapper = express.Router();
    wrapper.use(verifyAdminMock);
    wrapper.use(router);

    const app = makeTestApp(MOUNT_PATH, wrapper);

    return {
      app,
      poolMock,
      mockConn,
      verifyAdminMock,
      uploadMock,
      controllerMock,
    };
  }

  afterEach(() => {
    process.env = originalEnv;
    jest.clearAllMocks();
  });

  /**
   * Helper: implementa um controller que:
   * - pega conexão do pool (mock)
   * - sempre chama release() (mesmo em erro)
   * - responde sucesso ou joga erro
   *
   * Usa SEMPRE o `res` real do Express (evita hang/timeout no supertest).
   */
  function implWithConn({ poolMock, status = 200, body, throwErr } = {}) {
    return async (req, res, next) => {
      let conn;
      try {
        conn = await poolMock.getConnection();
        if (throwErr) throw throwErr;
        return res.status(status).json(body ?? { ok: true, path: req.path });
      } catch (e) {
        return next(e);
      } finally {
        if (conn) conn.release();
      }
    };
  }

  describe("Auth wrapper (verifyAdmin)", () => {
    test("deve chamar verifyAdmin antes de qualquer handler", async () => {
      // Arrange
      const { app, verifyAdminMock, controllerMock, poolMock, mockConn } = setupModuleWithMocks();

      controllerMock.getPage.mockImplementation(
        implWithConn({ poolMock, status: 200, body: { ok: true } })
      );

      // Act
      const res = await request(app).get(`${MOUNT_PATH}/page`);

      // Assert
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true });

      expect(verifyAdminMock).toHaveBeenCalledTimes(1);
      expect(controllerMock.getPage).toHaveBeenCalledTimes(1);

      expect(poolMock.getConnection).toHaveBeenCalledTimes(1);
      expect(mockConn.release).toHaveBeenCalledTimes(1);
    });

    test("deve responder 403 quando verifyAdmin negar (simulado)", async () => {
      // Arrange
      const { app, verifyAdminMock, controllerMock } = setupModuleWithMocks();

      verifyAdminMock.mockImplementationOnce((_req, res, _next) => {
        return res.status(403).json({ code: "FORBIDDEN", message: "Acesso negado." });
      });

      // Act
      const res = await request(app).get(`${MOUNT_PATH}/page`);

      // Assert
      expect(res.status).toBe(403);
      expect(res.body).toEqual({ code: "FORBIDDEN", message: "Acesso negado." });
      expect(controllerMock.getPage).not.toHaveBeenCalled();
    });
  });

  describe("PAGE /page and /page-settings", () => {
    test("GET /page -> 200", async () => {
      // Arrange
      const { app, controllerMock, poolMock, mockConn } = setupModuleWithMocks();

      controllerMock.getPage.mockImplementation(
        implWithConn({ poolMock, status: 200, body: { ok: true } })
      );

      // Act
      const res = await request(app).get(`${MOUNT_PATH}/page`);

      // Assert
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true });

      expect(controllerMock.getPage).toHaveBeenCalledTimes(1);
      expect(poolMock.getConnection).toHaveBeenCalledTimes(1);
      expect(mockConn.release).toHaveBeenCalledTimes(1);
    });

    test("PUT /page (multipart) -> 200 e deve passar pelo upload.fields", async () => {
      // Arrange
      const { app, controllerMock, uploadMock, poolMock, mockConn } = setupModuleWithMocks();

      controllerMock.upsertPage.mockImplementation(async (req, res, next) => {
        let conn;
        try {
          conn = await poolMock.getConnection();

          // Assert (multer mock rodou)
          expect(req.files).toBeDefined();

          return res.status(200).json({ ok: true });
        } catch (e) {
          return next(e);
        } finally {
          if (conn) conn.release();
        }
      });

      // Act
      const res = await request(app)
        .put(`${MOUNT_PATH}/page`)
        .field("title", "x") // força multipart
        .attach("heroImageFallback", Buffer.from("fake"), "hero.png");

      // Assert
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true });

      expect(uploadMock.fields).toHaveBeenCalled();
      expect(controllerMock.upsertPage).toHaveBeenCalledTimes(1);

      expect(poolMock.getConnection).toHaveBeenCalledTimes(1);
      expect(mockConn.release).toHaveBeenCalledTimes(1);
    });

    test("DELETE /page -> 200", async () => {
      // Arrange
      const { app, controllerMock, poolMock, mockConn } = setupModuleWithMocks();
      controllerMock.resetPageToDefault.mockImplementation(async (_req, res, next) => {
        let conn;
        try {
          conn = await poolMock.getConnection();
          return res.status(200).json({ ok: true });
        } catch (e) {
          return next(e);
        } finally {
          if (conn) conn.release();
        }
      });

      // Act
      const res = await request(app).delete(`${MOUNT_PATH}/page`);

      // Assert
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true });

      expect(controllerMock.resetPageToDefault).toHaveBeenCalledTimes(1);
      expect(poolMock.getConnection).toHaveBeenCalledTimes(1);
      expect(mockConn.release).toHaveBeenCalledTimes(1);
    });

    test("GET /page-settings -> 200 (alias chama getPage)", async () => {
      // Arrange
      const { app, controllerMock, poolMock, mockConn } = setupModuleWithMocks();
      controllerMock.getPage.mockImplementation(async (_req, res, next) => {
        let conn;
        try {
          conn = await poolMock.getConnection();
          return res.status(200).json({ ok: true, alias: true });
        } catch (e) {
          return next(e);
        } finally {
          if (conn) conn.release();
        }
      });

      // Act
      const res = await request(app).get(`${MOUNT_PATH}/page-settings`);

      // Assert
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true, alias: true });

      expect(controllerMock.getPage).toHaveBeenCalledTimes(1);
      expect(poolMock.getConnection).toHaveBeenCalledTimes(1);
      expect(mockConn.release).toHaveBeenCalledTimes(1);
    });

    test("POST /page -> 500 (erro inesperado)", async () => {
      // Arrange
      const { app, controllerMock, poolMock, mockConn } = setupModuleWithMocks();
      controllerMock.upsertPage.mockImplementation(async (_req, _res, next) => {
        let conn;
        try {
          conn = await poolMock.getConnection();
          throw new Error("boom");
        } catch (e) {
          return next(e);
        } finally {
          if (conn) conn.release();
        }
      });

      // Act
      const res = await request(app).post(`${MOUNT_PATH}/page`).field("x", "y");

      // Assert
      expect(res.status).toBe(500);
      expect(res.body).toHaveProperty("code");
      expect(res.body).toHaveProperty("message");

      expect(controllerMock.upsertPage).toHaveBeenCalledTimes(1);
      expect(poolMock.getConnection).toHaveBeenCalledTimes(1);
      expect(mockConn.release).toHaveBeenCalledTimes(1);
    });
  });

  describe("CONFIG /config", () => {
    test("GET /config -> 200", async () => {
      // Arrange
      const { app, controllerMock, poolMock, mockConn } = setupModuleWithMocks();
      controllerMock.getLandingConfig.mockImplementation(async (_req, res, next) => {
        let conn;
        try {
          conn = await poolMock.getConnection();
          return res.status(200).json({ heroTitle: "Kavita Drones" });
        } catch (e) {
          return next(e);
        } finally {
          if (conn) conn.release();
        }
      });

      // Act
      const res = await request(app).get(`${MOUNT_PATH}/config`);

      // Assert
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ heroTitle: "Kavita Drones" });

      expect(controllerMock.getLandingConfig).toHaveBeenCalledTimes(1);
      expect(mockConn.release).toHaveBeenCalledTimes(1);
    });

    test("PUT /config (multipart) -> 400 (AppError-like)", async () => {
      // Arrange
      const { app, controllerMock, poolMock, mockConn } = setupModuleWithMocks();
      controllerMock.upsertLandingConfig.mockImplementation(
        implWithConn({
          poolMock,
          status: 200,
          throwErr: makeAppError("Payload inválido.", 400, "VALIDATION_ERROR", { field: "heroTitle" }),
        })
      );

      // Act
      const res = await request(app).put(`${MOUNT_PATH}/config`).field("heroTitle", "");

      // Assert
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ code: "VALIDATION_ERROR", message: "Payload inválido." });

      expect(controllerMock.upsertLandingConfig).toHaveBeenCalledTimes(1);
      expect(poolMock.getConnection).toHaveBeenCalledTimes(1);
      expect(mockConn.release).toHaveBeenCalledTimes(1);
    });
  });

  describe("MODELS /models", () => {
    test("GET /models -> 200 (lista vazia)", async () => {
      // Arrange
      const { app, controllerMock, poolMock, mockConn } = setupModuleWithMocks();
      controllerMock.listModels.mockImplementation(
        implWithConn({ poolMock, status: 200, body: { items: [] } })
      );

      // Act
      const res = await request(app).get(`${MOUNT_PATH}/models`);

      // Assert
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ items: [] });

      expect(controllerMock.listModels).toHaveBeenCalledTimes(1);
      expect(poolMock.getConnection).toHaveBeenCalledTimes(1);
      expect(mockConn.release).toHaveBeenCalledTimes(1);
    });

    test("POST /models (json) -> 201", async () => {
      // Arrange
      const { app, controllerMock, poolMock, mockConn } = setupModuleWithMocks();
      controllerMock.createModel.mockImplementation(async (req, res, next) => {
        let conn;
        try {
          conn = await poolMock.getConnection();

          // Assert (jsonParser rodou)
          expect(req.body).toEqual({ key: "t25p", label: "DJI Agras T25P" });

          return res.status(201).json({ id: 1, ...req.body });
        } catch (e) {
          return next(e);
        } finally {
          if (conn) conn.release();
        }
      });

      // Act
      const res = await request(app)
        .post(`${MOUNT_PATH}/models`)
        .send({ key: "t25p", label: "DJI Agras T25P" })
        .set("Content-Type", "application/json");

      // Assert
      expect(res.status).toBe(201);
      expect(res.body).toEqual({ id: 1, key: "t25p", label: "DJI Agras T25P" });

      expect(controllerMock.createModel).toHaveBeenCalledTimes(1);
      expect(poolMock.getConnection).toHaveBeenCalledTimes(1);
      expect(mockConn.release).toHaveBeenCalledTimes(1);
    });

    test("POST /models -> 400 (AppError-like)", async () => {
      // Arrange
      const { app, controllerMock, poolMock, mockConn } = setupModuleWithMocks();
      controllerMock.createModel.mockImplementation(
        implWithConn({
          poolMock,
          throwErr: makeAppError("Campos obrigatórios.", 400, "VALIDATION_ERROR"),
        })
      );

      // Act
      const res = await request(app)
        .post(`${MOUNT_PATH}/models`)
        .send({})
        .set("Content-Type", "application/json");

      // Assert
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ code: "VALIDATION_ERROR", message: "Campos obrigatórios." });

      expect(controllerMock.createModel).toHaveBeenCalledTimes(1);
      expect(poolMock.getConnection).toHaveBeenCalledTimes(1);
      expect(mockConn.release).toHaveBeenCalledTimes(1);
    });

    test("GET /models/:modelKey -> 404", async () => {
      // Arrange
      const { app, controllerMock, poolMock, mockConn } = setupModuleWithMocks();
      controllerMock.getModelAggregate.mockImplementation(
        implWithConn({
          poolMock,
          throwErr: makeAppError("Modelo não encontrado.", 404, "NOT_FOUND"),
        })
      );

      // Act
      const res = await request(app).get(`${MOUNT_PATH}/models/inexistente`);

      // Assert
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ code: "NOT_FOUND", message: "Modelo não encontrado." });

      expect(controllerMock.getModelAggregate).toHaveBeenCalledTimes(1);
      expect(poolMock.getConnection).toHaveBeenCalledTimes(1);
      expect(mockConn.release).toHaveBeenCalledTimes(1);
    });

    test("PUT /models/:modelKey -> 200", async () => {
      // Arrange
      const { app, controllerMock, poolMock, mockConn } = setupModuleWithMocks();
      controllerMock.upsertModelInfo.mockImplementation(async (req, res, next) => {
        let conn;
        try {
          conn = await poolMock.getConnection();
          return res.status(200).json({ ok: true, modelKey: req.params.modelKey, data: req.body });
        } catch (e) {
          return next(e);
        } finally {
          if (conn) conn.release();
        }
      });

      // Act
      const res = await request(app)
        .put(`${MOUNT_PATH}/models/t70p`)
        .send({ label: "DJI Agras T70P" })
        .set("Content-Type", "application/json");

      // Assert
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true, modelKey: "t70p", data: { label: "DJI Agras T70P" } });

      expect(controllerMock.upsertModelInfo).toHaveBeenCalledTimes(1);
      expect(poolMock.getConnection).toHaveBeenCalledTimes(1);
      expect(mockConn.release).toHaveBeenCalledTimes(1);
    });

    test("DELETE /models/:modelKey -> 200", async () => {
      // Arrange
      const { app, controllerMock, poolMock, mockConn } = setupModuleWithMocks();
      controllerMock.deleteModel.mockImplementation(async (req, res, next) => {
        let conn;
        try {
          conn = await poolMock.getConnection();
          return res.status(200).json({ ok: true, deleted: req.params.modelKey });
        } catch (e) {
          return next(e);
        } finally {
          if (conn) conn.release();
        }
      });

      // Act
      const res = await request(app).delete(`${MOUNT_PATH}/models/t100`);

      // Assert
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true, deleted: "t100" });

      expect(controllerMock.deleteModel).toHaveBeenCalledTimes(1);
      expect(poolMock.getConnection).toHaveBeenCalledTimes(1);
      expect(mockConn.release).toHaveBeenCalledTimes(1);
    });
  });

  describe("MODEL GALLERY /models/:modelKey/gallery + media-selection", () => {
    test("GET /models/:modelKey/gallery -> 200 (sem dados)", async () => {
      // Arrange
      const { app, controllerMock, poolMock, mockConn } = setupModuleWithMocks();
      controllerMock.listModelGallery.mockImplementation(async (req, res, next) => {
        let conn;
        try {
          conn = await poolMock.getConnection();
          return res.status(200).json({ items: [], modelKey: req.params.modelKey });
        } catch (e) {
          return next(e);
        } finally {
          if (conn) conn.release();
        }
      });

      // Act
      const res = await request(app).get(`${MOUNT_PATH}/models/t25p/gallery`);

      // Assert
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ items: [], modelKey: "t25p" });

      expect(controllerMock.listModelGallery).toHaveBeenCalledTimes(1);
      expect(poolMock.getConnection).toHaveBeenCalledTimes(1);
      expect(mockConn.release).toHaveBeenCalledTimes(1);
    });

    test("POST /models/:modelKey/gallery (multipart media) -> 201", async () => {
      // Arrange
      const { app, controllerMock, uploadMock, poolMock, mockConn } = setupModuleWithMocks();
      controllerMock.createModelGalleryItem.mockImplementation(async (req, res, next) => {
        let conn;
        try {
          conn = await poolMock.getConnection();

          // Assert (multer mock rodou)
          expect(req.file).toBeDefined();

          return res.status(201).json({ ok: true, modelKey: req.params.modelKey });
        } catch (e) {
          return next(e);
        } finally {
          if (conn) conn.release();
        }
      });

      // Act
      const res = await request(app)
        .post(`${MOUNT_PATH}/models/t70p/gallery`)
        .attach("media", Buffer.from("fake"), "img.png");

      // Assert
      expect(res.status).toBe(201);
      expect(res.body).toEqual({ ok: true, modelKey: "t70p" });

      expect(uploadMock.single).toHaveBeenCalled();
      expect(controllerMock.createModelGalleryItem).toHaveBeenCalledTimes(1);

      expect(poolMock.getConnection).toHaveBeenCalledTimes(1);
      expect(mockConn.release).toHaveBeenCalledTimes(1);
    });

    test("PUT /models/:modelKey/gallery/:id -> 400 (AppError-like)", async () => {
      // Arrange
      const { app, controllerMock, poolMock, mockConn } = setupModuleWithMocks();
      controllerMock.updateModelGalleryItem.mockImplementation(
        implWithConn({
          poolMock,
          throwErr: makeAppError("ID inválido.", 400, "VALIDATION_ERROR", { field: "id" }),
        })
      );

      // Act
      const res = await request(app)
        .put(`${MOUNT_PATH}/models/t70p/gallery/0`)
        .attach("media", Buffer.from("fake"), "img.png");

      // Assert
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ code: "VALIDATION_ERROR", message: "ID inválido." });

      expect(controllerMock.updateModelGalleryItem).toHaveBeenCalledTimes(1);
      expect(poolMock.getConnection).toHaveBeenCalledTimes(1);
      expect(mockConn.release).toHaveBeenCalledTimes(1);
    });

    test("PUT /models/:modelKey/media-selection (json) -> 200", async () => {
      // Arrange
      const { app, controllerMock, poolMock, mockConn } = setupModuleWithMocks();
      controllerMock.setModelMediaSelection.mockImplementation(async (req, res, next) => {
        let conn;
        try {
          conn = await poolMock.getConnection();

          // Assert (jsonParser rodou)
          expect(req.body).toEqual({ target: "HERO", media_id: 123 });

          return res.status(200).json({ ok: true, modelKey: req.params.modelKey });
        } catch (e) {
          return next(e);
        } finally {
          if (conn) conn.release();
        }
      });

      // Act
      const res = await request(app)
        .put(`${MOUNT_PATH}/models/t100/media-selection`)
        .send({ target: "HERO", media_id: 123 })
        .set("Content-Type", "application/json");

      // Assert
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true, modelKey: "t100" });

      expect(controllerMock.setModelMediaSelection).toHaveBeenCalledTimes(1);
      expect(poolMock.getConnection).toHaveBeenCalledTimes(1);
      expect(mockConn.release).toHaveBeenCalledTimes(1);
    });

    test("DELETE /models/:modelKey/gallery/:id -> 500 (erro inesperado)", async () => {
      // Arrange
      const { app, controllerMock, poolMock, mockConn } = setupModuleWithMocks();
      controllerMock.deleteModelGalleryItem.mockImplementation(
        implWithConn({ poolMock, throwErr: new Error("db down") })
      );

      // Act
      const res = await request(app).delete(`${MOUNT_PATH}/models/t25p/gallery/999`);

      // Assert
      expect(res.status).toBe(500);
      expect(res.body).toHaveProperty("code");
      expect(res.body).toHaveProperty("message");

      expect(controllerMock.deleteModelGalleryItem).toHaveBeenCalledTimes(1);
      expect(poolMock.getConnection).toHaveBeenCalledTimes(1);
      expect(mockConn.release).toHaveBeenCalledTimes(1);
    });
  });

  describe("LEGADO /galeria", () => {
    test("GET /galeria -> 200", async () => {
      // Arrange
      const { app, controllerMock, poolMock, mockConn } = setupModuleWithMocks();
      controllerMock.listGallery.mockImplementation(
        implWithConn({ poolMock, status: 200, body: { items: [] } })
      );

      // Act
      const res = await request(app).get(`${MOUNT_PATH}/galeria`);

      // Assert
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ items: [] });

      expect(controllerMock.listGallery).toHaveBeenCalledTimes(1);
      expect(poolMock.getConnection).toHaveBeenCalledTimes(1);
      expect(mockConn.release).toHaveBeenCalledTimes(1);
    });

    test("POST /galeria (multipart) -> 201", async () => {
      // Arrange
      const { app, controllerMock, uploadMock, poolMock, mockConn } = setupModuleWithMocks();
      controllerMock.createGalleryItem.mockImplementation(async (req, res, next) => {
        let conn;
        try {
          conn = await poolMock.getConnection();
          expect(req.file).toBeDefined();
          return res.status(201).json({ ok: true });
        } catch (e) {
          return next(e);
        } finally {
          if (conn) conn.release();
        }
      });

      // Act
      const res = await request(app)
        .post(`${MOUNT_PATH}/galeria`)
        .attach("media", Buffer.from("fake"), "img.png");

      // Assert
      expect(res.status).toBe(201);
      expect(res.body).toEqual({ ok: true });

      expect(uploadMock.single).toHaveBeenCalled();
      expect(controllerMock.createGalleryItem).toHaveBeenCalledTimes(1);

      expect(poolMock.getConnection).toHaveBeenCalledTimes(1);
      expect(mockConn.release).toHaveBeenCalledTimes(1);
    });

    test("PUT /galeria/:id -> 404 (AppError-like)", async () => {
      // Arrange
      const { app, controllerMock, poolMock, mockConn } = setupModuleWithMocks();
      controllerMock.updateGalleryItem.mockImplementation(
        implWithConn({
          poolMock,
          throwErr: makeAppError("Item não encontrado.", 404, "NOT_FOUND"),
        })
      );

      // Act
      const res = await request(app)
        .put(`${MOUNT_PATH}/galeria/9999`)
        .attach("media", Buffer.from("fake"), "img.png");

      // Assert
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ code: "NOT_FOUND", message: "Item não encontrado." });

      expect(controllerMock.updateGalleryItem).toHaveBeenCalledTimes(1);
      expect(poolMock.getConnection).toHaveBeenCalledTimes(1);
      expect(mockConn.release).toHaveBeenCalledTimes(1);
    });

    test("DELETE /galeria/:id -> 200", async () => {
      // Arrange
      const { app, controllerMock, poolMock, mockConn } = setupModuleWithMocks();
      controllerMock.deleteGalleryItem.mockImplementation(async (req, res, next) => {
        let conn;
        try {
          conn = await poolMock.getConnection();
          return res.status(200).json({ ok: true, id: Number(req.params.id) });
        } catch (e) {
          return next(e);
        } finally {
          if (conn) conn.release();
        }
      });

      // Act
      const res = await request(app).delete(`${MOUNT_PATH}/galeria/10`);

      // Assert
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true, id: 10 });

      expect(controllerMock.deleteGalleryItem).toHaveBeenCalledTimes(1);
      expect(poolMock.getConnection).toHaveBeenCalledTimes(1);
      expect(mockConn.release).toHaveBeenCalledTimes(1);
    });
  });

  describe("REPRESENTANTES", () => {
    test("GET /representantes -> 200", async () => {
      // Arrange
      const { app, controllerMock, poolMock, mockConn } = setupModuleWithMocks();
      controllerMock.listRepresentatives.mockImplementation(
        implWithConn({ poolMock, status: 200, body: { items: [] } })
      );

      // Act
      const res = await request(app).get(`${MOUNT_PATH}/representantes`);

      // Assert
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ items: [] });

      expect(controllerMock.listRepresentatives).toHaveBeenCalledTimes(1);
      expect(poolMock.getConnection).toHaveBeenCalledTimes(1);
      expect(mockConn.release).toHaveBeenCalledTimes(1);
    });

    test("POST /representantes -> 201", async () => {
      // Arrange
      const { app, controllerMock, poolMock, mockConn } = setupModuleWithMocks();
      controllerMock.createRepresentative.mockImplementation(async (req, res, next) => {
        let conn;
        try {
          conn = await poolMock.getConnection();
          expect(req.body).toEqual({ name: "Fulano", phone: "31999999999" });
          return res.status(201).json({ id: 1, ...req.body });
        } catch (e) {
          return next(e);
        } finally {
          if (conn) conn.release();
        }
      });

      // Act
      const res = await request(app)
        .post(`${MOUNT_PATH}/representantes`)
        .send({ name: "Fulano", phone: "31999999999" })
        .set("Content-Type", "application/json");

      // Assert
      expect(res.status).toBe(201);
      expect(res.body).toEqual({ id: 1, name: "Fulano", phone: "31999999999" });

      expect(controllerMock.createRepresentative).toHaveBeenCalledTimes(1);
      expect(poolMock.getConnection).toHaveBeenCalledTimes(1);
      expect(mockConn.release).toHaveBeenCalledTimes(1);
    });

    test("PUT /representantes/:id -> 400", async () => {
      // Arrange
      const { app, controllerMock, poolMock, mockConn } = setupModuleWithMocks();
      controllerMock.updateRepresentative.mockImplementation(
        implWithConn({
          poolMock,
          throwErr: makeAppError("ID inválido.", 400, "VALIDATION_ERROR"),
        })
      );

      // Act
      const res = await request(app)
        .put(`${MOUNT_PATH}/representantes/0`)
        .send({ name: "Ciclano" })
        .set("Content-Type", "application/json");

      // Assert
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ code: "VALIDATION_ERROR", message: "ID inválido." });

      expect(controllerMock.updateRepresentative).toHaveBeenCalledTimes(1);
      expect(poolMock.getConnection).toHaveBeenCalledTimes(1);
      expect(mockConn.release).toHaveBeenCalledTimes(1);
    });

    test("DELETE /representantes/:id -> 200", async () => {
      // Arrange
      const { app, controllerMock, poolMock, mockConn } = setupModuleWithMocks();
      controllerMock.deleteRepresentative.mockImplementation(async (req, res, next) => {
        let conn;
        try {
          conn = await poolMock.getConnection();
          return res.status(200).json({ ok: true, id: Number(req.params.id) });
        } catch (e) {
          return next(e);
        } finally {
          if (conn) conn.release();
        }
      });

      // Act
      const res = await request(app).delete(`${MOUNT_PATH}/representantes/5`);

      // Assert
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true, id: 5 });

      expect(controllerMock.deleteRepresentative).toHaveBeenCalledTimes(1);
      expect(poolMock.getConnection).toHaveBeenCalledTimes(1);
      expect(mockConn.release).toHaveBeenCalledTimes(1);
    });
  });

  describe("COMENTÁRIOS (moderação)", () => {
    test("GET /comentarios -> 200", async () => {
      // Arrange
      const { app, controllerMock, poolMock, mockConn } = setupModuleWithMocks();
      controllerMock.listComments.mockImplementation(
        implWithConn({ poolMock, status: 200, body: { items: [], page: 1, limit: 10, total: 0 } })
      );

      // Act
      const res = await request(app).get(`${MOUNT_PATH}/comentarios?page=1&limit=10`);

      // Assert
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ items: [], page: 1, limit: 10, total: 0 });

      expect(controllerMock.listComments).toHaveBeenCalledTimes(1);
      expect(poolMock.getConnection).toHaveBeenCalledTimes(1);
      expect(mockConn.release).toHaveBeenCalledTimes(1);
    });

    test("PUT /comentarios/:id/aprovar -> 200", async () => {
      // Arrange
      const { app, controllerMock, poolMock, mockConn } = setupModuleWithMocks();
      controllerMock.approveComment.mockImplementation(
        implWithConn({
          poolMock,
          status: 200,
          body: { ok: true, id: 10, status: "APROVADO" },
        })
      );

      // Act
      const res = await request(app).put(`${MOUNT_PATH}/comentarios/10/aprovar`);

      // Assert
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true, id: 10, status: "APROVADO" });

      expect(controllerMock.approveComment).toHaveBeenCalledTimes(1);
      expect(poolMock.getConnection).toHaveBeenCalledTimes(1);
      expect(mockConn.release).toHaveBeenCalledTimes(1);
    });

    test("PUT /comentarios/:id/reprovar -> 404", async () => {
      // Arrange
      const { app, controllerMock, poolMock, mockConn } = setupModuleWithMocks();
      controllerMock.rejectComment.mockImplementation(
        implWithConn({
          poolMock,
          throwErr: makeAppError("Comentário não encontrado.", 404, "NOT_FOUND"),
        })
      );

      // Act
      const res = await request(app).put(`${MOUNT_PATH}/comentarios/999/reprovar`);

      // Assert
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ code: "NOT_FOUND", message: "Comentário não encontrado." });

      expect(controllerMock.rejectComment).toHaveBeenCalledTimes(1);
      expect(poolMock.getConnection).toHaveBeenCalledTimes(1);
      expect(mockConn.release).toHaveBeenCalledTimes(1);
    });

    test("DELETE /comentarios/:id -> 500", async () => {
      // Arrange
      const { app, controllerMock, poolMock, mockConn } = setupModuleWithMocks();
      controllerMock.deleteComment.mockImplementation(
        implWithConn({ poolMock, throwErr: new Error("unexpected") })
      );

      // Act
      const res = await request(app).delete(`${MOUNT_PATH}/comentarios/12`);

      // Assert
      expect(res.status).toBe(500);
      expect(res.body).toHaveProperty("code");
      expect(res.body).toHaveProperty("message");

      expect(controllerMock.deleteComment).toHaveBeenCalledTimes(1);
      expect(poolMock.getConnection).toHaveBeenCalledTimes(1);
      expect(mockConn.release).toHaveBeenCalledTimes(1);
    });
  });
});
