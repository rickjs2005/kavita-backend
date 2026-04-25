/**
 * test/unit/services/whatsapp/apiAdapter.unit.test.js
 *
 * B3 — adapter Meta Cloud API. Cobre:
 *   - Sem credenciais → status='error', sem fetch
 *   - Texto livre (sem templateId) → body type='text'
 *   - Template + params → body type='template' com components corretos
 *   - 200 OK → status='sent', messageId capturado
 *   - 4xx Meta → status='error', mensagem extraída de error.message
 *   - 5xx Meta → status='error'
 *   - Timeout → status='error' indicando timeout
 */

describe("services/whatsapp/adapters/api", () => {
  let originalFetch;

  beforeEach(() => {
    jest.resetModules();
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    delete process.env.WHATSAPP_API_TOKEN;
    delete process.env.WHATSAPP_PHONE_NUMBER_ID;
    delete process.env.WHATSAPP_API_VERSION;
    delete process.env.WHATSAPP_API_TIMEOUT_MS;
  });

  function loadAdapter() {
    return require("../../../../services/whatsapp/adapters/api");
  }

  function mockFetchOk(jsonData) {
    global.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => jsonData,
    }));
  }

  function mockFetchError(status, errorJson) {
    global.fetch = jest.fn(async () => ({
      ok: false,
      status,
      json: async () => errorJson,
    }));
  }

  test("sem credenciais: retorna error sem chamar fetch", async () => {
    const fetchSpy = jest.fn();
    global.fetch = fetchSpy;
    const adapter = loadAdapter();

    const r = await adapter.send({
      destino: "5533999991234",
      mensagem: "oi",
    });

    expect(r.provider).toBe("api");
    expect(r.status).toBe("error");
    expect(r.erro).toMatch(/credenciais/i);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test("texto livre: monta body type='text' e chama URL correta", async () => {
    process.env.WHATSAPP_API_TOKEN = "tok-x";
    process.env.WHATSAPP_PHONE_NUMBER_ID = "phone-y";
    mockFetchOk({ messages: [{ id: "wamid.HBgL_test" }] });
    const adapter = loadAdapter();

    const r = await adapter.send({
      destino: "5533999991234",
      mensagem: "Olá rocks!",
    });

    expect(r.status).toBe("sent");
    expect(r.messageId).toBe("wamid.HBgL_test");

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = global.fetch.mock.calls[0];
    expect(url).toMatch(
      /https:\/\/graph\.facebook\.com\/v\d+\.0\/phone-y\/messages/,
    );
    expect(init.headers.Authorization).toBe("Bearer tok-x");
    const body = JSON.parse(init.body);
    expect(body).toEqual({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: "5533999991234",
      type: "text",
      text: { body: "Olá rocks!" },
    });
  });

  test("template + params: monta body type='template' com components", async () => {
    process.env.WHATSAPP_API_TOKEN = "tok";
    process.env.WHATSAPP_PHONE_NUMBER_ID = "ph";
    mockFetchOk({ messages: [{ id: "wamid.tpl" }] });
    const adapter = loadAdapter();

    await adapter.send({
      destino: "5533999991234",
      mensagem: "fallback",
      options: {
        templateId: "pedido_recebido_v1",
        templateLang: "pt_BR",
        templateParams: ["João", "1234", "199,90"],
      },
    });

    const body = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(body.type).toBe("template");
    expect(body.template.name).toBe("pedido_recebido_v1");
    expect(body.template.language.code).toBe("pt_BR");
    expect(body.template.components).toEqual([
      {
        type: "body",
        parameters: [
          { type: "text", text: "João" },
          { type: "text", text: "1234" },
          { type: "text", text: "199,90" },
        ],
      },
    ]);
  });

  test("template sem params: omite components", async () => {
    process.env.WHATSAPP_API_TOKEN = "tok";
    process.env.WHATSAPP_PHONE_NUMBER_ID = "ph";
    mockFetchOk({ messages: [{ id: "x" }] });
    const adapter = loadAdapter();

    await adapter.send({
      destino: "5533999991234",
      mensagem: "fb",
      options: { templateId: "no_params_v1" },
    });

    const body = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(body.type).toBe("template");
    expect(body.template.name).toBe("no_params_v1");
    expect(body.template.components).toBeUndefined();
  });

  test("4xx Meta: extrai mensagem de error.message", async () => {
    process.env.WHATSAPP_API_TOKEN = "tok";
    process.env.WHATSAPP_PHONE_NUMBER_ID = "ph";
    mockFetchError(400, {
      error: {
        message: "Template name does not exist in the translation",
        type: "OAuthException",
        code: 132001,
      },
    });
    const adapter = loadAdapter();

    const r = await adapter.send({
      destino: "5533999991234",
      mensagem: "x",
      options: { templateId: "wrong_template" },
    });

    expect(r.status).toBe("error");
    expect(r.erro).toMatch(/Template name does not exist/);
    expect(r.messageId).toBeUndefined();
  });

  test("5xx Meta: status='error' com fallback message", async () => {
    process.env.WHATSAPP_API_TOKEN = "tok";
    process.env.WHATSAPP_PHONE_NUMBER_ID = "ph";
    mockFetchError(503, null); // sem json válido
    const adapter = loadAdapter();

    const r = await adapter.send({
      destino: "5533999991234",
      mensagem: "x",
    });

    expect(r.status).toBe("error");
    expect(r.erro).toMatch(/503/);
  });

  test("network error: status='error' com mensagem útil", async () => {
    process.env.WHATSAPP_API_TOKEN = "tok";
    process.env.WHATSAPP_PHONE_NUMBER_ID = "ph";
    global.fetch = jest.fn(async () => {
      throw new Error("ECONNRESET");
    });
    const adapter = loadAdapter();

    const r = await adapter.send({
      destino: "5533999991234",
      mensagem: "x",
    });

    expect(r.status).toBe("error");
    expect(r.erro).toMatch(/ECONNRESET|rede/);
  });

  test("timeout via AbortController: status='error' com texto descritivo", async () => {
    process.env.WHATSAPP_API_TOKEN = "tok";
    process.env.WHATSAPP_PHONE_NUMBER_ID = "ph";
    global.fetch = jest.fn(async () => {
      const e = new Error("aborted");
      e.name = "AbortError";
      throw e;
    });
    const adapter = loadAdapter();

    const r = await adapter.send({
      destino: "5533999991234",
      mensagem: "x",
    });

    expect(r.status).toBe("error");
    expect(r.erro).toMatch(/Timeout/);
  });

  test("usa WHATSAPP_API_VERSION quando setada", async () => {
    process.env.WHATSAPP_API_TOKEN = "tok";
    process.env.WHATSAPP_PHONE_NUMBER_ID = "ph";
    process.env.WHATSAPP_API_VERSION = "v23.0";
    mockFetchOk({ messages: [{ id: "x" }] });
    const adapter = loadAdapter();

    await adapter.send({
      destino: "5533999991234",
      mensagem: "x",
    });

    const url = global.fetch.mock.calls[0][0];
    expect(url).toContain("/v23.0/");
  });

  test("nunca expõe url wa.me no retorno (modo api é envio real)", async () => {
    process.env.WHATSAPP_API_TOKEN = "tok";
    process.env.WHATSAPP_PHONE_NUMBER_ID = "ph";
    mockFetchOk({ messages: [{ id: "x" }] });
    const adapter = loadAdapter();

    const r = await adapter.send({
      destino: "5533999991234",
      mensagem: "x",
    });

    expect(r.url).toBeNull();
  });
});

