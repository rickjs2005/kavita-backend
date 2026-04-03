/**
 * test/unit/services/comunicacaoService.unit.test.js
 *
 * Testes unitários do services/comunicacaoService.js
 * - Sem MySQL real (mock do config/pool)
 * - Sem serviços externos (mock do mailService)
 * - AAA: Arrange -> Act -> Assert
 */

describe("services/comunicacaoService - dispararEventoComunicacao()", () => {
  let comunicacaoService;

  // Paths reais (resolvidos) para o Jest mockar o MESMO módulo que o service usa.
  const poolPath = require.resolve("../../../config/pool");
  const mailServicePath = require.resolve("../../../services/mailService");

  // Referências aos mocks (instanciadas após doMock)
  let pool;
  let sendTransactionalEmail;

  const makePedido = (overrides = {}) => ({
    id: 10,
    usuario_id: 7,
    total: 123.4,
    status_pagamento: "pendente",
    status_entrega: "separando",
    forma_pagamento: "PIX",
    data_pedido: "2026-01-09 10:00:00",
    usuario_nome: "Rick",
    usuario_email: "rick@kavita.com",
    usuario_telefone: "(31) 9 9999-0000",
    ...overrides,
  });

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();

    // Mocks dos módulos reais usados pelo service
    jest.doMock(poolPath, () => ({
      query: jest.fn(),
      getConnection: jest.fn(),
    }));

    jest.doMock(mailServicePath, () => ({
      sendTransactionalEmail: jest.fn(),
    }));

    // Importa os mocks após doMock
    pool = require(poolPath);
    ({ sendTransactionalEmail } = require(mailServicePath));

    // Importa o service depois dos mocks
    comunicacaoService = require("../../../services/comunicacaoService");

    // Silenciar logs controladamente
    jest.spyOn(console, "log").mockImplementation(() => {});
    jest.spyOn(console, "warn").mockImplementation(() => {});
    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    console.log.mockRestore?.();
    console.warn.mockRestore?.();
    console.error.mockRestore?.();
  });

  function mockPoolQuerySelectThenInsert(pedidoOrNull, insertBehavior) {
    pool.query.mockImplementation(async (sql, params) => {
      const s = String(sql);

      // SELECT do pedido básico
      if (s.includes("FROM pedidos p") && s.includes("JOIN usuarios u")) {
        return [[pedidoOrNull], []];
      }

      // INSERT de log de comunicacao
      if (s.includes("INSERT INTO comunicacoes_enviadas")) {
        if (typeof insertBehavior === "function") {
          return insertBehavior(sql, params);
        }
        return [{ insertId: 1 }, undefined];
      }

      return [[], []];
    });
  }

  test("pedido não encontrado: deve dar warn e não deve tentar enviar/logar", async () => {
    // Arrange
    mockPoolQuerySelectThenInsert(null);

    // Act
    await comunicacaoService.dispararEventoComunicacao("pedido_criado", 999);

    // Assert
    expect(console.warn).toHaveBeenCalledTimes(1);
    const warnArgs = console.warn.mock.calls[0].join(" ");
    expect(warnArgs).toContain("[comunicacao]");
    expect(warnArgs).toContain("Pedido 999 não encontrado");

    expect(sendTransactionalEmail).not.toHaveBeenCalled();

    // Apenas 1 SELECT
    expect(pool.query).toHaveBeenCalledTimes(1);
  });

  test("tipoEvento não suportado: deve dar warn e não deve enviar/logar", async () => {
    // Arrange
    const pedido = makePedido();
    mockPoolQuerySelectThenInsert(pedido);

    // Act
    await comunicacaoService.dispararEventoComunicacao("evento_invalido", pedido.id);

    // Assert
    expect(console.warn).toHaveBeenCalledWith(
      "[comunicacao] tipoEvento não suportado:",
      "evento_invalido"
    );

    // Só SELECT
    expect(pool.query).toHaveBeenCalledTimes(1);
    expect(sendTransactionalEmail).not.toHaveBeenCalled();
  });

  test("pedido_criado: deve disparar WhatsApp (fake) e e-mail; e deve logar ambos", async () => {
    // Arrange
    const pedido = makePedido({
      total: 10,
      usuario_telefone: "55 (31) 99999-0000",
    });

    const insertCalls = [];
    mockPoolQuerySelectThenInsert(pedido, async (sql, params) => {
      insertCalls.push({ sql: String(sql), params });
      return [{ insertId: insertCalls.length }, undefined];
    });

    // Act
    await comunicacaoService.dispararEventoComunicacao("pedido_criado", pedido.id);

    // Assert
    // WhatsApp fake: deve logar
    expect(console.log).toHaveBeenCalled();
    const logText = console.log.mock.calls.map((c) => String(c[0])).join("\n");
    expect(logText).toContain("[FAKE WHATSAPP] Enviando mensagem para 55");

    // Email enviado
    expect(sendTransactionalEmail).toHaveBeenCalledTimes(1);
    const [to, subject, html] = sendTransactionalEmail.mock.calls[0];
    expect(to).toBe(pedido.usuario_email);
    expect(subject).toContain(`Pedido #${pedido.id}`);
    expect(html).toContain("R$ 10.00");

    // DB: 1 SELECT + 2 INSERT
    expect(pool.query).toHaveBeenCalledTimes(3);
    expect(insertCalls).toHaveLength(2);

    const whatsappInsert = insertCalls.find((c) => c.params?.[2] === "whatsapp");
    const emailInsert = insertCalls.find((c) => c.params?.[2] === "email");

    expect(whatsappInsert).toBeTruthy();
    expect(emailInsert).toBeTruthy();

    // whatsapp
    expect(whatsappInsert.params[3]).toBe("confirmacao_pedido");
    expect(whatsappInsert.params[7]).toBe("sucesso");

    // email
    expect(emailInsert.params[3]).toBe("confirmacao_pedido");
    expect(emailInsert.params[7]).toBe("sucesso");
    expect(emailInsert.params[8]).toBeNull();
  });

  test("pagamento_aprovado: deve usar template correto e logar email/whatsapp", async () => {
    // Arrange
    const pedido = makePedido({ total: 99.9 });
    const insertCalls = [];
    mockPoolQuerySelectThenInsert(pedido, async (sql, params) => {
      insertCalls.push(params);
      return [{ insertId: insertCalls.length }, undefined];
    });

    // Act
    await comunicacaoService.dispararEventoComunicacao("pagamento_aprovado", pedido.id);

    // Assert
    expect(sendTransactionalEmail).toHaveBeenCalledTimes(1);
    const [, subject, html] = sendTransactionalEmail.mock.calls[0];
    expect(subject.toLowerCase()).toContain("aprovado");
    expect(html).toContain("R$ 99.90");

    expect(insertCalls.filter((p) => p[3] === "pagamento_aprovado")).toHaveLength(2);
  });

  test("pedido_enviado: deve usar template correto e incluir status_entrega no WhatsApp", async () => {
    // Arrange
    const pedido = makePedido({ status_entrega: "em rota" });
    const insertCalls = [];
    mockPoolQuerySelectThenInsert(pedido, async (sql, params) => {
      insertCalls.push(params);
      return [{ insertId: insertCalls.length }, undefined];
    });

    // Act
    await comunicacaoService.dispararEventoComunicacao("pedido_enviado", pedido.id);

    // Assert
    const whatsapp = insertCalls.find((p) => p[2] === "whatsapp");
    expect(whatsapp).toBeTruthy();
    expect(String(whatsapp[6])).toContain("Status de entrega");
    expect(String(whatsapp[6])).toContain("em rota");

    expect(sendTransactionalEmail).toHaveBeenCalledTimes(1);
    const [, subject] = sendTransactionalEmail.mock.calls[0];
    expect(subject.toLowerCase()).toContain("enviado");
  });

  test("sem telefone: deve ignorar WhatsApp e logar apenas email", async () => {
    // Arrange
    const pedido = makePedido({ usuario_telefone: "" });
    const insertCalls = [];
    mockPoolQuerySelectThenInsert(pedido, async (sql, params) => {
      insertCalls.push(params);
      return [{ insertId: insertCalls.length }, undefined];
    });

    // Act
    await comunicacaoService.dispararEventoComunicacao("pedido_criado", pedido.id);

    // Assert
    expect(sendTransactionalEmail).toHaveBeenCalledTimes(1);

    // 1 SELECT + 1 INSERT (email)
    expect(pool.query).toHaveBeenCalledTimes(2);
    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0][2]).toBe("email");
  });

  test("sem email: deve ignorar email e logar apenas WhatsApp", async () => {
    // Arrange
    const pedido = makePedido({ usuario_email: "" });
    const insertCalls = [];
    mockPoolQuerySelectThenInsert(pedido, async (sql, params) => {
      insertCalls.push(params);
      return [{ insertId: insertCalls.length }, undefined];
    });

    // Act
    await comunicacaoService.dispararEventoComunicacao("pedido_criado", pedido.id);

    // Assert
    expect(sendTransactionalEmail).not.toHaveBeenCalled();

    // 1 SELECT + 1 INSERT (whatsapp)
    expect(pool.query).toHaveBeenCalledTimes(2);
    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0][2]).toBe("whatsapp");
  });

  test("falha no sendTransactionalEmail: deve logar email com status_envio=erro e erro preenchido", async () => {
    // Arrange
    const pedido = makePedido();
    sendTransactionalEmail.mockRejectedValueOnce(new Error("SMTP down"));

    const insertCalls = [];
    mockPoolQuerySelectThenInsert(pedido, async (sql, params) => {
      insertCalls.push(params);
      return [{ insertId: insertCalls.length }, undefined];
    });

    // Act
    await comunicacaoService.dispararEventoComunicacao("pedido_criado", pedido.id);

    // Assert
    const email = insertCalls.find((p) => p[2] === "email");
    expect(email).toBeTruthy();
    expect(email[7]).toBe("erro");
    expect(String(email[8])).toContain("SMTP down");
    expect(console.error).toHaveBeenCalled();
  });

  test("falha ao logar comunicação (INSERT): não deve quebrar o fluxo (swallow com console.error)", async () => {
    // Arrange
    const pedido = makePedido();

    mockPoolQuerySelectThenInsert(pedido, async () => {
      throw new Error("DB insert failed");
    });

    // Act / Assert
    await expect(
      comunicacaoService.dispararEventoComunicacao("pedido_criado", pedido.id)
    ).resolves.toBeUndefined();

    // Email ainda tenta enviar
    expect(sendTransactionalEmail).toHaveBeenCalledTimes(1);

    expect(console.error).toHaveBeenCalled();
  });

  test("erro inesperado no fluxo geral: deve ser capturado e logado (não deve lançar)", async () => {
    // Arrange
    pool.query.mockRejectedValueOnce(new Error("DB select failed"));

    // Act / Assert
    await expect(
      comunicacaoService.dispararEventoComunicacao("pedido_criado", 1)
    ).resolves.toBeUndefined();

    expect(console.error).toHaveBeenCalled();
    expect(sendTransactionalEmail).not.toHaveBeenCalled();
  });
});

