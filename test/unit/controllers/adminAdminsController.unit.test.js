"use strict";

/**
 * test/unit/controllers/adminAdminsController.unit.test.js
 *
 * Foco principal: proteções P2 (último admin) e P4 (auto-rebaixamento)
 * adicionadas em 2026-05-09.
 */

jest.mock("../../../repositories/adminAdminsRepository");
jest.mock("../../../services/adminLogs", () => ({ logAdminAction: jest.fn() }));
jest.mock("../../../lib", () => ({
  response: {
    ok: jest.fn(),
    created: jest.fn(),
    noContent: jest.fn(),
  },
}));
jest.mock("bcrypt", () => ({ hash: jest.fn().mockResolvedValue("hashed") }));

const repo = require("../../../repositories/adminAdminsRepository");
const { response } = require("../../../lib");
const ctrl = require("../../../controllers/adminAdminsController");
const AppError = require("../../../errors/AppError");

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
  response.ok.mockClear();
  response.created.mockClear();
  response.noContent.mockClear();
});

// ───────────────────────────────────────────────────────────────────────────
// updateAdmin — P4 (auto-rebaixamento) + P2 (último admin desativado)
// ───────────────────────────────────────────────────────────────────────────

describe("adminAdminsController.updateAdmin", () => {
  test("P4: bloqueia auto-troca de role com 400", async () => {
    repo.findById.mockResolvedValue({ id: 1, role: "master", ativo: 1 });
    const next = jest.fn();

    await ctrl.updateAdmin(
      makeReq({
        params: { id: "1" },
        body: { role: "viewer" },
        admin: { id: 1 },
      }),
      {},
      next,
    );

    expect(next.mock.calls[0][0]).toBeInstanceOf(AppError);
    expect(next.mock.calls[0][0].status).toBe(400);
    expect(next.mock.calls[0][0].message).toMatch(/próprio papel/i);
    expect(repo.update).not.toHaveBeenCalled();
  });

  test("P4: bloqueia auto-desativação", async () => {
    repo.findById.mockResolvedValue({ id: 1, role: "master", ativo: 1 });
    const next = jest.fn();

    await ctrl.updateAdmin(
      makeReq({
        params: { id: "1" },
        body: { ativo: false },
        admin: { id: 1 },
      }),
      {},
      next,
    );

    expect(next.mock.calls[0][0].message).toMatch(/desativar a si mesmo/i);
    expect(repo.update).not.toHaveBeenCalled();
  });

  test("P4: permite admin trocar próprio role para o MESMO role (no-op)", async () => {
    // Edge case: o frontend envia o role atual junto com outras mudanças. Nao
    // deve bloquear se nao houve mudança real.
    repo.findById.mockResolvedValue({ id: 1, role: "master", ativo: 1 });
    repo.findRoleBySlug.mockResolvedValue({ id: 1 });
    repo.update.mockResolvedValue(1);

    await ctrl.updateAdmin(
      makeReq({
        params: { id: "1" },
        body: { role: "master" },
        admin: { id: 1 },
      }),
      {},
      jest.fn(),
    );

    expect(repo.update).toHaveBeenCalled();
  });

  test("P4: outro admin pode trocar role de qualquer um (não bloqueia)", async () => {
    repo.findById.mockResolvedValue({ id: 5, role: "viewer", ativo: 1 });
    repo.findRoleBySlug.mockResolvedValue({ id: 1 });
    repo.update.mockResolvedValue(1);

    await ctrl.updateAdmin(
      makeReq({
        params: { id: "5" },
        body: { role: "editor" },
        admin: { id: 1 },
      }),
      {},
      jest.fn(),
    );

    expect(repo.update).toHaveBeenCalled();
  });

  test("P2: bloqueia desativação do último admin ativo", async () => {
    repo.findById.mockResolvedValue({ id: 5, role: "viewer", ativo: 1 });
    repo.countActive.mockResolvedValue(1);
    const next = jest.fn();

    await ctrl.updateAdmin(
      makeReq({
        params: { id: "5" },
        body: { ativo: false },
        admin: { id: 1 }, // outro admin (não bate o P4)
      }),
      {},
      next,
    );

    expect(next.mock.calls[0][0].message).toMatch(/último admin/i);
    expect(repo.update).not.toHaveBeenCalled();
  });

  test("P2: permite desativação se há 2+ admins ativos", async () => {
    repo.findById.mockResolvedValue({ id: 5, role: "viewer", ativo: 1 });
    repo.countActive.mockResolvedValue(3);
    repo.update.mockResolvedValue(1);

    await ctrl.updateAdmin(
      makeReq({
        params: { id: "5" },
        body: { ativo: false },
        admin: { id: 1 },
      }),
      {},
      jest.fn(),
    );

    expect(repo.update).toHaveBeenCalled();
  });

  test("P2: NÃO conta active quando alvo já estava inativo (no-op)", async () => {
    repo.findById.mockResolvedValue({ id: 5, role: "viewer", ativo: 0 });
    repo.update.mockResolvedValue(1);

    await ctrl.updateAdmin(
      makeReq({
        params: { id: "5" },
        body: { ativo: false },
        admin: { id: 1 },
      }),
      {},
      jest.fn(),
    );

    expect(repo.countActive).not.toHaveBeenCalled();
  });

  test("404 quando admin não existe", async () => {
    repo.findById.mockResolvedValue(null);
    const next = jest.fn();

    await ctrl.updateAdmin(
      makeReq({ params: { id: "999" }, body: { role: "viewer" } }),
      {},
      next,
    );

    expect(next.mock.calls[0][0].status).toBe(404);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// deleteAdmin — P2 (último admin)
// ───────────────────────────────────────────────────────────────────────────

describe("adminAdminsController.deleteAdmin", () => {
  test("P2: bloqueia deleção do último admin ativo", async () => {
    repo.findById.mockResolvedValue({ id: 5, role: "viewer", ativo: 1 });
    repo.countActive.mockResolvedValue(1);
    const next = jest.fn();

    await ctrl.deleteAdmin(
      makeReq({ params: { id: "5" }, admin: { id: 1 } }),
      {},
      next,
    );

    expect(next.mock.calls[0][0].message).toMatch(/último admin/i);
    expect(repo.deleteById).not.toHaveBeenCalled();
  });

  test("permite delete quando há outros admins ativos", async () => {
    repo.findById.mockResolvedValue({ id: 5, role: "viewer", ativo: 1 });
    repo.countActive.mockResolvedValue(3);

    await ctrl.deleteAdmin(
      makeReq({ params: { id: "5" }, admin: { id: 1 } }),
      {},
      jest.fn(),
    );

    expect(repo.deleteById).toHaveBeenCalledWith(5);
  });

  test("self-delete continua bloqueado (proteção pré-existente)", async () => {
    repo.findById.mockResolvedValue({ id: 1, role: "viewer", ativo: 1 });
    const next = jest.fn();

    await ctrl.deleteAdmin(
      makeReq({ params: { id: "1" }, admin: { id: 1 } }),
      {},
      next,
    );

    expect(next.mock.calls[0][0].message).toMatch(/si mesmo/i);
  });

  test("master delete continua bloqueado (proteção pré-existente)", async () => {
    repo.findById.mockResolvedValue({ id: 7, role: "master", ativo: 1 });
    const next = jest.fn();

    await ctrl.deleteAdmin(
      makeReq({ params: { id: "7" }, admin: { id: 1 } }),
      {},
      next,
    );

    expect(next.mock.calls[0][0].message).toMatch(/master/i);
  });

  test("não conta active quando alvo já está inativo (sem risco de lockout)", async () => {
    repo.findById.mockResolvedValue({ id: 5, role: "viewer", ativo: 0 });

    await ctrl.deleteAdmin(
      makeReq({ params: { id: "5" }, admin: { id: 1 } }),
      {},
      jest.fn(),
    );

    expect(repo.countActive).not.toHaveBeenCalled();
    expect(repo.deleteById).toHaveBeenCalled();
  });
});
