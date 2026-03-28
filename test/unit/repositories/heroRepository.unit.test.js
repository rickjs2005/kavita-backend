/**
 * test/unit/repositories/heroRepository.unit.test.js
 *
 * Repositório simples de site_hero_settings.
 *
 * O que está sendo testado:
 *   - findHeroId: retorna id ou null
 *   - insertDefaultHeroRow: retorna insertId com valores default
 *   - findHeroSettings: retorna row ou null
 *   - updateHeroSettings: passa fields como objeto (sintaxe SET ?)
 */

"use strict";

jest.mock("../../../config/pool");

const pool = require("../../../config/pool");
const repo = require("../../../repositories/heroRepository");

function mockQuery(returnValue) {
  pool.query.mockResolvedValueOnce(returnValue);
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("heroRepository — findHeroId", () => {
  test("retorna id quando row existe", async () => {
    mockQuery([[{ id: 1 }]]);
    const result = await repo.findHeroId();
    expect(result).toBe(1);
  });

  test("retorna null quando tabela vazia", async () => {
    mockQuery([[]]);
    const result = await repo.findHeroId();
    expect(result).toBeNull();
  });
});

describe("heroRepository — insertDefaultHeroRow", () => {
  test("retorna insertId e insere valores default", async () => {
    mockQuery([{ insertId: 3 }]);
    const result = await repo.insertDefaultHeroRow();
    expect(result).toBe(3);
    const [sql, params] = pool.query.mock.calls[0];
    expect(sql.toLowerCase()).toContain("insert into site_hero_settings");
    // Valores default esperados pelo contrato da função
    expect(params[0]).toBe("Saiba Mais");
    expect(params[1]).toBe("/drones");
  });
});

describe("heroRepository — findHeroSettings", () => {
  test("retorna configurações quando existem", async () => {
    const row = { title: "Kavita", hero_video_url: null };
    mockQuery([[row]]);

    const result = await repo.findHeroSettings();

    expect(result).toEqual(row);
    const [sql] = pool.query.mock.calls[0];
    expect(sql.toLowerCase()).toContain("from site_hero_settings");
  });

  test("retorna null quando não há configuração", async () => {
    mockQuery([[]]);
    const result = await repo.findHeroSettings();
    expect(result).toBeNull();
  });
});

describe("heroRepository — updateHeroSettings", () => {
  test("passa fields como objeto e id nessa ordem", async () => {
    mockQuery([{ affectedRows: 1 }]);
    const fields = { title: "Novo Título", hero_video_url: "/video.mp4" };

    await repo.updateHeroSettings(1, fields);

    const [sql, params] = pool.query.mock.calls[0];
    expect(sql.toLowerCase()).toContain("update site_hero_settings set ?");
    expect(params[0]).toEqual(fields);
    expect(params[1]).toBe(1);
  });
});
