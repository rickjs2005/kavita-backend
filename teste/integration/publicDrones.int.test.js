/**
 * teste/integration/publicDrones.int.test.js
 *
 * Rotas testadas (routes/publicDrones.js):
 * - GET    /api/public/drones
 * - GET    /api/public/drones/models
 * - GET    /api/public/drones/models/:modelKey
 * - GET    /api/public/drones/page
 * - GET    /api/public/drones/galeria
 * - GET    /api/public/drones/representantes
 * - GET    /api/public/drones/comentarios
 * - POST   /api/public/drones/comentarios
 *          middlewares: verifyUser (login), dronesCommentThrottle (antispam), upload.array("media", 6)
 *
 * Regras (obrigatórias):
 * - Sem MySQL real: mockar pool/getConnection/conn.query com makeMockConn()
 * - Sem rede externa: serviços externos devem ser mockados (aqui não há chamada externa direta na rota)
 * - Auth mock: verifyUser deve simular req.user e next()
 * - AAA (Arrange -> Act -> Assert) em todos os testes
 * - App de teste: makeTestApp(mountPath, router) do teste/testUtils.js
 * - ENV controlado: originalEnv + process.env setado antes do require + afterEach restaurando
 * - jest.resetModules() no setup
 * - Sem snapshots
 *
 * Observação:
 * - Este arquivo testa INTEGRAÇÃO DE ROTAS Express. Controllers são mockados.
 *   (Cobertura aqui é do arquivo routes/publicDrones.js.)
 *
 * Nota importante (multipart em testes):
 * - Como o multer está mockado (não roda de verdade), os campos `.field(...)` do Supertest
 *   podem NÃO popular `req.body`. Então o mock do upload.array() abaixo também popula `req.body`
 *   para simular o comportamento real do multer.
 * - Além disso, evitamos `expect(...)` dentro do handler mock do controller para não transformar
 *   falhas de assert em HTTP 500 (error handler do app de teste).
 */

const request = require("supertest");
const { makeTestApp, makeMockConn } = require("../testUtils");

