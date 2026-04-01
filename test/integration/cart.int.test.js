// test/integration/cart.int.test.js
const request = require("supertest");
const { makeTestApp, makeMockConn } = require("../testUtils");

jest.mock("../../config/pool", () => ({
  query: jest.fn(),
  getConnection: jest.fn(),
}));

jest.mock("../../middleware/authenticateToken", () => jest.fn());

const pool = require("../../config/pool");
const authenticateToken = require("../../middleware/authenticateToken");
const cartRouter = require("../../routes/ecommerce/cart");

function expectUnauthorized(res) {
  expect(res.status).toBe(401);
  expect(res.body).toHaveProperty("message", "Usuário não autenticado.");
}

function expectValidationMessage(res, expectedMessage = "Dados inválidos.") {
  expect(res.status).toBe(400);
  expect(res.body.message).toBe(expectedMessage);
}

function expectValidationFieldMessage(res, expectedFieldMessage) {
  expectValidationMessage(res);
  expect(res.body?.details?.fields?.[0]?.message).toBe(expectedFieldMessage);
}

function expectStockLimit(res, payload) {
  expect(res.status).toBe(409);
  expect(res.body).toEqual({
    code: "STOCK_LIMIT",
    message: "Limite de estoque atingido.",
    ...payload,
  });
}

