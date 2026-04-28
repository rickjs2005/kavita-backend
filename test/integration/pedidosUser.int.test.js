/**
 * test/integration/pedidosUser.int.test.js
 *
 * Testes de integração para pedidos do usuário autenticado:
 *   GET /api/pedidos       — listar meus pedidos
 *   GET /api/pedidos/:id   — detalhe do meu pedido
 *
 * Cenários críticos:
 *   - Não autenticado → 401
 *   - Ownership: só vê pedidos do próprio usuário
 *   - Pedido inexistente ou de outro usuário → 404
 *   - ID inválido → 400
 *   - Fluxo feliz com itens e shipping
 */

"use strict";

const request = require("supertest");
const express = require("express");

const AUTH_PATH = require.resolve("../../middleware/authenticateToken");
const REPO_PATH = require.resolve("../../repositories/pedidosUserRepository");
const OCORRENCIAS_REPO_PATH = require.resolve("../../repositories/pedidoOcorrenciasRepository");
const FEEDBACK_REPO_PATH = require.resolve("../../repositories/ocorrenciaFeedbackRepository");
const POOL_PATH = require.resolve("../../config/pool");
const ROUTER_PATH = require.resolve("../../routes/ecommerce/pedidos");
const ERROR_HANDLER_PATH = require.resolve("../../middleware/errorHandler");
const MOUNT = "/api/pedidos";

function setup({ user = null } = {}) {
  jest.resetModules();
  jest.clearAllMocks();

  jest.doMock(POOL_PATH, () => ({ query: jest.fn() }));

  const repoMock = {
    findByUserId: jest.fn().mockResolvedValue([]),
    findByIdAndUserId: jest.fn(),
    findItemsByPedidoId: jest.fn().mockResolvedValue([]),
  };
  jest.doMock(REPO_PATH, () => repoMock);

  const ocorrenciasRepoMock = {
    findByPedidoId: jest.fn().mockResolvedValue([]),
  };
  jest.doMock(OCORRENCIAS_REPO_PATH, () => ocorrenciasRepoMock);

  const feedbackRepoMock = {
    findByOcorrenciaId: jest.fn().mockResolvedValue(null),
  };
  jest.doMock(FEEDBACK_REPO_PATH, () => feedbackRepoMock);

  jest.doMock(AUTH_PATH, () =>
    jest.fn((req, res, next) => {
      if (!user) return res.status(401).json({ ok: false, code: "UNAUTHORIZED" });
      req.user = user;
      next();
    })
  );

  const router = require(ROUTER_PATH);
  const errorHandler = require(ERROR_HANDLER_PATH);
  const app = express();
  app.use(express.json());
  app.use(MOUNT, require(AUTH_PATH), router);
  app.use(errorHandler);

  return { app, repoMock };
}

describe("GET /api/pedidos", () => {
  test("401: não autenticado", async () => {
    const { app } = setup({ user: null });
    const res = await request(app).get(MOUNT);
    expect(res.status).toBe(401);
  });

  test("200: retorna lista de pedidos do usuário", async () => {
    const { app, repoMock } = setup({ user: { id: 7 } });
    repoMock.findByUserId.mockResolvedValue([
      { id: 1, status: "pago" },
      { id: 2, status: "pendente" },
    ]);

    const res = await request(app).get(MOUNT);

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.data).toHaveLength(2);
    // Repo é chamado com o userId correto (ownership)
    expect(repoMock.findByUserId).toHaveBeenCalledWith(7);
  });

  test("200: retorna lista vazia se sem pedidos", async () => {
    const { app, repoMock } = setup({ user: { id: 7 } });
    repoMock.findByUserId.mockResolvedValue([]);

    const res = await request(app).get(MOUNT);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });
});

describe("GET /api/pedidos/:id", () => {
  test("401: não autenticado", async () => {
    const { app } = setup({ user: null });
    const res = await request(app).get(`${MOUNT}/1`);
    expect(res.status).toBe(401);
  });

  test("400: ID inválido", async () => {
    const { app } = setup({ user: { id: 7 } });
    const res = await request(app).get(`${MOUNT}/abc`);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
  });

  test("404: pedido não encontrado (ou de outro usuário)", async () => {
    const { app, repoMock } = setup({ user: { id: 7 } });
    repoMock.findByIdAndUserId.mockResolvedValue(null);

    const res = await request(app).get(`${MOUNT}/999`);

    expect(res.status).toBe(404);
    expect(res.body.code).toBe("NOT_FOUND");
    // Repo é chamado com userId do req.user (ownership check)
    expect(repoMock.findByIdAndUserId).toHaveBeenCalledWith(999, 7);
  });

  test("200: retorna detalhe do pedido com itens", async () => {
    const { app, repoMock } = setup({ user: { id: 7 } });
    repoMock.findByIdAndUserId.mockResolvedValue({
      id: 1, usuario_id: 7, forma_pagamento: "pix",
      status: "pago", status_pagamento: "pago",
      data_pedido: "2026-04-01", endereco: "{}",
      subtotal_itens: 200, total_com_desconto: 200, shipping_price: 15,
    });
    repoMock.findItemsByPedidoId.mockResolvedValue([
      { id: 10, produto_id: 5, nome: "P1", preco: 100, quantidade: 2, imagem: "/img/p1.jpg" },
    ]);

    const res = await request(app).get(`${MOUNT}/1`);

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.data.id).toBe(1);
    expect(res.body.data.total).toBe(215); // 200 + 15 shipping
    expect(res.body.data.shipping_price).toBe(15);
    expect(res.body.data.itens).toHaveLength(1);
    expect(res.body.data.itens[0]).toMatchObject({
      produto_id: 5, nome: "P1", quantidade: 2,
    });
  });
});
