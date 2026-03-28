/**
 * test/unit/middleware/requirePermission.unit.test.js
 *
 * Testes unitários do middleware requirePermission.
 *
 * Casos cobertos:
 * - req.admin ausente → 401 (não autenticado)
 * - role "master" → bypass imediato (sem verificar permissions)
 * - admin com permissão exata → next() sem erro
 * - admin sem a permissão → 403
 * - admin com permissions undefined → 403
 * - admin com permissions vazio → 403
 * - permissão presente entre várias → next()
 */

"use strict";

const requirePermission = require("../../../middleware/requirePermission");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeReqRes({ admin } = {}) {
  const req = {};
  if (admin !== undefined) req.admin = admin;
  const res = {};
  const next = jest.fn();
  return { req, res, next };
}

function nextError(next) {
  return next.mock.calls[0]?.[0];
}

// ---------------------------------------------------------------------------
// req.admin ausente
// ---------------------------------------------------------------------------

describe("requirePermission — req.admin ausente", () => {
  test("sem req.admin → next com AppError 401", () => {
    const { req, res, next } = makeReqRes();
    requirePermission("produtos.criar")(req, res, next);

    const err = nextError(next);
    expect(err).toBeDefined();
    expect(err.status).toBe(401);
    expect(err.code).toBe("AUTH_ERROR");
  });
});

// ---------------------------------------------------------------------------
// Superuser bypass
// ---------------------------------------------------------------------------

describe("requirePermission — role master", () => {
  test("role 'master' chama next() sem verificar permissions", () => {
    const { req, res, next } = makeReqRes({
      admin: { role: "master", permissions: [] },
    });
    requirePermission("qualquer.coisa")(req, res, next);

    expect(next).toHaveBeenCalledWith(); // sem argumento = sem erro
  });

  test("role 'master' sem permissions → ainda chama next()", () => {
    const { req, res, next } = makeReqRes({
      admin: { role: "master" },
    });
    requirePermission("super.secret")(req, res, next);

    expect(next).toHaveBeenCalledWith();
  });
});

// ---------------------------------------------------------------------------
// Admin com permissão
// ---------------------------------------------------------------------------

describe("requirePermission — admin com permissão", () => {
  test("permissão exata presente → next() sem erro", () => {
    const { req, res, next } = makeReqRes({
      admin: { role: "admin", permissions: ["produtos.criar", "pedidos.ver"] },
    });
    requirePermission("produtos.criar")(req, res, next);

    expect(next).toHaveBeenCalledWith();
  });

  test("permissão presente entre várias → next() sem erro", () => {
    const { req, res, next } = makeReqRes({
      admin: {
        role: "editor",
        permissions: ["news.ver", "news.editar", "news.criar"],
      },
    });
    requirePermission("news.editar")(req, res, next);

    expect(next).toHaveBeenCalledWith();
  });
});

// ---------------------------------------------------------------------------
// Admin sem permissão
// ---------------------------------------------------------------------------

describe("requirePermission — admin sem permissão", () => {
  test("permissão ausente → next com AppError 403", () => {
    const { req, res, next } = makeReqRes({
      admin: { role: "admin", permissions: ["produtos.ver"] },
    });
    requirePermission("produtos.deletar")(req, res, next);

    const err = nextError(next);
    expect(err).toBeDefined();
    expect(err.status).toBe(403);
    expect(err.code).toBe("AUTH_ERROR");
  });

  test("permissions vazio → 403", () => {
    const { req, res, next } = makeReqRes({
      admin: { role: "admin", permissions: [] },
    });
    requirePermission("pedidos.criar")(req, res, next);

    const err = nextError(next);
    expect(err.status).toBe(403);
  });

  test("permissions undefined → 403 (fallback para [])", () => {
    const { req, res, next } = makeReqRes({
      admin: { role: "admin" }, // sem permissions
    });
    requirePermission("drones.editar")(req, res, next);

    const err = nextError(next);
    expect(err.status).toBe(403);
  });

  test("role vazia (não-master) → 403 quando permissão ausente", () => {
    const { req, res, next } = makeReqRes({
      admin: { role: "", permissions: ["config.ver"] },
    });
    requirePermission("config.editar")(req, res, next);

    const err = nextError(next);
    expect(err.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// Diferentes keys por middleware instance (closure)
// ---------------------------------------------------------------------------

describe("requirePermission — closure por key", () => {
  test("dois middlewares para keys diferentes são independentes", () => {
    const admin = { role: "admin", permissions: ["a.criar"] };

    const { req: req1, res: res1, next: next1 } = makeReqRes({ admin });
    requirePermission("a.criar")(req1, res1, next1);
    expect(next1).toHaveBeenCalledWith(); // sem erro

    const { req: req2, res: res2, next: next2 } = makeReqRes({ admin });
    requirePermission("b.criar")(req2, res2, next2);
    expect(nextError(next2).status).toBe(403); // diferente key → 403
  });
});
