// teste/integration/cart.int.test.js
const request = require("supertest");
const { makeTestApp, makeMockConn } = require("../testUtils");

// Mocks obrigatórios: pool e authenticateToken
// Ajuste: no seu projeto NÃO existe /src, então apontamos para a raiz.
jest.mock("../../config/pool", () => ({
  query: jest.fn(),
  getConnection: jest.fn(),
}));

// Middleware de auth é aplicado via router.use(authenticateToken)
// Então mockamos para injetar req.user conforme cada teste
jest.mock("../../middleware/authenticateToken", () => jest.fn());

// Agora importamos os mocks para configurar comportamento
const pool = require("../../config/pool");
const authenticateToken = require("../../middleware/authenticateToken");

// Importa o router real (arquivo alvo)
const cartRouter = require("../../routes/cart");

describe("Cart routes (integração) — /api/cart", () => {
  let app;

  const setAuthUser = (user) => {
    authenticateToken.mockImplementation((req, res, next) => {
      req.user = user; // pode ser undefined para simular visitante
      return next();
    });
  };

  beforeAll(() => {
    // Silencia logs esperados em cenários de erro
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
      // Arrange
      pool.query.mockResolvedValueOnce([[]]); // SELECT carrinhos => rows vazio

      // Act
      const res = await request(app).get("/api/cart");

      // Assert
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ carrinho_id: null, items: [] });
      expect(pool.query).toHaveBeenCalledTimes(1);
    });

    test("200: retorna carrinho e itens com stock quando existe carrinho aberto", async () => {
      // Arrange
      pool.query
        .mockResolvedValueOnce([[{ id: 12, usuario_id: 10, status: "aberto" }]]) // carrinho
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

      // Act
      const res = await request(app).get("/api/cart");

      // Assert
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
      // Arrange
      setAuthUser(undefined);

      // Act
      const res = await request(app).get("/api/cart");

      // Assert
      expect(res.status).toBe(401);
      expect(res.body).toHaveProperty("code");
      expect(res.body).toHaveProperty("message", "Usuário não autenticado.");
    });

    test("500: erro inesperado no pool.query vira AppError padronizado", async () => {
      // Arrange
      pool.query.mockRejectedValueOnce(new Error("db down"));

      // Act
      const res = await request(app).get("/api/cart");

      // Assert
      expect(res.status).toBe(500);
      expect(res.body).toMatchObject({
        code: expect.any(String),
        message: "Erro ao carregar carrinho.",
      });
    });
  });

  describe("POST /api/cart/items", () => {
    test("401: quando não autenticado", async () => {
      // Arrange
      setAuthUser(undefined);

      // Act
      const res = await request(app)
        .post("/api/cart/items")
        .send({ produto_id: 105, quantidade: 1 });

      // Assert
      expect(res.status).toBe(401);
      expect(res.body.message).toBe("Usuário não autenticado.");
      expect(pool.getConnection).not.toHaveBeenCalled();
    });

    test("400: valida produto_id inválido", async () => {
      // Act
      const res = await request(app)
        .post("/api/cart/items")
        .send({ produto_id: 0, quantidade: 1 });

      // Assert
      expect(res.status).toBe(400);
      expect(res.body.message).toBe("produto_id é obrigatório e deve ser válido.");
      expect(pool.getConnection).not.toHaveBeenCalled();
    });

    test("400: valida quantidade <= 0", async () => {
      // Act
      const res = await request(app)
        .post("/api/cart/items")
        .send({ produto_id: 105, quantidade: 0 });

      // Assert
      expect(res.status).toBe(400);
      expect(res.body.message).toBe("quantidade deve ser um número maior que zero.");
      expect(pool.getConnection).not.toHaveBeenCalled();
    });

    test("200: cria carrinho se não existir e insere item", async () => {
      // Arrange
      const conn = makeMockConn();
      pool.getConnection.mockResolvedValue(conn);

      conn.query
        // 1) SELECT carrinho aberto => vazio
        .mockResolvedValueOnce([[]])
        // 1b) INSERT carrinho => insertId
        .mockResolvedValueOnce([{ insertId: 55 }])
        // 2) SELECT produto FOR UPDATE
        .mockResolvedValueOnce([[{ id: 105, price: 79.9, quantity: 7 }]])
        // 3) SELECT item existente => vazio
        .mockResolvedValueOnce([[]])
        // 4) INSERT carrinho_itens
        .mockResolvedValueOnce([{ insertId: 999 }]);

      // Act
      const res = await request(app)
        .post("/api/cart/items")
        .send({ produto_id: 105, quantidade: 2 });

      // Assert
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
      // Arrange
      const conn = makeMockConn();
      pool.getConnection.mockResolvedValue(conn);

      conn.query
        // carrinho existe
        .mockResolvedValueOnce([[{ id: 12 }]])
        // produto
        .mockResolvedValueOnce([[{ id: 105, price: 79.9, quantity: 7 }]])
        // item existente com quantidade 3
        .mockResolvedValueOnce([[{ id: 321, quantidade: 3 }]])
        // UPDATE carrinho_itens
        .mockResolvedValueOnce([{ affectedRows: 1 }]);

      // Act
      const res = await request(app)
        .post("/api/cart/items")
        .send({ produto_id: 105, quantidade: 2 });

      // Assert
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        success: true,
        produto_id: 105,
        quantidade: 5,
        stock: 7,
      });

      expect(conn.commit).toHaveBeenCalledTimes(1);
      expect(conn.rollback).not.toHaveBeenCalled();
    });

    test("404: produto não encontrado => rollback + erro padronizado", async () => {
      // Arrange
      const conn = makeMockConn();
      pool.getConnection.mockResolvedValue(conn);

      conn.query
        .mockResolvedValueOnce([[{ id: 12 }]]) // carrinho
        .mockResolvedValueOnce([[]]); // produto inexistente

      // Act
      const res = await request(app)
        .post("/api/cart/items")
        .send({ produto_id: 9999, quantidade: 1 });

      // Assert
      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty("code");
      expect(res.body).toHaveProperty("message", "Produto não encontrado.");

      expect(conn.rollback).toHaveBeenCalledTimes(1);
      expect(conn.commit).not.toHaveBeenCalled();
      expect(conn.release).toHaveBeenCalledTimes(1);
    });

    test("409: STOCK_LIMIT quando desired > stock (payload compatível)", async () => {
      // Arrange
      const conn = makeMockConn();
      pool.getConnection.mockResolvedValue(conn);

      conn.query
        .mockResolvedValueOnce([[{ id: 12 }]]) // carrinho
        .mockResolvedValueOnce([[{ id: 105, price: 79.9, quantity: 2 }]]) // stock=2
        .mockResolvedValueOnce([[{ id: 321, quantidade: 1 }]]); // current=1 => desired=3 > 2

      // Act
      const res = await request(app)
        .post("/api/cart/items")
        .send({ produto_id: 105, quantidade: 2 });

      // Assert
      expect(res.status).toBe(409);
      expect(res.body).toEqual({
        code: "STOCK_LIMIT",
        message: "Limite de estoque atingido.",
        max: 2,
        current: 1,
        requested: 3,
      });

      expect(conn.rollback).toHaveBeenCalledTimes(1);
      expect(conn.commit).not.toHaveBeenCalled();
      expect(conn.release).toHaveBeenCalledTimes(1);
    });

    test("409: STOCK_LIMIT quando produto com stock <= 0", async () => {
      // Arrange
      const conn = makeMockConn();
      pool.getConnection.mockResolvedValue(conn);

      conn.query
        .mockResolvedValueOnce([[{ id: 12 }]]) // carrinho
        .mockResolvedValueOnce([[{ id: 105, price: 79.9, quantity: 0 }]]); // sem stock

      // Act
      const res = await request(app)
        .post("/api/cart/items")
        .send({ produto_id: 105, quantidade: 1 });

      // Assert
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
      // Arrange
      const conn = makeMockConn();
      pool.getConnection.mockResolvedValue(conn);

      conn.query.mockResolvedValueOnce([[]]); // SELECT carrinho => vazio

      // Act
      const res = await request(app)
        .patch("/api/cart/items")
        .send({ produto_id: 105, quantidade: 3 });

      // Assert
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

    test("200: quantidade <= 0 remove item sem validar estoque", async () => {
      // Arrange
      const conn = makeMockConn();
      pool.getConnection.mockResolvedValue(conn);

      conn.query
        .mockResolvedValueOnce([[{ id: 12 }]]) // carrinho existe
        .mockResolvedValueOnce([{ affectedRows: 1 }]); // DELETE carrinho_itens

      // Act
      const res = await request(app)
        .patch("/api/cart/items")
        .send({ produto_id: 105, quantidade: 0 });

      // Assert
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        success: true,
        message: "Item removido.",
        produto_id: 105,
        quantidade: 0,
        stock: 0,
      });

      expect(conn.query).toHaveBeenCalledWith(
        "DELETE FROM carrinho_itens WHERE carrinho_id = ? AND produto_id = ?",
        [12, 105]
      );
      expect(conn.commit).toHaveBeenCalledTimes(1);
    });

    test("200: atualiza quantidade quando q <= stock", async () => {
      // Arrange
      const conn = makeMockConn();
      pool.getConnection.mockResolvedValue(conn);

      conn.query
        .mockResolvedValueOnce([[{ id: 12 }]]) // carrinho
        .mockResolvedValueOnce([[{ id: 105, quantity: 7 }]]) // produto
        .mockResolvedValueOnce([{ affectedRows: 1 }]); // UPDATE item

      // Act
      const res = await request(app)
        .patch("/api/cart/items")
        .send({ produto_id: 105, quantidade: 5 });

      // Assert
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
    });

    test("409: STOCK_LIMIT quando q > stock (current=null)", async () => {
      // Arrange
      const conn = makeMockConn();
      pool.getConnection.mockResolvedValue(conn);

      conn.query
        .mockResolvedValueOnce([[{ id: 12 }]]) // carrinho
        .mockResolvedValueOnce([[{ id: 105, quantity: 2 }]]); // stock=2

      // Act
      const res = await request(app)
        .patch("/api/cart/items")
        .send({ produto_id: 105, quantidade: 3 });

      // Assert
      expect(res.status).toBe(409);
      expect(res.body).toEqual({
        code: "STOCK_LIMIT",
        message: "Limite de estoque atingido.",
        max: 2,
        current: null,
        requested: 3,
      });

      expect(conn.rollback).toHaveBeenCalledTimes(1);
      expect(conn.commit).not.toHaveBeenCalled();
    });

    test("400: quantidade inválida (NaN)", async () => {
      // Act
      const res = await request(app)
        .patch("/api/cart/items")
        .send({ produto_id: 105, quantidade: "abc" });

      // Assert
      expect(res.status).toBe(400);
      expect(res.body.message).toBe("quantidade inválida.");
      expect(pool.getConnection).not.toHaveBeenCalled();
    });
  });

  describe("DELETE /api/cart/items/:produtoId", () => {
    test("400: produtoId inválido", async () => {
      const res = await request(app).delete("/api/cart/items/0");
      expect(res.status).toBe(400);
      expect(res.body.message).toBe("produtoId inválido.");
      expect(pool.getConnection).not.toHaveBeenCalled();
    });

    test("200: quando não há carrinho aberto, retorna 'Carrinho já vazio.'", async () => {
      // Arrange
      const conn = makeMockConn();
      pool.getConnection.mockResolvedValue(conn);

      conn.query.mockResolvedValueOnce([[]]); // SELECT carrinho => vazio

      // Act
      const res = await request(app).delete("/api/cart/items/105");

      // Assert
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, message: "Carrinho já vazio." });
      expect(conn.commit).toHaveBeenCalledTimes(1);
      expect(conn.release).toHaveBeenCalledTimes(1);
    });

    test("200: remove item específico quando carrinho existe", async () => {
      // Arrange
      const conn = makeMockConn();
      pool.getConnection.mockResolvedValue(conn);

      conn.query
        .mockResolvedValueOnce([[{ id: 12 }]]) // carrinho
        .mockResolvedValueOnce([{ affectedRows: 1 }]); // DELETE item

      // Act
      const res = await request(app).delete("/api/cart/items/105");

      // Assert
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, message: "Item removido do carrinho." });
      expect(conn.commit).toHaveBeenCalledTimes(1);
      expect(conn.rollback).not.toHaveBeenCalled();
      expect(conn.release).toHaveBeenCalledTimes(1);
    });
  });

  describe("DELETE /api/cart", () => {
    test("200: quando carrinho não existe, retorna 'Carrinho já estava vazio.'", async () => {
      // Arrange
      const conn = makeMockConn();
      pool.getConnection.mockResolvedValue(conn);

      conn.query.mockResolvedValueOnce([[]]); // SELECT carrinho => vazio

      // Act
      const res = await request(app).delete("/api/cart");

      // Assert
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, message: "Carrinho já estava vazio." });
      expect(conn.commit).toHaveBeenCalledTimes(1);
      expect(conn.release).toHaveBeenCalledTimes(1);
    });

    test("200: limpa itens e fecha carrinho quando existe", async () => {
      // Arrange
      const conn = makeMockConn();
      pool.getConnection.mockResolvedValue(conn);

      conn.query
        .mockResolvedValueOnce([[{ id: 12 }]]) // SELECT carrinho
        .mockResolvedValueOnce([{ affectedRows: 2 }]) // DELETE carrinho_itens
        .mockResolvedValueOnce([{ affectedRows: 1 }]); // UPDATE carrinhos status fechado

      // Act
      const res = await request(app).delete("/api/cart");

      // Assert
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
      // Arrange
      setAuthUser(undefined);

      // Act
      const res = await request(app).delete("/api/cart");

      // Assert
      expect(res.status).toBe(401);
      expect(res.body.message).toBe("Usuário não autenticado.");
      expect(pool.getConnection).not.toHaveBeenCalled();
    });
  });
});
