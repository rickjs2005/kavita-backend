/**
 * test/integration/checkoutBizRules.int.test.js
 *
 * Testes do checkout service REAL (não mockado) exercitando regras de negócio
 * via rota HTTP com queries SQL mockadas por padrão.
 *
 * Cenários de risco real:
 *   1. Estoque insuficiente → 400 com rollback
 *   2. Produto inexistente no payload → 404
 *   3. Cupom expirado → 400 (desconto não concedido)
 *   4. Cupom inativo → 400
 *   5. Cupom com limite de usos atingido → 400
 *   6. Cupom com valor mínimo não atingido → 400
 *   7. Cupom válido percentual → desconto calculado corretamente
 *   8. Cupom válido fixo → desconto calculado corretamente
 *   9. Produto com promoção ativa → preço promocional usado
 */

"use strict";

const request = require("supertest");
const express = require("express");

const POOL_PATH = require.resolve("../../config/pool");
const AUTH_PATH = require.resolve("../../middleware/authenticateToken");
const CSRF_PATH = require.resolve("../../middleware/csrfProtection");
const SHIPPING_SVC_PATH = require.resolve("../../services/shippingQuoteService");
const NOTIF_SVC_PATH = require.resolve("../../services/checkoutNotificationService");
const ROUTER_PATH = require.resolve("../../routes/ecommerce/checkout");
const ERROR_HANDLER_PATH = require.resolve("../../middleware/errorHandler");
const MOUNT = "/api/checkout";

function normalizeSql(sql) {
  return String(sql || "").replace(/\s+/g, " ").trim().toLowerCase();
}

function setup() {
  jest.resetModules();
  jest.clearAllMocks();

  const conn = {
    beginTransaction: jest.fn().mockResolvedValue(),
    query: jest.fn(),
    commit: jest.fn().mockResolvedValue(),
    rollback: jest.fn().mockResolvedValue(),
    release: jest.fn(),
  };

  const poolMock = {
    query: jest.fn().mockResolvedValue([[], {}]),
    getConnection: jest.fn().mockResolvedValue(conn),
  };
  jest.doMock(POOL_PATH, () => poolMock);

  jest.doMock(AUTH_PATH, () => jest.fn((req, _res, next) => {
    req.user = { id: 10 };
    next();
  }));
  jest.doMock(CSRF_PATH, () => ({ validateCSRF: jest.fn((_r, _s, n) => n()) }));
  jest.doMock(SHIPPING_SVC_PATH, () => ({
    getQuote: jest.fn().mockResolvedValue({ price: 0, prazo_dias: 0, is_free: true }),
    parseCep: jest.fn((c) => String(c || "").replace(/\D/g, "")),
    normalizeItems: jest.fn((items) => items.map((i) => ({ id: Number(i.id), quantidade: Number(i.quantidade) }))),
  }));
  jest.doMock(NOTIF_SVC_PATH, () => ({
    notifyOrderCreated: jest.fn().mockResolvedValue(),
  }));

  // Cart repo — convertCart called post-commit
  const cartRepoPath = require.resolve("../../repositories/cartRepository");
  jest.doMock(cartRepoPath, () => ({
    convertCart: jest.fn().mockResolvedValue(),
  }));

  const router = require(ROUTER_PATH);
  const errorHandler = require(ERROR_HANDLER_PATH);
  const app = express();
  app.use(express.json());
  app.use(MOUNT, require(AUTH_PATH), router);
  app.use(errorHandler);

  return { app, conn };
}

/**
 * Sets up conn.query to respond based on SQL pattern.
 * `handlers` is an array of { match: (sql) => bool, reply: (sql, params) => result }
 */
function setQueryRouter(conn, handlers) {
  conn.query.mockImplementation(async (sql, params) => {
    const s = normalizeSql(sql);
    for (const h of handlers) {
      if (h.match(s)) return h.reply(s, params);
    }
    return [[], {}];
  });
}

