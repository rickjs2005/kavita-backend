/**
 * test/unit/services/rolesAdminService.unit.test.js
 *
 * Cobre:
 *   list      — delega ao repo
 *   getById   — NOT_FOUND, retorna role
 *   create    — CONFLICT em slug duplicado, cria role, logAdminAction
 *   update    — NOT_FOUND, atualiza campos, sincroniza permissões, transação
 *   remove    — NOT_FOUND, is_system → 400, deleta permissões e role, transação
 */

"use strict";

const { makeMockConn } = require("../../testUtils");

const POOL_PATH = require.resolve("../../../config/pool");
const REPO_PATH = require.resolve("../../../repositories/rolesRepository");
const LOGS_PATH = require.resolve("../../../services/adminLogs");
const SVC_PATH = require.resolve("../../../services/rolesAdminService");

// ---------------------------------------------------------------------------
// Setup helper
// ---------------------------------------------------------------------------

function setupModule(repoOverrides = {}, connOverride = null) {
  jest.resetModules();

  const mockConn = connOverride || makeMockConn();

  const poolMock = {
    query: jest.fn(),
    getConnection: jest.fn().mockResolvedValue(mockConn),
  };

  const repoMock = {
    listRoles: jest.fn(),
    findRoleById: jest.fn(),
    findRoleBySlug: jest.fn(),
    createRole: jest.fn(),
    updateRoleFields: jest.fn().mockResolvedValue(1),
    deleteRolePermissions: jest.fn().mockResolvedValue(undefined),
    resolvePermissionsByChave: jest.fn().mockResolvedValue(new Map()),
    insertRolePermissions: jest.fn().mockResolvedValue(undefined),
    findRoleForDelete: jest.fn(),
    deleteRole: jest.fn().mockResolvedValue(1),
    ...repoOverrides,
  };

  const logsMock = { logAdminAction: jest.fn() };

  jest.doMock(POOL_PATH, () => poolMock);
  jest.doMock(REPO_PATH, () => repoMock);
  jest.doMock(LOGS_PATH, () => logsMock);

  const svc = require(SVC_PATH);
  return { svc, repoMock, poolMock, mockConn, logsMock };
}

function makeRole(overrides = {}) {
  return { id: 1, nome: "Gestor", slug: "gestor", descricao: null, is_system: 0, criado_em: "2024-01-01", permissions: [], ...overrides };
}

// ---------------------------------------------------------------------------
// list
// ---------------------------------------------------------------------------

