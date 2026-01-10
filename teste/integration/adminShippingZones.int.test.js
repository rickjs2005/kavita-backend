// teste/integration/adminShippingZones.int.test.js

const request = require("supertest");
const { makeTestApp, makeMockConn } = require("../testUtils");
const { makeMockPool } = require("../mocks/pool.mock");

describe("Admin Shipping Zones Routes (integration)", () => {
  let pool;
  let router;
  let app;

  // Caminhos absolutos resolvidos (garante que mock bate com o require da rota)
  const poolPath = require.resolve("../../config/pool");
  const appErrorPath = require.resolve("../../errors/AppError");
  const errorCodesPath = require.resolve("../../constants/ErrorCodes");
  const routerPath = require.resolve("../../routes/adminShippingZonesRoutes");

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules(); // essencial: limpa cache para aplicar doMock corretamente

    // Cria instância nova por teste (evita leakage entre casos)
    const mockPool = makeMockPool();

    // Mocka os módulos EXATOS que a rota carrega (pelo path resolvido)
    jest.doMock(poolPath, () => mockPool);

    // Mock do AppError (contrato: message, code, status)
    jest.doMock(appErrorPath, () => {
      return class AppError extends Error {
        constructor(message, code, status) {
          super(message);
          this.name = "AppError";
          this.code = code;
          this.status = status;
        }
      };
    });

    // Mock dos ErrorCodes usados na rota
    jest.doMock(errorCodesPath, () => ({
      VALIDATION_ERROR: "VALIDATION_ERROR",
      SERVER_ERROR: "SERVER_ERROR",
      NOT_FOUND: "NOT_FOUND",
    }));

    // Agora sim: importa router e pool (já mockados)
    router = require(routerPath);
    pool = require(poolPath);

    // Monta app de teste
    app = makeTestApp("/api/admin/shipping", router);
  });

  describe("GET /api/admin/shipping/zones", () => {
    test("retorna [] quando não há zonas", async () => {
      // Arrange
      pool.query.mockResolvedValueOnce([[]]);

      // Act
      const res = await request(app).get("/api/admin/shipping/zones");

      // Assert
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
      expect(pool.query).toHaveBeenCalledTimes(1);
    });

    test("normaliza booleans, price, prazo_dias e cities quando all_cities=false", async () => {
      // Arrange
      const zones = [
        {
          id: 10,
          name: "MG - Zona A",
          state: "MG",
          all_cities: 0,
          is_free: 0,
          price: "19.9",
          prazo_dias: 3,
          is_active: 1,
          created_at: "2026-01-01",
          updated_at: "2026-01-02",
        },
      ];
      const citiesRows = [
        { zone_id: 10, city: "Belo Horizonte" },
        { zone_id: 10, city: "Contagem" },
      ];

      pool.query
        .mockResolvedValueOnce([zones]) // SELECT zones
        .mockResolvedValueOnce([citiesRows]); // SELECT cities

      // Act
      const res = await request(app).get("/api/admin/shipping/zones");

      // Assert
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body).toHaveLength(1);

      const z = res.body[0];
      expect(z.id).toBe(10);
      expect(z.all_cities).toBe(false);
      expect(z.is_free).toBe(false);
      expect(z.is_active).toBe(true);
      expect(z.price).toBe(19.9);
      expect(z.prazo_dias).toBe(3);
      expect(z.cities).toEqual(["Belo Horizonte", "Contagem"]);

      expect(pool.query).toHaveBeenCalledTimes(2);
    });

    test("retorna cities=[] quando all_cities=true", async () => {
      // Arrange
      const zones = [
        {
          id: 1,
          name: "SP - Todas",
          state: "SP",
          all_cities: 1,
          is_free: 1,
          price: "0",
          prazo_dias: null,
          is_active: 1,
          created_at: "2026-01-01",
          updated_at: "2026-01-02",
        },
      ];

      pool.query
        .mockResolvedValueOnce([zones]) // SELECT zones
        .mockResolvedValueOnce([[{ zone_id: 1, city: "SÃO PAULO" }]]); // SELECT cities (não deve ser usado)

      // Act
      const res = await request(app).get("/api/admin/shipping/zones");

      // Assert
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);

      const z = res.body[0];
      expect(z.all_cities).toBe(true);
      expect(z.is_free).toBe(true);
      expect(z.price).toBe(0);
      expect(z.prazo_dias).toBeNull();
      expect(z.cities).toEqual([]);

      expect(pool.query).toHaveBeenCalledTimes(2);
    });

    test("em erro inesperado, responde 500 com SERVER_ERROR", async () => {
      // Arrange
      pool.query.mockRejectedValueOnce(new Error("db down"));

      // Act
      const res = await request(app).get("/api/admin/shipping/zones");

      // Assert
      expect(res.status).toBe(500);
      expect(res.body).toEqual({
        code: "SERVER_ERROR",
        message: "Erro ao listar zonas de frete.",
      });
    });
  });

  describe("POST /api/admin/shipping/zones", () => {
    test("400 se name vazio", async () => {
      // Arrange
      const payload = { name: "   ", state: "MG", all_cities: true, is_free: true };

      // Act
      const res = await request(app).post("/api/admin/shipping/zones").send(payload);

      // Assert
      expect(res.status).toBe(400);
      expect(res.body).toEqual({
        code: "VALIDATION_ERROR",
        message: "Informe um nome para a regra.",
      });
      expect(pool.getConnection).not.toHaveBeenCalled();
    });

    test("400 se UF inválida", async () => {
      // Arrange
      const payload = { name: "Zona", state: "M", all_cities: true, is_free: true };

      // Act
      const res = await request(app).post("/api/admin/shipping/zones").send(payload);

      // Assert
      expect(res.status).toBe(400);
      expect(res.body).toEqual({
        code: "VALIDATION_ERROR",
        message: "Informe o estado (UF) com 2 letras.",
      });
      expect(pool.getConnection).not.toHaveBeenCalled();
    });

    test("400 se não for frete grátis e price inválido (<=0)", async () => {
      // Arrange
      const payload = {
        name: "Zona",
        state: "MG",
        all_cities: true,
        is_free: false,
        price: 0,
      };

      // Act
      const res = await request(app).post("/api/admin/shipping/zones").send(payload);

      // Assert
      expect(res.status).toBe(400);
      expect(res.body).toEqual({
        code: "VALIDATION_ERROR",
        message: "Informe um preço válido (ou marque frete grátis).",
      });
      expect(pool.getConnection).not.toHaveBeenCalled();
    });

    test("400 se prazo_dias inválido (<=0)", async () => {
      // Arrange
      const payload = {
        name: "Zona",
        state: "MG",
        all_cities: true,
        is_free: true,
        prazo_dias: 0,
      };

      // Act
      const res = await request(app).post("/api/admin/shipping/zones").send(payload);

      // Assert
      expect(res.status).toBe(400);
      expect(res.body).toEqual({
        code: "VALIDATION_ERROR",
        message: "Prazo deve ser um número >= 1 ou vazio.",
      });
      expect(pool.getConnection).not.toHaveBeenCalled();
    });

    test("201 cria zona (all_cities=true) e commita transação; price vira 0 quando is_free=true", async () => {
      // Arrange
      const conn = makeMockConn();
      conn.query.mockResolvedValueOnce([{ insertId: 123 }]); // INSERT zones

      pool.getConnection.mockResolvedValueOnce(conn);

      const payload = {
        name: "  Zona SP  ",
        state: "sp",
        all_cities: true,
        is_free: true,
        price: 9999, // vira 0
        prazo_dias: " 7 ",
      };

      // Act
      const res = await request(app).post("/api/admin/shipping/zones").send(payload);

      // Assert
      expect(res.status).toBe(201);
      expect(res.body).toEqual({ success: true, id: 123 });

      expect(conn.beginTransaction).toHaveBeenCalledTimes(1);
      expect(conn.commit).toHaveBeenCalledTimes(1);
      expect(conn.rollback).not.toHaveBeenCalled();
      expect(conn.release).toHaveBeenCalledTimes(1);

      expect(conn.query).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO shipping_zones"),
        ["Zona SP", "SP", 1, 1, 0, 7, 1]
      );
    });

    test("201 cria zona (all_cities=false) e insere cidades únicas e trimadas", async () => {
      // Arrange
      const conn = makeMockConn();
      conn.query
        .mockResolvedValueOnce([{ insertId: 50 }]) // INSERT zones
        .mockResolvedValueOnce([{}]) // city 1
        .mockResolvedValueOnce([{}]); // city 2

      pool.getConnection.mockResolvedValueOnce(conn);

      const payload = {
        name: "Zona MG",
        state: "mg",
        all_cities: false,
        is_free: false,
        price: "15.50",
        is_active: false,
        cities: ["  Belo Horizonte ", "Contagem", "Contagem", "", null, "  "],
      };

      // Act
      const res = await request(app).post("/api/admin/shipping/zones").send(payload);

      // Assert
      expect(res.status).toBe(201);
      expect(res.body).toEqual({ success: true, id: 50 });

      expect(conn.beginTransaction).toHaveBeenCalledTimes(1);
      expect(conn.commit).toHaveBeenCalledTimes(1);
      expect(conn.rollback).not.toHaveBeenCalled();
      expect(conn.release).toHaveBeenCalledTimes(1);

      const cityInsertCalls = conn.query.mock.calls.filter((c) =>
        String(c[0]).includes("INSERT IGNORE INTO shipping_zone_cities")
      );
      expect(cityInsertCalls).toHaveLength(2);
      expect(cityInsertCalls[0][1]).toEqual([50, "Belo Horizonte"]);
      expect(cityInsertCalls[1][1]).toEqual([50, "Contagem"]);
    });

    test("se erro ocorrer dentro da transação, faz rollback e responde 500 SERVER_ERROR", async () => {
      // Arrange
      const conn = makeMockConn();
      conn.query.mockRejectedValueOnce(new Error("insert failed"));
      pool.getConnection.mockResolvedValueOnce(conn);

      const payload = {
        name: "Zona",
        state: "MG",
        all_cities: true,
        is_free: true,
      };

      // Act
      const res = await request(app).post("/api/admin/shipping/zones").send(payload);

      // Assert
      expect(res.status).toBe(500);
      expect(res.body).toEqual({
        code: "SERVER_ERROR",
        message: "Erro ao criar zona de frete.",
      });

      expect(conn.rollback).toHaveBeenCalledTimes(1);
      expect(conn.commit).not.toHaveBeenCalled();
      expect(conn.release).toHaveBeenCalledTimes(1);
    });
  });

  describe("PUT /api/admin/shipping/zones/:id", () => {
    test("400 se ID inválido", async () => {
      // Arrange
      const payload = { name: "Zona", state: "MG", all_cities: true, is_free: true };

      // Act
      const res = await request(app).put("/api/admin/shipping/zones/0").send(payload);

      // Assert
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ code: "VALIDATION_ERROR", message: "ID inválido." });
      expect(pool.getConnection).not.toHaveBeenCalled();
    });

    test("404 se zona não existe (rollback manual dentro do fluxo)", async () => {
      // Arrange
      const conn = makeMockConn();
      conn.query.mockResolvedValueOnce([[]]); // SELECT exists vazio
      pool.getConnection.mockResolvedValueOnce(conn);

      const payload = {
        name: "Zona",
        state: "MG",
        all_cities: true,
        is_free: true,
      };

      // Act
      const res = await request(app).put("/api/admin/shipping/zones/999").send(payload);

      // Assert
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ code: "NOT_FOUND", message: "Zona não encontrada." });

      expect(conn.beginTransaction).toHaveBeenCalledTimes(1);
      // aqui o código faz rollback antes de next(404)
      expect(conn.rollback).toHaveBeenCalledTimes(1);
      expect(conn.commit).not.toHaveBeenCalled();
      expect(conn.release).toHaveBeenCalledTimes(1);
    });

    test("200 atualiza zona, deleta cidades e reinsere quando all_cities=false; price vira 0 se is_free=true; prazo floor", async () => {
      // Arrange
      const conn = makeMockConn();
      conn.query
        .mockResolvedValueOnce([[{ id: 10 }]]) // SELECT exists ok
        .mockResolvedValueOnce([{}]) // UPDATE
        .mockResolvedValueOnce([{}]) // DELETE cities
        .mockResolvedValueOnce([{}]) // INSERT city 1
        .mockResolvedValueOnce([{}]); // INSERT city 2

      pool.getConnection.mockResolvedValueOnce(conn);

      const payload = {
        name: "  Zona SP Edit  ",
        state: "sp",
        all_cities: false,
        is_free: true,
        price: 999, // vira 0
        prazo_dias: 9.9, // floor => 9
        cities: ["São Paulo", " Campinas ", "Campinas"],
      };

      // Act
      const res = await request(app).put("/api/admin/shipping/zones/10").send(payload);

      // Assert
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true });

      expect(conn.beginTransaction).toHaveBeenCalledTimes(1);
      expect(conn.commit).toHaveBeenCalledTimes(1);
      expect(conn.rollback).not.toHaveBeenCalled();
      expect(conn.release).toHaveBeenCalledTimes(1);

      const updateCall = conn.query.mock.calls.find((c) => String(c[0]).includes("UPDATE shipping_zones"));
      expect(updateCall[1]).toEqual(["Zona SP Edit", "SP", 0, 1, 0, 9, 1, 10]);

      expect(conn.query).toHaveBeenCalledWith("DELETE FROM shipping_zone_cities WHERE zone_id=?", [10]);

      const cityInsertCalls = conn.query.mock.calls.filter((c) =>
        String(c[0]).includes("INSERT IGNORE INTO shipping_zone_cities")
      );
      expect(cityInsertCalls).toHaveLength(2);
      expect(cityInsertCalls[0][1]).toEqual([10, "São Paulo"]);
      expect(cityInsertCalls[1][1]).toEqual([10, "Campinas"]);
    });

    test("500 em erro inesperado dentro da transação (rollback + SERVER_ERROR)", async () => {
      // Arrange
      const conn = makeMockConn();
      conn.query
        .mockResolvedValueOnce([[{ id: 10 }]]) // exists ok
        .mockRejectedValueOnce(new Error("update failed")); // UPDATE falha

      pool.getConnection.mockResolvedValueOnce(conn);

      const payload = {
        name: "Zona",
        state: "MG",
        all_cities: true,
        is_free: true,
      };

      // Act
      const res = await request(app).put("/api/admin/shipping/zones/10").send(payload);

      // Assert
      expect(res.status).toBe(500);
      expect(res.body).toEqual({ code: "SERVER_ERROR", message: "Erro ao atualizar zona." });

      expect(conn.rollback).toHaveBeenCalledTimes(1);
      expect(conn.commit).not.toHaveBeenCalled();
      expect(conn.release).toHaveBeenCalledTimes(1);
    });
  });

  describe("DELETE /api/admin/shipping/zones/:id", () => {
    test("400 se ID inválido", async () => {
      // Act
      const res = await request(app).delete("/api/admin/shipping/zones/abc");

      // Assert
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ code: "VALIDATION_ERROR", message: "ID inválido." });
    });

    test("204 remove zona com sucesso", async () => {
      // Arrange
      pool.query.mockResolvedValueOnce([{}]);

      // Act
      const res = await request(app).delete("/api/admin/shipping/zones/10");

      // Assert
      expect(res.status).toBe(204);
      expect(res.text).toBe("");
      expect(pool.query).toHaveBeenCalledWith("DELETE FROM shipping_zones WHERE id=?", [10]);
    });

    test("500 em erro inesperado (SERVER_ERROR)", async () => {
      // Arrange
      pool.query.mockRejectedValueOnce(new Error("db fail"));

      // Act
      const res = await request(app).delete("/api/admin/shipping/zones/10");

      // Assert
      expect(res.status).toBe(500);
      expect(res.body).toEqual({ code: "SERVER_ERROR", message: "Erro ao excluir zona." });
    });
  });
});
