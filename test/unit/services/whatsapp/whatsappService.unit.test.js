/**
 * test/unit/services/whatsapp/whatsappService.unit.test.js
 *
 * Etapa 3 da reativacao — service consolidado da corretora. Cobre:
 *   - envio via stub registra queued_stub e retorna ok
 *   - template inactive nao dispara adapter (CONFLICT)
 *   - template inexistente nao dispara adapter (NOT_FOUND)
 *   - numero invalido falha antes do adapter (VALIDATION_ERROR)
 *   - language_code default vem do template
 *   - override de language_code funciona
 *   - sendFreeText insere com template_key=NULL
 *   - api sem meta_template_name nao bate Meta (CONFLICT)
 */

jest.mock("../../../../repositories/whatsappRepository", () => ({
  findActiveTemplate: jest.fn(),
  findAnyTemplate: jest.fn(),
  insertMessage: jest.fn(),
  updateMessageResult: jest.fn(),
  getMessageById: jest.fn(),
}));

const repo = require("../../../../repositories/whatsappRepository");
const service = require("../../../../services/whatsapp/whatsappService");

describe("services/whatsapp/whatsappService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.WHATSAPP_PROVIDER = "stub";
    delete process.env.WHATSAPP_STUB_FORCE_FAIL;
  });

  afterEach(() => {
    delete process.env.WHATSAPP_PROVIDER;
    delete process.env.WHATSAPP_STUB_FORCE_FAIL;
  });

  function fakeTemplate(overrides = {}) {
    return {
      id: 1,
      key: "corretora_lead_recebido",
      version: 1,
      language_code: "pt_BR",
      category: "UTILITY",
      body: "Olá, {{nome_corretora}}. Produtor: {{nome_produtor}}.",
      variables: ["nome_corretora", "nome_produtor"],
      meta_template_name: null,
      active: 1,
      approved_at: null,
      ...overrides,
    };
  }

  // -----------------------------------------------------------------
  // Caminho feliz com stub
  // -----------------------------------------------------------------
  test("sendMessage com stub: registra queued_stub e retorna ok", async () => {
    repo.findActiveTemplate.mockResolvedValue(fakeTemplate());
    repo.insertMessage.mockResolvedValue({ id: 42 });
    repo.updateMessageResult.mockResolvedValue({ affectedRows: 1 });

    const r = await service.sendMessage({
      key: "corretora_lead_recebido",
      variables: { nome_corretora: "Vale do Café", nome_produtor: "Joao" },
      to: "(33) 9 9999-1234",
      lead_id: 7,
      corretora_id: 3,
    });

    expect(r.ok).toBe(true);
    expect(r.message_id).toBe(42);
    expect(r.status).toBe("queued_stub");
    expect(r.provider).toBe("stub");
    expect(r.language_code).toBe("pt_BR");
    expect(r.provider_message_id).toMatch(/^stub_/);

    // Insert deve ter recebido o body renderizado e os ids
    const inserted = repo.insertMessage.mock.calls[0][0];
    expect(inserted.recipient_phone).toBe("5533999991234");
    expect(inserted.template_key).toBe("corretora_lead_recebido");
    expect(inserted.body).toBe("Olá, Vale do Café. Produtor: Joao.");
    expect(inserted.lead_id).toBe(7);
    expect(inserted.corretora_id).toBe(3);
    expect(inserted.contract_id).toBeNull();
    expect(inserted.provider).toBe("stub");
    expect(inserted.status).toBe("queued_stub");
    expect(inserted.language_code).toBe("pt_BR");

    // Update deve ter sido chamado com status final + provider_message_id
    const updateArgs = repo.updateMessageResult.mock.calls[0];
    expect(updateArgs[0]).toBe(42);
    expect(updateArgs[1].status).toBe("queued_stub");
    expect(updateArgs[1].provider_message_id).toMatch(/^stub_/);
    expect(updateArgs[1].error_message).toBeNull();
  });

  // -----------------------------------------------------------------
  // Template inactive nao dispara adapter
  // -----------------------------------------------------------------
  test("template inactive: retorna CONFLICT, nao chama insertMessage", async () => {
    repo.findActiveTemplate.mockResolvedValue(null); // sem ativo
    repo.findAnyTemplate.mockResolvedValue({ id: 1, version: 1, active: 0 });

    const r = await service.sendMessage({
      key: "corretora_lead_recebido",
      variables: {},
      to: "5533999991234",
    });

    expect(r.ok).toBe(false);
    expect(r.code).toBe("CONFLICT");
    expect(r.message).toMatch(/inativo/i);
    expect(repo.insertMessage).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------
  // Template inexistente
  // -----------------------------------------------------------------
  test("template inexistente: retorna NOT_FOUND", async () => {
    repo.findActiveTemplate.mockResolvedValue(null);
    repo.findAnyTemplate.mockResolvedValue(null);

    const r = await service.sendMessage({
      key: "corretora_inexistente",
      variables: {},
      to: "5533999991234",
    });

    expect(r.ok).toBe(false);
    expect(r.code).toBe("NOT_FOUND");
    expect(repo.insertMessage).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------
  // Numero invalido
  // -----------------------------------------------------------------
  test("telefone invalido: VALIDATION_ERROR antes do adapter", async () => {
    const r = await service.sendMessage({
      key: "corretora_lead_recebido",
      variables: {},
      to: "123",
    });

    expect(r.ok).toBe(false);
    expect(r.code).toBe("VALIDATION_ERROR");
    expect(repo.findActiveTemplate).not.toHaveBeenCalled();
    expect(repo.insertMessage).not.toHaveBeenCalled();
  });

  test("key vazia: VALIDATION_ERROR", async () => {
    const r = await service.sendMessage({
      key: "",
      variables: {},
      to: "5533999991234",
    });
    expect(r.ok).toBe(false);
    expect(r.code).toBe("VALIDATION_ERROR");
  });

  // -----------------------------------------------------------------
  // language_code do template -> whatsapp_messages
  // -----------------------------------------------------------------
  test("language_code default copia do template", async () => {
    repo.findActiveTemplate.mockResolvedValue(
      fakeTemplate({ language_code: "pt_PT" }),
    );
    repo.insertMessage.mockResolvedValue({ id: 1 });
    repo.updateMessageResult.mockResolvedValue({ affectedRows: 1 });

    const r = await service.sendMessage({
      key: "corretora_lead_recebido",
      variables: {},
      to: "5533999991234",
    });

    expect(r.language_code).toBe("pt_PT");
    expect(repo.insertMessage.mock.calls[0][0].language_code).toBe("pt_PT");
  });

  test("override language_code prevalece", async () => {
    repo.findActiveTemplate.mockResolvedValue(
      fakeTemplate({ language_code: "pt_BR" }),
    );
    repo.insertMessage.mockResolvedValue({ id: 1 });
    repo.updateMessageResult.mockResolvedValue({ affectedRows: 1 });

    const r = await service.sendMessage({
      key: "corretora_lead_recebido",
      variables: {},
      to: "5533999991234",
      language_code: "en_US",
    });

    expect(r.language_code).toBe("en_US");
    expect(repo.insertMessage.mock.calls[0][0].language_code).toBe("en_US");
  });

  // -----------------------------------------------------------------
  // sendFreeText
  // -----------------------------------------------------------------
  test("sendFreeText com stub: insere template_key=NULL e ok", async () => {
    repo.insertMessage.mockResolvedValue({ id: 99 });
    repo.updateMessageResult.mockResolvedValue({ affectedRows: 1 });

    const r = await service.sendFreeText({
      to: "5533999991234",
      text: "Mensagem livre dentro da janela 24h",
      lead_id: 5,
    });

    expect(r.ok).toBe(true);
    expect(r.status).toBe("queued_stub");
    expect(r.provider).toBe("stub");

    const inserted = repo.insertMessage.mock.calls[0][0];
    expect(inserted.template_key).toBeNull();
    expect(inserted.body).toBe("Mensagem livre dentro da janela 24h");
    expect(inserted.lead_id).toBe(5);
  });

  test("sendFreeText: text vazio -> VALIDATION_ERROR", async () => {
    const r = await service.sendFreeText({
      to: "5533999991234",
      text: "   ",
    });
    expect(r.ok).toBe(false);
    expect(r.code).toBe("VALIDATION_ERROR");
    expect(repo.insertMessage).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------
  // Stub forcado a falhar -> failed em whatsapp_messages
  // -----------------------------------------------------------------
  test("stub force fail: status final failed e ok=false", async () => {
    process.env.WHATSAPP_STUB_FORCE_FAIL = "true";
    repo.findActiveTemplate.mockResolvedValue(fakeTemplate());
    repo.insertMessage.mockResolvedValue({ id: 7 });
    repo.updateMessageResult.mockResolvedValue({ affectedRows: 1 });

    const r = await service.sendMessage({
      key: "corretora_lead_recebido",
      variables: {},
      to: "5533999991234",
    });

    expect(r.ok).toBe(false);
    expect(r.code).toBe("SERVER_ERROR");
    expect(r.status).toBe("failed");
    expect(repo.updateMessageResult.mock.calls[0][1].status).toBe("failed");
    expect(repo.updateMessageResult.mock.calls[0][1].error_message).toBe(
      "stub.force_fail",
    );
  });

  // -----------------------------------------------------------------
  // api sem meta_template_name
  // -----------------------------------------------------------------
  test("provider=api mas template sem meta_template_name: CONFLICT, nao bate Meta", async () => {
    process.env.WHATSAPP_PROVIDER = "api";
    repo.findActiveTemplate.mockResolvedValue(
      fakeTemplate({ meta_template_name: null }),
    );
    repo.insertMessage.mockResolvedValue({ id: 30 });
    repo.updateMessageResult.mockResolvedValue({ affectedRows: 1 });

    // Garante que se Meta fosse chamada o teste pegaria
    const originalFetch = global.fetch;
    global.fetch = jest.fn();

    const r = await service.sendMessage({
      key: "corretora_lead_recebido",
      variables: {},
      to: "5533999991234",
    });

    expect(r.ok).toBe(false);
    expect(r.code).toBe("CONFLICT");
    expect(r.message).toMatch(/meta_template_name/i);
    expect(global.fetch).not.toHaveBeenCalled();
    // Mensagem persistida como failed (registramos a tentativa)
    expect(repo.updateMessageResult.mock.calls[0][1].status).toBe("failed");

    global.fetch = originalFetch;
  });
});
