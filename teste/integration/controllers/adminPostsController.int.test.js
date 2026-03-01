/**
 * teste/integration/controllers/adminPostsController.int.test.js
 *
 * Controller testado: controllers/news/adminPostsController.js
 *
 * Endpoints montados no router de teste:
 * - GET    /api/admin/news/posts          listPosts
 * - POST   /api/admin/news/posts          createPost
 * - PUT    /api/admin/news/posts/:id      updatePost
 * - DELETE /api/admin/news/posts/:id      deletePost
 *
 * Regras do projeto:
 * - Sem MySQL real: mock de config/pool (controller usa pool diretamente, sem newsModel)
 * - AAA em todos os testes
 * - Erros: validar { ok, code, message } e status HTTP
 *
 * NOTA DE SEGURANÇA:
 * ⚠️  O controller NÃO possui middleware verifyAdmin — qualquer request chega
 *     sem autenticação. Os testes documentam esse comportamento atual.
 *
 * ⚠️  Race condition em slug: slugExists() e INSERT são duas queries separadas sem
 *     transação, podendo causar duplicata em alta concorrência.
 */

"use strict";

const request = require("supertest");
const express = require("express");
const { makeTestApp } = require("../../testUtils");

// ─────────────────────────────────────────────
// Helpers de teste
// ─────────────────────────────────────────────