describe("services/whatsapp/templateMap", () => {
  let mod;
  beforeEach(() => {
    jest.resetModules();
    delete process.env.WHATSAPP_TEMPLATE_PEDIDO_CRIADO;
    delete process.env.WHATSAPP_TEMPLATE_PAGAMENTO_APROVADO;
    delete process.env.WHATSAPP_TEMPLATE_LANG;
    mod = require("../../../../services/whatsapp/templateMap");
  });

  const fakePedido = {
    id: 1234,
    usuario_nome: "João da Silva",
    total: 199.9,
  };

  test("evento desconhecido: retorna null", () => {
    const r = mod.resolveTemplateForEvent("ocorrencia_xpto", fakePedido);
    expect(r).toBeNull();
  });

  test("evento conhecido sem env setada: retorna null (sem template)", () => {
    const r = mod.resolveTemplateForEvent("pedido_criado", fakePedido);
    expect(r).toBeNull();
  });

  test("env setada: retorna { templateId, templateLang, templateParams }", () => {
    process.env.WHATSAPP_TEMPLATE_PEDIDO_CRIADO = "pedido_recebido_v1";
    jest.resetModules();
    const reload = require("../../../../services/whatsapp/templateMap");

    const r = reload.resolveTemplateForEvent("pedido_criado", fakePedido);
    expect(r).toEqual({
      templateId: "pedido_recebido_v1",
      templateLang: "pt_BR",
      templateParams: ["João", "1234", "199,90"],
    });
  });

  test("WHATSAPP_TEMPLATE_LANG override", () => {
    process.env.WHATSAPP_TEMPLATE_PAGAMENTO_APROVADO = "pago_v1";
    process.env.WHATSAPP_TEMPLATE_LANG = "pt_PT";
    jest.resetModules();
    const reload = require("../../../../services/whatsapp/templateMap");

    const r = reload.resolveTemplateForEvent("pagamento_aprovado", fakePedido);
    expect(r.templateLang).toBe("pt_PT");
    expect(r.templateParams).toEqual(["João", "1234"]);
  });

  test("listSupportedEvents inclui os 6 eventos UTILITY de pedido", () => {
    const list = mod.listSupportedEvents();
    expect(list).toEqual(
      expect.arrayContaining([
        "pedido_criado",
        "pagamento_aprovado",
        "pedido_em_separacao",
        "pedido_enviado",
        "pedido_entregue",
        "pedido_cancelado",
      ]),
    );
    // MARKETING (carrinho) NÃO está mapeado nesta versão
    expect(list).not.toContain("carrinho_abandonado_24h");
  });

  test("nome com 1 palavra ou vazio: usa palavra única ou fallback", () => {
    process.env.WHATSAPP_TEMPLATE_PEDIDO_CRIADO = "pedido_recebido_v1";
    jest.resetModules();
    const reload = require("../../../../services/whatsapp/templateMap");

    const r1 = reload.resolveTemplateForEvent("pedido_criado", {
      ...fakePedido,
      usuario_nome: "Cleyton",
    });
    expect(r1.templateParams[0]).toBe("Cleyton");

    const r2 = reload.resolveTemplateForEvent("pedido_criado", {
      ...fakePedido,
      usuario_nome: "",
    });
    expect(r2.templateParams[0]).toBe("amigo(a)");
  });
});
