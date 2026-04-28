/**
 * test/integration/adminProdutos.int.test.js
 *
 * Rotas testadas:
 * - GET    /api/admin/produtos          (list)
 * - GET    /api/admin/produtos/:id      (getById)
 * - POST   /api/admin/produtos          (create)
 * - PUT    /api/admin/produtos/:id      (update)
 * - DELETE /api/admin/produtos/:id      (remove)
 *
 * Regras:
 * - Sem MySQL real (pool.query e pool.getConnection mockados)
 * - Sem disco real (mediaService mockado)
 * - Auth mock (verifyAdmin)
 * - Arrange -> Act -> Assert
 */

"use strict";

const request = require("supertest");
const { makeTestApp, makeMockConn } = require("../testUtils");

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const PRODUCT_ROW = {
  id: 10,
  name: "Ração Premium 10kg",
  description: "Alta digestibilidade",
  price: 199.9,
  quantity: 5,
  category_id: 3,
  image: "/uploads/products/main.webp",
  shipping_free: 1,
  shipping_free_from_qty: 2,
};

const PRODUCT_IMAGES = [
  { product_id: 10, path: "/uploads/products/main.webp" },
  { product_id: 10, path: "/uploads/products/secondary.webp" },
];

const CREATE_BODY = {
  name: "Novo Produto",
  description: "Descrição",
  price: "299,90",
  quantity: "10",
  category_id: "2",
  shippingFree: "0",
  shippingFreeFromQtyStr: "",
};

// ---------------------------------------------------------------------------
// Setup factory
// ---------------------------------------------------------------------------

