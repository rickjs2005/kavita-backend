/**
 * test/integration/publicProducts.int.test.js
 *
 * Testes de integração para catálogo público de produtos:
 *   GET /api/products          — listagem paginada
 *   GET /api/products/search   — busca avançada
 *   GET /api/products/:id      — detalhe do produto
 *
 * Cenários:
 *   - Sem auth (rotas públicas)
 *   - Paginação, filtros, ordenação
 *   - Categoria inexistente → 404
 *   - Produto inexistente → 404
 *   - Preço inválido em search → 400
 *   - Fluxo feliz com imagens
 */

"use strict";

const request = require("supertest");
const express = require("express");

const POOL_PATH = require.resolve("../../config/pool");
const PRODUCT_REPO_PATH = require.resolve("../../repositories/productPublicRepository");
const PRODUCT_SVC_PATH = require.resolve("../../services/productService");
const ROUTER_PATH = require.resolve("../../routes/public/publicProducts");
const ERROR_HANDLER_PATH = require.resolve("../../middleware/errorHandler");
const MOUNT = "/api/products";

function setup() {
  jest.resetModules();
  jest.clearAllMocks();

  jest.doMock(POOL_PATH, () => ({ query: jest.fn() }));

  const repoMock = {
    findProducts: jest.fn().mockResolvedValue({ rows: [], total: 0 }),
    findCategoryByName: jest.fn(),
    findProductImages: jest.fn().mockResolvedValue([]),
    findProductById: jest.fn(),
    searchProducts: jest.fn().mockResolvedValue({ rows: [], total: 0 }),
  };
  jest.doMock(PRODUCT_REPO_PATH, () => repoMock);

  const router = require(ROUTER_PATH);
  const errorHandler = require(ERROR_HANDLER_PATH);

  const app = express();
  app.use(express.json());
  app.use(MOUNT, router);
  app.use(errorHandler);

  return { app, repoMock };
}

describe("GET /api/products (listagem)", () => {
  test("200: retorna lista paginada sem filtros", async () => {
    const { app, repoMock } = setup();
    repoMock.findProducts.mockResolvedValue({
      rows: [{ id: 1, name: "Produto A", price: 29.9 }],
      total: 1,
    });

    const res = await request(app).get(MOUNT);

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.meta.total).toBe(1);
  });

  test("200: filtra por categoria (slug → nome → ID)", async () => {
    const { app, repoMock } = setup();
    repoMock.findCategoryByName.mockResolvedValue({ id: 3 });
    repoMock.findProducts.mockResolvedValue({ rows: [], total: 0 });

    const res = await request(app).get(`${MOUNT}?category=pragas-e-insetos`);

    expect(res.status).toBe(200);
    expect(repoMock.findCategoryByName).toHaveBeenCalledWith("pragas e insetos");
  });

  test("404: categoria inexistente", async () => {
    const { app, repoMock } = setup();
    repoMock.findCategoryByName.mockResolvedValue(null);

    const res = await request(app).get(`${MOUNT}?category=inexistente`);

    expect(res.status).toBe(404);
    expect(res.body.code).toBe("NOT_FOUND");
  });

  test("200: paginação funciona", async () => {
    const { app, repoMock } = setup();
    repoMock.findProducts.mockResolvedValue({ rows: [], total: 50 });

    const res = await request(app).get(`${MOUNT}?page=3&limit=10`);

    expect(res.status).toBe(200);
    expect(res.body.meta.page).toBe(3);
    expect(res.body.meta.limit).toBe(10);
  });
});

describe("GET /api/products/search", () => {
  test("200: busca por texto", async () => {
    const { app, repoMock } = setup();
    repoMock.searchProducts.mockResolvedValue({
      rows: [{ id: 1, name: "Fertilizante" }],
      total: 1,
    });

    const res = await request(app).get(`${MOUNT}/search?q=fert`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });

  test("400: minPrice inválido", async () => {
    const { app } = setup();
    const res = await request(app).get(`${MOUNT}/search?minPrice=abc`);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
  });

  test("200: busca com filtro de preço e promo", async () => {
    const { app, repoMock } = setup();
    repoMock.searchProducts.mockResolvedValue({ rows: [], total: 0 });

    const res = await request(app).get(`${MOUNT}/search?minPrice=10&maxPrice=100&promo=true`);

    expect(res.status).toBe(200);
    expect(repoMock.searchProducts).toHaveBeenCalledWith(
      expect.objectContaining({ minPrice: 10, maxPrice: 100, promo: true })
    );
  });
});

describe("GET /api/products/:id", () => {
  test("404: produto inexistente", async () => {
    const { app, repoMock } = setup();
    repoMock.findProductById.mockResolvedValue(null);

    const res = await request(app).get(`${MOUNT}/999`);

    expect(res.status).toBe(404);
    expect(res.body.code).toBe("NOT_FOUND");
  });

  test("200: retorna produto com imagens", async () => {
    const { app, repoMock } = setup();
    repoMock.findProductById.mockResolvedValue({
      id: 1, name: "Produto A", price: 29.9,
    });
    repoMock.findProductImages.mockResolvedValue([
      { product_id: 1, image_url: "/img/a.jpg" },
    ]);

    const res = await request(app).get(`${MOUNT}/1`);

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.data.name).toBe("Produto A");
    expect(res.body.data.images).toEqual(["/img/a.jpg"]);
  });

  test("400: ID inválido (0)", async () => {
    const { app } = setup();
    const res = await request(app).get(`${MOUNT}/0`);
    expect(res.status).toBe(400);
  });
});
