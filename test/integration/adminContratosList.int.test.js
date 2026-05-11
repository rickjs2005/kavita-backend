/**
 * test/integration/adminContratosList.int.test.js
 *
 * Rotas testadas:
 * - GET /api/admin/contratos        (listagem global admin)
 *
 * Cobertura:
 * - 401 sem autenticação (verifyAdmin rejeita)
 * - 403 admin autenticado SEM mercado_cafe_view
 * - 200 admin COM mercado_cafe_view
 * - 200 admin COM mercado_cafe_manage (super-permissão)
 * - 200 admin role "master" (bypass)
 * - 200 estrutura { ok: true, data: { items, meta } }
 * - 200 filtro status=signed monta WHERE c.status=?
 * - 400 filtro inválido status=deleted (VALIDATION_ERROR)
 * - 400 limit acima de 100 (VALIDATION_ERROR)
 * - 200 paginação page/limit refletida em meta
 *
 * Padrão: pool mockado (sem MySQL real), verifyAdmin mockado por
 * cenário, requirePermission REAL (queremos testar a regra). Inspira
 * em test/integration/adminConfig.int.test.js.
 *
 * Observação sobre CSRF: validateCSRF é aplicado no MOUNT global
 * (adminRoutes.js). Os testes de rotas admin neste projeto montam o
 * router isolado (makeTestApp), portanto CSRF não está na chain
 * destes integration tests — alinha com o padrão dos demais
 * (adminConfig, adminCupons, adminPedidos etc). Mantemos a regra
 * de RBAC + Zod aqui; o CSRF do mount fica coberto por
 * test/integration/security-p0.test.js e pelo próprio middleware
 * em testes dedicados.
 */

"use strict";

const request = require("supertest");
const { makeTestApp } = require("../testUtils");

