"use strict";

/**
 * test/unit/controllers/permissionsController.unit.test.js
 *
 * Foco principal: proteção P1 — delete de permissões críticas
 * (`roles_manage`, `permissions_manage`) deve ser bloqueado.
 */

jest.mock("../../../repositories/permissionsRepository");
jest.mock("../../../services/adminLogs", () => ({ logAdminAction: jest.fn() }));
jest.mock("../../../lib", () => ({
  response: {
    ok: jest.fn(),
    created: jest.fn(),
    noContent: jest.fn(),
  },
}));

const repo = require("../../../repositories/permissionsRepository");
const { response } = require("../../../lib");
const ctrl = require("../../../controllers/permissionsController");

function makeReq(overrides = {}) {
  return {
    body: {},
    params: {},
    admin: { id: 1 },
    ...overrides,
  };
}

beforeEach(() => {
  Object.values(repo).forEach((fn) => typeof fn?.mockClear === "function" && fn.mockClear());
  response.noContent.mockClear();
});

describe("permissionsController.deletePermission", () => {
  test("P1: bloqueia delete de roles_manage com 400", async () => {
    repo.findById.mockResolvedValue({
      id: 10,
      chave: "roles_manage",
      grupo: "sistema",
      descricao: null,
    });
    const next = jest.fn();

    await ctrl.deletePermission(
      makeReq({ params: { id: "10" } }),
      {},
      next,
    );

    expect(next.mock.calls[0][0].status).toBe(400);
    expect(next.mock.calls[0][0].message).toMatch(/roles_manage/);
    expect(next.mock.calls[0][0].message).toMatch(/crítica/i);
    expect(repo.deleteById).not.toHaveBeenCalled();
  });

  test("P1: bloqueia delete de permissions_manage com 400", async () => {
    repo.findById.mockResolvedValue({
      id: 11,
      chave: "permissions_manage",
      grupo: "sistema",
      descricao: null,
    });
    const next = jest.fn();

    await ctrl.deletePermission(
      makeReq({ params: { id: "11" } }),
      {},
      next,
    );

    expect(next.mock.calls[0][0].status).toBe(400);
    expect(repo.deleteById).not.toHaveBeenCalled();
  });

  test("permite delete de permissão não-crítica", async () => {
    repo.findById.mockResolvedValue({
      id: 20,
      chave: "products_manage",
      grupo: "loja",
      descricao: null,
    });
    repo.deleteById.mockResolvedValue(1);

    await ctrl.deletePermission(
      makeReq({ params: { id: "20" } }),
      {},
      jest.fn(),
    );

    expect(repo.deleteById).toHaveBeenCalledWith("20");
    expect(response.noContent).toHaveBeenCalled();
  });

  test("404 quando permissão não existe", async () => {
    repo.findById.mockResolvedValue(null);
    const next = jest.fn();

    await ctrl.deletePermission(
      makeReq({ params: { id: "999" } }),
      {},
      next,
    );

    expect(next.mock.calls[0][0].status).toBe(404);
    expect(repo.deleteById).not.toHaveBeenCalled();
  });
});
