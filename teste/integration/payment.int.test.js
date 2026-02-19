/**
 * teste/integration/payment.int.test.js
 *
 * Rotas testadas: routes/payment.js
 *
 * Endpoints:
 * - GET    /api/payment/methods                         (public)
 * - ADMIN: /api/payment/admin/payment-methods
 *   - GET    -> lista todos (ativos e inativos)
 *   - POST   -> cria
 *   - PUT    -> atualiza
 *   - DELETE -> soft delete (is_active = 0)
 *
 * Regras:
 * - Sem MySQL real: mock de ../../config/pool (pool.getConnection + conn.query)
 * - Sem rede externa: (aqui não testamos /start e /webhook)
 * - Auth/admin: mock de ../../middleware/authenticateToken e ../../middleware/verifyAdmin
 * - AAA em todos os testes
 */

"use strict";

const request = require("supertest");
const { makeTestApp, makeMockConn } = require("../testUtils");
const { makeMockPool } = require("../mocks/pool.mock");

/** helpers */
function normalizeSql(sql) {
  return String(sql || "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
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

function setupModuleWithMocks({ asAdmin = true } = {}) {
  jest.resetModules();

  const poolPath = require.resolve("../../config/pool");
  const authPath = require.resolve("../../middleware/authenticateToken");
  const adminPath = require.resolve("../../middleware/verifyAdmin");

  const mockPool = makeMockPool();

  // ✅ pool mock (sem DB real)
  jest.doMock(poolPath, () => mockPool);

  // ✅ auth mock
  jest.doMock(authPath, () => (req, res, next) => {
    // Simula "logado"
    req.user = asAdmin ? { id: 1, role: "admin" } : { id: 1, role: "user" };
    next();
  });

  // ✅ verifyAdmin mock (gate)
  jest.doMock(adminPath, () => (req, res, next) => {
    if (!req.user) return res.status(401).json({ code: "UNAUTHORIZED", message: "Não autenticado." });
    if (req.user.role !== "admin") {
      return res.status(403).json({ code: "FORBIDDEN", message: "Sem permissão." });
    }
    next();
  });

  // Importa o router real só depois dos mocks
  const router = require("../../routes/payment");

  return { router, mockPool };
}

describe("Payment Routes (integration) - routes/payment.js", () => {
  test("GET /api/payment/methods -> 200 lista somente métodos ativos", async () => {
    // Arrange
    const { router, mockPool } = setupModuleWithMocks();
    const app = makeTestApp("/api/payment", router);

    const conn = makeMockConn();
    mockPool.getConnection.mockResolvedValue(conn);

    conn.query.mockImplementation(
      makeQueryRouter([
        {
          match: (sqlNorm) =>
            sqlNorm.includes("from payment_methods") &&
            sqlNorm.includes("where is_active = 1") &&
            sqlNorm.includes("order by sort_order asc"),
          reply: async () => [
            [
              { id: 1, code: "pix", label: "Pix", is_active: 1, sort_order: 10 },
              { id: 2, code: "boleto", label: "Boleto", is_active: 1, sort_order: 20 },
            ],
          ],
        },
      ])
    );

    // Act
    const res = await request(app).get("/api/payment/methods");

    // Assert
    expect(res.status).toBe(200);
    expect(res.body.methods).toHaveLength(2);
    expect(mockPool.getConnection).toHaveBeenCalledTimes(1);
    expect(conn.release).toHaveBeenCalledTimes(1);
  });

  describe("ADMIN CRUD /api/payment/admin/payment-methods", () => {
    test("GET 200 lista todos (ativos e inativos)", async () => {
      // Arrange
      const { router, mockPool } = setupModuleWithMocks({ asAdmin: true });
      const app = makeTestApp("/api/payment", router);

      const conn = makeMockConn();
      mockPool.getConnection.mockResolvedValue(conn);

      conn.query.mockImplementation(
        makeQueryRouter([
          {
            match: (sqlNorm) =>
              sqlNorm.includes("select id, code, label") &&
              sqlNorm.includes("from payment_methods") &&
              !sqlNorm.includes("where is_active = 1") &&
              sqlNorm.includes("order by sort_order asc"),
            reply: async () => [
              [
                { id: 1, code: "pix", label: "Pix", is_active: 1, sort_order: 10 },
                { id: 2, code: "boleto", label: "Boleto", is_active: 0, sort_order: 20 },
              ],
            ],
          },
        ])
      );

      // Act
      const res = await request(app).get("/api/payment/admin/payment-methods");

      // Assert
      expect(res.status).toBe(200);
      expect(res.body.methods).toHaveLength(2);
      expect(conn.release).toHaveBeenCalledTimes(1);
    });

    test("GET 403 quando user não é admin", async () => {
      // Arrange
      const { router } = setupModuleWithMocks({ asAdmin: false });
      const app = makeTestApp("/api/payment", router);

      // Act
      const res = await request(app).get("/api/payment/admin/payment-methods");

      // Assert
      expect(res.status).toBe(403);
      expect(res.body).toMatchObject({ code: "FORBIDDEN" });
    });

    test("POST 400 se code/label ausentes", async () => {
      // Arrange
      const { router, mockPool } = setupModuleWithMocks({ asAdmin: true });
      const app = makeTestApp("/api/payment", router);

      // Act
      const res = await request(app)
        .post("/api/payment/admin/payment-methods")
        .send({ description: "x" });

      // Assert
      expect(res.status).toBe(400);
      expect(res.body).toEqual({
        code: "VALIDATION_ERROR",
        message: "code e label são obrigatórios.",
      });
      expect(mockPool.getConnection).not.toHaveBeenCalled();
    });

    test("POST 201 cria e retorna método criado (normaliza is_active/sort_order)", async () => {
      // Arrange
      const { router, mockPool } = setupModuleWithMocks({ asAdmin: true });
      const app = makeTestApp("/api/payment", router);

      const conn = makeMockConn();
      mockPool.getConnection.mockResolvedValue(conn);

      conn.query.mockImplementation(
        makeQueryRouter([
          {
            match: (sqlNorm) => sqlNorm.startsWith("insert into payment_methods"),
            reply: async (_sqlNorm, params) => {
              // [code, label, description, is_active, sort_order]
              expect(params[0]).toBe("pix");
              expect(params[1]).toBe("Pix");
              expect(params[2]).toBe("Pagamento instantâneo");
              expect(params[3]).toBe(1); // normalizado
              expect(params[4]).toBe(12); // normalizado
              return [{ insertId: 123 }];
            },
          },
          {
            match: (sqlNorm) =>
              sqlNorm.includes("select id, code, label") &&
              sqlNorm.includes("from payment_methods") &&
              sqlNorm.includes("where id = ?"),
            reply: async (_sqlNorm, params) => {
              expect(params).toEqual([123]);
              return [
                [
                  {
                    id: 123,
                    code: "pix",
                    label: "Pix",
                    description: "Pagamento instantâneo",
                    is_active: 1,
                    sort_order: 12,
                    created_at: "2026-02-18 10:00:00",
                    updated_at: null,
                  },
                ],
              ];
            },
          },
        ])
      );

      // Act
      const res = await request(app)
        .post("/api/payment/admin/payment-methods")
        .send({
          code: "pix",
          label: "Pix",
          description: "Pagamento instantâneo",
          is_active: true,
          sort_order: 12,
        });

      // Assert
      expect(res.status).toBe(201);
      expect(res.body.method).toEqual({
        id: 123,
        code: "pix",
        label: "Pix",
        description: "Pagamento instantâneo",
        is_active: 1,
        sort_order: 12,
        created_at: "2026-02-18 10:00:00",
        updated_at: null,
      });
      expect(conn.release).toHaveBeenCalledTimes(1);
    });

    test("POST 400 quando duplicate code (ER_DUP...)", async () => {
      // Arrange
      const { router, mockPool } = setupModuleWithMocks({ asAdmin: true });
      const app = makeTestApp("/api/payment", router);

      const conn = makeMockConn();
      mockPool.getConnection.mockResolvedValue(conn);

      conn.query.mockImplementation(
        makeQueryRouter([
          {
            match: (sqlNorm) => sqlNorm.startsWith("insert into payment_methods"),
            reply: async () => {
              const err = new Error("dup");
              err.code = "ER_DUP_ENTRY";
              throw err;
            },
          },
        ])
      );

      // Act
      const res = await request(app)
        .post("/api/payment/admin/payment-methods")
        .send({ code: "pix", label: "Pix" });

      // Assert
      expect(res.status).toBe(400);
      expect(res.body).toEqual({
        code: "VALIDATION_ERROR",
        message: "Já existe um método com esse code.",
      });
      expect(conn.release).toHaveBeenCalledTimes(1);
    });

    test("PUT 400 id inválido", async () => {
      // Arrange
      const { router, mockPool } = setupModuleWithMocks({ asAdmin: true });
      const app = makeTestApp("/api/payment", router);

      // Act
      const res = await request(app)
        .put("/api/payment/admin/payment-methods/0")
        .send({ label: "X" });

      // Assert
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ code: "VALIDATION_ERROR", message: "id inválido." });
      expect(mockPool.getConnection).not.toHaveBeenCalled();
    });

    test("PUT 400 se nenhum campo enviado", async () => {
      // Arrange
      const { router, mockPool } = setupModuleWithMocks({ asAdmin: true });
      const app = makeTestApp("/api/payment", router);

      // Act
      const res = await request(app)
        .put("/api/payment/admin/payment-methods/10")
        .send({});

      // Assert
      expect(res.status).toBe(400);
      expect(res.body).toEqual({
        code: "VALIDATION_ERROR",
        message: "Nenhum campo para atualizar.",
      });
      expect(mockPool.getConnection).not.toHaveBeenCalled();
    });

    test("PUT 404 se método não existe", async () => {
      // Arrange
      const { router, mockPool } = setupModuleWithMocks({ asAdmin: true });
      const app = makeTestApp("/api/payment", router);

      const conn = makeMockConn();
      mockPool.getConnection.mockResolvedValue(conn);

      conn.query.mockImplementation(
        makeQueryRouter([
          {
            match: (sqlNorm) => sqlNorm === "select id from payment_methods where id = ?",
            reply: async () => [[undefined]], // não existe
          },
        ])
      );

      // Act
      const res = await request(app)
        .put("/api/payment/admin/payment-methods/10")
        .send({ label: "Novo" });

      // Assert
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ code: "NOT_FOUND", message: "Método não encontrado." });
      expect(conn.release).toHaveBeenCalledTimes(1);
    });

    test("PUT 200 atualiza label/description ('' -> null) e retorna atualizado", async () => {
      // Arrange
      const { router, mockPool } = setupModuleWithMocks({ asAdmin: true });
      const app = makeTestApp("/api/payment", router);

      const conn = makeMockConn();
      mockPool.getConnection.mockResolvedValue(conn);

      let sawUpdate = false;

      conn.query.mockImplementation(
        makeQueryRouter([
          {
            match: (sqlNorm) => sqlNorm === "select id from payment_methods where id = ?",
            reply: async () => [[{ id: 10 }]],
          },
          {
            match: (sqlNorm) =>
              sqlNorm.startsWith("update payment_methods set") &&
              sqlNorm.includes("updated_at = now()") &&
              sqlNorm.includes("where id = ?"),
            reply: async (_sqlNorm, params) => {
              // params = [...values, id]
              const last = params[params.length - 1];
              expect(last).toBe(10);

              // description enviada como "" vira null (tem que estar nos params)
              expect(params).toContain(null);

              sawUpdate = true;
              return [{ affectedRows: 1 }];
            },
          },
          {
            match: (sqlNorm) =>
              sqlNorm.includes("select id, code, label") &&
              sqlNorm.includes("from payment_methods") &&
              sqlNorm.includes("where id = ?"),
            reply: async () => [
              [
                {
                  id: 10,
                  code: "pix",
                  label: "Pix atualizado",
                  description: null,
                  is_active: 1,
                  sort_order: 10,
                  created_at: "2026-02-10 10:00:00",
                  updated_at: "2026-02-18 10:00:00",
                },
              ],
            ],
          },
        ])
      );

      // Act
      const res = await request(app)
        .put("/api/payment/admin/payment-methods/10")
        .send({ label: "Pix atualizado", description: "" });

      // Assert
      expect(res.status).toBe(200);
      expect(res.body.method).toMatchObject({
        id: 10,
        code: "pix",
        label: "Pix atualizado",
        description: null,
      });
      expect(sawUpdate).toBe(true);
      expect(conn.release).toHaveBeenCalledTimes(1);
    });

    test("DELETE 404 se método não existe", async () => {
      // Arrange
      const { router, mockPool } = setupModuleWithMocks({ asAdmin: true });
      const app = makeTestApp("/api/payment", router);

      const conn = makeMockConn();
      mockPool.getConnection.mockResolvedValue(conn);

      conn.query.mockImplementation(
        makeQueryRouter([
          {
            match: (sqlNorm) => sqlNorm === "select id from payment_methods where id = ?",
            reply: async () => [[undefined]],
          },
        ])
      );

      // Act
      const res = await request(app).delete("/api/payment/admin/payment-methods/999");

      // Assert
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ code: "NOT_FOUND", message: "Método não encontrado." });
      expect(conn.release).toHaveBeenCalledTimes(1);
    });

    test("DELETE 200 soft delete desativa e retorna ok", async () => {
      // Arrange
      const { router, mockPool } = setupModuleWithMocks({ asAdmin: true });
      const app = makeTestApp("/api/payment", router);

      const conn = makeMockConn();
      mockPool.getConnection.mockResolvedValue(conn);

      let sawSoftDelete = false;

      conn.query.mockImplementation(
        makeQueryRouter([
          {
            match: (sqlNorm) => sqlNorm === "select id from payment_methods where id = ?",
            reply: async () => [[{ id: 10 }]],
          },
          {
            match: (sqlNorm) =>
              sqlNorm.startsWith("update payment_methods set is_active = 0") &&
              sqlNorm.includes("where id = ?"),
            reply: async (_sqlNorm, params) => {
              expect(params).toEqual([10]);
              sawSoftDelete = true;
              return [{ affectedRows: 1 }];
            },
          },
        ])
      );

      // Act
      const res = await request(app).delete("/api/payment/admin/payment-methods/10");

      // Assert
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true });
      expect(sawSoftDelete).toBe(true);
      expect(conn.release).toHaveBeenCalledTimes(1);
    });
  });
});
