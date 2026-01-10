// teste/integration/payment.int.test.js

const request = require("supertest");
const crypto = require("crypto");
const { makeTestApp, makeMockConn } = require("../testUtils");
const { makeMockPool } = require("../mocks/pool.mock");

describe("Payment Routes (integration)", () => {
  // Paths resolvidos (garante que mocks batem com os requires do router)
  const poolPath = require.resolve("../../config/pool");
  const appErrorPath = require.resolve("../../errors/AppError");
  const errorCodesPath = require.resolve("../../constants/ErrorCodes");
  const routerPath = require.resolve("../../routes/payment");
  const mpSdkPath = require.resolve("mercadopago");

  let app;
  let pool;

  // SDK MP mocks (controle por teste)
  const mpState = {
    preferenceCreate: jest.fn(),
    paymentGet: jest.fn(),
  };

  function loadAppWithMocks() {
    jest.resetModules();
    jest.clearAllMocks();

    // Env defaults seguros para os testes
    process.env.APP_URL = "http://localhost:3000";
    process.env.BACKEND_URL = "http://localhost:5000";
    process.env.MP_ACCESS_TOKEN = "test-token";
    delete process.env.MP_WEBHOOK_SECRET;

    // Mock ErrorCodes
    jest.doMock(errorCodesPath, () => ({
      VALIDATION_ERROR: "VALIDATION_ERROR",
      SERVER_ERROR: "SERVER_ERROR",
      NOT_FOUND: "NOT_FOUND",
    }));

    // Mock AppError compatível
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

    // Mock pool (sem MySQL real)
    const mockPool = makeMockPool();
    jest.doMock(poolPath, () => mockPool);

    // Mock MercadoPago SDK (NUNCA rede)
    jest.doMock(mpSdkPath, () => {
      class MercadoPagoConfig {
        constructor(_opts) {}
      }
      class Preference {
        constructor(_client) {}
        create({ body }) {
          return mpState.preferenceCreate({ body });
        }
      }
      class Payment {
        constructor(_client) {}
        get({ id }) {
          return mpState.paymentGet({ id });
        }
      }
      return { MercadoPagoConfig, Preference, Payment };
    });

    // Importa router após mocks
    const router = require(routerPath);
    pool = require(poolPath);

    // Monta app sob /api/payment
    app = makeTestApp("/api/payment", router);

    return { app, pool };
  }

  beforeEach(() => {
    loadAppWithMocks();
  });

  afterEach(() => {
    // Evita vazamento entre testes
    delete process.env.NODE_ENV;
    delete process.env.MP_WEBHOOK_SECRET;
  });

  // ---------------------------
  // PUBLIC: GET /methods
  // ---------------------------
  describe("GET /api/payment/methods", () => {
    test("200 retorna métodos ativos ordenados", async () => {
      // Arrange
      const conn = makeMockConn();
      pool.getConnection.mockResolvedValueOnce(conn);
      conn.query.mockResolvedValueOnce([
        [
          { id: 1, code: "pix", label: "Pix", is_active: 1, sort_order: 10 },
          { id: 2, code: "boleto", label: "Boleto", is_active: 1, sort_order: 20 },
        ],
      ]);

      // Act
      const res = await request(app).get("/api/payment/methods");

      // Assert
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        methods: [
          { id: 1, code: "pix", label: "Pix", is_active: 1, sort_order: 10 },
          { id: 2, code: "boleto", label: "Boleto", is_active: 1, sort_order: 20 },
        ],
      });
      expect(pool.getConnection).toHaveBeenCalledTimes(1);
      expect(conn.release).toHaveBeenCalledTimes(1);
    });

    test("500 quando query falha", async () => {
      // Arrange
      const conn = makeMockConn();
      pool.getConnection.mockResolvedValueOnce(conn);
      conn.query.mockRejectedValueOnce(new Error("db down"));

      // Act
      const res = await request(app).get("/api/payment/methods");

      // Assert
      expect(res.status).toBe(500);
      expect(res.body).toMatchObject({
        code: "SERVER_ERROR",
        message: "Erro ao listar métodos de pagamento.",
      });
      expect(conn.release).toHaveBeenCalledTimes(1);
    });
  });

  // ---------------------------
  // ADMIN: CRUD payment-methods
  // ---------------------------
  describe("ADMIN CRUD /api/payment/admin/payment-methods", () => {
    test("GET 200 lista todos (ativos e inativos)", async () => {
      // Arrange
      const conn = makeMockConn();
      pool.getConnection.mockResolvedValueOnce(conn);
      conn.query.mockResolvedValueOnce([
        [
          { id: 1, code: "pix", label: "Pix", is_active: 1, sort_order: 10 },
          { id: 2, code: "prazo", label: "Prazo", is_active: 0, sort_order: 99 },
        ],
      ]);

      // Act
      const res = await request(app).get("/api/payment/admin/payment-methods");

      // Assert
      expect(res.status).toBe(200);
      expect(res.body.methods).toHaveLength(2);
      expect(conn.release).toHaveBeenCalledTimes(1);
    });

    test("POST 400 se code/label ausentes", async () => {
      // Act
      const res = await request(app).post("/api/payment/admin/payment-methods").send({
        code: " ",
        label: "",
      });

      // Assert
      expect(res.status).toBe(400);
      expect(res.body).toEqual({
        code: "VALIDATION_ERROR",
        message: "code e label são obrigatórios.",
      });
    });

    test("POST 201 cria e retorna método criado (normaliza is_active/sort_order)", async () => {
      // Arrange
      const conn = makeMockConn();
      pool.getConnection.mockResolvedValueOnce(conn);

      conn.query
        .mockResolvedValueOnce([{ insertId: 123 }]) // INSERT
        .mockResolvedValueOnce([[{ id: 123, code: "pix", label: "Pix", is_active: 1, sort_order: 10 }]]); // SELECT created

      // Act
      const res = await request(app).post("/api/payment/admin/payment-methods").send({
        code: "  pix  ",
        label: " Pix ",
        description: "Pagamento instantâneo",
        is_active: "1",
        sort_order: "10",
      });

      // Assert
      expect(res.status).toBe(201);
      expect(res.body.method).toEqual({
        id: 123,
        code: "pix",
        label: "Pix",
        is_active: 1,
        sort_order: 10,
      });

      const insertCall = conn.query.mock.calls[0];
      expect(String(insertCall[0])).toContain("INSERT INTO payment_methods");
      expect(insertCall[1]).toEqual(["pix", "Pix", "Pagamento instantâneo", 1, 10]);

      expect(conn.release).toHaveBeenCalledTimes(1);
    });

    test("POST 400 quando duplicate code (ER_DUP...)", async () => {
      // Arrange
      const conn = makeMockConn();
      pool.getConnection.mockResolvedValueOnce(conn);
      const dupErr = new Error("dup");
      dupErr.code = "ER_DUP_ENTRY";
      conn.query.mockRejectedValueOnce(dupErr);

      // Act
      const res = await request(app).post("/api/payment/admin/payment-methods").send({
        code: "pix",
        label: "Pix",
      });

      // Assert
      expect(res.status).toBe(400);
      expect(res.body).toEqual({
        code: "VALIDATION_ERROR",
        message: "Já existe um método com esse code.",
      });
      expect(conn.release).toHaveBeenCalledTimes(1);
    });

    test("PUT 400 id inválido", async () => {
      const res = await request(app).put("/api/payment/admin/payment-methods/0").send({ label: "X" });
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ code: "VALIDATION_ERROR", message: "id inválido." });
    });

    test("PUT 400 se nenhum campo enviado", async () => {
      const res = await request(app).put("/api/payment/admin/payment-methods/10").send({});
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ code: "VALIDATION_ERROR", message: "Nenhum campo para atualizar." });
    });

    test("PUT 404 se método não existe", async () => {
      // Arrange
      const conn = makeMockConn();
      pool.getConnection.mockResolvedValueOnce(conn);
      conn.query.mockResolvedValueOnce([[null]]); // SELECT exists

      // Act
      const res = await request(app).put("/api/payment/admin/payment-methods/10").send({ label: "Novo" });

      // Assert
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ code: "NOT_FOUND", message: "Método não encontrado." });
      expect(conn.release).toHaveBeenCalledTimes(1);
    });

    test("PUT 200 atualiza label/description ('' -> null) e retorna atualizado", async () => {
      // Arrange
      const conn = makeMockConn();
      pool.getConnection.mockResolvedValueOnce(conn);

      conn.query
        .mockResolvedValueOnce([[{ id: 10 }]]) // exists
        .mockResolvedValueOnce([{}]) // UPDATE
        .mockResolvedValueOnce([[{ id: 10, code: "pix", label: "Pix 2", description: null, is_active: 1, sort_order: 10 }]]); // SELECT updated

      // Act
      const res = await request(app).put("/api/payment/admin/payment-methods/10").send({
        label: " Pix 2 ",
        description: "",
      });

      // Assert
      expect(res.status).toBe(200);
      expect(res.body.method).toMatchObject({
        id: 10,
        code: "pix",
        label: "Pix 2",
        description: null,
      });

      const updateCall = conn.query.mock.calls[1];
      expect(String(updateCall[0])).toContain("UPDATE payment_methods");
      expect(updateCall[1]).toEqual(["Pix 2", null, 10]);

      expect(conn.release).toHaveBeenCalledTimes(1);
    });

    test("DELETE 404 se método não existe", async () => {
      // Arrange
      const conn = makeMockConn();
      pool.getConnection.mockResolvedValueOnce(conn);
      conn.query.mockResolvedValueOnce([[null]]);

      // Act
      const res = await request(app).delete("/api/payment/admin/payment-methods/10");

      // Assert
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ code: "NOT_FOUND", message: "Método não encontrado." });
      expect(conn.release).toHaveBeenCalledTimes(1);
    });

    test("DELETE 200 soft delete desativa e retorna ok", async () => {
      // Arrange
      const conn = makeMockConn();
      pool.getConnection.mockResolvedValueOnce(conn);
      conn.query
        .mockResolvedValueOnce([[{ id: 10 }]]) // exists
        .mockResolvedValueOnce([{}]); // UPDATE is_active=0

      // Act
      const res = await request(app).delete("/api/payment/admin/payment-methods/10");

      // Assert
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true });
      expect(conn.release).toHaveBeenCalledTimes(1);
    });
  });

  // ---------------------------
  // MP FLOW: POST /start
  // ---------------------------
  describe("POST /api/payment/start", () => {
    test("400 pedidoId inválido", async () => {
      const res = await request(app).post("/api/payment/start").send({ pedidoId: 0 });
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ code: "VALIDATION_ERROR", message: "pedidoId é obrigatório." });
    });

    test("404 pedido não encontrado", async () => {
      // Arrange
      const conn = makeMockConn();
      pool.getConnection.mockResolvedValueOnce(conn);
      conn.query.mockResolvedValueOnce([[null]]); // SELECT pedido

      // Act
      const res = await request(app).post("/api/payment/start").send({ pedidoId: 123 });

      // Assert
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ code: "NOT_FOUND", message: "Pedido não encontrado." });
      expect(conn.release).toHaveBeenCalledTimes(1);
    });

    test("400 quando forma_pagamento = 'Prazo' (não é MP)", async () => {
      // Arrange
      const conn = makeMockConn();
      pool.getConnection.mockResolvedValueOnce(conn);

      conn.query.mockResolvedValueOnce([[{ id: 123, forma_pagamento: "Prazo" }]]);

      // Act
      const res = await request(app).post("/api/payment/start").send({ pedidoId: 123 });

      // Assert
      expect(res.status).toBe(400);
      expect(res.body).toEqual({
        code: "VALIDATION_ERROR",
        message: "Forma de pagamento 'Prazo' não é processada pelo Mercado Pago.",
      });
      expect(conn.release).toHaveBeenCalledTimes(1);
    });

    test("200 cria preferência e atualiza status_pagamento='pendente' (PIX filtra payment_methods)", async () => {
      // Arrange
      const conn = makeMockConn();
      pool.getConnection.mockResolvedValueOnce(conn);

      // SELECT pedido -> pix
      conn.query
        .mockResolvedValueOnce([[{ id: 123, forma_pagamento: "Pix" }]])
        // SELECT itens para total
        .mockResolvedValueOnce([
          [
            { quantidade: 2, valor_unitario: "10.00" },
            { quantidade: 1, valor_unitario: "5.50" },
          ],
        ])
        // UPDATE status_pagamento
        .mockResolvedValueOnce([{}]);

      mpState.preferenceCreate.mockResolvedValueOnce({
        id: "pref_1",
        init_point: "https://mp/init",
        sandbox_init_point: "https://mp/sandbox",
      });

      // Act
      const res = await request(app).post("/api/payment/start").send({ pedidoId: 123 });

      // Assert
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        preferenceId: "pref_1",
        init_point: "https://mp/init",
        sandbox_init_point: "https://mp/sandbox",
      });

      // Preference body: total = 25.50
      expect(mpState.preferenceCreate).toHaveBeenCalledTimes(1);
      const { body } = mpState.preferenceCreate.mock.calls[0][0];
      expect(body.items[0].unit_price).toBe(25.5);
      expect(body.metadata).toEqual({ pedidoId: 123 });

      // PIX: exclui cartões e ticket
      expect(body.payment_methods).toBeTruthy();
      const excluded = body.payment_methods.excluded_payment_types.map((x) => x.id).sort();
      expect(excluded).toEqual(["credit_card", "debit_card", "ticket"].sort());

      // Atualizou pedidos.status_pagamento
      const updateCall = conn.query.mock.calls[2];
      expect(String(updateCall[0])).toContain("UPDATE pedidos");
      expect(updateCall[1]).toEqual([123]);

      expect(conn.release).toHaveBeenCalledTimes(1);
    });

    test("500 quando Preference.create falha com erro genérico", async () => {
      // Arrange
      const conn = makeMockConn();
      pool.getConnection.mockResolvedValueOnce(conn);

      conn.query
        .mockResolvedValueOnce([[{ id: 123, forma_pagamento: "Pix" }]])
        .mockResolvedValueOnce([[{ quantidade: 1, valor_unitario: "10.00" }]]);

      mpState.preferenceCreate.mockRejectedValueOnce(new Error("mp fail"));

      // Act
      const res = await request(app).post("/api/payment/start").send({ pedidoId: 123 });

      // Assert
      expect(res.status).toBe(500);
      expect(res.body).toEqual({
        code: "SERVER_ERROR",
        message: "Erro ao iniciar pagamento com o Mercado Pago.",
      });
      expect(conn.release).toHaveBeenCalledTimes(1);
    });
  });

  // ---------------------------
  // WEBHOOK: POST /webhook
  // ---------------------------
  describe("POST /api/payment/webhook", () => {
    function signWebhook({ secret, ts, body }) {
      const payloadString = JSON.stringify(body || {});
      const v1 = crypto
        .createHmac("sha256", secret)
        .update(`${ts}.${payloadString}`)
        .digest("hex");
      return { signature: `ts=${ts},v1=${v1}` };
    }

    test("401 quando headers x-signature ou x-idempotency-key ausentes", async () => {
      // Act
      const res = await request(app).post("/api/payment/webhook").send({ type: "payment" });

      // Assert
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ ok: false });
    });

    test("quando MP_WEBHOOK_SECRET não configurado: dev => 500, prod => 200", async () => {
      // Arrange
      const body = { type: "payment", data: { id: "999" } };

      // dev
      process.env.NODE_ENV = "development";
      const resDev = await request(app)
        .post("/api/payment/webhook")
        .set("x-signature", "ts=1,v1=abc")
        .set("x-idempotency-key", "k1")
        .send(body);

      expect(resDev.status).toBe(500);
      expect(resDev.body).toEqual({ ok: false });

      // prod
      process.env.NODE_ENV = "production";
      const resProd = await request(app)
        .post("/api/payment/webhook")
        .set("x-signature", "ts=1,v1=abc")
        .set("x-idempotency-key", "k2")
        .send(body);

      expect(resProd.status).toBe(200);
      expect(resProd.body).toEqual({ ok: true });
    });

    test("401 quando assinatura inválida", async () => {
      // Arrange
      process.env.MP_WEBHOOK_SECRET = "secret";
      const body = { type: "payment", data: { id: "999" } };

      // Act (assinatura errada)
      const res = await request(app)
        .post("/api/payment/webhook")
        .set("x-signature", "ts=100,v1=deadbeef")
        .set("x-idempotency-key", "idem-1")
        .send(body);

      // Assert
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ ok: false });
    });

    test("200 idempotente: evento já processado (processed_at) => não chama MP", async () => {
      // Arrange
      process.env.MP_WEBHOOK_SECRET = "secret";
      process.env.NODE_ENV = "production";

      const conn = makeMockConn();
      pool.getConnection.mockResolvedValueOnce(conn);

      conn.beginTransaction.mockResolvedValueOnce();
      conn.query
        // SELECT existingEvent FOR UPDATE
        .mockResolvedValueOnce([[{ id: 1, status: "pago", processed_at: "2026-01-01 10:00:00" }]]);

      const body = { type: "payment", data: { id: "999" } };
      const ts = "1700000000";
      const { signature } = signWebhook({ secret: "secret", ts, body });

      // Act
      const res = await request(app)
        .post("/api/payment/webhook")
        .set("x-signature", signature)
        .set("x-idempotency-key", "idem-processed")
        .send(body);

      // Assert
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true, idempotent: true });

      expect(conn.commit).toHaveBeenCalledTimes(1);
      expect(mpState.paymentGet).not.toHaveBeenCalled();
      expect(conn.release).toHaveBeenCalledTimes(1);
    });

    test("200 ignora quando type != payment ou data.id ausente", async () => {
      // Arrange
      process.env.MP_WEBHOOK_SECRET = "secret";
      process.env.NODE_ENV = "production";

      const conn = makeMockConn();
      pool.getConnection.mockResolvedValueOnce(conn);

      conn.beginTransaction.mockResolvedValueOnce();
      conn.query
        .mockResolvedValueOnce([[null]]) // SELECT existingEvent => none
        .mockResolvedValueOnce([{ insertId: 10 }]) // INSERT webhook_events
        .mockResolvedValueOnce([{}]); // UPDATE status=ignored

      const body = { type: "other", data: {} };
      const ts = "1700000001";
      const { signature } = signWebhook({ secret: "secret", ts, body });

      // Act
      const res = await request(app)
        .post("/api/payment/webhook")
        .set("x-signature", signature)
        .set("x-idempotency-key", "idem-ignore")
        .send(body);

      // Assert
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true });

      expect(mpState.paymentGet).not.toHaveBeenCalled();
      expect(conn.commit).toHaveBeenCalledTimes(1);
      expect(conn.release).toHaveBeenCalledTimes(1);
    });

    test("200 processa payment aprovado -> status_pagamento='pago' e atualiza webhook_events", async () => {
      // Arrange
      process.env.MP_WEBHOOK_SECRET = "secret";
      process.env.NODE_ENV = "production";

      const conn = makeMockConn();
      pool.getConnection.mockResolvedValueOnce(conn);

      conn.beginTransaction.mockResolvedValueOnce();

      // fluxo: existing none -> insert event -> MP get -> update pedidos -> update events -> commit
      conn.query
        .mockResolvedValueOnce([[null]]) // SELECT existingEvent
        .mockResolvedValueOnce([{ insertId: 77 }]) // INSERT webhook_events
        .mockResolvedValueOnce([{}]) // UPDATE pedidos
        .mockResolvedValueOnce([{}]); // UPDATE webhook_events status

      mpState.paymentGet.mockResolvedValueOnce({
        status: "approved",
        metadata: { pedidoId: 123 },
      });

      const body = { type: "payment", data: { id: "pay_999" } };
      const ts = "1700000002";
      const { signature } = signWebhook({ secret: "secret", ts, body });

      // Act
      const res = await request(app)
        .post("/api/payment/webhook")
        .set("x-signature", signature)
        .set("x-idempotency-key", "idem-ok")
        .send(body);

      // Assert
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true });

      expect(mpState.paymentGet).toHaveBeenCalledTimes(1);
      expect(mpState.paymentGet).toHaveBeenCalledWith({ id: "pay_999" });

      // Update pedidos: deve usar novoStatusPagamento + pagamento_id + pedidoId
      const pedidosUpdate = conn.query.mock.calls.find((c) => String(c[0]).includes("UPDATE pedidos"));
      expect(pedidosUpdate).toBeTruthy();
      expect(pedidosUpdate[1][0]).toBe("pago");
      expect(pedidosUpdate[1][1]).toBe("pay_999");
      expect(pedidosUpdate[1][2]).toBe(123);

      // Update webhook_events status
      const evUpdate = conn.query.mock.calls.find((c) => String(c[0]).includes("UPDATE webhook_events"));
      expect(evUpdate).toBeTruthy();

      expect(conn.commit).toHaveBeenCalledTimes(1);
      expect(conn.release).toHaveBeenCalledTimes(1);
    });

    test("200 ignora quando payment não tem metadata.pedidoId", async () => {
      // Arrange
      process.env.MP_WEBHOOK_SECRET = "secret";
      process.env.NODE_ENV = "production";

      const conn = makeMockConn();
      pool.getConnection.mockResolvedValueOnce(conn);
      conn.beginTransaction.mockResolvedValueOnce();

      conn.query
        .mockResolvedValueOnce([[null]]) // SELECT existingEvent
        .mockResolvedValueOnce([{ insertId: 88 }]) // INSERT webhook_events
        .mockResolvedValueOnce([{}]); // UPDATE webhook_events ignored

      mpState.paymentGet.mockResolvedValueOnce({
        status: "approved",
        metadata: {}, // sem pedidoId
      });

      const body = { type: "payment", data: { id: "pay_no_pid" } };
      const ts = "1700000003";
      const { signature } = signWebhook({ secret: "secret", ts, body });

      // Act
      const res = await request(app)
        .post("/api/payment/webhook")
        .set("x-signature", signature)
        .set("x-idempotency-key", "idem-nopid")
        .send(body);

      // Assert
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true });

      // Não atualiza pedidos
      const anyPedidosUpdate = conn.query.mock.calls.some((c) => String(c[0]).includes("UPDATE pedidos"));
      expect(anyPedidosUpdate).toBe(false);

      expect(conn.commit).toHaveBeenCalledTimes(1);
      expect(conn.release).toHaveBeenCalledTimes(1);
    });

    test("quando db dá erro durante webhook: dev => 500, prod => 200", async () => {
      // Arrange
      process.env.MP_WEBHOOK_SECRET = "secret";

      const body = { type: "payment", data: { id: "pay_db_err" } };
      const ts = "1700000004";
      const { signature } = signWebhook({ secret: "secret", ts, body });

      // prepara conn com erro
      const conn = makeMockConn();
      pool.getConnection.mockResolvedValue(conn);
      conn.beginTransaction.mockResolvedValueOnce();
      conn.query.mockRejectedValueOnce(new Error("db error"));

      // dev -> 500
      process.env.NODE_ENV = "development";
      const resDev = await request(app)
        .post("/api/payment/webhook")
        .set("x-signature", signature)
        .set("x-idempotency-key", "idem-db1")
        .send(body);

      expect(resDev.status).toBe(500);
      expect(resDev.body.ok).toBe(false);

      // prod -> 200
      jest.clearAllMocks();
      loadAppWithMocks();
      process.env.MP_WEBHOOK_SECRET = "secret";
      process.env.NODE_ENV = "production";

      const conn2 = makeMockConn();
      pool.getConnection.mockResolvedValue(conn2);
      conn2.beginTransaction.mockResolvedValueOnce();
      conn2.query.mockRejectedValueOnce(new Error("db error"));

      const resProd = await request(app)
        .post("/api/payment/webhook")
        .set("x-signature", signature)
        .set("x-idempotency-key", "idem-db2")
        .send(body);

      expect(resProd.status).toBe(200);
      expect(resProd.body.ok).toBe(true);
    });
  });

  // ---------------------------
  // Extra: produção adiciona notification_url + auto_return
  // ---------------------------
  describe("Preference body (production toggles)", () => {
    test("em production, adiciona auto_return e notification_url quando BACKEND_URL setado", async () => {
      // Arrange
      process.env.NODE_ENV = "production";
      process.env.BACKEND_URL = "http://api.example.com";

      const conn = makeMockConn();
      pool.getConnection.mockResolvedValueOnce(conn);

      conn.query
        .mockResolvedValueOnce([[{ id: 123, forma_pagamento: "Boleto" }]]) // pedido boleto
        .mockResolvedValueOnce([[{ quantidade: 1, valor_unitario: "10.00" }]]) // total
        .mockResolvedValueOnce([{}]); // UPDATE status_pagamento

      mpState.preferenceCreate.mockResolvedValueOnce({
        id: "pref_prod",
        init_point: "init",
        sandbox_init_point: "sandbox",
      });

      // Act
      const res = await request(app).post("/api/payment/start").send({ pedidoId: 123 });

      // Assert
      expect(res.status).toBe(200);

      const { body } = mpState.preferenceCreate.mock.calls[0][0];
      expect(body.auto_return).toBe("approved");
      expect(body.notification_url).toBe("http://api.example.com/api/payment/webhook");

      // boleto exclui cartões e bank_transfer
      const excluded = body.payment_methods.excluded_payment_types.map((x) => x.id).sort();
      expect(excluded).toEqual(["bank_transfer", "credit_card", "debit_card"].sort());
    });
  });
});
