/**
 * teste/integration/controllers/siteHero.int.test.js
 *
 * Controller testado: controllers/siteHeroController.js (assumido)
 *
 * Endpoints montados no router de teste:
 * - GET  /api/site-hero/hero         (auth admin)
 * - GET  /api/site-hero/hero/public  (guest ok)
 * - PUT  /api/site-hero/hero         (auth admin)  // simula req.files via app.locals.__files
 *
 * Regras do projeto:
 * - Sem MySQL real: mock de ../config/pool
 * - AAA em todos os testes
 * - Mock de query por MATCH de SQL (normalizeSql)
 * - Erros: validar { code, message } e status
 */

"use strict";

const request = require("supertest");
const express = require("express");
const { makeTestApp } = require("../../testUtils");
const ERROR_CODES = require("../../../constants/ErrorCodes");

/** helpers (obrigatórios no teste) */
function normalizeSql(sql) {
  return String(sql || "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

function buildConn() {
  // não usado aqui (controller usa pool.query), mas mantido por padrão do projeto
  return {
    beginTransaction: jest.fn(async () => undefined),
    query: jest.fn(async () => [[], []]),
    commit: jest.fn(async () => undefined),
    rollback: jest.fn(async () => undefined),
    release: jest.fn(() => undefined),
  };
}

/**
 * makeQueryRouter(handlers)
 * - handlers: Array<{ match: (sqlNorm, params) => boolean, reply: (sqlNorm, params) => any }>
 */
function makeQueryRouter(handlers) {
  return async (sql, params) => {
    const sqlNorm = normalizeSql(sql);
    for (const h of handlers) {
      if (h && typeof h.match === "function" && h.match(sqlNorm, params)) {
        if (typeof h.reply !== "function") throw new Error("Handler.reply inválido");
        return await h.reply(sqlNorm, params);
      }
    }
    throw new Error(`Query não mockada: ${sqlNorm}`);
  };
}

function authAsUser(userObj) {
  return (req, _res, next) => {
    req.user = userObj || { id: 1, role: "admin" };
    next();
  };
}

function authAsGuest() {
  return (req, _res, next) => {
    req.user = null;
    next();
  };
}

function requireAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ code: ERROR_CODES.UNAUTHORIZED, message: "Não autenticado." });
  }
  if (req.user.role !== "admin") {
    return res.status(403).json({ code: ERROR_CODES.FORBIDDEN, message: "Sem permissão." });
  }
  next();
}

/**
 * Express 4 NÃO captura automaticamente errors de Promise em handlers async.
 * Para simular o seu router real (que normalmente tem um wrapper), aplicamos aqui.
 */