// Base query handlers for a successful checkout (product id=1, qty=2, price=50)
function baseHandlers({ products = [{ id: 1, price: 50, quantity: 10 }], promos = [], coupon = null } = {}) {
  return [
    { match: (s) => s.includes("get_lock("), reply: () => [[{ ok: 1 }]] },
    { match: (s) => s.includes("update usuarios"), reply: () => [{ affectedRows: 1 }] },
    { match: (s) => s.includes("from carrinhos") && s.includes("aberto"), reply: () => [[]] },
    { match: (s) => s.includes("group_concat") && s.includes("pedidos_produtos"), reply: () => [[]] }, // no dup
    { match: (s) => s.includes("insert into pedidos") && !s.includes("pedidos_produtos"), reply: () => [{ insertId: 500 }] },
    { match: (s) => s.includes("for update") && s.includes("products"), reply: () => [products] },
    { match: (s) => s.includes("product_promotions") && s.includes("is_active"), reply: () => [promos] },
    { match: (s) => s.includes("insert into pedidos_produtos"), reply: () => [{ insertId: 1 }] },
    { match: (s) => s.includes("update products set quantity"), reply: () => [{ affectedRows: 1 }] },
    // Coupon handlers
    { match: (s) => s.includes("from cupons") && s.includes("for update"), reply: () => [coupon ? [coupon] : []] },
    { match: (s) => s.includes("update cupons set usos"), reply: () => [{ affectedRows: 1 }] },
    // Totals + shipping
    { match: (s) => s.includes("update pedidos set total"), reply: () => [{ affectedRows: 1 }] },
    { match: (s) => s.includes("update pedidos") && s.includes("shipping_price"), reply: () => [{ affectedRows: 1 }] },
    { match: (s) => s.includes("carrinhos_abandonados"), reply: () => [{ affectedRows: 0 }] },
    { match: (s) => s.includes("release_lock"), reply: () => [[{ ok: 1 }]] },
  ];
}

const BODY = {
  formaPagamento: "pix",
  entrega_tipo: "RETIRADA",
  produtos: [{ id: 1, quantidade: 2 }],
  nome: "Rick",
};

beforeEach(() => {
  jest.spyOn(console, "error").mockImplementation(() => {});
  jest.spyOn(console, "log").mockImplementation(() => {});
});
afterEach(() => {
  console.error.mockRestore();
  console.log.mockRestore();
});

// =========================================================================
// ESTOQUE
// =========================================================================

describe("Checkout — estoque", () => {
  test("400: estoque insuficiente → erro com nome do produto + rollback", async () => {
    const { app, conn } = setup();
    setQueryRouter(conn, baseHandlers({
      products: [{ id: 1, price: 50, quantity: 1 }], // só 1 unidade
    }));

    const res = await request(app).post(MOUNT).send({
      ...BODY, produtos: [{ id: 1, quantidade: 5 }], // pede 5
    });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("Estoque insuficiente");
    expect(conn.rollback).toHaveBeenCalled();
  });

  test("404: produto inexistente no payload → erro + rollback", async () => {
    const { app, conn } = setup();
    setQueryRouter(conn, baseHandlers({
      products: [], // nenhum produto encontrado pelo FOR UPDATE
    }));

    const res = await request(app).post(MOUNT).send(BODY);

    expect(res.status).toBe(404);
    expect(res.body.message).toContain("não encontrado");
    expect(conn.rollback).toHaveBeenCalled();
  });
});

// =========================================================================
// CUPOM
// =========================================================================