describe("Public Drones routes (routes/publicDrones.js)", () => {
  const originalEnv = process.env;
  const MOUNT_PATH = "/api/public/drones";

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

    // --- Auth mock: verifyUser ---
    const verifyUserMock = jest.fn((req, _res, next) => {
      req.user = { id: 123, role: "user" };
      next();
    });

    // --- Throttle mock: dronesCommentThrottle ---
    const throttleMock = jest.fn((_req, _res, next) => next());

    // --- mediaService.upload mock (multer) ---
    // IMPORTANT: como não existe multer real rodando, req.body do multipart pode vir vazio.
    // Aqui simulamos que multer preenche req.body + req.files.
    const uploadMock = {
      array: jest.fn((_field, _max) => (req, _res, next) => {
        req.files =
          req.files ||
          [
            { fieldname: "media", originalname: "a.png" },
            { fieldname: "media", originalname: "b.png" },
          ];

        req.body = req.body || {};

        // defaults para o teste (evita req.body vazio)
        if (req.body.text === undefined) req.body.text = "Meu comentário";
        if (req.body.model_key === undefined) req.body.model_key = "t25p";

        next();
      }),
    };

    // --- Controller mock ---
    const controllerMock = {
      getRoot: jest.fn(),
      listModels: jest.fn(),
      getModelAggregate: jest.fn(),
      getPage: jest.fn(),
      getGallery: jest.fn(),
      listRepresentatives: jest.fn(),
      listApprovedComments: jest.fn(),
      createComment: jest.fn(),
    };

    // resolve absolute paths to match project imports
    const pathPool = require.resolve("../../config/pool");
    const pathController = require.resolve("../../controllers/dronesPublicController");
    const pathVerifyUser = require.resolve("../../middleware/verifyUser");
    const pathThrottle = require.resolve("../../middleware/dronesCommentThrottle");
    const pathMediaService = require.resolve("../../services/mediaService");

    jest.doMock(pathPool, () => poolMock, { virtual: false });
    jest.doMock(pathController, () => controllerMock, { virtual: false });
    jest.doMock(pathVerifyUser, () => verifyUserMock, { virtual: false });
    jest.doMock(pathThrottle, () => throttleMock, { virtual: false });
    jest.doMock(
      pathMediaService,
      () => ({
        upload: uploadMock,
      }),
      { virtual: false }
    );

    // require router after mocks
    const router = require("../../routes/publicDrones");
    const app = makeTestApp(MOUNT_PATH, router);

    return {
      app,
      poolMock,
      mockConn,
      verifyUserMock,
      throttleMock,
      uploadMock,
      controllerMock,
    };
  }

  afterEach(() => {
    process.env = originalEnv;
    jest.clearAllMocks();
  });

  /**
   * Helper: controller mock que SEMPRE usa res real e SEMPRE dá release().
   * Evita hang no supertest.
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

  describe("GET / (root agregado)", () => {
    test("200 -> sem query model", async () => {
      // Arrange
      const { app, controllerMock, poolMock, mockConn } = setupModuleWithMocks();
      controllerMock.getRoot.mockImplementation(
        implWithConn({ poolMock, status: 200, body: { ok: true, model: null } })
      );

      // Act
      const res = await request(app).get(`${MOUNT_PATH}`);

      // Assert
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true, model: null });
      expect(controllerMock.getRoot).toHaveBeenCalledTimes(1);
      expect(poolMock.getConnection).toHaveBeenCalledTimes(1);
      expect(mockConn.release).toHaveBeenCalledTimes(1);
    });

    test("400 -> model inválido (formato)", async () => {
      // Arrange
      const { app, controllerMock, poolMock, mockConn } = setupModuleWithMocks();
      controllerMock.getRoot.mockImplementation(
        implWithConn({
          poolMock,
          throwErr: makeAppError("Modelo inválido.", 400, "VALIDATION_ERROR", {
            field: "model",
            reason: "format",
          }),
        })
      );

      // Act
      const res = await request(app).get(`${MOUNT_PATH}?model=@@@`);

      // Assert
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ code: "VALIDATION_ERROR", message: "Modelo inválido." });
      expect(controllerMock.getRoot).toHaveBeenCalledTimes(1);
      expect(poolMock.getConnection).toHaveBeenCalledTimes(1);
      expect(mockConn.release).toHaveBeenCalledTimes(1);
    });

    test("404 -> model não encontrado", async () => {
      // Arrange
      const { app, controllerMock, poolMock, mockConn } = setupModuleWithMocks();
      controllerMock.getRoot.mockImplementation(
        implWithConn({
          poolMock,
          throwErr: makeAppError("Modelo não encontrado.", 404, "NOT_FOUND"),
        })
      );

      // Act
      const res = await request(app).get(`${MOUNT_PATH}?model=t999`);

      // Assert
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ code: "NOT_FOUND", message: "Modelo não encontrado." });
      expect(controllerMock.getRoot).toHaveBeenCalledTimes(1);
      expect(poolMock.getConnection).toHaveBeenCalledTimes(1);
      expect(mockConn.release).toHaveBeenCalledTimes(1);
    });

    test("500 -> erro inesperado", async () => {
      // Arrange
      const { app, controllerMock, poolMock, mockConn } = setupModuleWithMocks();
      controllerMock.getRoot.mockImplementation(implWithConn({ poolMock, throwErr: new Error("boom") }));

      // Act
      const res = await request(app).get(`${MOUNT_PATH}`);

      // Assert
      expect(res.status).toBe(500);
      expect(res.body).toHaveProperty("code");
      expect(res.body).toHaveProperty("message");
      expect(controllerMock.getRoot).toHaveBeenCalledTimes(1);
      expect(poolMock.getConnection).toHaveBeenCalledTimes(1);
      expect(mockConn.release).toHaveBeenCalledTimes(1);
    });
  });

  describe("GET /models", () => {
    test("200 -> lista vazia", async () => {
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

    test("500 -> erro inesperado", async () => {
      // Arrange
      const { app, controllerMock, poolMock, mockConn } = setupModuleWithMocks();
      controllerMock.listModels.mockImplementation(implWithConn({ poolMock, throwErr: new Error("db down") }));

      // Act
      const res = await request(app).get(`${MOUNT_PATH}/models`);

      // Assert
      expect(res.status).toBe(500);
      expect(res.body).toHaveProperty("code");
      expect(res.body).toHaveProperty("message");
      expect(controllerMock.listModels).toHaveBeenCalledTimes(1);
      expect(poolMock.getConnection).toHaveBeenCalledTimes(1);
      expect(mockConn.release).toHaveBeenCalledTimes(1);
    });
  });

  describe("GET /models/:modelKey", () => {
    test("200 -> agregado do modelo", async () => {
      // Arrange
      const { app, controllerMock, poolMock, mockConn } = setupModuleWithMocks();
      controllerMock.getModelAggregate.mockImplementation(
        implWithConn({ poolMock, status: 200, body: { ok: true, modelKey: "t25p" } })
      );

      // Act
      const res = await request(app).get(`${MOUNT_PATH}/models/t25p`);

      // Assert
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true, modelKey: "t25p" });
      expect(controllerMock.getModelAggregate).toHaveBeenCalledTimes(1);
      expect(poolMock.getConnection).toHaveBeenCalledTimes(1);
      expect(mockConn.release).toHaveBeenCalledTimes(1);
    });

    test("400 -> modelKey inválido", async () => {
      // Arrange
      const { app, controllerMock, poolMock, mockConn } = setupModuleWithMocks();
      controllerMock.getModelAggregate.mockImplementation(
        implWithConn({ poolMock, throwErr: makeAppError("Modelo inválido.", 400, "VALIDATION_ERROR") })
      );

      // Act
      const res = await request(app).get(`${MOUNT_PATH}/models/@@@`);

      // Assert
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ code: "VALIDATION_ERROR", message: "Modelo inválido." });
      expect(controllerMock.getModelAggregate).toHaveBeenCalledTimes(1);
      expect(poolMock.getConnection).toHaveBeenCalledTimes(1);
      expect(mockConn.release).toHaveBeenCalledTimes(1);
    });

    test("404 -> modelo não encontrado", async () => {
      // Arrange
      const { app, controllerMock, poolMock, mockConn } = setupModuleWithMocks();
      controllerMock.getModelAggregate.mockImplementation(
        implWithConn({ poolMock, throwErr: makeAppError("Modelo não encontrado.", 404, "NOT_FOUND") })
      );

      // Act
      const res = await request(app).get(`${MOUNT_PATH}/models/t999`);

      // Assert
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ code: "NOT_FOUND", message: "Modelo não encontrado." });
      expect(controllerMock.getModelAggregate).toHaveBeenCalledTimes(1);
      expect(poolMock.getConnection).toHaveBeenCalledTimes(1);
      expect(mockConn.release).toHaveBeenCalledTimes(1);
    });
  });

  describe("LEGADO GET /page, /galeria, /representantes, /comentarios", () => {
    test("GET /page -> 200", async () => {
      // Arrange
      const { app, controllerMock, poolMock, mockConn } = setupModuleWithMocks();
      controllerMock.getPage.mockImplementation(implWithConn({ poolMock, status: 200, body: { ok: true } }));

      // Act
      const res = await request(app).get(`${MOUNT_PATH}/page`);

      // Assert
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true });
      expect(controllerMock.getPage).toHaveBeenCalledTimes(1);
      expect(poolMock.getConnection).toHaveBeenCalledTimes(1);
      expect(mockConn.release).toHaveBeenCalledTimes(1);
    });

    test("GET /galeria -> 200 (sem dados)", async () => {
      // Arrange
      const { app, controllerMock, poolMock, mockConn } = setupModuleWithMocks();
      controllerMock.getGallery.mockImplementation(implWithConn({ poolMock, status: 200, body: { items: [] } }));

      // Act
      const res = await request(app).get(`${MOUNT_PATH}/galeria`);

      // Assert
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ items: [] });
      expect(controllerMock.getGallery).toHaveBeenCalledTimes(1);
      expect(poolMock.getConnection).toHaveBeenCalledTimes(1);
      expect(mockConn.release).toHaveBeenCalledTimes(1);
    });

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

    test("GET /comentarios -> 200 (aprovados)", async () => {
      // Arrange
      const { app, controllerMock, poolMock, mockConn } = setupModuleWithMocks();
      controllerMock.listApprovedComments.mockImplementation(
        implWithConn({ poolMock, status: 200, body: { items: [] } })
      );

      // Act
      const res = await request(app).get(`${MOUNT_PATH}/comentarios?model=t25p`);

      // Assert
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ items: [] });
      expect(controllerMock.listApprovedComments).toHaveBeenCalledTimes(1);
      expect(poolMock.getConnection).toHaveBeenCalledTimes(1);
      expect(mockConn.release).toHaveBeenCalledTimes(1);
    });
  });

  describe("POST /comentarios (login obrigatório + throttle + upload)", () => {
    test("201 -> fluxo feliz (verifyUser + throttle + upload.array + controller)", async () => {
      // Arrange
      const { app, controllerMock, verifyUserMock, throttleMock, uploadMock, poolMock, mockConn } =
        setupModuleWithMocks();

      let seenUser = null;
      let seenBody = null;
      let seenFiles = null;

      controllerMock.createComment.mockImplementation(async (req, res, next) => {
        let conn;
        try {
          conn = await poolMock.getConnection();

          // captura para validar fora (evita assert virar 500)
          seenUser = req.user;
          seenBody = req.body;
          seenFiles = req.files;

          return res.status(201).json({ ok: true, created: true });
        } catch (e) {
          return next(e);
        } finally {
          if (conn) conn.release();
        }
      });

      // Act
      const res = await request(app)
        .post(`${MOUNT_PATH}/comentarios`)
        .field("text", "Meu comentário")
        .field("model_key", "t25p")
        .attach("media", Buffer.from("fake"), "a.png");

      // Assert
      expect(res.status).toBe(201);
      expect(res.body).toEqual({ ok: true, created: true });

      expect(verifyUserMock).toHaveBeenCalledTimes(1);
      expect(throttleMock).toHaveBeenCalledTimes(1);
      expect(uploadMock.array).toHaveBeenCalledTimes(1);
      expect(controllerMock.createComment).toHaveBeenCalledTimes(1);

      expect(poolMock.getConnection).toHaveBeenCalledTimes(1);
      expect(mockConn.release).toHaveBeenCalledTimes(1);

      // valida o que chegou no controller
      expect(seenUser).toEqual({ id: 123, role: "user" });
      expect(seenBody).toBeTruthy();
      expect(seenBody).toHaveProperty("text");
      expect(seenBody).toHaveProperty("model_key");
      expect(Array.isArray(seenFiles)).toBe(true);
    });

    test("401 -> sem login (verifyUser bloqueia)", async () => {
      // Arrange
      const { app, verifyUserMock, controllerMock } = setupModuleWithMocks();

      verifyUserMock.mockImplementationOnce((_req, res, _next) => {
        return res.status(401).json({ code: "UNAUTHORIZED", message: "Login obrigatório." });
      });

      // Act
      const res = await request(app).post(`${MOUNT_PATH}/comentarios`).field("text", "x");

      // Assert
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ code: "UNAUTHORIZED", message: "Login obrigatório." });
      expect(controllerMock.createComment).not.toHaveBeenCalled();
    });

    test("429 -> throttle bloqueia (antispam)", async () => {
      // Arrange
      const { app, throttleMock, controllerMock } = setupModuleWithMocks();

      throttleMock.mockImplementationOnce((_req, res, _next) => {
        return res.status(429).json({ code: "RATE_LIMIT", message: "Aguarde antes de comentar novamente." });
      });

      // Act
      const res = await request(app).post(`${MOUNT_PATH}/comentarios`).field("text", "x");

      // Assert
      expect(res.status).toBe(429);
      expect(res.body).toEqual({ code: "RATE_LIMIT", message: "Aguarde antes de comentar novamente." });
      expect(controllerMock.createComment).not.toHaveBeenCalled();
    });

    test("500 -> erro inesperado no controller (e release sempre)", async () => {
      // Arrange
      const { app, controllerMock, poolMock, mockConn } = setupModuleWithMocks();
      controllerMock.createComment.mockImplementation(implWithConn({ poolMock, throwErr: new Error("unexpected") }));

      // Act
      const res = await request(app).post(`${MOUNT_PATH}/comentarios`).field("text", "x");

      // Assert
      expect(res.status).toBe(500);
      expect(res.body).toHaveProperty("code");
      expect(res.body).toHaveProperty("message");

      expect(controllerMock.createComment).toHaveBeenCalledTimes(1);
      expect(poolMock.getConnection).toHaveBeenCalledTimes(1);
      expect(mockConn.release).toHaveBeenCalledTimes(1);
    });
  });
});