function asyncWrap(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

function buildRouter(controller, { authMw }) {
  const router = express.Router();

  // middleware para simular uploads (multer)
  router.use((req, _res, next) => {
    req.files = req.app?.locals?.__files || {};
    next();
  });

  router.get("/hero", authMw, requireAdmin, asyncWrap(controller.getHero));
  router.get("/hero/public", asyncWrap(controller.getHeroPublic));
  router.put("/hero", authMw, requireAdmin, asyncWrap(controller.updateHero));

  return router;
}

/** Test setup: mock pool + AppError antes de require do controller */
function setupModuleWithMocks() {
  jest.resetModules();

  const mockPool = {
    query: jest.fn(),
    getConnection: jest.fn(),
  };

  // ✅ garante que VALIDATION_ERROR vire status 400 no catch do controller (usa err.statusCode)
  class MockAppError extends Error {
    constructor(message, status = 500, code = "INTERNAL_ERROR", details = null) {
      super(message);
      this.name = "AppError";
      this.statusCode = status; // <- o controller usa statusCode
      this.code = code;
      this.details = details;
    }
  }

  jest.doMock("../../../config/pool", () => mockPool);
  jest.doMock("../../../errors/AppError", () => MockAppError);

  // carregar controller real após mocks
  const controller = require("../../../controllers/siteHeroController");

  return { controller, mockPool };
}

describe("SiteHero controller (controllers/siteHeroController.js)", () => {
  test("GET /api/site-hero/hero -> 200 (cria single row se não existir) e retorna defaults", async () => {
    // Arrange
    const { controller, mockPool } = setupModuleWithMocks();

    mockPool.query.mockImplementation(
      makeQueryRouter([
        {
          match: (sqlNorm) => sqlNorm === "select id from site_hero_settings limit 1",
          reply: async () => [[]], // sem rows -> força insert
        },
        {
          match: (sqlNorm) =>
            sqlNorm ===
            "insert into site_hero_settings (button_label, button_href) values (?, ?)",
          reply: async (_sqlNorm, params) => {
            expect(params).toEqual(["Saiba Mais", "/drones"]);
            return [{ insertId: 123 }];
          },
        },
        {
          match: (sqlNorm) =>
            sqlNorm.includes("from site_hero_settings") &&
            sqlNorm.includes("order by id asc") &&
            sqlNorm.includes("limit 1"),
          reply: async () => [
            [
              {
                hero_video_url: null,
                hero_video_path: null,
                hero_image_url: null,
                hero_image_path: null,
                title: null,
                subtitle: null,
                button_label: null,
                button_href: null,
                updated_at: null,
                created_at: null,
              },
            ],
          ],
        },
      ])
    );

    const router = buildRouter(controller, { authMw: authAsUser({ id: 7, role: "admin" }) });
    const app = makeTestApp("/api/site-hero", router);

    // Act
    const res = await request(app).get("/api/site-hero/hero");

    // Assert
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      hero_video_url: "",
      hero_video_path: "",
      hero_image_url: "",
      hero_image_path: "",
      title: "",
      subtitle: "",
      button_label: "Saiba Mais",
      button_href: "/drones",
      updated_at: null,
      created_at: null,
    });
    expect(mockPool.query).toHaveBeenCalled();
    expect(mockPool.getConnection).not.toHaveBeenCalled();
  });

  test("GET /api/site-hero/hero/public -> 200 (guest) e normaliza href sem barra", async () => {
    // Arrange
    const { controller, mockPool } = setupModuleWithMocks();

    mockPool.query.mockImplementation(
      makeQueryRouter([
        {
          match: (sqlNorm) => sqlNorm === "select id from site_hero_settings limit 1",
          reply: async () => [[{ id: 1 }]],
        },
        {
          match: (sqlNorm) =>
            sqlNorm.includes("from site_hero_settings") &&
            sqlNorm.includes("order by id asc") &&
            sqlNorm.includes("limit 1"),
          reply: async () => [
            [
              {
                hero_video_url: "",
                hero_video_path: "",
                hero_image_url: "",
                hero_image_path: "",
                title: "Título",
                subtitle: "Sub",
                button_label: "Clique",
                button_href: "drones", // sem "/" -> deve virar "/drones"
                updated_at: "2026-02-18T00:00:00.000Z",
                created_at: "2026-02-17T00:00:00.000Z",
              },
            ],
          ],
        },
      ])
    );

    const router = buildRouter(controller, { authMw: authAsGuest() });
    const app = makeTestApp("/api/site-hero", router);

    // Act
    const res = await request(app).get("/api/site-hero/hero/public");

    // Assert
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      title: "Título",
      subtitle: "Sub",
      button_label: "Clique",
      button_href: "/drones",
    });
    expect(mockPool.query).toHaveBeenCalled();
  });

  test("PUT /api/site-hero/hero -> 401 quando guest", async () => {
    // Arrange
    const { controller } = setupModuleWithMocks();

    const router = buildRouter(controller, { authMw: authAsGuest() });
    const app = makeTestApp("/api/site-hero", router);

    // Act
    const res = await request(app).put("/api/site-hero/hero").send({ button_label: "X" });

    // Assert
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ code: "UNAUTHORIZED", message: expect.any(String) });
  });

  test("PUT /api/site-hero/hero -> 403 quando role incorreta", async () => {
    // Arrange
    const { controller } = setupModuleWithMocks();

    const router = buildRouter(controller, { authMw: authAsUser({ id: 2, role: "user" }) });
    const app = makeTestApp("/api/site-hero", router);

    // Act
    const res = await request(app).put("/api/site-hero/hero").send({ button_label: "X" });

    // Assert
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ code: "FORBIDDEN", message: expect.any(String) });
  });

  test("PUT /api/site-hero/hero -> 400 quando button_label > 80", async () => {
    // Arrange
    const { controller, mockPool } = setupModuleWithMocks();

    const router = buildRouter(controller, { authMw: authAsUser({ id: 1, role: "admin" }) });
    const app = makeTestApp("/api/site-hero", router);

    const big = "a".repeat(81);

    // Act
    const res = await request(app).put("/api/site-hero/hero").send({ button_label: big });

    // Assert
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      code: "VALIDATION_ERROR",
      message: "Label do botão muito grande.",
    });
    expect(mockPool.query).not.toHaveBeenCalled();
  });

  test("PUT /api/site-hero/hero -> 400 quando title > 255", async () => {
    // Arrange
    const { controller, mockPool } = setupModuleWithMocks();

    const router = buildRouter(controller, { authMw: authAsUser({ id: 1, role: "admin" }) });
    const app = makeTestApp("/api/site-hero", router);

    const big = "t".repeat(256);

    // Act
    const res = await request(app).put("/api/site-hero/hero").send({ title: big });

    // Assert
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      code: "VALIDATION_ERROR",
      message: "Título muito grande.",
    });
    expect(mockPool.query).not.toHaveBeenCalled();
  });

  test("PUT /api/site-hero/hero -> 400 quando subtitle > 500", async () => {
    // Arrange
    const { controller, mockPool } = setupModuleWithMocks();

    const router = buildRouter(controller, { authMw: authAsUser({ id: 1, role: "admin" }) });
    const app = makeTestApp("/api/site-hero", router);

    const big = "s".repeat(501);

    // Act
    const res = await request(app).put("/api/site-hero/hero").send({ subtitle: big });

    // Assert
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      code: "VALIDATION_ERROR",
      message: "Subtítulo muito grande.",
    });
    expect(mockPool.query).not.toHaveBeenCalled();
  });

  test("PUT /api/site-hero/hero -> 400 quando video mimetype inválido", async () => {
    // Arrange
    const { controller, mockPool } = setupModuleWithMocks();

    const router = buildRouter(controller, { authMw: authAsUser({ id: 1, role: "admin" }) });
    const app = makeTestApp("/api/site-hero", router);

    app.locals.__files = {
      heroVideo: [{ filename: "x.mp4", mimetype: "image/png" }], // errado
    };

    // Act
    const res = await request(app).put("/api/site-hero/hero").send({ button_label: "Ok" });

    // Assert
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      code: "VALIDATION_ERROR",
      message: "Arquivo de vídeo inválido.",
    });
    expect(mockPool.query).not.toHaveBeenCalled();
  });

  test("PUT /api/site-hero/hero -> 400 quando image mimetype inválido", async () => {
    // Arrange
    const { controller, mockPool } = setupModuleWithMocks();

    const router = buildRouter(controller, { authMw: authAsUser({ id: 1, role: "admin" }) });
    const app = makeTestApp("/api/site-hero", router);

    app.locals.__files = {
      heroImageFallback: [{ filename: "x.jpg", mimetype: "video/mp4" }], // errado
    };

    // Act
    const res = await request(app).put("/api/site-hero/hero").send({ button_label: "Ok" });

    // Assert
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      code: "VALIDATION_ERROR",
      message: "Arquivo de imagem inválido.",
    });
    expect(mockPool.query).not.toHaveBeenCalled();
  });

  test("PUT /api/site-hero/hero -> 200 sucesso: atualiza patch + retorna hero atualizado", async () => {
    // Arrange
    const { controller, mockPool } = setupModuleWithMocks();

    const router = buildRouter(controller, { authMw: authAsUser({ id: 9, role: "admin" }) });
    const app = makeTestApp("/api/site-hero", router);

    app.locals.__files = {
      heroVideo: [{ filename: "hero.mp4", mimetype: "video/mp4" }],
      heroImageFallback: [{ filename: "hero.jpg", mimetype: "image/jpeg" }],
    };

    mockPool.query.mockImplementation(
      makeQueryRouter([
        // ensureSingleRow (updateHeroRow) -> SELECT id
        {
          match: (sqlNorm) => sqlNorm === "select id from site_hero_settings limit 1",
          reply: async () => [[{ id: 77 }]],
        },
        // updateHeroRow -> UPDATE
        {
          match: (sqlNorm) => sqlNorm === "update site_hero_settings set ? where id = ?",
          reply: async (_sqlNorm, params) => {
            const [fields, id] = params || [];
            expect(id).toBe(77);

            expect(fields).toMatchObject({
              button_label: "Ver drones",
              button_href: "/drones",
              title: "Meu Título",
              subtitle: "Meu Sub",
              hero_video_path: "/uploads/hero.mp4",
              hero_video_url: "/uploads/hero.mp4",
              hero_image_path: "/uploads/hero.jpg",
              hero_image_url: "/uploads/hero.jpg",
            });

            return [{ affectedRows: 1 }];
          },
        },
        // getHeroBase após update -> SELECT hero row
        {
          match: (sqlNorm) =>
            sqlNorm.includes("from site_hero_settings") &&
            sqlNorm.includes("order by id asc") &&
            sqlNorm.includes("limit 1"),
          reply: async () => [
            [
              {
                hero_video_url: "/uploads/hero.mp4",
                hero_video_path: "/uploads/hero.mp4",
                hero_image_url: "/uploads/hero.jpg",
                hero_image_path: "/uploads/hero.jpg",
                title: "Meu Título",
                subtitle: "Meu Sub",
                button_label: "Ver drones",
                button_href: "/drones",
                updated_at: "2026-02-18T00:00:00.000Z",
                created_at: "2026-02-17T00:00:00.000Z",
              },
            ],
          ],
        },
      ])
    );

    // Act
    const res = await request(app).put("/api/site-hero/hero").send({
      button_label: "Ver drones",
      button_href: "drones",
      title: "Meu Título",
      subtitle: "Meu Sub",
    });

    // Assert
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      ok: true,
      hero: {
        hero_video_url: "/uploads/hero.mp4",
        hero_image_url: "/uploads/hero.jpg",
        title: "Meu Título",
        subtitle: "Meu Sub",
        button_label: "Ver drones",
        button_href: "/drones",
      },
    });
    expect(mockPool.query).toHaveBeenCalled();
    expect(mockPool.getConnection).not.toHaveBeenCalled();
  });

  test("PUT /api/site-hero/hero -> 500 erro inesperado em DB (pool.query throw) retorna padrão do controller", async () => {
    // Arrange
    const { controller, mockPool } = setupModuleWithMocks();

    const router = buildRouter(controller, { authMw: authAsUser({ id: 1, role: "admin" }) });
    const app = makeTestApp("/api/site-hero", router);

    mockPool.query.mockImplementation(
      makeQueryRouter([
        {
          match: (sqlNorm) => sqlNorm === "select id from site_hero_settings limit 1",
          reply: async () => {
            throw new Error("DB down");
          },
        },
      ])
    );

    // Act
    const res = await request(app).put("/api/site-hero/hero").send({ button_label: "Ok" });

    // Assert
    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({
      code: "INTERNAL_ERROR",
      message: expect.any(String),
    });
    expect(mockPool.query).toHaveBeenCalled();
  });

  test("GET /api/site-hero/hero -> 500 via error handler padrão quando pool.query throw", async () => {
    // Arrange
    const { controller, mockPool } = setupModuleWithMocks();

    mockPool.query.mockImplementation(
      makeQueryRouter([
        {
          match: (sqlNorm) => sqlNorm === "select id from site_hero_settings limit 1",
          reply: async () => {
            throw new Error("Boom");
          },
        },
      ])
    );

    const router = buildRouter(controller, { authMw: authAsUser({ id: 1, role: "admin" }) });
    const app = makeTestApp("/api/site-hero", router);

    // Act
    const res = await request(app).get("/api/site-hero/hero");

    // Assert
    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({
      code: expect.any(String),
      message: expect.any(String),
    });
    expect(mockPool.query).toHaveBeenCalled();
  });
});