describe("Cart routes (integração) — /api/cart", () => {
  let app;

  const setAuthUser = (user) => {
    authenticateToken.mockImplementation((req, _res, next) => {
      req.user = user;
      return next();
    });
  };

  beforeAll(() => {
    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterAll(() => {
    console.error.mockRestore();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    setAuthUser({ id: 10, role: "user" });
    app = makeTestApp("/api/cart", cartRouter);
  });

  describe("GET /api/cart", () => {
    test("200: retorna carrinho_id=null e items=[] quando não há carrinho aberto", async () => {
      pool.query.mockResolvedValueOnce([[]]);

      const res = await request(app).get("/api/cart");

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ carrinho_id: null, items: [] });
      expect(pool.query).toHaveBeenCalledTimes(1);
    });

    test("200: retorna carrinho e itens com stock quando existe carrinho aberto", async () => {
      pool.query
        .mockResolvedValueOnce([[{ id: 12, usuario_id: 10, status: "aberto" }]])
        .mockResolvedValueOnce([
          [
            {
              item_id: 321,
              produto_id: 105,
              quantidade: 2,
              valor_unitario: 79.9,
              nome: "Ração Premium",
              image: "https://cdn.site.com/img.png",
              stock: 7,
            },
          ],
        ]);

      const res = await request(app).get("/api/cart");

      expect(res.status).toBe(200);
      expect(res.body.carrinho_id).toBe(12);
      expect(Array.isArray(res.body.items)).toBe(true);
      expect(res.body.items[0]).toMatchObject({
        item_id: 321,
        produto_id: 105,
        quantidade: 2,
        valor_unitario: 79.9,
        nome: "Ração Premium",
        stock: 7,
      });
      expect(pool.query).toHaveBeenCalledTimes(2);
    });

    test("401: quando req.user.id não existe", async () => {
      setAuthUser(undefined);

      const res = await request(app).get("/api/cart");

      expectUnauthorized(res);
    });

    test("500: erro inesperado no pool.query vira AppError padronizado", async () => {
      pool.query.mockRejectedValueOnce(new Error("db down"));

      const res = await request(app).get("/api/cart");

      expect(res.status).toBe(500);
      expect(res.body).toMatchObject({
        code: expect.any(String),
        message: "Erro ao carregar carrinho.",
      });
    });
  });

  describe("POST /api/cart/items", () => {
    test("401: quando não autenticado", async () => {
      setAuthUser(undefined);

      const res = await request(app)
        .post("/api/cart/items")
        .send({ produto_id: 105, quantidade: 1 });

      expectUnauthorized(res);
      expect(pool.getConnection).not.toHaveBeenCalled();
    });

    test("400: valida produto_id inválido", async () => {
      const res = await request(app)
        .post("/api/cart/items")
        .send({ produto_id: 0, quantidade: 1 });

      expectValidationFieldMessage(
        res,
        "produto_id é obrigatório e deve ser válido."
      );
      expect(pool.getConnection).not.toHaveBeenCalled();
    });

    test("400: valida quantidade <= 0", async () => {
      const res = await request(app)
        .post("/api/cart/items")
        .send({ produto_id: 105, quantidade: 0 });

      expectValidationFieldMessage(
        res,
        "quantidade deve ser um inteiro entre 1 e 10000."
      );
      expect(pool.getConnection).not.toHaveBeenCalled();
    });

    test("400: POST rejeita quantidade negativa (-1)", async () => {
      const res = await request(app)
        .post("/api/cart/items")
        .send({ produto_id: 105, quantidade: -1 });

      expectValidationFieldMessage(
        res,
        "quantidade deve ser um inteiro entre 1 e 10000."
      );
      expect(pool.getConnection).not.toHaveBeenCalled();
    });

    test("400: POST rejeita quantidade acima do limite (10001)", async () => {
      const res = await request(app)
        .post("/api/cart/items")
        .send({ produto_id: 105, quantidade: 10001 });

      expectValidationFieldMessage(
        res,
        "quantidade deve ser um inteiro entre 1 e 10000."
      );
      expect(pool.getConnection).not.toHaveBeenCalled();
    });

    test("200: cria carrinho se não existir e insere item", async () => {
      const conn = makeMockConn();
      pool.getConnection.mockResolvedValue(conn);

      conn.query
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([{ insertId: 55 }])
        .mockResolvedValueOnce([[{ id: 105, price: 79.9, quantity: 7 }]])
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([{ insertId: 999 }]);

      const res = await request(app)
        .post("/api/cart/items")
        .send({ produto_id: 105, quantidade: 2 });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        success: true,
        message: "Produto adicionado ao carrinho",
        produto_id: 105,
        quantidade: 2,
        stock: 7,
      });

      expect(conn.beginTransaction).toHaveBeenCalledTimes(1);
      expect(conn.commit).toHaveBeenCalledTimes(1);
      expect(conn.rollback).not.toHaveBeenCalled();
      expect(conn.release).toHaveBeenCalledTimes(1);
    });

    test("200: incrementa item existente (UPDATE) respeitando estoque", async () => {
      const conn = makeMockConn();
      pool.getConnection.mockResolvedValue(conn);

      conn.query
        .mockResolvedValueOnce([[{ id: 12 }]])
        .mockResolvedValueOnce([[{ id: 105, price: 79.9, quantity: 7 }]])
        .mockResolvedValueOnce([[{ id: 321, quantidade: 3 }]])
        .mockResolvedValueOnce([{ affectedRows: 1 }]);

      const res = await request(app)
        .post("/api/cart/items")
        .send({ produto_id: 105, quantidade: 2 });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        success: true,
        produto_id: 105,
        quantidade: 5,
        stock: 7,
      });

      expect(conn.commit).toHaveBeenCalledTimes(1);
      expect(conn.rollback).not.toHaveBeenCalled();
      expect(conn.release).toHaveBeenCalledTimes(1);
    });

    test("404: produto não encontrado => rollback + erro padronizado", async () => {
      const conn = makeMockConn();
      pool.getConnection.mockResolvedValue(conn);

      conn.query
        .mockResolvedValueOnce([[{ id: 12 }]])
        .mockResolvedValueOnce([[]]);

      const res = await request(app)
        .post("/api/cart/items")
        .send({ produto_id: 9999, quantidade: 1 });

      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty("code");
      expect(res.body).toHaveProperty("message", "Produto não encontrado.");

      expect(conn.rollback).toHaveBeenCalledTimes(1);
      expect(conn.commit).not.toHaveBeenCalled();
      expect(conn.release).toHaveBeenCalledTimes(1);
    });

    test("409: STOCK_LIMIT quando desired > stock (payload compatível)", async () => {
      const conn = makeMockConn();
      pool.getConnection.mockResolvedValue(conn);

      conn.query
        .mockResolvedValueOnce([[{ id: 12 }]])
        .mockResolvedValueOnce([[{ id: 105, price: 79.9, quantity: 2 }]])
        .mockResolvedValueOnce([[{ id: 321, quantidade: 1 }]]);

      const res = await request(app)
        .post("/api/cart/items")
        .send({ produto_id: 105, quantidade: 2 });

      expectStockLimit(res, {
        max: 2,
        current: 1,
        requested: 3,
      });

      expect(conn.rollback).toHaveBeenCalledTimes(1);
      expect(conn.commit).not.toHaveBeenCalled();
      expect(conn.release).toHaveBeenCalledTimes(1);
    });

    test("409: STOCK_LIMIT quando produto com stock <= 0", async () => {
      const conn = makeMockConn();
      pool.getConnection.mockResolvedValue(conn);

      conn.query
        .mockResolvedValueOnce([[{ id: 12 }]])
        .mockResolvedValueOnce([[{ id: 105, price: 79.9, quantity: 0 }]]);

      const res = await request(app)
        .post("/api/cart/items")
        .send({ produto_id: 105, quantidade: 1 });

      expect(res.status).toBe(409);
      expect(res.body).toMatchObject({
        code: "STOCK_LIMIT",
        message: "Limite de estoque atingido.",
        max: 0,
        current: 0,
        requested: 1,
      });

      expect(conn.rollback).toHaveBeenCalledTimes(1);
      expect(conn.release).toHaveBeenCalledTimes(1);
    });
  });

  describe("PATCH /api/cart/items", () => {
    test("200: se não existe carrinho aberto, retorna 'Carrinho já vazio.'", async () => {
      const conn = makeMockConn();
      pool.getConnection.mockResolvedValue(conn);

      conn.query.mockResolvedValueOnce([[]]);

      const res = await request(app)
        .patch("/api/cart/items")
        .send({ produto_id: 105, quantidade: 3 });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        success: true,
        message: "Carrinho já vazio.",
        produto_id: 105,
        quantidade: 0,
        stock: 0,
      });

      expect(conn.commit).toHaveBeenCalledTimes(1);
      expect(conn.release).toHaveBeenCalledTimes(1);
    });

    test("400: quantidade 0 é proibido (use DELETE para remover)", async () => {
      const res = await request(app)
        .patch("/api/cart/items")
        .send({ produto_id: 105, quantidade: 0 });

      expectValidationFieldMessage(
        res,
        "quantidade deve ser um inteiro entre 1 e 10000."
      );
      expect(pool.getConnection).not.toHaveBeenCalled();
    });

    test("200: atualiza quantidade quando q <= stock", async () => {
      const conn = makeMockConn();
      pool.getConnection.mockResolvedValue(conn);

      conn.query
        .mockResolvedValueOnce([[{ id: 12 }]])
        .mockResolvedValueOnce([[{ id: 105, quantity: 7 }]])
        .mockResolvedValueOnce([{ affectedRows: 1 }]);

      const res = await request(app)
        .patch("/api/cart/items")
        .send({ produto_id: 105, quantidade: 5 });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        success: true,
        message: "Quantidade atualizada.",
        produto_id: 105,
        quantidade: 5,
        stock: 7,
      });

      expect(conn.commit).toHaveBeenCalledTimes(1);
      expect(conn.rollback).not.toHaveBeenCalled();
      expect(conn.release).toHaveBeenCalledTimes(1);
    });

    test("409: STOCK_LIMIT quando q > stock (current=null)", async () => {
      const conn = makeMockConn();
      pool.getConnection.mockResolvedValue(conn);

      conn.query
        .mockResolvedValueOnce([[{ id: 12 }]])
        .mockResolvedValueOnce([[{ id: 105, quantity: 2 }]]);

      const res = await request(app)
        .patch("/api/cart/items")
        .send({ produto_id: 105, quantidade: 3 });

      expectStockLimit(res, {
        max: 2,
        current: null,
        requested: 3,
      });

      expect(conn.rollback).toHaveBeenCalledTimes(1);
      expect(conn.commit).not.toHaveBeenCalled();
      expect(conn.release).toHaveBeenCalledTimes(1);
    });

    test("400: quantidade inválida (NaN)", async () => {
      const res = await request(app)
        .patch("/api/cart/items")
        .send({ produto_id: 105, quantidade: "abc" });

      expectValidationFieldMessage(
        res,
        "quantidade deve ser um inteiro entre 1 e 10000."
      );
      expect(pool.getConnection).not.toHaveBeenCalled();
    });

    test("400: PATCH rejeita quantidade negativa (-1)", async () => {
      const res = await request(app)
        .patch("/api/cart/items")
        .send({ produto_id: 105, quantidade: -1 });

      expectValidationFieldMessage(
        res,
        "quantidade deve ser um inteiro entre 1 e 10000."
      );
      expect(pool.getConnection).not.toHaveBeenCalled();
    });

    test("400: PATCH rejeita quantidade acima do limite (10001)", async () => {
      const res = await request(app)
        .patch("/api/cart/items")
        .send({ produto_id: 105, quantidade: 10001 });

      expectValidationFieldMessage(
        res,
        "quantidade deve ser um inteiro entre 1 e 10000."
      );
      expect(pool.getConnection).not.toHaveBeenCalled();
    });
  });

  describe("DELETE /api/cart/items/:produtoId", () => {
    test("400: produtoId inválido", async () => {
      const res = await request(app).delete("/api/cart/items/0");

      expectValidationFieldMessage(res, "produtoId inválido.");
      expect(pool.getConnection).not.toHaveBeenCalled();
    });

    test("200: quando não há carrinho aberto, retorna 'Carrinho já vazio.'", async () => {
      const conn = makeMockConn();
      pool.getConnection.mockResolvedValue(conn);

      conn.query.mockResolvedValueOnce([[]]);

      const res = await request(app).delete("/api/cart/items/105");

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, message: "Carrinho já vazio." });
      expect(conn.commit).toHaveBeenCalledTimes(1);
      expect(conn.release).toHaveBeenCalledTimes(1);
    });

    test("200: remove item específico quando carrinho existe", async () => {
      const conn = makeMockConn();
      pool.getConnection.mockResolvedValue(conn);

      conn.query
        .mockResolvedValueOnce([[{ id: 12 }]])
        .mockResolvedValueOnce([{ affectedRows: 1 }]);

      const res = await request(app).delete("/api/cart/items/105");

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        success: true,
        message: "Item removido do carrinho.",
      });
      expect(conn.commit).toHaveBeenCalledTimes(1);
      expect(conn.rollback).not.toHaveBeenCalled();
      expect(conn.release).toHaveBeenCalledTimes(1);
    });
  });

  describe("DELETE /api/cart", () => {
    test("200: quando carrinho não existe, retorna 'Carrinho já estava vazio.'", async () => {
      const conn = makeMockConn();
      pool.getConnection.mockResolvedValue(conn);

      conn.query.mockResolvedValueOnce([[]]);

      const res = await request(app).delete("/api/cart");

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        success: true,
        message: "Carrinho já estava vazio.",
      });
      expect(conn.commit).toHaveBeenCalledTimes(1);
      expect(conn.release).toHaveBeenCalledTimes(1);
    });

    test("200: limpa itens e fecha carrinho quando existe", async () => {
      const conn = makeMockConn();
      pool.getConnection.mockResolvedValue(conn);

      conn.query
        .mockResolvedValueOnce([[{ id: 12 }]])
        .mockResolvedValueOnce([{ affectedRows: 2 }])
        .mockResolvedValueOnce([{ affectedRows: 1 }]);

      const res = await request(app).delete("/api/cart");

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, message: "Carrinho limpo." });

      expect(conn.query).toHaveBeenCalledWith(
        "DELETE FROM carrinho_itens WHERE carrinho_id = ?",
        [12]
      );
      expect(conn.query).toHaveBeenCalledWith(
        'UPDATE carrinhos SET status = "fechado" WHERE id = ?',
        [12]
      );

      expect(conn.commit).toHaveBeenCalledTimes(1);
      expect(conn.rollback).not.toHaveBeenCalled();
      expect(conn.release).toHaveBeenCalledTimes(1);
    });

    test("401: quando não autenticado", async () => {
      setAuthUser(undefined);

      const res = await request(app).delete("/api/cart");

      expectUnauthorized(res);
      expect(pool.getConnection).not.toHaveBeenCalled();
    });
  });
});