function asyncWrap(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

function normalizeSql(sql) {
  return String(sql || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Constrói um mock de pool.query que responde com base em matchers de SQL.
 * handlers: Array<{ match: (sqlNorm, params) => boolean, reply: (sqlNorm, params) => any }>
 */
function makeQueryRouter(handlers) {
  return async (sql, params) => {
    const s = normalizeSql(sql);
    for (const h of handlers) {
      if (h.match(s, params)) return h.reply(s, params);
    }
    throw new Error(`Query não mockada: "${s}"`);
  };
}

/**
 * Carrega o controller com mocks isolados.
 * @param {object} mockPool - mock de config/pool
 */
function loadController({ mockPool } = {}) {
  jest.resetModules();

  const pool = mockPool || {
    query: jest.fn().mockResolvedValue([[], {}]),
    getConnection: jest.fn(),
  };

  jest.doMock("../../../config/pool", () => pool);

  const controller = require("../../../controllers/news/adminPostsController");
  return { controller, pool };
}

function buildRouter(controller) {
  const router = express.Router();
  router.get("/posts", asyncWrap(controller.listPosts));
  router.post("/posts", asyncWrap(controller.createPost));
  router.put("/posts/:id", asyncWrap(controller.updatePost));
  router.delete("/posts/:id", asyncWrap(controller.deletePost));
  return router;
}

const MOUNT = "/api/admin/news";

// Post válido para reutilizar nos testes
const VALID_POST = {
  title: "Post de Teste",
  content: "Conteúdo do post de teste",
  status: "draft",
};

// ─────────────────────────────────────────────
// Suite
// ─────────────────────────────────────────────

describe("adminPostsController", () => {
  // ───────────────── listPosts ─────────────────
  describe("GET /posts — listPosts()", () => {
    test("200 happy path — retorna lista de posts com paginação", async () => {
      // Arrange
      const postRows = [
        { id: 1, title: "Post 1", slug: "post-1", status: "published" },
        { id: 2, title: "Post 2", slug: "post-2", status: "draft" },
      ];
      const { controller, pool } = loadController({
        mockPool: {
          query: jest.fn().mockImplementation(
            makeQueryRouter([
              {
                match: (s) => s.includes("count(*)") && s.includes("from news_posts"),
                reply: async () => [[{ total: 2 }]],
              },
              {
                match: (s) => s.includes("select") && s.includes("from news_posts"),
                reply: async () => [postRows],
              },
            ])
          ),
          getConnection: jest.fn(),
        },
      });
      const app = makeTestApp(MOUNT, buildRouter(controller));

      // Act
      const res = await request(app).get(`${MOUNT}/posts`);

      // Assert
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        ok: true,
        data: expect.any(Array),
        meta: expect.objectContaining({ total: 2 }),
      });
      expect(pool.query).toHaveBeenCalledTimes(2); // count + list
    });

    test("200 — filtra por status=published", async () => {
      // Arrange
      const { controller, pool } = loadController({
        mockPool: {
          query: jest.fn().mockImplementation(
            makeQueryRouter([
              {
                match: (s) => s.includes("count(*)"),
                reply: async () => [[{ total: 1 }]],
              },
              {
                match: (s) => s.includes("select") && s.includes("from news_posts"),
                reply: async () => [[{ id: 1, title: "Post", status: "published" }]],
              },
            ])
          ),
          getConnection: jest.fn(),
        },
      });
      const app = makeTestApp(MOUNT, buildRouter(controller));

      // Act
      const res = await request(app).get(`${MOUNT}/posts?status=published`);

      // Assert
      expect(res.status).toBe(200);
      expect(res.body.meta).toMatchObject({ status: "published" });
    });

    test("400 quando status é inválido", async () => {
      // Arrange
      const { controller } = loadController();
      const app = makeTestApp(MOUNT, buildRouter(controller));

      // Act
      const res = await request(app).get(`${MOUNT}/posts?status=invalido`);

      // Assert
      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ ok: false, code: "VALIDATION_ERROR" });
    });

    test("500 quando pool.query lança exceção", async () => {
      // Arrange
      const { controller } = loadController({
        mockPool: {
          query: jest.fn().mockRejectedValue(new Error("DB down")),
          getConnection: jest.fn(),
        },
      });
      const app = makeTestApp(MOUNT, buildRouter(controller));

      // Act
      const res = await request(app).get(`${MOUNT}/posts`);

      // Assert
      expect(res.status).toBe(500);
      expect(res.body).toMatchObject({ ok: false, code: "INTERNAL_ERROR" });
    });
  });

  // ───────────────── createPost ─────────────────
  describe("POST /posts — createPost()", () => {
    test("201 happy path — cria post com slug gerado automaticamente", async () => {
      // Arrange
      const insertedId = 42;
      const postRow = { id: insertedId, title: "Post de Teste", slug: "post-de-teste", status: "draft" };

      const { controller, pool } = loadController({
        mockPool: {
          query: jest.fn().mockImplementation(
            makeQueryRouter([
              // slugExists (SELECT 1 FROM news_posts WHERE slug = ?)
              {
                match: (s) => s.includes("select 1") && s.includes("news_posts") && s.includes("slug"),
                reply: async () => [[]], // slug não existe
              },
              // INSERT INTO news_posts
              {
                match: (s) => s.includes("insert into news_posts"),
                reply: async () => [{ insertId: insertedId }],
              },
              // logAdmin INSERT — silenciado pelo setup, mas pode ser chamado
              {
                match: (s) => s.includes("admin_logs"),
                reply: async () => [{ insertId: 1 }],
              },
              // SELECT após insert
              {
                match: (s) => s.includes("select") && s.includes("from news_posts") && s.includes("where id"),
                reply: async () => [[postRow]],
              },
            ])
          ),
          getConnection: jest.fn(),
        },
      });
      const app = makeTestApp(MOUNT, buildRouter(controller));

      // Act
      const res = await request(app).post(`${MOUNT}/posts`).send(VALID_POST);

      // Assert
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ ok: true, data: expect.objectContaining({ id: insertedId }) });
    });

    test("201 com admin_id quando req.user é definido", async () => {
      // Arrange
      const insertedId = 55;
      const postRow = { id: insertedId, title: "Post Admin", slug: "post-admin", author_admin_id: 9 };

      const { controller, pool } = loadController({
        mockPool: {
          query: jest.fn().mockImplementation(
            makeQueryRouter([
              {
                match: (s) => s.includes("select 1") && s.includes("news_posts"),
                reply: async () => [[]],
              },
              {
                match: (s) => s.includes("insert into news_posts"),
                reply: async () => [{ insertId: insertedId }],
              },
              {
                match: (s) => s.includes("admin_logs"),
                reply: async () => [{ insertId: 1 }],
              },
              {
                match: (s) => s.includes("select") && s.includes("from news_posts") && s.includes("where id"),
                reply: async () => [[postRow]],
              },
            ])
          ),
          getConnection: jest.fn(),
        },
      });

      // Adiciona middleware para simular usuário autenticado
      jest.resetModules();
      jest.doMock("../../../config/pool", () => pool);
      const ctrl = require("../../../controllers/news/adminPostsController");
      const router = express.Router();
      router.use((req, _res, next) => {
        req.user = { id: 9, role: "admin" };
        next();
      });
      router.post("/posts", asyncWrap(ctrl.createPost));
      const app = makeTestApp(MOUNT, router);

      // Act
      const res = await request(app)
        .post(`${MOUNT}/posts`)
        .send({ title: "Post Admin", content: "Conteúdo válido" });

      // Assert
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ ok: true });
    });

    test("400 quando title está ausente", async () => {
      // Arrange
      const { controller } = loadController();
      const app = makeTestApp(MOUNT, buildRouter(controller));

      // Act
      const res = await request(app).post(`${MOUNT}/posts`).send({ content: "Conteúdo válido" });

      // Assert
      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ ok: false, code: "VALIDATION_ERROR", message: expect.stringMatching(/title/) });
    });

    test("400 quando content está vazio", async () => {
      // Arrange
      const { controller } = loadController();
      const app = makeTestApp(MOUNT, buildRouter(controller));

      // Act
      const res = await request(app).post(`${MOUNT}/posts`).send({ title: "Título", content: "   " });

      // Assert
      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ ok: false, code: "VALIDATION_ERROR", message: expect.stringMatching(/content/) });
    });

    test("400 quando slug fornecido manualmente é inválido", async () => {
      // Arrange
      const { controller } = loadController();
      const app = makeTestApp(MOUNT, buildRouter(controller));

      // Act
      const res = await request(app)
        .post(`${MOUNT}/posts`)
        .send({ ...VALID_POST, slug: "SLUG INVÁLIDO!!" });

      // Assert
      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ ok: false, code: "VALIDATION_ERROR", message: expect.stringMatching(/slug/) });
    });

    test("400 quando status é inválido", async () => {
      // Arrange
      const { controller } = loadController();
      const app = makeTestApp(MOUNT, buildRouter(controller));

      // Act
      const res = await request(app)
        .post(`${MOUNT}/posts`)
        .send({ ...VALID_POST, status: "pendente" });

      // Assert
      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ ok: false, code: "VALIDATION_ERROR", message: expect.stringMatching(/status/) });
    });

    test("400 quando published_at tem formato inválido", async () => {
      // Arrange
      const { controller } = loadController();
      const app = makeTestApp(MOUNT, buildRouter(controller));

      // Act
      const res = await request(app)
        .post(`${MOUNT}/posts`)
        .send({ ...VALID_POST, published_at: "31/12/2024" });

      // Assert
      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ ok: false, code: "VALIDATION_ERROR" });
    });

    test("400 quando excerpt excede 500 caracteres", async () => {
      // Arrange
      const { controller } = loadController();
      const app = makeTestApp(MOUNT, buildRouter(controller));

      // Act
      const res = await request(app)
        .post(`${MOUNT}/posts`)
        .send({ ...VALID_POST, excerpt: "x".repeat(501) });

      // Assert
      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ ok: false, code: "VALIDATION_ERROR" });
    });

    test("400 quando category excede 80 caracteres", async () => {
      // Arrange
      const { controller } = loadController();
      const app = makeTestApp(MOUNT, buildRouter(controller));

      // Act
      const res = await request(app)
        .post(`${MOUNT}/posts`)
        .send({ ...VALID_POST, category: "x".repeat(81) });

      // Assert
      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ ok: false, code: "VALIDATION_ERROR" });
    });

    test("409 quando slug fornecido já existe no banco (IDOR check slug duplicado)", async () => {
      // Arrange
      // ⚠️  NOTA: Potencial race condition entre slugExists() e INSERT (sem transação)
      const { controller } = loadController({
        mockPool: {
          query: jest.fn().mockImplementation(
            makeQueryRouter([
              // slugExists retorna que já existe
              {
                match: (s) => s.includes("select 1") && s.includes("news_posts"),
                reply: async () => [[{ ok: 1 }]], // slug já existe
              },
            ])
          ),
          getConnection: jest.fn(),
        },
      });
      const app = makeTestApp(MOUNT, buildRouter(controller));

      // Act
      const res = await request(app)
        .post(`${MOUNT}/posts`)
        .send({ ...VALID_POST, slug: "post-existente" });

      // Assert
      expect(res.status).toBe(409);
      expect(res.body).toMatchObject({ ok: false, code: "DUPLICATE" });
    });

    test("409 quando pool.query lança ER_DUP_ENTRY na INSERT", async () => {
      // Arrange
      const dupErr = new Error("Duplicate entry");
      dupErr.code = "ER_DUP_ENTRY";
      const { controller } = loadController({
        mockPool: {
          query: jest.fn().mockImplementation(
            makeQueryRouter([
              {
                match: (s) => s.includes("select 1") && s.includes("news_posts"),
                reply: async () => [[]], // passa o check, mas falha no insert
              },
              {
                match: (s) => s.includes("insert into news_posts"),
                reply: async () => { throw dupErr; },
              },
            ])
          ),
          getConnection: jest.fn(),
        },
      });
      const app = makeTestApp(MOUNT, buildRouter(controller));

      // Act
      const res = await request(app).post(`${MOUNT}/posts`).send(VALID_POST);

      // Assert
      expect(res.status).toBe(409);
      expect(res.body).toMatchObject({ ok: false, code: "DUPLICATE" });
    });

    test("500 quando pool.query lança erro genérico", async () => {
      // Arrange
      const { controller } = loadController({
        mockPool: {
          query: jest.fn().mockRejectedValue(new Error("DB error")),
          getConnection: jest.fn(),
        },
      });
      const app = makeTestApp(MOUNT, buildRouter(controller));

      // Act
      const res = await request(app).post(`${MOUNT}/posts`).send(VALID_POST);

      // Assert
      expect(res.status).toBe(500);
      expect(res.body).toMatchObject({ ok: false, code: "INTERNAL_ERROR" });
    });

    // Security: SQL injection — slug é validado pelo regex, então tentativas são bloqueadas
    test("400 quando slug contém tentativa de SQL injection", async () => {
      // Arrange
      const { controller } = loadController();
      const app = makeTestApp(MOUNT, buildRouter(controller));

      // Act
      const res = await request(app)
        .post(`${MOUNT}/posts`)
        .send({ ...VALID_POST, slug: "' OR 1=1; --" });

      // Assert
      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ ok: false, code: "VALIDATION_ERROR" });
    });

    // Security: title com tamanho máximo (boundary)
    test("400 quando title excede 220 caracteres", async () => {
      // Arrange
      const { controller } = loadController();
      const app = makeTestApp(MOUNT, buildRouter(controller));

      // Act
      const res = await request(app)
        .post(`${MOUNT}/posts`)
        .send({ title: "t".repeat(221), content: "Conteúdo válido" });

      // Assert
      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ ok: false, code: "VALIDATION_ERROR" });
    });
  });

  // ───────────────── updatePost ─────────────────
  describe("PUT /posts/:id — updatePost()", () => {
    test("200 happy path — atualiza title", async () => {
      // Arrange
      const postRow = { id: 10, title: "Novo Título", slug: "post-10", status: "draft" };
      const { controller, pool } = loadController({
        mockPool: {
          query: jest.fn().mockImplementation(
            makeQueryRouter([
              // UPDATE news_posts
              {
                match: (s) => s.includes("update news_posts"),
                reply: async () => [{ affectedRows: 1 }],
              },
              // logAdmin
              {
                match: (s) => s.includes("admin_logs"),
                reply: async () => [{ insertId: 1 }],
              },
              // SELECT após update
              {
                match: (s) => s.includes("select") && s.includes("from news_posts") && s.includes("where id"),
                reply: async () => [[postRow]],
              },
            ])
          ),
          getConnection: jest.fn(),
        },
      });
      const app = makeTestApp(MOUNT, buildRouter(controller));

      // Act
      const res = await request(app).put(`${MOUNT}/posts/10`).send({ title: "Novo Título" });

      // Assert
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ ok: true, data: expect.objectContaining({ id: 10 }) });
      expect(pool.query).toHaveBeenCalled();
    });

    test("200 — atualiza status para published e define published_at automático", async () => {
      // Arrange
      const postRow = { id: 3, title: "Post", status: "published", published_at: "2024-01-01 12:00:00" };
      const { controller } = loadController({
        mockPool: {
          query: jest.fn().mockImplementation(
            makeQueryRouter([
              {
                match: (s) => s.includes("update news_posts"),
                reply: async () => [{ affectedRows: 1 }],
              },
              {
                match: (s) => s.includes("admin_logs"),
                reply: async () => [{ insertId: 1 }],
              },
              {
                match: (s) => s.includes("select") && s.includes("from news_posts") && s.includes("where id"),
                reply: async () => [[postRow]],
              },
            ])
          ),
          getConnection: jest.fn(),
        },
      });
      const app = makeTestApp(MOUNT, buildRouter(controller));

      // Act
      const res = await request(app).put(`${MOUNT}/posts/3`).send({ status: "published" });

      // Assert
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ ok: true });
    });

    test("400 quando id é inválido (string)", async () => {
      // Arrange
      const { controller } = loadController();
      const app = makeTestApp(MOUNT, buildRouter(controller));

      // Act
      const res = await request(app).put(`${MOUNT}/posts/abc`).send({ title: "Novo" });

      // Assert
      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ ok: false, code: "VALIDATION_ERROR" });
    });

    test("400 quando body está vazio (nenhum campo)", async () => {
      // Arrange
      const { controller } = loadController();
      const app = makeTestApp(MOUNT, buildRouter(controller));

      // Act
      const res = await request(app).put(`${MOUNT}/posts/1`).send({});

      // Assert
      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ ok: false, code: "VALIDATION_ERROR" });
    });

    test("400 quando slug enviado é inválido", async () => {
      // Arrange
      const { controller } = loadController();
      const app = makeTestApp(MOUNT, buildRouter(controller));

      // Act
      const res = await request(app).put(`${MOUNT}/posts/1`).send({ slug: "INVÁLIDO!!" });

      // Assert
      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ ok: false, code: "VALIDATION_ERROR" });
    });

    test("400 quando status é inválido", async () => {
      // Arrange
      const { controller } = loadController();
      const app = makeTestApp(MOUNT, buildRouter(controller));

      // Act
      const res = await request(app).put(`${MOUNT}/posts/1`).send({ status: "xyz" });

      // Assert
      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ ok: false, code: "VALIDATION_ERROR" });
    });

    test("400 quando published_at tem formato inválido", async () => {
      // Arrange
      const { controller } = loadController();
      const app = makeTestApp(MOUNT, buildRouter(controller));

      // Act
      const res = await request(app).put(`${MOUNT}/posts/1`).send({ published_at: "01/01/2024" });

      // Assert
      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ ok: false, code: "VALIDATION_ERROR" });
    });

    test("404 quando post não existe (affectedRows = 0)", async () => {
      // Arrange
      const { controller } = loadController({
        mockPool: {
          query: jest.fn().mockImplementation(
            makeQueryRouter([
              // Verificação de slug duplicado (quando slug for atualizado)
              {
                match: (s) => s.includes("select id") && s.includes("news_posts") && s.includes("slug"),
                reply: async () => [[]], // não há duplicata
              },
              // UPDATE retorna 0 affected rows
              {
                match: (s) => s.includes("update news_posts"),
                reply: async () => [{ affectedRows: 0 }],
              },
            ])
          ),
          getConnection: jest.fn(),
        },
      });
      const app = makeTestApp(MOUNT, buildRouter(controller));

      // Act
      const res = await request(app).put(`${MOUNT}/posts/9999`).send({ title: "Inexistente" });

      // Assert
      expect(res.status).toBe(404);
      expect(res.body).toMatchObject({ ok: false, code: "NOT_FOUND" });
    });

    test("409 quando slug já existe em outro post (IDOR check slug update)", async () => {
      // Arrange
      // ⚠️  NOTA: Potencial race condition entre SELECT slug e UPDATE (sem transação)
      const { controller } = loadController({
        mockPool: {
          query: jest.fn().mockImplementation(
            makeQueryRouter([
              // SELECT id FROM news_posts WHERE slug = ? AND id <> ?
              {
                match: (s) => s.includes("select id") && s.includes("news_posts") && s.includes("slug") && s.includes("and id"),
                reply: async () => [[{ id: 5 }]], // outro post tem o mesmo slug
              },
            ])
          ),
          getConnection: jest.fn(),
        },
      });
      const app = makeTestApp(MOUNT, buildRouter(controller));

      // Act
      const res = await request(app).put(`${MOUNT}/posts/1`).send({ slug: "slug-existente" });

      // Assert
      expect(res.status).toBe(409);
      expect(res.body).toMatchObject({ ok: false, code: "DUPLICATE" });
    });

    test("409 quando pool.query lança ER_DUP_ENTRY", async () => {
      // Arrange
      const dupErr = new Error("Duplicate entry");
      dupErr.code = "ER_DUP_ENTRY";
      const { controller } = loadController({
        mockPool: {
          query: jest.fn().mockImplementation(
            makeQueryRouter([
              {
                match: (s) => s.includes("select id") && s.includes("news_posts"),
                reply: async () => [[]], // não há duplicata no check
              },
              {
                match: (s) => s.includes("update news_posts"),
                reply: async () => { throw dupErr; },
              },
            ])
          ),
          getConnection: jest.fn(),
        },
      });
      const app = makeTestApp(MOUNT, buildRouter(controller));

      // Act
      const res = await request(app).put(`${MOUNT}/posts/1`).send({ slug: "novo-slug" });

      // Assert
      expect(res.status).toBe(409);
      expect(res.body).toMatchObject({ ok: false, code: "DUPLICATE" });
    });

    test("500 quando pool.query lança erro genérico", async () => {
      // Arrange
      const { controller } = loadController({
        mockPool: {
          query: jest.fn().mockRejectedValue(new Error("DB error")),
          getConnection: jest.fn(),
        },
      });
      const app = makeTestApp(MOUNT, buildRouter(controller));

      // Act
      const res = await request(app).put(`${MOUNT}/posts/1`).send({ title: "Novo" });

      // Assert
      expect(res.status).toBe(500);
      expect(res.body).toMatchObject({ ok: false, code: "INTERNAL_ERROR" });
    });
  });

  // ───────────────── deletePost ─────────────────
  describe("DELETE /posts/:id — deletePost()", () => {
    test("200 happy path — remove post existente", async () => {
      // Arrange
      const { controller, pool } = loadController({
        mockPool: {
          query: jest.fn().mockImplementation(
            makeQueryRouter([
              {
                match: (s) => s.includes("delete from news_posts"),
                reply: async () => [{ affectedRows: 1 }],
              },
              {
                match: (s) => s.includes("admin_logs"),
                reply: async () => [{ insertId: 1 }],
              },
            ])
          ),
          getConnection: jest.fn(),
        },
      });
      const app = makeTestApp(MOUNT, buildRouter(controller));

      // Act
      const res = await request(app).delete(`${MOUNT}/posts/5`);

      // Assert
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ ok: true, data: expect.objectContaining({ deleted: true, id: 5 }) });
    });

    test("400 quando id é inválido (zero)", async () => {
      // Arrange
      const { controller } = loadController();
      const app = makeTestApp(MOUNT, buildRouter(controller));

      // Act
      const res = await request(app).delete(`${MOUNT}/posts/0`);

      // Assert
      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ ok: false, code: "VALIDATION_ERROR" });
    });

    test("400 quando id é string não numérica", async () => {
      // Arrange
      const { controller } = loadController();
      const app = makeTestApp(MOUNT, buildRouter(controller));

      // Act
      const res = await request(app).delete(`${MOUNT}/posts/abc`);

      // Assert
      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ ok: false, code: "VALIDATION_ERROR" });
    });

    test("404 quando post não existe (affectedRows = 0)", async () => {
      // Arrange
      const { controller } = loadController({
        mockPool: {
          query: jest.fn().mockImplementation(
            makeQueryRouter([
              {
                match: (s) => s.includes("delete from news_posts"),
                reply: async () => [{ affectedRows: 0 }],
              },
            ])
          ),
          getConnection: jest.fn(),
        },
      });
      const app = makeTestApp(MOUNT, buildRouter(controller));

      // Act
      const res = await request(app).delete(`${MOUNT}/posts/9999`);

      // Assert
      expect(res.status).toBe(404);
      expect(res.body).toMatchObject({ ok: false, code: "NOT_FOUND" });
    });

    test("500 quando pool.query lança exceção", async () => {
      // Arrange
      const { controller } = loadController({
        mockPool: {
          query: jest.fn().mockRejectedValue(new Error("DB error")),
          getConnection: jest.fn(),
        },
      });
      const app = makeTestApp(MOUNT, buildRouter(controller));

      // Act
      const res = await request(app).delete(`${MOUNT}/posts/1`);

      // Assert
      expect(res.status).toBe(500);
      expect(res.body).toMatchObject({ ok: false, code: "INTERNAL_ERROR" });
    });
  });
});