describe("services/comunicacaoService - sendEmail()", () => {
  let comunicacaoService, pool, sendTransactionalEmail;

  const poolPath = require.resolve("../../../config/pool");
  const mailServicePath = require.resolve("../../../services/mailService");

  const makePedido = (overrides = {}) => ({
    id: 10, usuario_id: 7, total: 100, usuario_nome: "Rick",
    usuario_email: "rick@test.com", usuario_telefone: "31999",
    status_pagamento: "pago", status_entrega: "enviado",
    forma_pagamento: "PIX", data_pedido: "2026-04-01",
    ...overrides,
  });

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    jest.doMock(poolPath, () => ({ query: jest.fn() }));
    jest.doMock(mailServicePath, () => ({ sendTransactionalEmail: jest.fn() }));
    pool = require(poolPath);
    ({ sendTransactionalEmail } = require(mailServicePath));
    comunicacaoService = require("../../../services/comunicacaoService");
    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => console.error.mockRestore?.());

  function mockPedidoQuery(pedido) {
    pool.query.mockImplementation(async (sql) => {
      if (String(sql).includes("FROM pedidos")) return [[pedido], []];
      return [{ insertId: 1 }, undefined];
    });
  }

  test("success — sends email and returns sucesso", async () => {
    mockPedidoQuery(makePedido());
    sendTransactionalEmail.mockResolvedValue();
    const result = await comunicacaoService.sendEmail("confirmacao_pedido", 10, null);
    expect(result.statusEnvio).toBe("sucesso");
    expect(sendTransactionalEmail).toHaveBeenCalledWith("rick@test.com", expect.any(String), expect.any(String));
  });

  test("uses emailOverride", async () => {
    mockPedidoQuery(makePedido());
    sendTransactionalEmail.mockResolvedValue();
    await comunicacaoService.sendEmail("confirmacao_pedido", 10, "alt@t.com");
    expect(sendTransactionalEmail).toHaveBeenCalledWith("alt@t.com", expect.any(String), expect.any(String));
  });

  test("pedido not found → throws NOT_FOUND", async () => {
    mockPedidoQuery(null);
    await expect(comunicacaoService.sendEmail("confirmacao_pedido", 999)).rejects.toThrow("Pedido não encontrado");
  });

  test("no email → throws VALIDATION_ERROR", async () => {
    mockPedidoQuery(makePedido({ usuario_email: null }));
    await expect(comunicacaoService.sendEmail("confirmacao_pedido", 10)).rejects.toThrow("e-mail");
  });

  test("email failure → returns erro status", async () => {
    mockPedidoQuery(makePedido());
    sendTransactionalEmail.mockRejectedValue(new Error("smtp"));
    const result = await comunicacaoService.sendEmail("confirmacao_pedido", 10);
    expect(result.statusEnvio).toBe("erro");
  });
});