describe("rolesAdminService.list", () => {
  test("delega para repo.listRoles e retorna resultado", async () => {
    const rows = [makeRole()];
    const { svc, repoMock } = setupModule({ listRoles: jest.fn().mockResolvedValue(rows) });

    const result = await svc.list();

    expect(result).toBe(rows);
    expect(repoMock.listRoles).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// getById
// ---------------------------------------------------------------------------

describe("rolesAdminService.getById", () => {
  test("NOT_FOUND quando repo retorna null", async () => {
    const { svc } = setupModule({ findRoleById: jest.fn().mockResolvedValue(null) });
    await expect(svc.getById(999)).rejects.toMatchObject({ status: 404, code: "NOT_FOUND" });
  });

  test("retorna role quando encontrado", async () => {
    const role = makeRole({ id: 3 });
    const { svc } = setupModule({ findRoleById: jest.fn().mockResolvedValue(role) });

    const result = await svc.getById(3);
    expect(result).toBe(role);
  });
});

// ---------------------------------------------------------------------------
// create
// ---------------------------------------------------------------------------

describe("rolesAdminService.create", () => {
  test("CONFLICT quando slug já existe", async () => {
    const { svc } = setupModule({
      findRoleBySlug: jest.fn().mockResolvedValue({ id: 1 }),
    });

    await expect(
      svc.create({ nome: "Dup", slug: "admin", descricao: undefined }, 99)
    ).rejects.toMatchObject({ status: 409, code: "CONFLICT" });
  });

  test("normaliza slug para lowercase antes de checar unicidade", async () => {
    const { svc, repoMock } = setupModule({
      findRoleBySlug: jest.fn().mockResolvedValue(null),
      createRole: jest.fn().mockResolvedValue(10),
    });

    await svc.create({ nome: "Novo", slug: "  ADMIN  ", descricao: undefined }, 1);

    expect(repoMock.findRoleBySlug).toHaveBeenCalledWith("admin");
    expect(repoMock.createRole).toHaveBeenCalledWith(
      expect.objectContaining({ slug: "admin" })
    );
  });

  test("retorna objeto completo do role criado", async () => {
    const { svc } = setupModule({
      findRoleBySlug: jest.fn().mockResolvedValue(null),
      createRole: jest.fn().mockResolvedValue(55),
    });

    const result = await svc.create({ nome: "Editor", slug: "editor", descricao: "Edita posts" }, 1);

    expect(result).toMatchObject({
      id: 55,
      nome: "Editor",
      slug: "editor",
      descricao: "Edita posts",
      is_system: 0,
      permissions: [],
    });
  });

  test("chama logAdminAction (fire-and-forget)", async () => {
    const { svc, logsMock } = setupModule({
      findRoleBySlug: jest.fn().mockResolvedValue(null),
      createRole: jest.fn().mockResolvedValue(7),
    });

    await svc.create({ nome: "X", slug: "x" }, 42);

    expect(logsMock.logAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({ adminId: 42, acao: "criar_role", entidadeId: 7 })
    );
  });

  test("não chama createRole quando slug já existe", async () => {
    const { svc, repoMock } = setupModule({
      findRoleBySlug: jest.fn().mockResolvedValue({ id: 1 }),
    });

    await expect(svc.create({ nome: "X", slug: "admin" }, 1)).rejects.toThrow();
    expect(repoMock.createRole).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// update
// ---------------------------------------------------------------------------

describe("rolesAdminService.update", () => {
  test("NOT_FOUND antes de abrir conexão quando role não existe", async () => {
    const { svc, poolMock } = setupModule({
      findRoleById: jest.fn().mockResolvedValue(null),
    });

    await expect(svc.update(999, { nome: "X" }, 1)).rejects.toMatchObject({ status: 404, code: "NOT_FOUND" });
    expect(poolMock.getConnection).not.toHaveBeenCalled();
  });

  test("commit chamado em atualização bem-sucedida", async () => {
    const { svc, mockConn } = setupModule({
      findRoleById: jest.fn().mockResolvedValue(makeRole()),
    });

    await svc.update(1, { nome: "Novo Nome" }, 1);

    expect(mockConn.beginTransaction).toHaveBeenCalled();
    expect(mockConn.commit).toHaveBeenCalled();
    expect(mockConn.rollback).not.toHaveBeenCalled();
    expect(mockConn.release).toHaveBeenCalled();
  });

  test("updateRoleFields chamado quando nome ou descricao fornecidos", async () => {
    const { svc, repoMock } = setupModule({
      findRoleById: jest.fn().mockResolvedValue(makeRole()),
    });

    await svc.update(1, { nome: "Novo", descricao: "Desc" }, 1);

    expect(repoMock.updateRoleFields).toHaveBeenCalledWith(
      expect.anything(),
      1,
      { nome: "Novo", descricao: "Desc" }
    );
  });

  test("updateRoleFields NÃO chamado quando nome e descricao ausentes", async () => {
    const { svc, repoMock } = setupModule({
      findRoleById: jest.fn().mockResolvedValue(makeRole()),
    });

    await svc.update(1, { permissions: ["roles_manage"] }, 1);

    expect(repoMock.updateRoleFields).not.toHaveBeenCalled();
  });

  test("sincroniza permissões: delete + resolve + insert", async () => {
    const permMap = new Map([["roles_manage", 10], ["users_view", 11]]);
    const { svc, repoMock } = setupModule({
      findRoleById: jest.fn().mockResolvedValue(makeRole()),
      resolvePermissionsByChave: jest.fn().mockResolvedValue(permMap),
    });

    await svc.update(1, { permissions: ["roles_manage", "users_view"] }, 1);

    expect(repoMock.deleteRolePermissions).toHaveBeenCalledWith(expect.anything(), 1);
    expect(repoMock.resolvePermissionsByChave).toHaveBeenCalledWith(
      expect.anything(),
      ["roles_manage", "users_view"]
    );
    expect(repoMock.insertRolePermissions).toHaveBeenCalledWith(
      expect.anything(),
      1,
      [10, 11]
    );
  });

  test("array de permissions vazio: só deleta, não insere", async () => {
    const { svc, repoMock } = setupModule({
      findRoleById: jest.fn().mockResolvedValue(makeRole()),
    });

    await svc.update(1, { permissions: [] }, 1);

    expect(repoMock.deleteRolePermissions).toHaveBeenCalled();
    expect(repoMock.insertRolePermissions).not.toHaveBeenCalled();
  });

  test("rollback e re-throw em erro de banco", async () => {
    const dbError = new Error("db fail");
    const { svc, mockConn } = setupModule({
      findRoleById: jest.fn().mockResolvedValue(makeRole()),
      updateRoleFields: jest.fn().mockRejectedValue(dbError),
    });

    await expect(svc.update(1, { nome: "X" }, 1)).rejects.toBe(dbError);
    expect(mockConn.rollback).toHaveBeenCalled();
    expect(mockConn.release).toHaveBeenCalled();
  });

  test("logAdminAction chamado após commit bem-sucedido", async () => {
    const { svc, logsMock } = setupModule({
      findRoleById: jest.fn().mockResolvedValue(makeRole()),
    });

    await svc.update(1, { nome: "Novo" }, 42);

    expect(logsMock.logAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({ adminId: 42, acao: "atualizar_role", entidadeId: 1 })
    );
  });
});

// ---------------------------------------------------------------------------
// remove
// ---------------------------------------------------------------------------

describe("rolesAdminService.remove", () => {
  test("NOT_FOUND quando role não existe na transação", async () => {
    const { svc } = setupModule({
      findRoleForDelete: jest.fn().mockResolvedValue(null),
    });

    await expect(svc.remove(999, 1)).rejects.toMatchObject({ status: 404, code: "NOT_FOUND" });
  });

  test("VALIDATION_ERROR 400 quando is_system=1", async () => {
    const { svc } = setupModule({
      findRoleForDelete: jest.fn().mockResolvedValue({ id: 1, is_system: 1 }),
    });

    await expect(svc.remove(1, 1)).rejects.toMatchObject({
      status: 400,
      code: "VALIDATION_ERROR",
    });
  });

  test("deleta permissões ANTES do role", async () => {
    const callOrder = [];
    const { svc } = setupModule({
      findRoleForDelete: jest.fn().mockResolvedValue({ id: 5, is_system: 0 }),
      deleteRolePermissions: jest.fn().mockImplementation(async () => { callOrder.push("perms"); }),
      deleteRole: jest.fn().mockImplementation(async () => { callOrder.push("role"); return 1; }),
    });

    await svc.remove(5, 1);

    expect(callOrder).toEqual(["perms", "role"]);
  });

  test("commit chamado em remoção bem-sucedida", async () => {
    const { svc, mockConn } = setupModule({
      findRoleForDelete: jest.fn().mockResolvedValue({ id: 5, is_system: 0 }),
    });

    await svc.remove(5, 1);

    expect(mockConn.commit).toHaveBeenCalled();
    expect(mockConn.rollback).not.toHaveBeenCalled();
    expect(mockConn.release).toHaveBeenCalled();
  });

  test("rollback e re-throw em erro de banco", async () => {
    const dbError = new Error("db fail");
    const { svc, mockConn } = setupModule({
      findRoleForDelete: jest.fn().mockRejectedValue(dbError),
    });

    await expect(svc.remove(1, 1)).rejects.toBe(dbError);
    expect(mockConn.rollback).toHaveBeenCalled();
    expect(mockConn.release).toHaveBeenCalled();
  });

  test("logAdminAction chamado após commit bem-sucedido", async () => {
    const { svc, logsMock } = setupModule({
      findRoleForDelete: jest.fn().mockResolvedValue({ id: 5, is_system: 0 }),
    });

    await svc.remove(5, 77);

    expect(logsMock.logAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({ adminId: 77, acao: "remover_role", entidadeId: 5 })
    );
  });

  test("rollback chamado mesmo em erro AppError (NOT_FOUND)", async () => {
    const { svc, mockConn } = setupModule({
      findRoleForDelete: jest.fn().mockResolvedValue(null),
    });

    await expect(svc.remove(999, 1)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(mockConn.rollback).toHaveBeenCalled();
    expect(mockConn.release).toHaveBeenCalled();
  });
});
