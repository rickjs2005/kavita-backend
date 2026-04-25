/**
 * test/unit/services/comunicacaoService.unit.test.js
 *
 * Testes unitários do services/comunicacaoService.js
 * - Sem MySQL real (mock do config/pool)
 * - Sem serviços externos (mock do mailService)
 * - WhatsApp roda no modo manual default — gera link wa.me sem rede
 * - AAA: Arrange -> Act -> Assert
 *
 * Refatoração B1 (2026-04-24): WhatsApp virou canal principal,
 * adapter manual gera link, anti-duplicação consulta o log antes
 * de reenviar, novos eventos em_separacao/entregue/cancelado.
 */

describe("services/comunicacaoService - dispararEventoComunicacao()", () => {
  let comunicacaoService;

  const poolPath = require.resolve("../../../config/pool");
  const mailServicePath = require.resolve("../../../services/mailService");

  let pool;
  let sendTransactionalEmail;

  const makePedido = (overrides = {}) => ({
    id: 10,
    usuario_id: 7,
    total: 123.4,
    status_pagamento: "pendente",
    status_entrega: "em_separacao",
    forma_pagamento: "PIX",
    data_pedido: "2026-01-09 10:00:00",
    usuario_nome: "Rick Januario",
    usuario_email: "rick@kavita.com",
    usuario_telefone: "(31) 99999-0000",
    ...overrides,
  });

  /**
   * Configura o pool.query mock para responder cada tipo de query:
   *   - SELECT pedido + usuario → retorna `pedidoOrNull`
   *   - SELECT 1 FROM comunicacoes_enviadas (jaEnviado) → retorna alreadySentChannels
   *   - INSERT INTO comunicacoes_enviadas → roda insertBehavior se passado
   */
  function mockPool({ pedidoOrNull, alreadySent = [], insertBehavior } = {}) {
    pool.query.mockImplementation(async (sql, _params) => {
      const s = String(sql);

      if (s.includes("FROM pedidos p") && s.includes("JOIN usuarios u")) {
        return [[pedidoOrNull], []];
      }

      if (s.includes("FROM comunicacoes_enviadas") && s.includes("SELECT 1")) {
        // jaEnviado guard — retorna 1 linha se canal está em alreadySent
        const matchesChannel = alreadySent.some((c) => _params.includes(c));
        return [matchesChannel ? [{ "1": 1 }] : [], []];
      }

      if (s.includes("INSERT INTO comunicacoes_enviadas")) {
        if (typeof insertBehavior === "function") {
          return insertBehavior(sql, _params);
        }
        return [{ insertId: 1 }, undefined];
      }

      return [[], []];
    });
  }

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    delete process.env.WHATSAPP_PROVIDER; // garante modo manual default

    jest.doMock(poolPath, () => ({
      query: jest.fn(),
      getConnection: jest.fn(),
    }));

    jest.doMock(mailServicePath, () => ({
      sendTransactionalEmail: jest.fn(),
    }));

    pool = require(poolPath);
    ({ sendTransactionalEmail } = require(mailServicePath));

    comunicacaoService = require("../../../services/comunicacaoService");
  });

  test("pedido não encontrado: silencia, não tenta enviar e não loga", async () => {
    mockPool({ pedidoOrNull: null });

    await comunicacaoService.dispararEventoComunicacao("pedido_criado", 999);

    expect(sendTransactionalEmail).not.toHaveBeenCalled();
    // Apenas o SELECT do pedido (que retornou null)
    expect(pool.query).toHaveBeenCalledTimes(1);
  });

  test("tipoEvento não suportado: silencia e não envia nada", async () => {
    mockPool({ pedidoOrNull: makePedido() });

    await comunicacaoService.dispararEventoComunicacao(
      "evento_invalido",
      makePedido().id,
    );

    expect(sendTransactionalEmail).not.toHaveBeenCalled();
    expect(pool.query).toHaveBeenCalledTimes(1);
  });

  test("pedido_criado: WhatsApp grava manual_pending + e-mail enviado real", async () => {
    const pedido = makePedido({ total: 10 });
    const insertCalls = [];
    mockPool({
      pedidoOrNull: pedido,
      insertBehavior: async (_sql, params) => {
        insertCalls.push({ params });
        return [{ insertId: insertCalls.length }, undefined];
      },
    });

    await comunicacaoService.dispararEventoComunicacao("pedido_criado", pedido.id);

    expect(sendTransactionalEmail).toHaveBeenCalledTimes(1);
    const [to, subject] = sendTransactionalEmail.mock.calls[0];
    expect(to).toBe(pedido.usuario_email);
    expect(subject).toContain(`Pedido #${pedido.id}`);

    expect(insertCalls).toHaveLength(2);

    const wa = insertCalls.find((c) => c.params[2] === "whatsapp");
    const email = insertCalls.find((c) => c.params[2] === "email");

    expect(wa).toBeTruthy();
    expect(wa.params[3]).toBe("confirmacao_pedido");
    // Modo manual: link gerado mas não enviado de fato
    expect(wa.params[7]).toBe("manual_pending");

    expect(email).toBeTruthy();
    expect(email.params[3]).toBe("confirmacao_pedido");
    expect(email.params[7]).toBe("sucesso");
  });

  test("pagamento_aprovado: usa template correto", async () => {
    const pedido = makePedido({ total: 99.9 });
    const insertCalls = [];
    mockPool({
      pedidoOrNull: pedido,
      insertBehavior: async (_sql, params) => {
        insertCalls.push(params);
        return [{ insertId: insertCalls.length }, undefined];
      },
    });

    await comunicacaoService.dispararEventoComunicacao(
      "pagamento_aprovado",
      pedido.id,
    );

    expect(sendTransactionalEmail).toHaveBeenCalledTimes(1);
    const [, subject] = sendTransactionalEmail.mock.calls[0];
    expect(subject.toLowerCase()).toContain("aprovado");

    const ofTemplate = insertCalls.filter((p) => p[3] === "pagamento_aprovado");
    expect(ofTemplate).toHaveLength(2);
  });

  test.each([
    ["pedido_em_separacao", "separad"],
    ["pedido_entregue", "entregu"],
    ["pedido_cancelado", "cancelad"],
  ])(
    "novo evento %s: dispara whatsapp + email com template correspondente",
    async (evento, subjectKeyword) => {
      const pedido = makePedido();
      const insertCalls = [];
      mockPool({
        pedidoOrNull: pedido,
        insertBehavior: async (_sql, params) => {
          insertCalls.push(params);
          return [{ insertId: insertCalls.length }, undefined];
        },
      });

      await comunicacaoService.dispararEventoComunicacao(evento, pedido.id);

      expect(sendTransactionalEmail).toHaveBeenCalledTimes(1);
      const [, subject] = sendTransactionalEmail.mock.calls[0];
      expect(subject.toLowerCase()).toContain(subjectKeyword);

      // 2 inserts: whatsapp + email — ambos com mesmo tipo_template
      expect(insertCalls).toHaveLength(2);
      const ofTemplate = insertCalls.filter((p) => p[3].startsWith("pedido_"));
      expect(ofTemplate.length).toBeGreaterThan(0);
    },
  );

  test("sem telefone: ignora WhatsApp e loga apenas email", async () => {
    const pedido = makePedido({ usuario_telefone: "" });
    const insertCalls = [];
    mockPool({
      pedidoOrNull: pedido,
      insertBehavior: async (_sql, params) => {
        insertCalls.push(params);
        return [{ insertId: insertCalls.length }, undefined];
      },
    });

    await comunicacaoService.dispararEventoComunicacao("pedido_criado", pedido.id);

    expect(sendTransactionalEmail).toHaveBeenCalledTimes(1);
    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0][2]).toBe("email");
  });

  test("sem email: ignora email e loga apenas WhatsApp", async () => {
    const pedido = makePedido({ usuario_email: "" });
    const insertCalls = [];
    mockPool({
      pedidoOrNull: pedido,
      insertBehavior: async (_sql, params) => {
        insertCalls.push(params);
        return [{ insertId: insertCalls.length }, undefined];
      },
    });

    await comunicacaoService.dispararEventoComunicacao("pedido_criado", pedido.id);

    expect(sendTransactionalEmail).not.toHaveBeenCalled();
    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0][2]).toBe("whatsapp");
  });

  test("anti-duplicação: pula whatsapp se jaEnviado retorna true", async () => {
    const pedido = makePedido();
    const insertCalls = [];
    mockPool({
      pedidoOrNull: pedido,
      alreadySent: ["whatsapp"], // simula que whatsapp já foi enviado
      insertBehavior: async (_sql, params) => {
        insertCalls.push(params);
        return [{ insertId: insertCalls.length }, undefined];
      },
    });

    await comunicacaoService.dispararEventoComunicacao("pedido_criado", pedido.id);

    // Email entra, whatsapp é pulado
    expect(sendTransactionalEmail).toHaveBeenCalledTimes(1);
    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0][2]).toBe("email");
  });

  test("anti-duplicação: pula email se jaEnviado retorna true", async () => {
    const pedido = makePedido();
    const insertCalls = [];
    mockPool({
      pedidoOrNull: pedido,
      alreadySent: ["email"],
      insertBehavior: async (_sql, params) => {
        insertCalls.push(params);
        return [{ insertId: insertCalls.length }, undefined];
      },
    });

    await comunicacaoService.dispararEventoComunicacao("pedido_criado", pedido.id);

    expect(sendTransactionalEmail).not.toHaveBeenCalled();
    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0][2]).toBe("whatsapp");
  });

  test("falha no sendTransactionalEmail: loga email com status_envio=erro", async () => {
    const pedido = makePedido();
    sendTransactionalEmail.mockRejectedValueOnce(new Error("SMTP down"));

    const insertCalls = [];
    mockPool({
      pedidoOrNull: pedido,
      insertBehavior: async (_sql, params) => {
        insertCalls.push(params);
        return [{ insertId: insertCalls.length }, undefined];
      },
    });

    await comunicacaoService.dispararEventoComunicacao("pedido_criado", pedido.id);

    const email = insertCalls.find((p) => p[2] === "email");
    expect(email).toBeTruthy();
    expect(email[7]).toBe("erro");
    expect(String(email[8])).toContain("SMTP down");
  });

  test("erro inesperado no fluxo geral: não lança", async () => {
    pool.query.mockRejectedValueOnce(new Error("DB select failed"));

    await expect(
      comunicacaoService.dispararEventoComunicacao("pedido_criado", 1),
    ).resolves.toBeUndefined();
  });
});