describe("AdminContratos routes — GET /api/admin/contratos", () => {
  const originalEnv = process.env;

  function setup({ admin = null, queryImpl = null } = {}) {
    jest.resetModules();
    process.env = { ...originalEnv, NODE_ENV: "test" };

    const poolMock = {
      query: jest.fn().mockImplementation(async (sql, params) => {
        if (queryImpl) return queryImpl(sql, params);
        // Default: lista vazia (caminho positivo sem mocks específicos).
        if (String(sql).includes("SELECT COUNT(*)")) return [[{ total: 0 }]];
        return [[]];
      }),
    };

    // verifyAdmin: null → 401 (sem auth); objeto → injeta req.admin.
    const verifyAdminMock = jest.fn((req, _res, next) => {
      if (!admin) {
        const AppError = require("../../errors/AppError");
        const ERROR_CODES = require("../../constants/ErrorCodes");
        return next(
          new AppError("Não autenticado.", ERROR_CODES.AUTH_ERROR, 401),
        );
      }
      req.admin = admin;
      return next();
    });

    jest.doMock(require.resolve("../../config/pool"), () => poolMock);
    jest.doMock(
      require.resolve("../../middleware/verifyAdmin"),
      () => verifyAdminMock,
    );

    // Monta um router que casa com o que adminRoutes.js faz:
    //   verifyAdmin → router específico. requirePermission REAL.
    const express = require("express");
    const adminContratosRouter = require("../../routes/admin/adminContratos");
    const verifyAdmin = require("../../middleware/verifyAdmin");
    const wrapped = express.Router();
    wrapped.use(verifyAdmin, adminContratosRouter);

    const app = makeTestApp("/api/admin/contratos", wrapped);
    return { app, poolMock };
  }

  afterEach(() => {
    process.env = originalEnv;
    jest.clearAllMocks();
  });

  /* ──────────────────────────────────────────────────────────────────── */
  /*  Autenticação                                                       */
  /* ──────────────────────────────────────────────────────────────────── */

  describe("Autenticação", () => {
    test("401 quando não autenticado", async () => {
      const { app } = setup({ admin: null });
      const res = await request(app).get("/api/admin/contratos");
      expect(res.status).toBe(401);
      expect(res.body.ok).toBe(false);
      expect(res.body.code).toBe("AUTH_ERROR");
    });
  });

  /* ──────────────────────────────────────────────────────────────────── */
  /*  RBAC                                                               */
  /* ──────────────────────────────────────────────────────────────────── */

  describe("Permissões (requirePermission mercado_cafe_view)", () => {
    test("403 admin autenticado SEM mercado_cafe_view", async () => {
      const { app } = setup({
        admin: { id: 1, role: "operator", permissions: ["pedidos.ver"] },
      });
      const res = await request(app).get("/api/admin/contratos");
      expect(res.status).toBe(403);
      expect(res.body.ok).toBe(false);
      // requirePermission devolve AUTH_ERROR + 403 (mensagem de
      // "Permissão insuficiente").
      expect(res.body.message).toMatch(/permissão insuficiente/i);
    });

    test("200 admin com mercado_cafe_view explícito", async () => {
      const { app } = setup({
        admin: {
          id: 1,
          role: "operator",
          permissions: ["mercado_cafe_view"],
        },
      });
      const res = await request(app).get("/api/admin/contratos");
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });

    test("200 admin com mercado_cafe_manage (super-permissão satisfaz view)", async () => {
      const { app } = setup({
        admin: {
          id: 1,
          role: "operator",
          permissions: ["mercado_cafe_manage"],
        },
      });
      const res = await request(app).get("/api/admin/contratos");
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });

    test("200 admin role 'master' (bypass de superusuário)", async () => {
      const { app } = setup({
        admin: { id: 1, role: "master", permissions: [] },
      });
      const res = await request(app).get("/api/admin/contratos");
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });
  });

  /* ──────────────────────────────────────────────────────────────────── */
  /*  Shape da resposta                                                  */
  /* ──────────────────────────────────────────────────────────────────── */

  describe("Resposta 200", () => {
    test("retorna { ok: true, data: { items, meta } } com items e meta", async () => {
      const adminWithView = {
        id: 1,
        role: "operator",
        permissions: ["mercado_cafe_view"],
      };
      const sampleRow = {
        id: 42,
        tipo: "disponivel",
        status: "signed",
        lead_id: 10,
        corretora_id: 1,
        numero_externo: "KVT-LXJZ8K",
        corretora_name: "Corretora Y",
        corretora_slug: "corretora-y",
        lead_nome: "João Silva",
        created_at: new Date("2026-05-08T13:24:00.000Z"),
        sent_at: new Date("2026-05-08T13:25:10.000Z"),
        signed_at: new Date("2026-05-09T09:12:00.000Z"),
        cancelled_at: null,
      };

      const { app } = setup({
        admin: adminWithView,
        queryImpl: async (sql) => {
          if (String(sql).includes("SELECT COUNT(*)")) {
            return [[{ total: 1 }]];
          }
          return [[sampleRow]];
        },
      });

      const res = await request(app).get("/api/admin/contratos");
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.data).toEqual(
        expect.objectContaining({
          items: expect.any(Array),
          meta: expect.objectContaining({
            total: 1,
            page: 1,
            limit: 20,
            total_pages: 1,
          }),
        }),
      );
      expect(res.body.data.items[0]).toEqual(
        expect.objectContaining({
          id: 42,
          tipo: "disponivel",
          status: "signed",
          corretora_name: "Corretora Y",
          lead_nome: "João Silva",
          numero_externo: "KVT-LXJZ8K",
        }),
      );
    });
  });

  /* ──────────────────────────────────────────────────────────────────── */
  /*  Filtros                                                            */
  /* ──────────────────────────────────────────────────────────────────── */

  describe("Filtros", () => {
    test("status=signed propaga para o WHERE da query", async () => {
      const seenSql = [];
      const seenParams = [];
      const { app } = setup({
        admin: {
          id: 1,
          role: "operator",
          permissions: ["mercado_cafe_view"],
        },
        queryImpl: async (sql, params) => {
          seenSql.push(String(sql));
          seenParams.push(params);
          if (String(sql).includes("SELECT COUNT(*)")) {
            return [[{ total: 0 }]];
          }
          return [[]];
        },
      });

      const res = await request(app).get(
        "/api/admin/contratos?status=signed",
      );
      expect(res.status).toBe(200);
      // O primeiro SQL é o COUNT, o segundo o SELECT — ambos devem
      // conter "c.status = ?" e "signed" nos params.
      expect(seenSql[0]).toMatch(/WHERE c\.status = \?/);
      expect(seenParams[0]).toEqual(expect.arrayContaining(["signed"]));
    });

    test("400 VALIDATION_ERROR com status=deleted (fora do ENUM)", async () => {
      const { app, poolMock } = setup({
        admin: {
          id: 1,
          role: "operator",
          permissions: ["mercado_cafe_view"],
        },
      });
      const res = await request(app).get(
        "/api/admin/contratos?status=deleted",
      );
      expect(res.status).toBe(400);
      expect(res.body.ok).toBe(false);
      expect(res.body.code).toBe("VALIDATION_ERROR");
      // Schema barra antes de chegar no repository.
      expect(poolMock.query).not.toHaveBeenCalled();
    });

    test("400 VALIDATION_ERROR com limit acima de 100", async () => {
      const { app, poolMock } = setup({
        admin: {
          id: 1,
          role: "operator",
          permissions: ["mercado_cafe_view"],
        },
      });
      const res = await request(app).get(
        "/api/admin/contratos?limit=9999",
      );
      expect(res.status).toBe(400);
      expect(res.body.code).toBe("VALIDATION_ERROR");
      expect(poolMock.query).not.toHaveBeenCalled();
    });

    test("400 VALIDATION_ERROR com date_from em formato inválido", async () => {
      const { app, poolMock } = setup({
        admin: {
          id: 1,
          role: "operator",
          permissions: ["mercado_cafe_view"],
        },
      });
      const res = await request(app).get(
        "/api/admin/contratos?date_from=10/05/2026",
      );
      expect(res.status).toBe(400);
      expect(res.body.code).toBe("VALIDATION_ERROR");
      expect(poolMock.query).not.toHaveBeenCalled();
    });
  });

  /* ──────────────────────────────────────────────────────────────────── */
  /*  Paginação                                                          */
  /* ──────────────────────────────────────────────────────────────────── */

  describe("Paginação", () => {
    test("page=3&limit=10 reflete em meta + offset correto na query", async () => {
      let selectParams = null;
      const { app } = setup({
        admin: {
          id: 1,
          role: "operator",
          permissions: ["mercado_cafe_view"],
        },
        queryImpl: async (sql, params) => {
          if (String(sql).includes("SELECT COUNT(*)")) {
            return [[{ total: 45 }]];
          }
          selectParams = params;
          return [[]];
        },
      });

      const res = await request(app).get(
        "/api/admin/contratos?page=3&limit=10",
      );
      expect(res.status).toBe(200);
      expect(res.body.data.meta).toEqual({
        total: 45,
        page: 3,
        limit: 10,
        total_pages: 5,
      });
      // limit + offset nas duas últimas posições do params.
      expect(selectParams[selectParams.length - 2]).toBe(10);
      expect(selectParams[selectParams.length - 1]).toBe(20); // (3-1)*10
    });

    test("page=1&limit=20 default quando nada é enviado", async () => {
      const { app } = setup({
        admin: {
          id: 1,
          role: "operator",
          permissions: ["mercado_cafe_view"],
        },
      });
      const res = await request(app).get("/api/admin/contratos");
      expect(res.status).toBe(200);
      expect(res.body.data.meta).toEqual({
        total: 0,
        page: 1,
        limit: 20,
        total_pages: 1,
      });
    });
  });
});