describe("Checkout — cupom", () => {
  test("400: cupom inexistente → erro", async () => {
    const { app, conn } = setup();
    setQueryRouter(conn, baseHandlers({ coupon: null }));

    const res = await request(app).post(MOUNT).send({
      ...BODY, cupom_codigo: "INVALIDO",
    });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("Cupom inválido");
  });

  test("400: cupom expirado → erro", async () => {
    const { app, conn } = setup();
    setQueryRouter(conn, baseHandlers({
      coupon: {
        id: 1, codigo: "EXPIRED", tipo: "percentual", valor: 10,
        ativo: 1, expiracao: "2020-01-01 00:00:00", usos: 0, max_usos: 100, minimo: 0,
      },
    }));

    const res = await request(app).post(MOUNT).send({
      ...BODY, cupom_codigo: "EXPIRED",
    });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("expirado");
  });

  test("400: cupom inativo → erro", async () => {
    const { app, conn } = setup();
    setQueryRouter(conn, baseHandlers({
      coupon: {
        id: 1, codigo: "INATIVO", tipo: "percentual", valor: 10,
        ativo: 0, expiracao: null, usos: 0, max_usos: null, minimo: 0,
      },
    }));

    const res = await request(app).post(MOUNT).send({
      ...BODY, cupom_codigo: "INATIVO",
    });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("inativo");
  });

  test("400: cupom com limite de usos atingido → erro", async () => {
    const { app, conn } = setup();
    setQueryRouter(conn, baseHandlers({
      coupon: {
        id: 1, codigo: "ESGOTADO", tipo: "percentual", valor: 10,
        ativo: 1, expiracao: null, usos: 50, max_usos: 50, minimo: 0,
      },
    }));

    const res = await request(app).post(MOUNT).send({
      ...BODY, cupom_codigo: "ESGOTADO",
    });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("limite de usos");
  });

  test("400: cupom com valor mínimo não atingido → erro com valor", async () => {
    const { app, conn } = setup();
    setQueryRouter(conn, baseHandlers({
      coupon: {
        id: 1, codigo: "MINIMO", tipo: "percentual", valor: 10,
        ativo: 1, expiracao: null, usos: 0, max_usos: null, minimo: 500,
      },
    }));

    const res = await request(app).post(MOUNT).send({
      ...BODY, cupom_codigo: "MINIMO",
      // total: 2 * 50 = 100 < mínimo 500
    });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("mínimo");
    expect(res.body.message).toContain("500");
  });

  test("201: cupom percentual válido → desconto calculado corretamente", async () => {
    const { app, conn } = setup();
    setQueryRouter(conn, baseHandlers({
      coupon: {
        id: 1, codigo: "DESC10", tipo: "percentual", valor: 10,
        ativo: 1, expiracao: "2030-12-31 23:59:59", usos: 0, max_usos: 100, minimo: 0,
      },
    }));

    const res = await request(app).post(MOUNT).send({
      ...BODY, cupom_codigo: "DESC10",
    });

    expect(res.status).toBe(201);
    // total = 2 * 50 = 100, desconto 10% = 10
    expect(res.body.data.total).toBe(90);
    expect(res.body.data.desconto_total).toBe(10);
    expect(res.body.data.cupom_aplicado.codigo).toBe("DESC10");
  });

  test("201: cupom valor fixo → desconto clampado ao subtotal", async () => {
    const { app, conn } = setup();
    setQueryRouter(conn, baseHandlers({
      products: [{ id: 1, price: 20, quantity: 10 }],
      coupon: {
        id: 2, codigo: "FIXO50", tipo: "valor", valor: 50,
        ativo: 1, expiracao: null, usos: 0, max_usos: null, minimo: 0,
      },
    }));

    const res = await request(app).post(MOUNT).send({
      ...BODY, cupom_codigo: "FIXO50",
      // total = 2 * 20 = 40, cupom 50 → clampado para 40
    });

    expect(res.status).toBe(201);
    expect(res.body.data.total).toBe(0); // 40 - 40 = 0
    expect(res.body.data.desconto_total).toBe(40); // clampado
  });
});

// =========================================================================
// PROMOÇÃO
// =========================================================================

describe("Checkout — promoção ativa", () => {
  test("201: produto com promoção → usa preço promocional", async () => {
    const { app, conn } = setup();
    setQueryRouter(conn, baseHandlers({
      products: [{ id: 1, price: 100, quantity: 10 }],
      promos: [{ product_id: 1, final_price: 60 }], // promoção: 60 em vez de 100
    }));

    const res = await request(app).post(MOUNT).send(BODY);

    expect(res.status).toBe(201);
    // total = 2 * 60 = 120 (preço promo), não 2 * 100 = 200
    expect(res.body.data.total).toBe(120);
    expect(res.body.data.total_sem_desconto).toBe(120);
  });
});
