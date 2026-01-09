/**
 * teste/integration/controllers/checkout.int.test.js
 *
 * Integração HTTP via Supertest:
 * - Express app mínimo com makeTestApp
 * - Router isolado chamando controller real
 * - Mocks: pool + comunicacaoService
 * - Mock de conn.query por SQL (não por ordem)
 */

const request = require("supertest");
const express = require("express");
const { makeTestApp } = require("../../testUtils");

describe("POST /api/checkout (integration)", () => {
  function authAsUser(user = { id: 10, role: "user" }) {
    return (req, res, next) => {
      req.user = user;
      next();
    };
  }

  function authAsGuest() {
    return (req, res, next) => next();
  }

  function normalizeSql(sql) {
    return String(sql || "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  }

  function buildConn() {
    return {
      beginTransaction: jest.fn().mockResolvedValue(undefined),
      query: jest.fn(),
      commit: jest.fn().mockResolvedValue(undefined),
      rollback: jest.fn().mockResolvedValue(undefined),
      release: jest.fn().mockResolvedValue(undefined),
    };
  }

  function makeQueryRouter(handlers) {
    return async (sql, params) => {
      const s = normalizeSql(sql);

      for (const h of handlers) {
        if (h.match(s, params)) {
          return h.reply(s, params);
        }
      }

      throw new Error(`Query não mockada: ${String(sql)}`);
    };
  }

  function makeRouter(controllerCreate, authMw) {
    const router = express.Router();
    router.post("/checkout", authMw, controllerCreate);
    return router;
  }

  function loadControllerWithMocks(mockPool, mockDisparar) {
    jest.resetModules();

    // Paths corretos a partir de teste/integration/controllers
    jest.doMock("../../../config/pool", () => mockPool);
    jest.doMock("../../../services/comunicacaoService", () => ({
      dispararEventoComunicacao: mockDisparar,
    }));

    // eslint-disable-next-line global-require
    return require("../../../controllers/checkoutController");
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("401: visitante sem login", async () => {
    const conn = buildConn();
    const mockPool = {
      query: jest.fn(),
      getConnection: jest.fn().mockResolvedValue(conn),
    };
    const mockDisparar = jest.fn();

    const controller = loadControllerWithMocks(mockPool, mockDisparar);

    const router = makeRouter(controller.create, authAsGuest());
    const app = makeTestApp("/api", router);

    const resp = await request(app).post("/api/checkout").send({
      formaPagamento: "pix",
      produtos: [{ id: 1, quantidade: 1 }],
      endereco: { cep: "00000-000" },
    });

    expect(resp.status).toBe(401);
    expect(resp.body).toMatchObject({
      code: expect.any(String),
      message: expect.stringMatching(/logado/i),
    });

    expect(mockPool.getConnection).not.toHaveBeenCalled();
  });

  test("400: formaPagamento inválida (contrato de erro JSON)", async () => {
    const conn = buildConn();
    const mockPool = {
      query: jest.fn(),
      getConnection: jest.fn().mockResolvedValue(conn),
    };
    const mockDisparar = jest.fn();

    const controller = loadControllerWithMocks(mockPool, mockDisparar);

    const router = makeRouter(controller.create, authAsUser({ id: 10 }));
    const app = makeTestApp("/api", router);

    const resp = await request(app).post("/api/checkout").send({
      formaPagamento: "dinheiro",
      produtos: [{ id: 1, quantidade: 1 }],
      endereco: { cep: "00000-000" },
    });

    expect(resp.status).toBe(400);
    expect(resp.body).toMatchObject({
      code: expect.any(String),
      message: expect.stringMatching(/Forma de pagamento inválida/i),
    });

    expect(mockPool.getConnection).not.toHaveBeenCalled();
  });

  test("201: sucesso HTTP retorna contrato completo", async () => {
    const conn = buildConn();
    const mockPool = {
      query: jest.fn().mockResolvedValue([[], {}]), // fecha carrinho fora transação
      getConnection: jest.fn().mockResolvedValue(conn),
    };
    const mockDisparar = jest.fn().mockResolvedValue(undefined);

    const controller = loadControllerWithMocks(mockPool, mockDisparar);

    const pedidoId = 222;

    conn.query.mockImplementation(
      makeQueryRouter([
        {
          match: (s) =>
            s.includes("select id") &&
            s.includes("from carrinhos") &&
            s.includes('status = "aberto"'),
          reply: async () => [[], {}],
        },
        {
          match: (s) => s.startsWith("insert into pedidos"),
          reply: async () => [{ insertId: pedidoId }, {}],
        },
        {
          match: (s) =>
            s.includes("select id, price, quantity from products") &&
            s.includes("for update"),
          reply: async () => [[{ id: 1, price: 10, quantity: 5 }], {}],
        },
        {
          match: (s) => s.startsWith("insert into pedidos_produtos"),
          reply: async () => [[], {}],
        },
        {
          match: (s) =>
            s.startsWith("update products set quantity = quantity -"),
          reply: async () => [[], {}],
        },
        {
          match: (s) => s.startsWith("update pedidos set total"),
          reply: async () => [[], {}],
        },
      ])
    );

    const router = makeRouter(controller.create, authAsUser({ id: 10 }));
    const app = makeTestApp("/api", router);

    const resp = await request(app).post("/api/checkout").send({
      formaPagamento: "Pix",
      endereco: { cep: "00000-000", rua: "A", numero: "10" },
      produtos: [{ id: 1, quantidade: 2 }], // total 20
      nome: "Rick",
    });

    expect(resp.status).toBe(201);
    expect(resp.body).toMatchObject({
      success: true,
      pedido_id: pedidoId,
      total: 20,
      total_sem_desconto: 20,
      desconto_total: 0,
      cupom_aplicado: null,
    });

    expect(conn.beginTransaction).toHaveBeenCalledTimes(1);
    expect(conn.commit).toHaveBeenCalledTimes(1);
    expect(conn.rollback).not.toHaveBeenCalled();
    expect(conn.release).toHaveBeenCalledTimes(1);

    expect(mockDisparar).toHaveBeenCalledWith("pedido_criado", pedidoId);

    expect(mockPool.query).toHaveBeenCalledTimes(1);
    expect(String(mockPool.query.mock.calls[0][0])).toMatch(
      /UPDATE carrinhos SET status = "convertido"/
    );
  });

  test("400: estoque insuficiente (HTTP) deve retornar erro e acionar rollback", async () => {
    const conn = buildConn();
    const mockPool = {
      query: jest.fn(),
      getConnection: jest.fn().mockResolvedValue(conn),
    };
    const mockDisparar = jest.fn();

    const controller = loadControllerWithMocks(mockPool, mockDisparar);

    const pedidoId = 333;

    conn.query.mockImplementation(
      makeQueryRouter([
        {
          match: (s) =>
            s.includes("select id") &&
            s.includes("from carrinhos") &&
            s.includes('status = "aberto"'),
          reply: async () => [[], {}],
        },
        {
          match: (s) => s.startsWith("insert into pedidos"),
          reply: async () => [{ insertId: pedidoId }, {}],
        },
        {
          match: (s) =>
            s.includes("select id, price, quantity from products") &&
            s.includes("for update"),
          reply: async () => [[{ id: 9, price: 10, quantity: 1 }], {}],
        },
      ])
    );

    const router = makeRouter(controller.create, authAsUser({ id: 10 }));
    const app = makeTestApp("/api", router);

    const resp = await request(app).post("/api/checkout").send({
      formaPagamento: "pix",
      endereco: { cep: "00000-000" },
      produtos: [{ id: 9, quantidade: 2 }],
    });

    expect(resp.status).toBe(400);
    expect(resp.body).toMatchObject({
      code: expect.any(String),
      message: expect.stringMatching(/Estoque insuficiente/i),
    });

    expect(conn.rollback).toHaveBeenCalledTimes(1);
    expect(conn.commit).not.toHaveBeenCalled();
    expect(mockDisparar).not.toHaveBeenCalled();
  });

  test("500: erro inesperado de DB (HTTP) retorna SERVER_ERROR padronizado", async () => {
    const conn = buildConn();
    const mockPool = {
      query: jest.fn(),
      getConnection: jest.fn().mockResolvedValue(conn),
    };
    const mockDisparar = jest.fn();

    const controller = loadControllerWithMocks(mockPool, mockDisparar);

    conn.query.mockRejectedValueOnce(new Error("DB down"));

    const router = makeRouter(controller.create, authAsUser({ id: 10 }));
    const app = makeTestApp("/api", router);

    const resp = await request(app).post("/api/checkout").send({
      formaPagamento: "pix",
      endereco: { cep: "00000-000" },
      produtos: [{ id: 1, quantidade: 1 }],
    });

    expect(resp.status).toBe(500);
    expect(resp.body).toMatchObject({
      code: expect.any(String),
      message: expect.stringMatching(/Erro interno ao processar checkout/i),
    });

    expect(conn.rollback).toHaveBeenCalledTimes(1);
  });
});
