/**
 * test/unit/repositories/rolesRepository.unit.test.js
 *
 * Verifica SQL, parâmetros e mapeamento de retorno.
 * Funções transacionais recebem um conn mockado.
 */

"use strict";

jest.mock("../../../config/pool", () => ({ query: jest.fn() }));

const pool = require("../../../config/pool");
const { makeMockConn } = require("../../testUtils");
const repo = require("../../../repositories/rolesRepository");

function mockQuery(returnValue) {
  pool.query.mockResolvedValueOnce(returnValue);
}

beforeEach(() => jest.clearAllMocks());

// ---------------------------------------------------------------------------
// listRoles
// ---------------------------------------------------------------------------

describe("rolesRepository — listRoles", () => {
  test("retorna roles com permissions como array (split por vírgula)", async () => {
    const rows = [
      { id: 1, nome: "Admin", slug: "admin", descricao: null, is_system: 1, criado_em: "2024-01-01", permissions: "roles_manage,users_view" },
      { id: 2, nome: "Editor", slug: "editor", descricao: "desc", is_system: 0, criado_em: "2024-01-02", permissions: null },
    ];
    mockQuery([rows]);

    const result = await repo.listRoles();

    expect(result).toHaveLength(2);
    expect(result[0].permissions).toEqual(["roles_manage", "users_view"]);
    expect(result[1].permissions).toEqual([]);

    const [sql] = pool.query.mock.calls[0];
    expect(sql).toContain("GROUP_CONCAT");
    expect(sql).toContain("ORDER BY r.is_system DESC");
  });

  test("retorna array vazio quando não há roles", async () => {
    mockQuery([[]]);
    expect(await repo.listRoles()).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// findRoleById
// ---------------------------------------------------------------------------

describe("rolesRepository — findRoleById", () => {
  test("retorna role mapeado quando encontrado", async () => {
    const row = { id: 3, nome: "Gestor", slug: "gestor", descricao: null, is_system: 0, criado_em: "2024-01-01", permissions: "roles_manage" };
    mockQuery([[row]]);

    const result = await repo.findRoleById(3);

    expect(result).toMatchObject({ id: 3, slug: "gestor" });
    expect(result.permissions).toEqual(["roles_manage"]);

    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toContain("WHERE r.id = ?");
    expect(params).toEqual([3]);
  });

  test("retorna null quando não encontrado", async () => {
    mockQuery([[]]);
    expect(await repo.findRoleById(999)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// findRoleBySlug
// ---------------------------------------------------------------------------

describe("rolesRepository — findRoleBySlug", () => {
  test("retorna { id } quando slug existe", async () => {
    mockQuery([[{ id: 5 }]]);
    const result = await repo.findRoleBySlug("admin");
    expect(result).toEqual({ id: 5 });
    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toContain("slug = ?");
    expect(params).toEqual(["admin"]);
  });

  test("retorna null quando slug não existe", async () => {
    mockQuery([[]]);
    expect(await repo.findRoleBySlug("nao-existe")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// createRole
// ---------------------------------------------------------------------------

describe("rolesRepository — createRole", () => {
  test("insere role com is_system=0 hardcoded e retorna insertId", async () => {
    mockQuery([{ insertId: 42 }]);

    const id = await repo.createRole({ nome: "Novo", slug: "novo", descricao: "desc" });

    expect(id).toBe(42);
    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toContain("INSERT INTO admin_roles");
    expect(sql).toContain("is_system");
    expect(params).toEqual(["Novo", "novo", "desc"]);
  });

  test("descricao null quando undefined", async () => {
    mockQuery([{ insertId: 1 }]);
    await repo.createRole({ nome: "X", slug: "x", descricao: undefined });
    const [, params] = pool.query.mock.calls[0];
    expect(params[2]).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// updateRoleFields (transactional)
// ---------------------------------------------------------------------------

describe("rolesRepository — updateRoleFields", () => {
  test("atualiza nome e descricao quando ambos fornecidos", async () => {
    const conn = makeMockConn();
    conn.query.mockResolvedValueOnce([{ affectedRows: 1 }]);

    const affected = await repo.updateRoleFields(conn, 7, { nome: "Novo Nome", descricao: "Nova desc" });

    expect(affected).toBe(1);
    const [sql, params] = conn.query.mock.calls[0];
    expect(sql).toContain("nome = ?");
    expect(sql).toContain("descricao = ?");
    expect(params).toEqual(["Novo Nome", "Nova desc", 7]);
  });

  test("atualiza apenas nome quando descricao não fornecida", async () => {
    const conn = makeMockConn();
    conn.query.mockResolvedValueOnce([{ affectedRows: 1 }]);

    await repo.updateRoleFields(conn, 7, { nome: "Só Nome" });

    const [sql, params] = conn.query.mock.calls[0];
    expect(sql).not.toContain("descricao");
    expect(params).toEqual(["Só Nome", 7]);
  });

  test("retorna 0 sem consultar banco quando nenhum campo fornecido", async () => {
    const conn = makeMockConn();
    const result = await repo.updateRoleFields(conn, 7, {});
    expect(result).toBe(0);
    expect(conn.query).not.toHaveBeenCalled();
  });

  test("descricao null quando explicitamente null", async () => {
    const conn = makeMockConn();
    conn.query.mockResolvedValueOnce([{ affectedRows: 1 }]);

    await repo.updateRoleFields(conn, 7, { descricao: null });

    const [, params] = conn.query.mock.calls[0];
    expect(params[0]).toBeNull(); // descricao
    expect(params[1]).toBe(7);   // id
  });
});

// ---------------------------------------------------------------------------
// deleteRolePermissions (transactional)
// ---------------------------------------------------------------------------

describe("rolesRepository — deleteRolePermissions", () => {
  test("DELETE FROM admin_role_permissions WHERE role_id = ?", async () => {
    const conn = makeMockConn();
    conn.query.mockResolvedValueOnce([{ affectedRows: 2 }]);

    await repo.deleteRolePermissions(conn, 4);

    const [sql, params] = conn.query.mock.calls[0];
    expect(sql).toContain("DELETE FROM admin_role_permissions");
    expect(sql).toContain("role_id = ?");
    expect(params).toEqual([4]);
  });
});

// ---------------------------------------------------------------------------
// resolvePermissionsByChave (transactional)
// ---------------------------------------------------------------------------

describe("rolesRepository — resolvePermissionsByChave", () => {
  test("retorna Map<chave, id> para as chaves encontradas", async () => {
    const conn = makeMockConn();
    conn.query.mockResolvedValueOnce([
      [{ id: 10, chave: "roles_manage" }, { id: 11, chave: "users_view" }],
    ]);

    const map = await repo.resolvePermissionsByChave(conn, ["roles_manage", "users_view"]);

    expect(map.get("roles_manage")).toBe(10);
    expect(map.get("users_view")).toBe(11);

    const [sql, params] = conn.query.mock.calls[0];
    expect(sql).toContain("WHERE chave IN (?)");
    expect(params).toEqual([["roles_manage", "users_view"]]);
  });

  test("retorna Map vazio sem consultar banco quando chaves é array vazio", async () => {
    const conn = makeMockConn();
    const map = await repo.resolvePermissionsByChave(conn, []);
    expect(map.size).toBe(0);
    expect(conn.query).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// insertRolePermissions (transactional)
// ---------------------------------------------------------------------------

describe("rolesRepository — insertRolePermissions", () => {
  test("bulk INSERT com (role_id, permission_id) pairs", async () => {
    const conn = makeMockConn();
    conn.query.mockResolvedValueOnce([{ affectedRows: 2 }]);

    await repo.insertRolePermissions(conn, 5, [10, 11]);

    const [sql, params] = conn.query.mock.calls[0];
    expect(sql).toContain("INSERT INTO admin_role_permissions");
    expect(params).toEqual([[[5, 10], [5, 11]]]);
  });

  test("não consulta banco quando permIds vazio", async () => {
    const conn = makeMockConn();
    await repo.insertRolePermissions(conn, 5, []);
    expect(conn.query).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// findRoleForDelete (transactional)
// ---------------------------------------------------------------------------

describe("rolesRepository — findRoleForDelete", () => {
  test("retorna { id, is_system } quando role existe", async () => {
    const conn = makeMockConn();
    conn.query.mockResolvedValueOnce([[{ id: 3, is_system: 0 }]]);

    const result = await repo.findRoleForDelete(conn, 3);

    expect(result).toEqual({ id: 3, is_system: 0 });
    const [sql, params] = conn.query.mock.calls[0];
    expect(sql).toContain("WHERE id = ?");
    expect(params).toEqual([3]);
  });

  test("retorna null quando não encontrado", async () => {
    const conn = makeMockConn();
    conn.query.mockResolvedValueOnce([[]]);
    expect(await repo.findRoleForDelete(conn, 999)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// deleteRole (transactional)
// ---------------------------------------------------------------------------

describe("rolesRepository — deleteRole", () => {
  test("DELETE FROM admin_roles WHERE id = ? e retorna affectedRows", async () => {
    const conn = makeMockConn();
    conn.query.mockResolvedValueOnce([{ affectedRows: 1 }]);

    const affected = await repo.deleteRole(conn, 4);

    expect(affected).toBe(1);
    const [sql, params] = conn.query.mock.calls[0];
    expect(sql).toContain("DELETE FROM admin_roles");
    expect(params).toEqual([4]);
  });
});
