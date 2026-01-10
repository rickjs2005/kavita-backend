/**
 * teste/unit/controllers/checkoutController.unit.test.js
 *
 * Testes UNIT do checkoutController.create
 * - Sem Express/Supertest
 * - Mocka pool.getConnection (transação) e pool.query (fora da transação)
 * - Mocka comunicacaoService
 * - NÃO depende da ordem das queries (mock por SQL), evitando flakiness
 * - Cobre branches de: validações, produto não encontrado, cupom (percentual/fixo/inativo/expirado/limite/mínimo),
 *   catch interno do cupom, falhas não bloqueantes (carrinho abandonado/ comunicação / fechar carrinho),
 *   e cenário onde rollback falha.
 */

describe("checkoutController.create (unit)", () => {
  function makeRes() {
    return {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
  }

  function makeNext() {
    return jest.fn();
  }

  function makeReq(overrides = {}) {
    return {
      body: {},
      user: { id: 10 },
      ...overrides,
    };
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

  function mockModuleOnce(mockPool, mockDisparar) {
    jest.resetModules();

    // Paths corretos a partir de teste/unit/controllers
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

  test("401: sem req.user.id deve chamar next(AppError AUTH_ERROR)", async () => {
    const mockPool = { query: jest.fn(), getConnection: jest.fn() };
    const mockDisparar = jest.fn();

    const { create } = mockModuleOnce(mockPool, mockDisparar);

    const req = makeReq({
      user: undefined,
      body: { formaPagamento: "pix", produtos: [{ id: 1, quantidade: 1 }] },
    });
    const res = makeRes();
    const next = makeNext();

    await create(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0];
    expect(err.status || err.statusCode).toBe(401);
    expect(err.code).toBeTruthy();
    expect(String(err.message || "")).toMatch(/logado/i);

    expect(mockPool.getConnection).not.toHaveBeenCalled();
  });

  test("400: formaPagamento inválida deve chamar next(AppError VALIDATION_ERROR)", async () => {
    const mockPool = { query: jest.fn(), getConnection: jest.fn() };
    const mockDisparar = jest.fn();

    const { create } = mockModuleOnce(mockPool, mockDisparar);

    const req = makeReq({
      body: {
        formaPagamento: "dinheiro",
        produtos: [{ id: 1, quantidade: 1 }],
        endereco: { cep: "12345-000" },
      },
    });
    const res = makeRes();
    const next = makeNext();

    await create(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0];
    expect(err.status || err.statusCode).toBe(400);
    expect(String(err.message || "")).toMatch(/forma de pagamento/i);

    expect(mockPool.getConnection).not.toHaveBeenCalled();
  });

  test("400: produtos vazio/ausente deve chamar next(AppError VALIDATION_ERROR)", async () => {
    const mockPool = { query: jest.fn(), getConnection: jest.fn() };
    const mockDisparar = jest.fn();

    const { create } = mockModuleOnce(mockPool, mockDisparar);

    const req = makeReq({
      body: {
        formaPagamento: "pix",
        produtos: [],
      },
    });
    const res = makeRes();
    const next = makeNext();

    await create(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0];
    expect(err.status || err.statusCode).toBe(400);
    expect(String(err.message || "")).toMatch(/checkout inválidos|inválidos/i);

    expect(mockPool.getConnection).not.toHaveBeenCalled();
  });

  test("201: sucesso básico cria pedido, insere itens, atualiza estoque, commit e responde totals", async () => {
    const conn = buildConn();

    // pool.query fora transação (fechar carrinho)
    const mockPool = {
      query: jest.fn().mockResolvedValue([[], {}]),
      getConnection: jest.fn().mockResolvedValue(conn),
    };

    const mockDisparar = jest.fn().mockResolvedValue(undefined);

    const { create } = mockModuleOnce(mockPool, mockDisparar);

    // Mock por SQL (não por ordem)
    const pedidoId = 123;
    const carrinhoId = 77;

    conn.query.mockImplementation(
      makeQueryRouter([
        { match: (s) => s.startsWith("update usuarios set"), reply: async () => [[], {}] },
        {
          match: (s) =>
            s.includes("select id") &&
            s.includes("from carrinhos") &&
            s.includes('status = "aberto"'),
          reply: async () => [[{ id: carrinhoId }], {}],
        },
        { match: (s) => s.startsWith("insert into pedidos"), reply: async () => [{ insertId: pedidoId }, {}] },
        {
          match: (s) =>
            s.includes("select id, price, quantity from products") && s.includes("for update"),
          reply: async () => [
            [
              { id: 1, price: 10.5, quantity: 5 },
              { id: 2, price: 20, quantity: 10 },
            ],
            {},
          ],
        },
        { match: (s) => s.startsWith("insert into pedidos_produtos"), reply: async () => [[], {}] },
        {
          match: (s) => s.startsWith("update products set quantity = quantity -"),
          reply: async () => [[], {}],
        },
        { match: (s) => s.startsWith("update pedidos set total"), reply: async () => [[], {}] },
        { match: (s) => s.includes("update carrinhos_abandonados"), reply: async () => [[], {}] },
      ])
    );

    const req = makeReq({
      body: {
        formaPagamento: "Pix",
        endereco: { cep: "30110-000", rua: "A", numero: "10" },
        produtos: [
          { id: 1, quantidade: 2 }, // 21
          { id: 2, quantidade: 1 }, // 20
        ],
        // inclui nome para também cobrir o trecho opcional UPDATE usuarios
        nome: "Rick",
      },
    });

    const res = makeRes();
    const next = makeNext();

    await create(req, res, next);

    expect(next).not.toHaveBeenCalled();

    expect(conn.beginTransaction).toHaveBeenCalledTimes(1);
    expect(conn.commit).toHaveBeenCalledTimes(1);
    expect(conn.rollback).not.toHaveBeenCalled();
    expect(conn.release).toHaveBeenCalledTimes(1);

    expect(mockDisparar).toHaveBeenCalledWith("pedido_criado", pedidoId);

    // fechar carrinho fora da transação
    expect(mockPool.query).toHaveBeenCalledTimes(1);
    expect(String(mockPool.query.mock.calls[0][0])).toMatch(/update carrinhos set status/i);

    expect(res.status).toHaveBeenCalledWith(201);
    const payload = res.json.mock.calls[0][0];

    expect(payload).toMatchObject({
      success: true,
      pedido_id: pedidoId,
      cupom_aplicado: null,
    });

    expect(payload.total_sem_desconto).toBeCloseTo(41, 5);
    expect(payload.desconto_total).toBeCloseTo(0, 5);
    expect(payload.total).toBeCloseTo(41, 5);
  });

  test("400: estoque insuficiente deve rollback e next(AppError)", async () => {
    const conn = buildConn();
    const mockPool = { query: jest.fn(), getConnection: jest.fn().mockResolvedValue(conn) };
    const mockDisparar = jest.fn();

    const { create } = mockModuleOnce(mockPool, mockDisparar);

    conn.query.mockImplementation(
      makeQueryRouter([
        {
          match: (s) =>
            s.includes("from carrinhos") && s.includes('status = "aberto"'),
          reply: async () => [[], {}],
        },
        { match: (s) => s.startsWith("insert into pedidos"), reply: async () => [{ insertId: 555 }, {}] },
        {
          match: (s) =>
            s.includes("from products") && s.includes("for update"),
          reply: async () => [[{ id: 9, price: 10, quantity: 1 }], {}],
        },
      ])
    );

    const req = makeReq({
      body: {
        formaPagamento: "pix",
        endereco: { cep: "00000-000" },
        produtos: [{ id: 9, quantidade: 2 }], // > estoque
      },
    });

    const res = makeRes();
    const next = makeNext();

    await create(req, res, next);

    expect(conn.rollback).toHaveBeenCalledTimes(1);
    expect(conn.commit).not.toHaveBeenCalled();
    expect(conn.release).toHaveBeenCalledTimes(1);

    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0];
    expect(err.status || err.statusCode).toBe(400);
    expect(String(err.message || "")).toMatch(/estoque insuficiente/i);

    expect(mockDisparar).not.toHaveBeenCalled();
  });

  test("500: erro inesperado durante query deve rollback e next(AppError SERVER_ERROR)", async () => {
    const conn = buildConn();
    const mockPool = { query: jest.fn(), getConnection: jest.fn().mockResolvedValue(conn) };
    const mockDisparar = jest.fn();

    const { create } = mockModuleOnce(mockPool, mockDisparar);

    conn.query.mockRejectedValueOnce(new Error("DB exploded"));

    const req = makeReq({
      body: {
        formaPagamento: "pix",
        endereco: { cep: "00000-000" },
        produtos: [{ id: 1, quantidade: 1 }],
      },
    });

    const res = makeRes();
    const next = makeNext();

    await create(req, res, next);

    expect(conn.rollback).toHaveBeenCalledTimes(1);
    expect(conn.commit).not.toHaveBeenCalled();
    expect(conn.release).toHaveBeenCalledTimes(1);

    const err = next.mock.calls[0][0];
    expect(err.status || err.statusCode).toBe(500);
    expect(String(err.message || "")).toMatch(/erro interno/i);
  });

  test("201: update usuário (nome/email/telefone/cpf) cobre ramo de normalização e segue checkout", async () => {
    const conn = buildConn();
    const mockPool = { query: jest.fn().mockResolvedValue([[], {}]), getConnection: jest.fn().mockResolvedValue(conn) };
    const mockDisparar = jest.fn().mockResolvedValue(undefined);

    const { create } = mockModuleOnce(mockPool, mockDisparar);

    conn.query.mockImplementation(
      makeQueryRouter([
        { match: (s) => s.startsWith("update usuarios set"), reply: async () => [[], {}] },
        { match: (s) => s.includes("from carrinhos") && s.includes('status = "aberto"'), reply: async () => [[], {}] },
        { match: (s) => s.startsWith("insert into pedidos"), reply: async () => [{ insertId: 1001 }, {}] },
        { match: (s) => s.includes("from products") && s.includes("for update"), reply: async () => [[{ id: 1, price: 10, quantity: 10 }], {}] },
        { match: (s) => s.startsWith("insert into pedidos_produtos"), reply: async () => [[], {}] },
        { match: (s) => s.startsWith("update products set quantity = quantity -"), reply: async () => [[], {}] },
        { match: (s) => s.startsWith("update pedidos set total"), reply: async () => [[], {}] },
      ])
    );

    const req = makeReq({
      body: {
        formaPagamento: "pix",
        endereco: { cep: "00000-000" },
        produtos: [{ id: 1, quantidade: 1 }],
        nome: "  Rick  ",
        email: "  rick@email.com ",
        telefone: "(31) 99999-8888",
        cpf: "123.456.789-09",
      },
    });

    const res = makeRes();
    const next = makeNext();

    await create(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(201);

    // garante que executou update usuarios
    const sqls = conn.query.mock.calls.map((c) => String(c[0]).toLowerCase());
    expect(sqls.some((s) => s.startsWith("update usuarios set"))).toBe(true);
  });

  test("400: item inválido (quantidade <= 0) deve falhar com VALIDATION_ERROR", async () => {
    const conn = buildConn();
    const mockPool = { query: jest.fn(), getConnection: jest.fn().mockResolvedValue(conn) };
    const mockDisparar = jest.fn();

    const { create } = mockModuleOnce(mockPool, mockDisparar);

    conn.query.mockImplementation(
      makeQueryRouter([
        { match: (s) => s.includes("from carrinhos") && s.includes('status = "aberto"'), reply: async () => [[], {}] },
        { match: (s) => s.startsWith("insert into pedidos"), reply: async () => [{ insertId: 2001 }, {}] },
        { match: (s) => s.includes("from products") && s.includes("for update"), reply: async () => [[{ id: 1, price: 10, quantity: 10 }], {}] },
      ])
    );

    const req = makeReq({
      body: {
        formaPagamento: "pix",
        endereco: { cep: "00000-000" },
        produtos: [{ id: 1, quantidade: 0 }],
      },
    });

    const res = makeRes();
    const next = makeNext();

    await create(req, res, next);

    expect(conn.rollback).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0];
    expect(err.status || err.statusCode).toBe(400);
    expect(String(err.message || "")).toMatch(/produto inválido|inválido/i);
  });

  test("404/400: produto não encontrado no SELECT FOR UPDATE deve falhar (contrato de erro)", async () => {
    const conn = buildConn();
    const mockPool = { query: jest.fn(), getConnection: jest.fn().mockResolvedValue(conn) };
    const mockDisparar = jest.fn();

    const { create } = mockModuleOnce(mockPool, mockDisparar);

    conn.query.mockImplementation(
      makeQueryRouter([
        { match: (s) => s.includes("from carrinhos") && s.includes('status = "aberto"'), reply: async () => [[], {}] },
        { match: (s) => s.startsWith("insert into pedidos"), reply: async () => [{ insertId: 3001 }, {}] },
        { match: (s) => s.includes("from products") && s.includes("for update"), reply: async () => [[/* vazio */], {}] },
      ])
    );

    const req = makeReq({
      body: {
        formaPagamento: "pix",
        endereco: { cep: "00000-000" },
        produtos: [{ id: 999, quantidade: 1 }],
      },
    });

    const res = makeRes();
    const next = makeNext();

    await create(req, res, next);

    expect(conn.rollback).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0];
    // Alguns projetos usam 404, outros 400. Mantemos flexível e estável.
    expect([400, 404]).toContain(err.status || err.statusCode);
    expect(String(err.message || "")).toMatch(/produto/i);
  });

  test("201: cupom percentual aplica desconto, incrementa usos e retorna cupom_aplicado", async () => {
    const conn = buildConn();
    const mockPool = { query: jest.fn().mockResolvedValue([[], {}]), getConnection: jest.fn().mockResolvedValue(conn) };
    const mockDisparar = jest.fn().mockResolvedValue(undefined);

    const { create } = mockModuleOnce(mockPool, mockDisparar);

    conn.query.mockImplementation(
      makeQueryRouter([
        { match: (s) => s.includes("from carrinhos") && s.includes('status = "aberto"'), reply: async () => [[], {}] },
        { match: (s) => s.startsWith("insert into pedidos"), reply: async () => [{ insertId: 900 }, {}] },
        { match: (s) => s.includes("from products") && s.includes("for update"), reply: async () => [[{ id: 1, price: 100, quantity: 10 }], {}] },
        { match: (s) => s.startsWith("insert into pedidos_produtos"), reply: async () => [[], {}] },
        { match: (s) => s.startsWith("update products set quantity = quantity -"), reply: async () => [[], {}] },
        {
          match: (s) => s.includes("from cupons") && s.includes("where codigo =") && s.includes("for update"),
          reply: async () => [
            [
              {
                id: 50,
                codigo: "OFF10",
                tipo: "percentual",
                valor: 10,
                minimo: 0,
                expiracao: null,
                usos: 1,
                max_usos: 10,
                ativo: 1,
              },
            ],
            {},
          ],
        },
        { match: (s) => s.startsWith("update cupons set usos = usos + 1"), reply: async () => [[], {}] },
        { match: (s) => s.startsWith("update pedidos set total"), reply: async () => [[], {}] },
      ])
    );

    const req = makeReq({
      body: {
        formaPagamento: "pix",
        endereco: { cep: "00000-000" },
        produtos: [{ id: 1, quantidade: 1 }], // 100
        cupom_codigo: "OFF10",
      },
    });

    const res = makeRes();
    const next = makeNext();

    await create(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(201);

    const payload = res.json.mock.calls[0][0];
    expect(payload.total_sem_desconto).toBeCloseTo(100, 5);
    expect(payload.desconto_total).toBeCloseTo(10, 5);
    expect(payload.total).toBeCloseTo(90, 5);

    expect(payload.cupom_aplicado).toMatchObject({
      id: 50,
      codigo: "OFF10",
      tipo: "percentual",
      valor: 10,
    });
  });

  test("201: cupom FIXO aplica desconto (branch tipo != percentual) e retorna cupom_aplicado", async () => {
    const conn = buildConn();
    const mockPool = { query: jest.fn().mockResolvedValue([[], {}]), getConnection: jest.fn().mockResolvedValue(conn) };
    const mockDisparar = jest.fn().mockResolvedValue(undefined);
    const { create } = mockModuleOnce(mockPool, mockDisparar);

    conn.query.mockImplementation(
      makeQueryRouter([
        { match: (s) => s.includes("from carrinhos") && s.includes('status = "aberto"'), reply: async () => [[], {}] },
        { match: (s) => s.startsWith("insert into pedidos"), reply: async () => [{ insertId: 910 }, {}] },
        { match: (s) => s.includes("from products") && s.includes("for update"), reply: async () => [[{ id: 1, price: 80, quantity: 10 }], {}] },
        { match: (s) => s.startsWith("insert into pedidos_produtos"), reply: async () => [[], {}] },
        { match: (s) => s.startsWith("update products set quantity = quantity -"), reply: async () => [[], {}] },
        {
          match: (s) => s.includes("from cupons") && s.includes("where codigo =") && s.includes("for update"),
          reply: async () => [
            [
              {
                id: 51,
                codigo: "OFF15",
                tipo: "fixo",
                valor: 15,
                minimo: 0,
                expiracao: null,
                usos: 0,
                max_usos: 10,
                ativo: 1,
              },
            ],
            {},
          ],
        },
        { match: (s) => s.startsWith("update cupons set usos = usos + 1"), reply: async () => [[], {}] },
        { match: (s) => s.startsWith("update pedidos set total"), reply: async () => [[], {}] },
      ])
    );

    const req = makeReq({
      body: {
        formaPagamento: "pix",
        endereco: { cep: "00000-000" },
        produtos: [{ id: 1, quantidade: 1 }], // 80
        cupom_codigo: "OFF15",
      },
    });

    const res = makeRes();
    const next = makeNext();

    await create(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(201);

    const payload = res.json.mock.calls[0][0];
    expect(payload.total_sem_desconto).toBeCloseTo(80, 5);
    expect(payload.desconto_total).toBeCloseTo(15, 5);
    expect(payload.total).toBeCloseTo(65, 5);

    expect(payload.cupom_aplicado).toMatchObject({
      id: 51,
      codigo: "OFF15",
      tipo: "fixo",
      valor: 15,
    });
  });

  test("400: cupom inválido (não encontrado) deve rollback e next(AppError)", async () => {
    const conn = buildConn();
    const mockPool = { query: jest.fn(), getConnection: jest.fn().mockResolvedValue(conn) };
    const mockDisparar = jest.fn();
    const { create } = mockModuleOnce(mockPool, mockDisparar);

    conn.query.mockImplementation(
      makeQueryRouter([
        { match: (s) => s.includes("from carrinhos") && s.includes('status = "aberto"'), reply: async () => [[], {}] },
        { match: (s) => s.startsWith("insert into pedidos"), reply: async () => [{ insertId: 901 }, {}] },
        { match: (s) => s.includes("from products") && s.includes("for update"), reply: async () => [[{ id: 1, price: 100, quantity: 10 }], {}] },
        { match: (s) => s.startsWith("insert into pedidos_produtos"), reply: async () => [[], {}] },
        { match: (s) => s.startsWith("update products set quantity = quantity -"), reply: async () => [[], {}] },
        {
          match: (s) => s.includes("from cupons") && s.includes("where codigo =") && s.includes("for update"),
          reply: async () => [[], {}],
        },
      ])
    );

    const req = makeReq({
      body: {
        formaPagamento: "pix",
        endereco: { cep: "00000-000" },
        produtos: [{ id: 1, quantidade: 1 }],
        cupom_codigo: "INVALIDO",
      },
    });

    const res = makeRes();
    const next = makeNext();

    await create(req, res, next);

    expect(conn.rollback).toHaveBeenCalledTimes(1);

    const err = next.mock.calls[0][0];
    expect(err.status || err.statusCode).toBe(400);
    expect(String(err.message || "")).toMatch(/cupom/i);
  });

  test("400: cupom inativo deve rollback e next(AppError)", async () => {
    const conn = buildConn();
    const mockPool = { query: jest.fn(), getConnection: jest.fn().mockResolvedValue(conn) };
    const mockDisparar = jest.fn();
    const { create } = mockModuleOnce(mockPool, mockDisparar);

    conn.query.mockImplementation(
      makeQueryRouter([
        { match: (s) => s.includes("from carrinhos") && s.includes('status = "aberto"'), reply: async () => [[], {}] },
        { match: (s) => s.startsWith("insert into pedidos"), reply: async () => [{ insertId: 920 }, {}] },
        { match: (s) => s.includes("from products") && s.includes("for update"), reply: async () => [[{ id: 1, price: 100, quantity: 10 }], {}] },
        { match: (s) => s.startsWith("insert into pedidos_produtos"), reply: async () => [[], {}] },
        { match: (s) => s.startsWith("update products set quantity = quantity -"), reply: async () => [[], {}] },
        {
          match: (s) => s.includes("from cupons") && s.includes("where codigo =") && s.includes("for update"),
          reply: async () => [
            [
              { id: 60, codigo: "OFF", tipo: "percentual", valor: 10, minimo: 0, expiracao: null, usos: 0, max_usos: 10, ativo: 0 },
            ],
            {},
          ],
        },
      ])
    );

    const req = makeReq({
      body: {
        formaPagamento: "pix",
        endereco: { cep: "00000-000" },
        produtos: [{ id: 1, quantidade: 1 }],
        cupom_codigo: "OFF",
      },
    });

    const res = makeRes();
    const next = makeNext();

    await create(req, res, next);

    expect(conn.rollback).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0];
    expect(err.status || err.statusCode).toBe(400);
    expect(String(err.message || "")).toMatch(/cupom/i);
  });

  test("400: cupom expirado deve rollback e next(AppError)", async () => {
    const conn = buildConn();
    const mockPool = { query: jest.fn(), getConnection: jest.fn().mockResolvedValue(conn) };
    const mockDisparar = jest.fn();
    const { create } = mockModuleOnce(mockPool, mockDisparar);

    const expiracaoPassada = "2000-01-01 00:00:00";

    conn.query.mockImplementation(
      makeQueryRouter([
        { match: (s) => s.includes("from carrinhos") && s.includes('status = "aberto"'), reply: async () => [[], {}] },
        { match: (s) => s.startsWith("insert into pedidos"), reply: async () => [{ insertId: 921 }, {}] },
        { match: (s) => s.includes("from products") && s.includes("for update"), reply: async () => [[{ id: 1, price: 100, quantity: 10 }], {}] },
        { match: (s) => s.startsWith("insert into pedidos_produtos"), reply: async () => [[], {}] },
        { match: (s) => s.startsWith("update products set quantity = quantity -"), reply: async () => [[], {}] },
        {
          match: (s) => s.includes("from cupons") && s.includes("where codigo =") && s.includes("for update"),
          reply: async () => [
            [
              { id: 61, codigo: "EXP", tipo: "percentual", valor: 10, minimo: 0, expiracao: expiracaoPassada, usos: 0, max_usos: 10, ativo: 1 },
            ],
            {},
          ],
        },
      ])
    );

    const req = makeReq({
      body: {
        formaPagamento: "pix",
        endereco: { cep: "00000-000" },
        produtos: [{ id: 1, quantidade: 1 }],
        cupom_codigo: "EXP",
      },
    });

    const res = makeRes();
    const next = makeNext();

    await create(req, res, next);

    expect(conn.rollback).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0];
    expect(err.status || err.statusCode).toBe(400);
    expect(String(err.message || "")).toMatch(/cupom|expir/i);
  });

  test("400: cupom atingiu limite de usos (usos >= max_usos) deve rollback e next(AppError)", async () => {
    const conn = buildConn();
    const mockPool = { query: jest.fn(), getConnection: jest.fn().mockResolvedValue(conn) };
    const mockDisparar = jest.fn();
    const { create } = mockModuleOnce(mockPool, mockDisparar);

    conn.query.mockImplementation(
      makeQueryRouter([
        { match: (s) => s.includes("from carrinhos") && s.includes('status = "aberto"'), reply: async () => [[], {}] },
        { match: (s) => s.startsWith("insert into pedidos"), reply: async () => [{ insertId: 922 }, {}] },
        { match: (s) => s.includes("from products") && s.includes("for update"), reply: async () => [[{ id: 1, price: 100, quantity: 10 }], {}] },
        { match: (s) => s.startsWith("insert into pedidos_produtos"), reply: async () => [[], {}] },
        { match: (s) => s.startsWith("update products set quantity = quantity -"), reply: async () => [[], {}] },
        {
          match: (s) => s.includes("from cupons") && s.includes("where codigo =") && s.includes("for update"),
          reply: async () => [
            [
              { id: 62, codigo: "LIM", tipo: "percentual", valor: 10, minimo: 0, expiracao: null, usos: 10, max_usos: 10, ativo: 1 },
            ],
            {},
          ],
        },
      ])
    );

    const req = makeReq({
      body: {
        formaPagamento: "pix",
        endereco: { cep: "00000-000" },
        produtos: [{ id: 1, quantidade: 1 }],
        cupom_codigo: "LIM",
      },
    });

    const res = makeRes();
    const next = makeNext();

    await create(req, res, next);

    expect(conn.rollback).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0];
    expect(err.status || err.statusCode).toBe(400);
    expect(String(err.message || "")).toMatch(/cupom|limite|uso/i);
  });

  test("400: cupom exige mínimo (totalPedido < minimo) deve rollback e next(AppError)", async () => {
    const conn = buildConn();
    const mockPool = { query: jest.fn(), getConnection: jest.fn().mockResolvedValue(conn) };
    const mockDisparar = jest.fn();
    const { create } = mockModuleOnce(mockPool, mockDisparar);

    conn.query.mockImplementation(
      makeQueryRouter([
        { match: (s) => s.includes("from carrinhos") && s.includes('status = "aberto"'), reply: async () => [[], {}] },
        { match: (s) => s.startsWith("insert into pedidos"), reply: async () => [{ insertId: 923 }, {}] },
        { match: (s) => s.includes("from products") && s.includes("for update"), reply: async () => [[{ id: 1, price: 50, quantity: 10 }], {}] },
        { match: (s) => s.startsWith("insert into pedidos_produtos"), reply: async () => [[], {}] },
        { match: (s) => s.startsWith("update products set quantity = quantity -"), reply: async () => [[], {}] },
        {
          match: (s) => s.includes("from cupons") && s.includes("where codigo =") && s.includes("for update"),
          reply: async () => [
            [
              { id: 63, codigo: "MIN", tipo: "percentual", valor: 10, minimo: 100, expiracao: null, usos: 0, max_usos: 10, ativo: 1 },
            ],
            {},
          ],
        },
      ])
    );

    const req = makeReq({
      body: {
        formaPagamento: "pix",
        endereco: { cep: "00000-000" },
        produtos: [{ id: 1, quantidade: 1 }], // total 50 < minimo 100
        cupom_codigo: "MIN",
      },
    });

    const res = makeRes();
    const next = makeNext();

    await create(req, res, next);

    expect(conn.rollback).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0];
    expect(err.status || err.statusCode).toBe(400);
    expect(String(err.message || "")).toMatch(/mínim|minimo|cupom/i);
  });

  test("500: erro interno ao aplicar cupom (força catch interno do bloco do cupom)", async () => {
    const conn = buildConn();
    const mockPool = { query: jest.fn(), getConnection: jest.fn().mockResolvedValue(conn) };
    const mockDisparar = jest.fn();
    const { create } = mockModuleOnce(mockPool, mockDisparar);

    conn.query.mockImplementation(
      makeQueryRouter([
        { match: (s) => s.includes("from carrinhos") && s.includes('status = "aberto"'), reply: async () => [[], {}] },
        { match: (s) => s.startsWith("insert into pedidos"), reply: async () => [{ insertId: 930 }, {}] },
        { match: (s) => s.includes("from products") && s.includes("for update"), reply: async () => [[{ id: 1, price: 100, quantity: 10 }], {}] },
        { match: (s) => s.startsWith("insert into pedidos_produtos"), reply: async () => [[], {}] },
        { match: (s) => s.startsWith("update products set quantity = quantity -"), reply: async () => [[], {}] },
        {
          match: (s) => s.includes("from cupons") && s.includes("where codigo =") && s.includes("for update"),
          reply: async () => {
            // provoca erro inesperado dentro do bloco do cupom
            throw new Error("cupom-db-fail");
          },
        },
      ])
    );

    const req = makeReq({
      body: {
        formaPagamento: "pix",
        endereco: { cep: "00000-000" },
        produtos: [{ id: 1, quantidade: 1 }],
        cupom_codigo: "OFF10",
      },
    });

    const res = makeRes();
    const next = makeNext();

    await create(req, res, next);

    expect(conn.rollback).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0];
    expect(err.status || err.statusCode).toBe(500);
    expect(String(err.message || "")).toMatch(/cupom|erro/i);
  });

  test("201: falha ao marcar carrinho recuperado NÃO deve quebrar (catch não-bloqueante)", async () => {
    const conn = buildConn();
    const mockPool = { query: jest.fn().mockResolvedValue([[], {}]), getConnection: jest.fn().mockResolvedValue(conn) };
    const mockDisparar = jest.fn().mockResolvedValue(undefined);

    const { create } = mockModuleOnce(mockPool, mockDisparar);

    conn.query.mockImplementation(
      makeQueryRouter([
        { match: (s) => s.startsWith("update usuarios set"), reply: async () => [[], {}] },
        {
          match: (s) => s.includes("from carrinhos") && s.includes('status = "aberto"'),
          reply: async () => [[{ id: 77 }], {}],
        },
        { match: (s) => s.startsWith("insert into pedidos"), reply: async () => [{ insertId: 940 }, {}] },
        { match: (s) => s.includes("from products") && s.includes("for update"), reply: async () => [[{ id: 1, price: 10, quantity: 10 }], {}] },
        { match: (s) => s.startsWith("insert into pedidos_produtos"), reply: async () => [[], {}] },
        { match: (s) => s.startsWith("update products set quantity = quantity -"), reply: async () => [[], {}] },
        { match: (s) => s.startsWith("update pedidos set total"), reply: async () => [[], {}] },
        {
          match: (s) => s.includes("update carrinhos_abandonados"),
          reply: async () => {
            throw new Error("carrinho-abandonado-fail");
          },
        },
      ])
    );

    const req = makeReq({
      body: {
        formaPagamento: "pix",
        endereco: { cep: "00000-000" },
        produtos: [{ id: 1, quantidade: 1 }],
        nome: "Rick",
      },
    });

    const res = makeRes();
    const next = makeNext();

    await create(req, res, next);

    // deve seguir com sucesso mesmo com falha não-bloqueante
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(201);
    expect(conn.commit).toHaveBeenCalledTimes(1);
  });

  test("201: falha ao disparar comunicação NÃO deve quebrar (catch não-bloqueante)", async () => {
    const conn = buildConn();
    const mockPool = { query: jest.fn().mockResolvedValue([[], {}]), getConnection: jest.fn().mockResolvedValue(conn) };

    const mockDisparar = jest.fn().mockRejectedValue(new Error("comunicacao-fail"));

    const { create } = mockModuleOnce(mockPool, mockDisparar);

    conn.query.mockImplementation(
      makeQueryRouter([
        { match: (s) => s.includes("from carrinhos") && s.includes('status = "aberto"'), reply: async () => [[], {}] },
        { match: (s) => s.startsWith("insert into pedidos"), reply: async () => [{ insertId: 950 }, {}] },
        { match: (s) => s.includes("from products") && s.includes("for update"), reply: async () => [[{ id: 1, price: 10, quantity: 10 }], {}] },
        { match: (s) => s.startsWith("insert into pedidos_produtos"), reply: async () => [[], {}] },
        { match: (s) => s.startsWith("update products set quantity = quantity -"), reply: async () => [[], {}] },
        { match: (s) => s.startsWith("update pedidos set total"), reply: async () => [[], {}] },
      ])
    );

    const req = makeReq({
      body: {
        formaPagamento: "pix",
        endereco: { cep: "00000-000" },
        produtos: [{ id: 1, quantidade: 1 }],
      },
    });

    const res = makeRes();
    const next = makeNext();

    await create(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(201);
    expect(conn.commit).toHaveBeenCalledTimes(1);
    expect(mockDisparar).toHaveBeenCalledTimes(1);
  });

  test("201: falha ao fechar carrinho (pool.query) NÃO deve quebrar (catch não-bloqueante)", async () => {
    const conn = buildConn();
    const mockPool = {
      query: jest.fn().mockRejectedValue(new Error("fechar-carrinho-fail")),
      getConnection: jest.fn().mockResolvedValue(conn),
    };
    const mockDisparar = jest.fn().mockResolvedValue(undefined);

    const { create } = mockModuleOnce(mockPool, mockDisparar);

    conn.query.mockImplementation(
      makeQueryRouter([
        { match: (s) => s.includes("from carrinhos") && s.includes('status = "aberto"'), reply: async () => [[], {}] },
        { match: (s) => s.startsWith("insert into pedidos"), reply: async () => [{ insertId: 960 }, {}] },
        { match: (s) => s.includes("from products") && s.includes("for update"), reply: async () => [[{ id: 1, price: 10, quantity: 10 }], {}] },
        { match: (s) => s.startsWith("insert into pedidos_produtos"), reply: async () => [[], {}] },
        { match: (s) => s.startsWith("update products set quantity = quantity -"), reply: async () => [[], {}] },
        { match: (s) => s.startsWith("update pedidos set total"), reply: async () => [[], {}] },
      ])
    );

    const req = makeReq({
      body: {
        formaPagamento: "pix",
        endereco: { cep: "00000-000" },
        produtos: [{ id: 1, quantidade: 1 }],
      },
    });

    const res = makeRes();
    const next = makeNext();

    await create(req, res, next);

    // mesmo com falha ao fechar carrinho, checkout deve finalizar
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(201);
    expect(conn.commit).toHaveBeenCalledTimes(1);
    expect(mockPool.query).toHaveBeenCalledTimes(1);
  });

  test("500: erro inesperado e rollback falha (ainda deve retornar erro 500 via next)", async () => {
    const conn = buildConn();

    // força rollback falhar
    conn.rollback.mockRejectedValueOnce(new Error("rollback-fail"));

    const mockPool = { query: jest.fn(), getConnection: jest.fn().mockResolvedValue(conn) };
    const mockDisparar = jest.fn();

    const { create } = mockModuleOnce(mockPool, mockDisparar);

    // primeira query explode
    conn.query.mockRejectedValueOnce(new Error("db-fail"));

    const req = makeReq({
      body: {
        formaPagamento: "pix",
        endereco: { cep: "00000-000" },
        produtos: [{ id: 1, quantidade: 1 }],
      },
    });

    const res = makeRes();
    const next = makeNext();

    await create(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0];
    expect(err.status || err.statusCode).toBe(500);
    expect(String(err.message || "")).toMatch(/erro interno/i);

    // release deve ser chamado mesmo com rollback falhando, se o controller trata corretamente
    expect(conn.release).toHaveBeenCalledTimes(1);
  });
});