describe("services/comunicacaoService - sendWhatsapp()", () => {
  let comunicacaoService, pool;

  const poolPath = require.resolve("../../../config/pool");
  const mailServicePath = require.resolve("../../../services/mailService");

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    jest.doMock(poolPath, () => ({ query: jest.fn() }));
    jest.doMock(mailServicePath, () => ({ sendTransactionalEmail: jest.fn() }));
    pool = require(poolPath);
    comunicacaoService = require("../../../services/comunicacaoService");
    jest.spyOn(console, "log").mockImplementation(() => {});
    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    console.log.mockRestore?.();
    console.error.mockRestore?.();
  });

  function mockPedidoQuery(pedido) {
    pool.query.mockImplementation(async (sql) => {
      if (String(sql).includes("FROM pedidos")) return [[pedido], []];
      return [{ insertId: 1 }, undefined];
    });
  }

  test("success", async () => {
    mockPedidoQuery({ id: 10, usuario_id: 7, total: 100, usuario_telefone: "31999", usuario_nome: "R", status_pagamento: "pago", status_entrega: "enviado", forma_pagamento: "PIX", data_pedido: "2026" });
    const result = await comunicacaoService.sendWhatsapp("confirmacao_pedido", 10, null);
    expect(result.statusEnvio).toBe("sucesso");
  });

  test("no telefone → throws", async () => {
    mockPedidoQuery({ id: 10, usuario_id: 7, total: 100, usuario_telefone: null, usuario_nome: "R" });
    await expect(comunicacaoService.sendWhatsapp("confirmacao_pedido", 10)).rejects.toThrow("telefone");
  });
});
