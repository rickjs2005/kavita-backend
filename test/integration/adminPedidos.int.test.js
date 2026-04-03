/**
 * test/integration/adminPedidos.int.test.js
 *
 * Testes de integração para gestão de pedidos no painel admin:
 *   GET  /api/admin/pedidos          — listar todos
 *   GET  /api/admin/pedidos/:id      — detalhe
 *   PUT  /api/admin/pedidos/:id/pagamento — atualizar pagamento
 *   PUT  /api/admin/pedidos/:id/entrega   — atualizar entrega
 *
 * Cenários:
 *   - Sem auth → 401
 *   - Sem permissão → 403
 *   - Pedido inexistente → 404
 *   - Status inválido → 400
 *   - Cancelamento com restauração de estoque
 *   - Fluxo feliz completo
 */

"use strict";

const request = require("supertest");
const express = require("express");

const VERIFY_ADMIN_PATH = require.resolve("../../middleware/verifyAdmin");
const REQUIRE_PERM_PATH = require.resolve("../../middleware/requirePermission");
const ORDER_SVC_PATH = require.resolve("../../services/orderService");
const COMUNICACAO_PATH = require.resolve("../../services/comunicacaoService");
const POOL_PATH = require.resolve("../../config/pool");
const WITH_TX_PATH = require.resolve("../../lib/withTransaction");
const ORDER_REPO_PATH = require.resolve("../../repositories/orderRepository");
const ROUTER_PATH = require.resolve("../../routes/admin/adminPedidos");
const ERROR_HANDLER_PATH = require.resolve("../../middleware/errorHandler");
const MOUNT = "/api/admin/pedidos";

function setup({ adminUser = null } = {}) {
  jest.resetModules();
  jest.clearAllMocks();

  const poolMock = { query: jest.fn(), getConnection: jest.fn() };
  jest.doMock(POOL_PATH, () => poolMock);
  jest.doMock(WITH_TX_PATH, () => ({
    withTransaction: jest.fn(async (fn) => fn({})),
  }));
  jest.doMock(COMUNICACAO_PATH, () => ({
    dispararEventoComunicacao: jest.fn().mockResolvedValue(),
  }));

  const orderRepoMock = {
    findAllOrderRows: jest.fn().mockResolvedValue([]),
    findAllOrderItems: jest.fn().mockResolvedValue([]),
    findOrderRowById: jest.fn(),
    findOrderItemsById: jest.fn().mockResolvedValue([]),
    setPaymentStatus: jest.fn(),
    setDeliveryStatus: jest.fn(),
    lockOrderForUpdate: jest.fn(),
    restoreStock: jest.fn().mockResolvedValue(),
  };
  jest.doMock(ORDER_REPO_PATH, () => orderRepoMock);

  jest.doMock(VERIFY_ADMIN_PATH, () =>
    jest.fn((req, res, next) => {
      if (!adminUser) return res.status(401).json({ ok: false, code: "AUTH_ERROR", message: "Não autenticado." });
      req.admin = adminUser;
      next();
    })
  );

  const verifyAdmin = require(VERIFY_ADMIN_PATH);
  const requirePermission = require(REQUIRE_PERM_PATH);
  const router = require(ROUTER_PATH);
  const errorHandler = require(ERROR_HANDLER_PATH);

  const app = express();
  app.use(express.json());
  app.use(MOUNT, verifyAdmin, requirePermission("pedidos.ver"), router);
  app.use(errorHandler);

  return { app, orderRepoMock };
}

const ADMIN_MASTER = { id: 1, role: "master", permissions: [] };

describe("Admin Pedidos — auth/permission guards", () => {
  test("GET / sem auth → 401", async () => {
    const { app } = setup({ adminUser: null });
    const res = await request(app).get(MOUNT);
    expect(res.status).toBe(401);
  });

  test("GET / sem permissão pedidos.ver → 403", async () => {
    const { app } = setup({ adminUser: { id: 2, role: "operador", permissions: [] } });
    const res = await request(app).get(MOUNT);
    expect(res.status).toBe(403);
  });

  test("PUT /:id/pagamento sem auth → 401", async () => {
    const { app } = setup({ adminUser: null });
    const res = await request(app).put(`${MOUNT}/1/pagamento`).send({ status_pagamento: "pago" });
    expect(res.status).toBe(401);
  });
});

describe("GET /api/admin/pedidos", () => {
  test("200: retorna lista de pedidos", async () => {
    const { app, orderRepoMock } = setup({ adminUser: ADMIN_MASTER });
    orderRepoMock.findAllOrderRows.mockResolvedValue([{
      pedido_id: 1, usuario_id: 10, usuario_nome: "Rick",
      forma_pagamento: "pix", status_pagamento: "pago",
      status_entrega: "enviado", total: 100, shipping_price: 10,
      data_pedido: "2026-04-01",
    }]);
    orderRepoMock.findAllOrderItems.mockResolvedValue([{
      pedido_id: 1, produto_nome: "P1", quantidade: 2, preco_unitario: 50,
    }]);

    const res = await request(app).get(MOUNT);

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].itens).toHaveLength(1);
  });
});

