/**
 * test/unit/services/whatsapp/stubAdapter.unit.test.js
 *
 * Adapter stub — Etapa 3 da reativacao. Cobre:
 *   - retorno default queued_stub com messageId determ. stub_<ts>_<rand>
 *   - WHATSAPP_STUB_FORCE_FAIL=true forca status=error
 *   - input invalido -> status=error
 */

const stub = require("../../../../services/whatsapp/adapters/stub");

describe("services/whatsapp/adapters/stub", () => {
  afterEach(() => {
    delete process.env.WHATSAPP_STUB_FORCE_FAIL;
  });

  test("default: status=queued_stub + messageId stub_<ts>_<rand>", async () => {
    const r = await stub.send({ destino: "5533999991234", mensagem: "ola" });
    expect(r.provider).toBe("stub");
    expect(r.status).toBe("queued_stub");
    expect(r.url).toBeNull();
    expect(r.erro).toBeNull();
    expect(r.messageId).toMatch(/^stub_\d+_[0-9a-f]+$/);
  });

  test("WHATSAPP_STUB_FORCE_FAIL=true -> status=error", async () => {
    process.env.WHATSAPP_STUB_FORCE_FAIL = "true";
    const r = await stub.send({ destino: "5533999991234", mensagem: "ola" });
    expect(r.status).toBe("error");
    expect(r.erro).toBe("stub.force_fail");
    expect(r.messageId).toBeUndefined();
  });

  test("destino vazio -> status=error", async () => {
    const r = await stub.send({ destino: "", mensagem: "x" });
    expect(r.status).toBe("error");
  });

  test("mensagem vazia -> status=error", async () => {
    const r = await stub.send({ destino: "5533999991234", mensagem: "" });
    expect(r.status).toBe("error");
  });
});