describe("AdminProdutos routes (routes/admin/adminProdutos.js)", () => {
  const originalEnv = process.env;

  function setupModuleWithMocks() {
    jest.resetModules();

    process.env = { ...originalEnv, NODE_ENV: "test" };

    const mockConn = makeMockConn();

    const poolMock = {
      query: jest.fn(),
      getConnection: jest.fn().mockResolvedValue(mockConn),
    };

    // mediaService mock: bypass multer + mock todas as operações de arquivo
    const mediaServiceMock = {
      upload: {
        array: () => (req, _res, next) => {
          req.files = req._mockFiles || [];
          return next();
        },
      },
      persistMedia: jest.fn().mockResolvedValue([]),
      enqueueOrphanCleanup: jest.fn().mockResolvedValue(undefined),
      removeMedia: jest.fn().mockResolvedValue(undefined),
      toPublicPath: (filename) => `/uploads/products/${filename}`,
    };

    const verifyAdminMock = jest.fn((req, _res, next) => {
      req.user = { id: 999, role: "admin" };
      return next();
    });

    jest.doMock(require.resolve("../../config/pool"), () => poolMock);
    jest.doMock(require.resolve("../../services/mediaService"), () => mediaServiceMock);
    jest.doMock(require.resolve("../../middleware/verifyAdmin"), () => verifyAdminMock);

    const router = require("../../routes/admin/adminProdutos");
    const app = makeTestApp("/api/admin/produtos", router);

    return { app, mockConn, poolMock, mediaServiceMock };
  }

  afterEach(() => {
    process.env = originalEnv;
    jest.restoreAllMocks();
  });

  /* ------------------------------------------------------------------ */
  /*  GET /                                                               */
  /* ------------------------------------------------------------------ */

  describe("GET /api/admin/produtos", () => {
    test("200: retorna lista vazia quando não há produtos", async () => {
      const { app, poolMock } = setupModuleWithMocks();

      poolMock.query.mockResolvedValue([[]]);

      const res = await request(app).get("/api/admin/produtos");

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ ok: true, data: [] });
    });

    test("200: retorna produtos com imagens anexadas", async () => {
      const { app, poolMock } = setupModuleWithMocks();

      poolMock.query
        .mockResolvedValueOnce([[PRODUCT_ROW]])        // findAll
        .mockResolvedValueOnce([PRODUCT_IMAGES]);       // findImagesByProductIds

      const res = await request(app).get("/api/admin/produtos");

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ ok: true });
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0]).toMatchObject({
        id: 10,
        name: "Ração Premium 10kg",
        images: ["/uploads/products/main.webp", "/uploads/products/secondary.webp"],
      });
    });

    test("500: erro de banco retorna SERVER_ERROR", async () => {
      const { app, poolMock } = setupModuleWithMocks();

      poolMock.query.mockRejectedValue(new Error("DB failure"));

      const res = await request(app).get("/api/admin/produtos");

      expect(res.status).toBe(500);
      expect(res.body).toMatchObject({ ok: false, code: "SERVER_ERROR" });
    });
  });

  /* ------------------------------------------------------------------ */
  /*  GET /:id                                                            */
  /* ------------------------------------------------------------------ */

  describe("GET /api/admin/produtos/:id", () => {
    test("200: retorna produto com imagens", async () => {
      const { app, poolMock } = setupModuleWithMocks();

      poolMock.query
        .mockResolvedValueOnce([[PRODUCT_ROW]])       // findById
        .mockResolvedValueOnce([PRODUCT_IMAGES]);      // findImagesByProductIds (via attachImages)

      const res = await request(app).get("/api/admin/produtos/10");

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ ok: true });
      expect(res.body.data).toMatchObject({
        id: 10,
        name: "Ração Premium 10kg",
        images: expect.arrayContaining(["/uploads/products/main.webp"]),
      });
    });

    test("400: ID não numérico retorna VALIDATION_ERROR", async () => {
      const { app } = setupModuleWithMocks();

      const res = await request(app).get("/api/admin/produtos/abc");

      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ ok: false, code: "VALIDATION_ERROR" });
      expect(res.body.details.fields[0]).toMatchObject({ field: "id", message: "ID inválido." });
    });

    test("400: ID zero retorna VALIDATION_ERROR", async () => {
      const { app } = setupModuleWithMocks();

      const res = await request(app).get("/api/admin/produtos/0");

      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ ok: false, code: "VALIDATION_ERROR" });
      expect(res.body.details.fields[0]).toMatchObject({ field: "id", message: "ID inválido." });
    });

    test("404: produto não encontrado retorna NOT_FOUND", async () => {
      const { app, poolMock } = setupModuleWithMocks();

      poolMock.query.mockResolvedValue([[]]); // findById retorna vazio

      const res = await request(app).get("/api/admin/produtos/999");

      expect(res.status).toBe(404);
      expect(res.body).toMatchObject({ ok: false, code: "NOT_FOUND" });
    });

    test("500: erro de banco retorna SERVER_ERROR", async () => {
      const { app, poolMock } = setupModuleWithMocks();

      poolMock.query.mockRejectedValue(new Error("DB failure"));

      const res = await request(app).get("/api/admin/produtos/10");

      expect(res.status).toBe(500);
      expect(res.body).toMatchObject({ ok: false, code: "SERVER_ERROR" });
    });
  });

  /* ------------------------------------------------------------------ */
  /*  POST /                                                              */
  /* ------------------------------------------------------------------ */

  describe("POST /api/admin/produtos", () => {
    test("201: cria produto sem imagens e retorna id", async () => {
      const { app, mockConn, poolMock } = setupModuleWithMocks();

      // Sem arquivos — conn.query só executa o INSERT de produto
      mockConn.query.mockResolvedValue([{ insertId: 42 }]);
      // pool.query não deve ser chamado (sem attachImages após create)
      poolMock.query.mockResolvedValue([[]]);

      const res = await request(app)
        .post("/api/admin/produtos")
        .send(CREATE_BODY);

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ ok: true, data: { id: 42 }, message: "Produto adicionado com sucesso." });
      expect(mockConn.beginTransaction).toHaveBeenCalledTimes(1);
      expect(mockConn.commit).toHaveBeenCalledTimes(1);
      expect(mockConn.release).toHaveBeenCalledTimes(1);
    });

    test("201: cria produto com imagens — persiste e associa ao produto", async () => {
      const { app, mockConn, mediaServiceMock } = setupModuleWithMocks();

      mediaServiceMock.persistMedia.mockResolvedValue([
        { path: "/uploads/products/img1.webp" },
        { path: "/uploads/products/img2.webp" },
      ]);

      mockConn.query
        .mockResolvedValueOnce([{ insertId: 55 }])  // INSERT produto
        .mockResolvedValueOnce([{ affectedRows: 2 }]) // INSERT images (bulk)
        .mockResolvedValueOnce([{ affectedRows: 1 }]); // UPDATE image (setMainImage)

      const res = await request(app)
        .post("/api/admin/produtos")
        .send({ ...CREATE_BODY, _mockFiles: [{ filename: "img1.webp" }, { filename: "img2.webp" }] });

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ ok: true, data: { id: 55 } });
      expect(mockConn.commit).toHaveBeenCalledTimes(1);
    });

    test("400: nome vazio retorna VALIDATION_ERROR (schema Zod)", async () => {
      const { app } = setupModuleWithMocks();

      const res = await request(app)
        .post("/api/admin/produtos")
        .send({ ...CREATE_BODY, name: "" });

      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ ok: false, code: "VALIDATION_ERROR" });
    });

    test("400: preço inválido retorna VALIDATION_ERROR (service)", async () => {
      const { app, mockConn } = setupModuleWithMocks();

      // Zod permite a string "abc" em price (schema valida shape, não semântica numérica)
      // O service converte e valida o número resultante
      mockConn.query.mockResolvedValue([{ insertId: 1 }]);

      const res = await request(app)
        .post("/api/admin/produtos")
        .send({ ...CREATE_BODY, price: "abc" });

      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ ok: false, code: "VALIDATION_ERROR" });
      expect(mockConn.beginTransaction).not.toHaveBeenCalled();
    });

    test("400: quantidade negativa retorna VALIDATION_ERROR", async () => {
      const { app } = setupModuleWithMocks();

      const res = await request(app)
        .post("/api/admin/produtos")
        .send({ ...CREATE_BODY, quantity: "-1" });

      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ ok: false, code: "VALIDATION_ERROR" });
    });

    test("400: category_id inválido (0) retorna VALIDATION_ERROR", async () => {
      const { app } = setupModuleWithMocks();

      const res = await request(app)
        .post("/api/admin/produtos")
        .send({ ...CREATE_BODY, category_id: "0" });

      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ ok: false, code: "VALIDATION_ERROR" });
    });

    test("500: erro de banco faz rollback e enfileira cleanup das mídias", async () => {
      const { app, mockConn, mediaServiceMock } = setupModuleWithMocks();

      // INSERT do produto em si falha — simples e suficiente para validar transação
      mockConn.query.mockRejectedValue(new Error("DB insert failed"));

      const res = await request(app)
        .post("/api/admin/produtos")
        .send(CREATE_BODY);

      expect(res.status).toBe(500);
      expect(res.body).toMatchObject({ ok: false, code: "SERVER_ERROR" });
      expect(mockConn.rollback).toHaveBeenCalledTimes(1);
      expect(mockConn.release).toHaveBeenCalledTimes(1);
      expect(mediaServiceMock.enqueueOrphanCleanup).toHaveBeenCalledTimes(1);
    });

    // Regressão: shipping_prazo_dias era silenciosamente dropado pelo
    // Zod (schema sem o campo) e pelo service (destructure sem a chave).
    // Esta suite garante que o valor enviado pelo admin chega no SQL.
    test("201: persiste shipping_prazo_dias no INSERT quando fornecido", async () => {
      const { app, mockConn } = setupModuleWithMocks();
      mockConn.query.mockResolvedValue([{ insertId: 77 }]);

      const res = await request(app)
        .post("/api/admin/produtos")
        .send({ ...CREATE_BODY, shippingPrazoDiasStr: "5" });

      expect(res.status).toBe(201);
      // INSERT tem 10 params: name, description, price, quantity, category_id,
      // image (null), shipping_free, shipping_free_from_qty, shipping_prazo_dias, reorder_point.
      // toHaveLength quebra se alguém adicionar coluna sem atualizar este teste.
      const sqlArgs = mockConn.query.mock.calls[0][1];
      expect(sqlArgs[8]).toBe(5);          // shipping_prazo_dias
      expect(sqlArgs[9]).toBeNull();       // reorder_point (não enviado em CREATE_BODY)
      expect(sqlArgs).toHaveLength(10);
    });

    test("201: shipping_prazo_dias ausente persiste NULL (cai no prazo da região)", async () => {
      const { app, mockConn } = setupModuleWithMocks();
      mockConn.query.mockResolvedValue([{ insertId: 78 }]);

      const res = await request(app)
        .post("/api/admin/produtos")
        .send(CREATE_BODY); // sem shippingPrazoDiasStr

      expect(res.status).toBe(201);
      const sqlArgs = mockConn.query.mock.calls[0][1];
      expect(sqlArgs[sqlArgs.length - 1]).toBeNull();
    });
  });

  /* ------------------------------------------------------------------ */
  /*  PUT /:id                                                            */
  /* ------------------------------------------------------------------ */

  describe("PUT /api/admin/produtos/:id", () => {
    test("200: atualiza produto — mantém imagens do keepImages", async () => {
      const { app, mockConn, mediaServiceMock } = setupModuleWithMocks();

      const keepPath = "/uploads/products/keep.webp";
      const removePath = "/uploads/products/remove.webp";

      // O UPDATE principal tem newline entre "UPDATE products" e "SET name = ?...",
      // então discriminamos pelos campos específicos da query.
      mockConn.query.mockImplementation(async (sql) => {
        // UPDATE principal: contém "shipping_free_from_qty" (último campo do SET, pré-reorder_point)
        if (String(sql).includes("shipping_free_from_qty")) return [{ affectedRows: 1 }];
        // productStockSyncService.syncActiveByStock — SELECT FOR UPDATE acionado
        // após repo.update quando affectedRows > 0. Devolve produto consistente
        // (qty>0, ativo) → noop, sem queries adicionais.
        if (String(sql).includes("is_active") && String(sql).includes("deactivated_by") && String(sql).toUpperCase().includes("FOR UPDATE")) {
          return [[{ id: 10, quantity: 5, is_active: 1, deactivated_by: null }]];
        }
        // SELECT imagens atuais
        if (String(sql).includes("SELECT path FROM product_images"))
          return [[{ path: keepPath }, { path: removePath }]];
        // DELETE imagens a remover
        if (String(sql).includes("DELETE FROM product_images")) return [{ affectedRows: 1 }];
        // setMainImage: UPDATE products SET image = ?
        if (String(sql).includes("SET image")) return [{ affectedRows: 1 }];
        throw new Error(`SQL não mapeado: ${sql}`);
      });

      const res = await request(app)
        .put("/api/admin/produtos/10")
        .send({ ...CREATE_BODY, keepImages: JSON.stringify([keepPath]) });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ ok: true, message: "Produto atualizado com sucesso." });
      expect(mockConn.commit).toHaveBeenCalledTimes(1);
      expect(mockConn.release).toHaveBeenCalledTimes(1);
      // Imagem não mantida deve ter sido agendada para remoção
      expect(mediaServiceMock.removeMedia).toHaveBeenCalledWith([removePath]);
    });

    test("400: ID inválido retorna VALIDATION_ERROR", async () => {
      const { app, poolMock } = setupModuleWithMocks();

      const res = await request(app)
        .put("/api/admin/produtos/0")
        .send(CREATE_BODY);

      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ ok: false, code: "VALIDATION_ERROR" });
      expect(res.body.details.fields[0]).toMatchObject({ field: "id", message: "ID inválido." });
      expect(poolMock.getConnection).not.toHaveBeenCalled();
    });

    test("404: produto não encontrado (affectedRows=0) — faz rollback", async () => {
      const { app, mockConn, mediaServiceMock } = setupModuleWithMocks();

      // UPDATE retorna 0 → service lança NOT_FOUND → catch faz rollback + cleanup
      mockConn.query.mockResolvedValue([{ affectedRows: 0 }]);

      const res = await request(app)
        .put("/api/admin/produtos/999")
        .send(CREATE_BODY);

      expect(res.status).toBe(404);
      expect(res.body).toMatchObject({ ok: false, code: "NOT_FOUND" });
      expect(mockConn.rollback).toHaveBeenCalledTimes(1);
      expect(mediaServiceMock.enqueueOrphanCleanup).toHaveBeenCalledTimes(1);
      expect(mockConn.release).toHaveBeenCalledTimes(1);
    });

    test("500: erro de banco faz rollback e cleanup", async () => {
      const { app, mockConn, mediaServiceMock } = setupModuleWithMocks();

      mockConn.query.mockRejectedValue(new Error("DB failure"));

      const res = await request(app)
        .put("/api/admin/produtos/10")
        .send(CREATE_BODY);

      expect(res.status).toBe(500);
      expect(res.body).toMatchObject({ ok: false, code: "SERVER_ERROR" });
      expect(mockConn.rollback).toHaveBeenCalledTimes(1);
      expect(mockConn.release).toHaveBeenCalledTimes(1);
      expect(mediaServiceMock.enqueueOrphanCleanup).toHaveBeenCalledTimes(1);
    });
  });

  /* ------------------------------------------------------------------ */
  /*  DELETE /:id                                                         */
  /* ------------------------------------------------------------------ */

  describe("DELETE /api/admin/produtos/:id", () => {
    test("204: remove produto e agenda exclusão das mídias", async () => {
      const { app, mockConn, poolMock, mediaServiceMock } = setupModuleWithMocks();

      // findById usa pool.query (fora da transação) — early-return 404 sem abrir conn.
      poolMock.query.mockResolvedValueOnce([[{ id: 10 }]]);
      mockConn.query
        .mockResolvedValueOnce([[{ activeCount: 0, closedCount: 0 }]]) // countCartReferences
        .mockResolvedValueOnce([[{ path: "/uploads/products/img1.webp" }, { path: "/uploads/products/img2.webp" }]]) // findImagesByProductId
        .mockResolvedValueOnce([{ affectedRows: 1 }]); // DELETE produto

      const res = await request(app).delete("/api/admin/produtos/10");

      expect(res.status).toBe(204);
      expect(res.body).toEqual({});
      expect(mockConn.commit).toHaveBeenCalledTimes(1);
      expect(mockConn.release).toHaveBeenCalledTimes(1);
      expect(mediaServiceMock.removeMedia).toHaveBeenCalledWith([
        "/uploads/products/img1.webp",
        "/uploads/products/img2.webp",
      ]);
    });

    test("204: remove produto sem imagens — removeMedia não é chamado", async () => {
      const { app, mockConn, poolMock, mediaServiceMock } = setupModuleWithMocks();

      poolMock.query.mockResolvedValueOnce([[{ id: 10 }]]);
      mockConn.query
        .mockResolvedValueOnce([[{ activeCount: 0, closedCount: 0 }]]) // countCartReferences
        .mockResolvedValueOnce([[]])                                    // findImagesByProductId: sem imagens
        .mockResolvedValueOnce([{ affectedRows: 1 }]);                  // DELETE produto

      const res = await request(app).delete("/api/admin/produtos/10");

      expect(res.status).toBe(204);
      expect(mediaServiceMock.removeMedia).not.toHaveBeenCalled();
    });

    test("400: ID inválido retorna VALIDATION_ERROR", async () => {
      const { app, poolMock } = setupModuleWithMocks();

      const res = await request(app).delete("/api/admin/produtos/0");

      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ ok: false, code: "VALIDATION_ERROR" });
      expect(res.body.details.fields[0]).toMatchObject({ field: "id", message: "ID inválido." });
      expect(poolMock.getConnection).not.toHaveBeenCalled();
    });

    test("404: produto não encontrado (affectedRows=0) — faz rollback", async () => {
      const { app, mockConn, poolMock } = setupModuleWithMocks();

      // findById (pool.query) retorna vazio → service lança NOT_FOUND DENTRO da
      // transação. catch faz rollback; finally libera conn.
      poolMock.query.mockResolvedValueOnce([[]]);

      const res = await request(app).delete("/api/admin/produtos/999");

      expect(res.status).toBe(404);
      expect(res.body).toMatchObject({ ok: false, code: "NOT_FOUND" });
      expect(mockConn.rollback).toHaveBeenCalledTimes(1);
      expect(mockConn.release).toHaveBeenCalledTimes(1);
    });

    test("500: erro de banco faz rollback", async () => {
      const { app, mockConn } = setupModuleWithMocks();

      mockConn.query.mockRejectedValue(new Error("DB failure"));

      const res = await request(app).delete("/api/admin/produtos/10");

      expect(res.status).toBe(500);
      expect(res.body).toMatchObject({ ok: false, code: "SERVER_ERROR" });
      expect(mockConn.rollback).toHaveBeenCalledTimes(1);
      expect(mockConn.release).toHaveBeenCalledTimes(1);
    });
  });
});
