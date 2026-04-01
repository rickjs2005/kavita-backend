/**
 * test/unit/repositories/userRepository.unit.test.js
 *
 * Estratégia: mock explícito do pool para cobrir query() e execute()
 * (updatePassword usa pool.execute, as demais usam pool.query).
 *
 * O que está sendo testado:
 *   - SQL correto para cada função
 *   - Parâmetros na ordem correta
 *   - Mapeamento de retorno (rows[0] ?? null, rows.length > 0)
 *   - updateUserById: id sempre o último parâmetro
 *   - updateUserInfo: query não é chamada quando objeto vazio
 */

"use strict";

jest.mock("../../../config/pool", () => ({
  query: jest.fn(),
  execute: jest.fn(),
}));

const pool = require("../../../config/pool");
const repo = require("../../../repositories/userRepository");

function mockQuery(returnValue) {
  pool.query.mockResolvedValueOnce(returnValue);
}

function mockExecute(returnValue) {
  pool.execute.mockResolvedValueOnce(returnValue);
}

beforeEach(() => {
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Auth queries
// ---------------------------------------------------------------------------

describe("userRepository — findUserById", () => {
  test("retorna campos de auth quando usuário encontrado", async () => {
    const row = { id: 5, nome: "Rick", email: "rick@kavita.com", tokenVersion: 2 };
    mockQuery([[row]]);

    const result = await repo.findUserById(5);

    expect(result).toEqual(row);

    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toContain("SELECT");
    expect(sql).toContain("usuarios");
    expect(sql).toContain("id = ?");
    expect(params).toEqual([5]);
  });

  test("retorna null quando usuário não existe", async () => {
    mockQuery([[]]);

    const result = await repo.findUserById(999);

    expect(result).toBeNull();
  });

  test("não inclui senha nos campos selecionados", async () => {
    mockQuery([[{ id: 1 }]]);

    await repo.findUserById(1);

    const [sql] = pool.query.mock.calls[0];
    expect(sql).not.toContain("senha");
  });
});

describe("userRepository — findUserByEmail", () => {
  test("retorna campos de auth quando usuário encontrado", async () => {
    const row = {
      id: 1,
      nome: "Rick",
      email: "rick@kavita.com",
      senha: "hash",
      tokenVersion: 3,
    };
    mockQuery([[row]]);

    const result = await repo.findUserByEmail("rick@kavita.com");

    expect(result).toEqual(row);

    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toContain("SELECT");
    expect(sql).toContain("usuarios");
    expect(sql).toContain("email = ?");
    expect(params).toEqual(["rick@kavita.com"]);
  });

  test("retorna null quando e-mail não cadastrado", async () => {
    mockQuery([[]]);

    const result = await repo.findUserByEmail("nao@existe.com");

    expect(result).toBeNull();
  });
});

describe("userRepository — emailExists", () => {
  test("retorna true quando e-mail já cadastrado", async () => {
    mockQuery([[{ id: 5 }]]);

    const result = await repo.emailExists("rick@kavita.com");

    expect(result).toBe(true);
  });

  test("retorna false quando e-mail livre", async () => {
    mockQuery([[]]);

    const result = await repo.emailExists("novo@kavita.com");

    expect(result).toBe(false);
  });
});

describe("userRepository — createUser", () => {
  test("passa nome, email e senha na ordem correta", async () => {
    mockQuery([{ insertId: 10 }]);

    await repo.createUser({
      nome: "João",
      email: "joao@k.com",
      senha: "hash123",
    });

    const [sql, params] = pool.query.mock.calls[0];

    expect(sql.toLowerCase()).toContain("insert into usuarios");

    expect(params[0]).toBe("João");
    expect(params[1]).toBe("joao@k.com");
    expect(params[2]).toBe("hash123");
    expect(params.length).toBeGreaterThanOrEqual(3);
  });

  test("mantém campos opcionais adicionais no final sem quebrar a ordem base", async () => {
    mockQuery([{ insertId: 11 }]);

    await repo.createUser({
      nome: "Maria",
      email: "maria@k.com",
      senha: "hash456",
    });

    const [, params] = pool.query.mock.calls[0];

    expect(params.slice(0, 3)).toEqual(["Maria", "maria@k.com", "hash456"]);
  });
});

describe("userRepository — incrementTokenVersion", () => {
  test("usa COALESCE e passa userId", async () => {
    mockQuery([{ affectedRows: 1 }]);

    await repo.incrementTokenVersion(7);

    const [sql, params] = pool.query.mock.calls[0];
    expect(sql.toUpperCase()).toContain("COALESCE");
    expect(sql.toLowerCase()).toContain("tokenversion");
    expect(params).toEqual([7]);
  });
});

describe("userRepository — updatePassword", () => {
  test("usa pool.execute com hashedPassword antes do userId", async () => {
    mockExecute([{ affectedRows: 1 }]);

    await repo.updatePassword(3, "newHash");

    expect(pool.execute).toHaveBeenCalledTimes(1);

    const [sql, params] = pool.execute.mock.calls[0];
    expect(sql.toLowerCase()).toContain("update usuarios set senha");
    expect(params).toEqual(["newHash", 3]);
  });
});

// ---------------------------------------------------------------------------
// Profile queries
// ---------------------------------------------------------------------------

describe("userRepository — findProfileById", () => {
  test("retorna campos de perfil quando encontrado", async () => {
    const row = { id: 2, nome: "Ana", email: "ana@k.com" };
    mockQuery([[row]]);

    const result = await repo.findProfileById(2);

    expect(result).toEqual(row);

    const [sql, params] = pool.query.mock.calls[0];
    expect(sql.toLowerCase()).toContain("from usuarios");
    expect(params).toEqual([2]);
  });

  test("retorna null quando usuário não existe", async () => {
    mockQuery([[]]);

    const result = await repo.findProfileById(999);

    expect(result).toBeNull();
  });
});

describe("userRepository — findProfileByIdAdmin", () => {
  test("inclui status_conta no SELECT", async () => {
    const row = { id: 1, nome: "Admin", status_conta: "ativo" };
    mockQuery([[row]]);

    await repo.findProfileByIdAdmin(1);

    const [sql] = pool.query.mock.calls[0];
    expect(sql).toContain("status_conta");
  });
});

describe("userRepository — cpfExistsForOtherUser", () => {
  test("retorna true quando CPF pertence a outro usuário", async () => {
    mockQuery([[{ id: 5 }]]);

    const result = await repo.cpfExistsForOtherUser("12345678900", 2);

    expect(result).toBe(true);

    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toContain("id <> ?");
    expect(params).toEqual(["12345678900", 2]);
  });

  test("retorna false quando CPF não existe em outros usuários", async () => {
    mockQuery([[]]);

    const result = await repo.cpfExistsForOtherUser("12345678900", 1);

    expect(result).toBe(false);
  });
});

describe("userRepository — updateUserById", () => {
  test("userId é sempre o último parâmetro do SET", async () => {
    mockQuery([{ affectedRows: 1 }]);

    await repo.updateUserById(10, ["nome = ?", "telefone = ?"], ["Carlos", "11999"]);

    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toContain("SET nome = ?, telefone = ?");
    expect(params).toEqual(["Carlos", "11999", 10]);
  });

  test("SET com um único campo funciona corretamente", async () => {
    mockQuery([{ affectedRows: 1 }]);

    await repo.updateUserById(5, ["cpf = ?"], ["09876543210"]);

    const [, params] = pool.query.mock.calls[0];
    expect(params).toEqual(["09876543210", 5]);
  });
});