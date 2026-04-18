/**
 * test/unit/services/smsService.unit.test.js
 *
 * ETAPA 3.2 — facade SMS com adapter Zenvia.
 */

describe("services/smsService", () => {
  const adapterPath = require.resolve(
    "../../../services/sms/zenviaAdapter",
  );

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    jest.spyOn(console, "warn").mockImplementation(() => {});
    jest.spyOn(console, "info").mockImplementation(() => {});
  });

  afterEach(() => {
    console.warn.mockRestore?.();
    console.info.mockRestore?.();
  });

  it("send() devolve provider_unavailable quando adapter não configurado", async () => {
    jest.doMock(adapterPath, () => ({
      PROVIDER: "zenvia",
      isConfigured: () => false,
      sendSms: jest.fn(),
    }));
    const svc = require("../../../services/smsService");
    const r = await svc.send({ to: "33999990000", text: "oi" });
    expect(r).toEqual({ sent: false, error: "provider_unavailable" });
  });

  it("send() delega no adapter quando configurado", async () => {
    const sendSms = jest.fn().mockResolvedValue({ sent: true, id: "x1" });
    jest.doMock(adapterPath, () => ({
      PROVIDER: "zenvia",
      isConfigured: () => true,
      sendSms,
    }));
    const svc = require("../../../services/smsService");
    const r = await svc.send({ to: "33999990000", text: "hi" });
    expect(r).toEqual({ sent: true, id: "x1" });
    expect(sendSms).toHaveBeenCalledWith({
      to: "33999990000",
      text: "hi",
    });
  });

  it("send() captura throw e devolve {sent:false}", async () => {
    jest.doMock(adapterPath, () => ({
      PROVIDER: "zenvia",
      isConfigured: () => true,
      sendSms: async () => {
        throw new Error("boom");
      },
    }));
    const svc = require("../../../services/smsService");
    const r = await svc.send({ to: "x", text: "x" });
    expect(r.sent).toBe(false);
    expect(r.error).toBe("boom");
  });

  it("isActive() reflete isConfigured()", async () => {
    jest.doMock(adapterPath, () => ({
      PROVIDER: "zenvia",
      isConfigured: () => true,
      sendSms: jest.fn(),
    }));
    const svc = require("../../../services/smsService");
    expect(svc.isActive()).toBe(true);
  });
});

describe("services/sms/zenviaAdapter — normalize()", () => {
  const { normalize } = require("../../../services/sms/zenviaAdapter");

  it("adiciona 55 em número BR de 11 dígitos", () => {
    expect(normalize("(33) 9 9999-0000")).toBe("5533999990000");
  });

  it("adiciona 55 em número BR de 10 dígitos (fixo)", () => {
    expect(normalize("(33) 3333-0000")).toBe("5533333300000".slice(0, 12));
    // 10 dígitos + 55 = 12 total
    expect(normalize("33 3333-0000")).toBe("5533333300000".slice(0, 12));
  });

  it("aceita número com DDI já presente", () => {
    expect(normalize("+55 33 99999-0000")).toBe("5533999990000");
  });

  it("retorna null pra entrada inválida", () => {
    expect(normalize("")).toBeNull();
    expect(normalize("123")).toBeNull();
    expect(normalize(null)).toBeNull();
  });
});
