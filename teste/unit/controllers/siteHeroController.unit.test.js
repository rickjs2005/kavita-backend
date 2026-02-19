/**
 * teste/unit/controllers/siteHeroController.unit.test.js
 *
 * Testes UNIT do siteHeroController:
 * - Sem Express/Supertest
 * - Mocka pool.query
 * - NÃO depende da ordem das queries (mock por SQL), evitando flakiness
 * - Cobre: GETs, validações do PUT, mimetype inválido, patch parcial, ensureSingleRow (insert),
 *   e erro inesperado (catch interno do updateHero).
 */

"use strict";

describe("siteHeroController (unit)", () => {
  function makeRes() {
    return {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
  }

  function makeNext() {
    return jest.fn();
  }

  function makeReq(overrides = {}) {
    return {
      body: {},
      files: {},
      user: { id: 1, role: "admin" },
      ...overrides,
    };
  }

  function normalizeSql(sql) {
    return String(sql || "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  }

  function makeQueryRouter(handlers) {
    return async (sql, params) => {
      const s = normalizeSql(sql);

      for (const h of handlers) {
        if (h.match(s, params)) return h.reply(s, params);
      }

      throw new Error(`Query não mockada: ${String(sql)}`);
    };
  }

  function mockModuleOnce(mockPool) {
    jest.resetModules();

    // ✅ AppError real pode ter statusCode/status; aqui garantimos statusCode
    class MockAppError extends Error {
      constructor(message, status = 500, code = "INTERNAL_ERROR", details = null) {
        super(message);
        this.name = "AppError";
        this.statusCode = status;
        this.code = code;
        this.details = details;
      }
    }

    // Paths corretos a partir de teste/unit/controllers
    jest.doMock("../../../config/pool", () => mockPool);
    jest.doMock("../../../errors/AppError", () => MockAppError);

    // eslint-disable-next-line global-require
    return require("../../../controllers/siteHeroController");
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("getHero: 200 retorna defaults (ensureSingleRow cria linha quando vazio)", async () => {
    // Arrange
    const mockPool = { query: jest.fn(), getConnection: jest.fn() };
    const { getHero } = mockModuleOnce(mockPool);

    mockPool.query.mockImplementation(
      makeQueryRouter([
        {
          match: (s) => s === "select id from site_hero_settings limit 1",
          reply: async () => [[]],
        },
        {
          match: (s) =>
            s === "insert into site_hero_settings (button_label, button_href) values (?, ?)",
          reply: async (_s, params) => {
            expect(params).toEqual(["Saiba Mais", "/drones"]);
            return [{ insertId: 10 }, {}];
          },
        },
        {
          match: (s) => s.includes("from site_hero_settings") && s.includes("limit 1"),
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
            {},
          ],
        },
      ])
    );

    const req = makeReq();
    const res = makeRes();
    const next = makeNext();

    // Act
    await getHero(req, res, next);

    // Assert
    expect(next).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledTimes(1);

    const payload = res.json.mock.calls[0][0];
    expect(payload).toMatchObject({
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
  });

  test("getHeroPublic: 200 normaliza href sem '/' e retorna title/subtitle", async () => {
    // Arrange
    const mockPool = { query: jest.fn(), getConnection: jest.fn() };
    const { getHeroPublic } = mockModuleOnce(mockPool);

    mockPool.query.mockImplementation(
      makeQueryRouter([
        {
          match: (s) => s === "select id from site_hero_settings limit 1",
          reply: async () => [[{ id: 1 }], {}],
        },
        {
          match: (s) => s.includes("from site_hero_settings") && s.includes("limit 1"),
          reply: async () => [
            [
              {
                hero_video_url: "",
                hero_video_path: "",
                hero_image_url: "",
                hero_image_path: "",
                title: "Meu título",
                subtitle: "Meu sub",
                button_label: "Clique",
                button_href: "drones",
                updated_at: "2026-02-18T00:00:00.000Z",
                created_at: "2026-02-17T00:00:00.000Z",
              },
            ],
            {},
          ],
        },
      ])
    );

    const req = makeReq({ user: undefined });
    const res = makeRes();
    const next = makeNext();

    // Act
    await getHeroPublic(req, res, next);

    // Assert
    expect(next).not.toHaveBeenCalled();
    const payload = res.json.mock.calls[0][0];

    expect(payload).toMatchObject({
      title: "Meu título",
      subtitle: "Meu sub",
      button_label: "Clique",
      button_href: "/drones",
    });
  });

  test("updateHero: 400 label > 80 deve responder VALIDATION_ERROR (catch interno)", async () => {
    // Arrange
    const mockPool = { query: jest.fn(), getConnection: jest.fn() };
    const { updateHero } = mockModuleOnce(mockPool);

    const req = makeReq({ body: { button_label: "a".repeat(81) } });
    const res = makeRes();
    const next = makeNext();

    // Act
    await updateHero(req, res, next);

    // Assert
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        code: "VALIDATION_ERROR",
        message: "Label do botão muito grande.",
      })
    );
    expect(mockPool.query).not.toHaveBeenCalled();
  });

  test("updateHero: 400 title > 255 deve responder VALIDATION_ERROR", async () => {
    // Arrange
    const mockPool = { query: jest.fn(), getConnection: jest.fn() };
    const { updateHero } = mockModuleOnce(mockPool);

    const req = makeReq({ body: { title: "t".repeat(256) } });
    const res = makeRes();
    const next = makeNext();

    // Act
    await updateHero(req, res, next);

    // Assert
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0]).toMatchObject({
      code: "VALIDATION_ERROR",
      message: "Título muito grande.",
    });
    expect(mockPool.query).not.toHaveBeenCalled();
  });

  test("updateHero: 400 subtitle > 500 deve responder VALIDATION_ERROR", async () => {
    // Arrange
    const mockPool = { query: jest.fn(), getConnection: jest.fn() };
    const { updateHero } = mockModuleOnce(mockPool);

    const req = makeReq({ body: { subtitle: "s".repeat(501) } });
    const res = makeRes();
    const next = makeNext();

    // Act
    await updateHero(req, res, next);

    // Assert
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0]).toMatchObject({
      code: "VALIDATION_ERROR",
      message: "Subtítulo muito grande.",
    });
    expect(mockPool.query).not.toHaveBeenCalled();
  });

  test("updateHero: 400 vídeo com mimetype inválido deve responder VALIDATION_ERROR", async () => {
    // Arrange
    const mockPool = { query: jest.fn(), getConnection: jest.fn() };
    const { updateHero } = mockModuleOnce(mockPool);

    const req = makeReq({
      body: { button_label: "Ok" },
      files: { heroVideo: [{ filename: "x.mp4", mimetype: "image/png" }] },
    });
    const res = makeRes();
    const next = makeNext();

    // Act
    await updateHero(req, res, next);

    // Assert
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0]).toMatchObject({
      code: "VALIDATION_ERROR",
      message: "Arquivo de vídeo inválido.",
    });
    expect(mockPool.query).not.toHaveBeenCalled();
  });

  test("updateHero: 400 imagem com mimetype inválido deve responder VALIDATION_ERROR", async () => {
    // Arrange
    const mockPool = { query: jest.fn(), getConnection: jest.fn() };
    const { updateHero } = mockModuleOnce(mockPool);

    const req = makeReq({
      body: { button_label: "Ok" },
      files: { heroImageFallback: [{ filename: "x.jpg", mimetype: "video/mp4" }] },
    });
    const res = makeRes();
    const next = makeNext();

    // Act
    await updateHero(req, res, next);

    // Assert
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0]).toMatchObject({
      code: "VALIDATION_ERROR",
      message: "Arquivo de imagem inválido.",
    });
    expect(mockPool.query).not.toHaveBeenCalled();
  });

  test("updateHero: 200 sucesso (patch parcial + normalize href + upload paths) e retorna hero atualizado", async () => {
    // Arrange
    const mockPool = { query: jest.fn(), getConnection: jest.fn() };
    const { updateHero } = mockModuleOnce(mockPool);

    mockPool.query.mockImplementation(
      makeQueryRouter([
        // ensureSingleRow no updateHeroRow
        {
          match: (s) => s === "select id from site_hero_settings limit 1",
          reply: async () => [[{ id: 5 }], {}],
        },
        // UPDATE ... SET ? WHERE id = ?
        {
          match: (s) => s === "update site_hero_settings set ? where id = ?",
          reply: async (_s, params) => {
            const [fields, id] = params || [];
            expect(id).toBe(5);

            // label vazio -> não seta; title/subtitle vazios -> não seta
            // href sem "/" -> normaliza
            expect(fields).toMatchObject({
              button_href: "/drones",
              hero_video_path: "/uploads/hero.mp4",
              hero_video_url: "/uploads/hero.mp4",
              hero_image_path: "/uploads/hero.jpg",
              hero_image_url: "/uploads/hero.jpg",
            });

            // não deve ter campos opcionais quando vazios
            expect(Object.prototype.hasOwnProperty.call(fields, "button_label")).toBe(false);
            expect(Object.prototype.hasOwnProperty.call(fields, "title")).toBe(false);
            expect(Object.prototype.hasOwnProperty.call(fields, "subtitle")).toBe(false);

            return [{ affectedRows: 1 }, {}];
          },
        },
        // getHeroBase após update
        {
          match: (s) => s.includes("from site_hero_settings") && s.includes("limit 1"),
          reply: async () => [
            [
              {
                hero_video_url: "/uploads/hero.mp4",
                hero_video_path: "/uploads/hero.mp4",
                hero_image_url: "/uploads/hero.jpg",
                hero_image_path: "/uploads/hero.jpg",
                title: "",
                subtitle: "",
                button_label: "Saiba Mais",
                button_href: "/drones",
                updated_at: "2026-02-18T00:00:00.000Z",
                created_at: "2026-02-17T00:00:00.000Z",
              },
            ],
            {},
          ],
        },
      ])
    );

    const req = makeReq({
      body: {
        button_label: "   ", // não deve entrar no patch
        button_href: "drones",
        title: "",
        subtitle: "   ",
      },
      files: {
        heroVideo: [{ filename: "hero.mp4", mimetype: "video/mp4" }],
        heroImageFallback: [{ filename: "hero.jpg", mimetype: "image/jpeg" }],
      },
    });

    const res = makeRes();
    const next = makeNext();

    // Act
    await updateHero(req, res, next);

    // Assert
    expect(next).not.toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalledWith(expect.any(Number)); // sucesso retorna res.json direto (sem status)
    expect(res.json).toHaveBeenCalledTimes(1);

    const payload = res.json.mock.calls[0][0];
    expect(payload).toMatchObject({
      ok: true,
      hero: {
        hero_video_url: "/uploads/hero.mp4",
        hero_image_url: "/uploads/hero.jpg",
        button_href: "/drones",
      },
    });

    expect(mockPool.query).toHaveBeenCalled();
  });

  test("updateHero: 200 sucesso quando ensureSingleRow insere row (sem id) antes do UPDATE", async () => {
    // Arrange
    const mockPool = { query: jest.fn(), getConnection: jest.fn() };
    const { updateHero } = mockModuleOnce(mockPool);

    mockPool.query.mockImplementation(
      makeQueryRouter([
        {
          match: (s) => s === "select id from site_hero_settings limit 1",
          reply: async () => [[]], // força insert
        },
        {
          match: (s) =>
            s === "insert into site_hero_settings (button_label, button_href) values (?, ?)",
          reply: async (_s, params) => {
            expect(params).toEqual(["Saiba Mais", "/drones"]);
            return [{ insertId: 99 }, {}];
          },
        },
        {
          match: (s) => s === "update site_hero_settings set ? where id = ?",
          reply: async (_s, params) => {
            const [_fields, id] = params || [];
            expect(id).toBe(99);
            return [{ affectedRows: 1 }, {}];
          },
        },
        {
          match: (s) => s.includes("from site_hero_settings") && s.includes("limit 1"),
          reply: async () => [
            [
              {
                hero_video_url: "",
                hero_video_path: "",
                hero_image_url: "",
                hero_image_path: "",
                title: "",
                subtitle: "",
                button_label: "X",
                button_href: "/drones",
                updated_at: null,
                created_at: null,
              },
            ],
            {},
          ],
        },
      ])
    );

    const req = makeReq({ body: { button_label: "X" } });
    const res = makeRes();
    const next = makeNext();

    // Act
    await updateHero(req, res, next);

    // Assert
    expect(next).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        ok: true,
        hero: expect.any(Object),
      })
    );
  });

  test("updateHero: 500 erro inesperado em pool.query deve responder INTERNAL_ERROR (catch interno)", async () => {
    // Arrange
    const mockPool = { query: jest.fn(), getConnection: jest.fn() };
    const { updateHero } = mockModuleOnce(mockPool);

    mockPool.query.mockImplementation(
      makeQueryRouter([
        {
          match: (s) => s === "select id from site_hero_settings limit 1",
          reply: async () => {
            throw new Error("db exploded");
          },
        },
      ])
    );

    const req = makeReq({ body: { button_label: "Ok" } });
    const res = makeRes();
    const next = makeNext();

    // Act
    await updateHero(req, res, next);

    // Assert
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(500);
    const payload = res.json.mock.calls[0][0];
    expect(payload).toMatchObject({
      code: "INTERNAL_ERROR",
      message: expect.any(String),
    });
    expect(mockPool.query).toHaveBeenCalled();
  });
});