describe("GET /api/admin/pedidos/:id", () => {
  test("200: retorna detalhe do pedido", async () => {
    const { app, orderRepoMock } = setup({ adminUser: ADMIN_MASTER });
    orderRepoMock.findOrderRowById.mockResolvedValue({
      pedido_id: 1, usuario_id: 10, usuario_nome: "Rick",
      forma_pagamento: "pix", status_pagamento: "pendente",
      status_entrega: "em_separacao", total: 200, shipping_price: 0,
      data_pedido: "2026-04-01",
    });
    orderRepoMock.findOrderItemsById.mockResolvedValue([
      { pedido_id: 1, produto_nome: "P1", quantidade: 1, preco_unitario: 200 },
    ]);

    const res = await request(app).get(`${MOUNT}/1`);

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(1);
    expect(res.body.data.itens).toHaveLength(1);
  });

  test("404: pedido inexistente", async () => {
    const { app, orderRepoMock } = setup({ adminUser: ADMIN_MASTER });
    orderRepoMock.findOrderRowById.mockResolvedValue(null);

    const res = await request(app).get(`${MOUNT}/999`);

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ ok: false, code: "NOT_FOUND" });
  });
});

describe("PUT /api/admin/pedidos/:id/pagamento", () => {
  test("200: atualiza status para pago", async () => {
    const { app, orderRepoMock } = setup({ adminUser: ADMIN_MASTER });
    orderRepoMock.setPaymentStatus.mockResolvedValue(1);

    const res = await request(app)
      .put(`${MOUNT}/1/pagamento`)
      .send({ status_pagamento: "pago" });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.message).toContain("pagamento");
  });

  test("400: status_pagamento inválido → VALIDATION_ERROR", async () => {
    const { app } = setup({ adminUser: ADMIN_MASTER });

    const res = await request(app)
      .put(`${MOUNT}/1/pagamento`)
      .send({ status_pagamento: "invalido" });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
  });

  test("404: pedido não encontrado", async () => {
    const { app, orderRepoMock } = setup({ adminUser: ADMIN_MASTER });
    orderRepoMock.setPaymentStatus.mockResolvedValue(0);

    const res = await request(app)
      .put(`${MOUNT}/999/pagamento`)
      .send({ status_pagamento: "pago" });

    expect(res.status).toBe(404);
  });
});

describe("PUT /api/admin/pedidos/:id/entrega", () => {
  test("200: atualiza status para enviado", async () => {
    const { app, orderRepoMock } = setup({ adminUser: ADMIN_MASTER });
    orderRepoMock.setDeliveryStatus.mockResolvedValue(1);

    const res = await request(app)
      .put(`${MOUNT}/1/entrega`)
      .send({ status_entrega: "enviado" });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  test("200: cancelamento restaura estoque", async () => {
    const { app, orderRepoMock } = setup({ adminUser: ADMIN_MASTER });
    orderRepoMock.lockOrderForUpdate.mockResolvedValue({
      status_entrega: "processando", status_pagamento: "pendente",
    });
    orderRepoMock.setDeliveryStatus.mockResolvedValue(1);

    const res = await request(app)
      .put(`${MOUNT}/1/entrega`)
      .send({ status_entrega: "cancelado" });

    expect(res.status).toBe(200);
    expect(orderRepoMock.restoreStock).toHaveBeenCalled();
  });

  test("200: cancelamento NÃO restaura estoque se já falhou (webhook já restaurou)", async () => {
    const { app, orderRepoMock } = setup({ adminUser: ADMIN_MASTER });
    orderRepoMock.lockOrderForUpdate.mockResolvedValue({
      status_entrega: "processando", status_pagamento: "falhou",
    });
    orderRepoMock.setDeliveryStatus.mockResolvedValue(1);

    const res = await request(app)
      .put(`${MOUNT}/1/entrega`)
      .send({ status_entrega: "cancelado" });

    expect(res.status).toBe(200);
    expect(orderRepoMock.restoreStock).not.toHaveBeenCalled();
  });

  test("400: status_entrega inválido → VALIDATION_ERROR", async () => {
    const { app } = setup({ adminUser: ADMIN_MASTER });

    const res = await request(app)
      .put(`${MOUNT}/1/entrega`)
      .send({ status_entrega: "voando" });

    expect(res.status).toBe(400);
  });

  test("404: pedido inexistente no cancelamento", async () => {
    const { app, orderRepoMock } = setup({ adminUser: ADMIN_MASTER });
    orderRepoMock.lockOrderForUpdate.mockResolvedValue(null);

    const res = await request(app)
      .put(`${MOUNT}/1/entrega`)
      .send({ status_entrega: "cancelado" });

    // withTransaction returns false → controller returns {found: false} → 404
    expect(res.status).toBe(404);
  });
});
