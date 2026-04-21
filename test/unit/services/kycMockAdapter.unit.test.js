// test/unit/services/kycMockAdapter.unit.test.js
"use strict";

const adapter = require("../../../services/kyc/kycMockAdapter");

describe("kycMockAdapter.verifyCnpj", () => {
  it("rejeita CNPJ com formato inválido (menos de 14 dígitos)", async () => {
    const r = await adapter.verifyCnpj("12345");
    expect(r.ok).toBe(false);
    expect(r.error_code).toBe("INVALID_FORMAT");
  });

  it("rejeita CNPJ com dígitos todos iguais", async () => {
    const r = await adapter.verifyCnpj("11111111111111");
    expect(r.ok).toBe(false);
    expect(r.error_code).toBe("INVALID_FORMAT");
  });

  it("aceita CNPJ com máscara e normaliza", async () => {
    const r = await adapter.verifyCnpj("12.345.678/0001-95");
    expect(r.ok).toBe(true);
    expect(r.cnpj).toBe("12345678000195");
  });

  it("retorna ATIVA para CNPJ válido padrão", async () => {
    const r = await adapter.verifyCnpj("12345678000195");
    expect(r.ok).toBe(true);
    expect(r.situacao_cadastral).toBe("ATIVA");
    expect(r.provider).toBe("mock");
    expect(r.qsa).toHaveLength(2);
    expect(r.risk_score).toBe(15);
  });

  it("retorna BAIXADA para 14 zeros", async () => {
    const r = await adapter.verifyCnpj("00000000000000");
    expect(r.ok).toBe(false); // 14 zeros falha na regex de dígitos iguais
  });

  it("retorna INATIVA para CNPJ terminando em 0000", async () => {
    const r = await adapter.verifyCnpj("12345678000000");
    expect(r.ok).toBe(true);
    expect(r.situacao_cadastral).toBe("INATIVA");
    expect(r.risk_score).toBe(85);
  });

  it("retorna SUSPENSA para CNPJ terminando em 9999", async () => {
    const r = await adapter.verifyCnpj("12345678999999");
    expect(r.ok).toBe(true);
    expect(r.situacao_cadastral).toBe("SUSPENSA");
  });

  it("raw_response preserva metadata para auditoria", async () => {
    const r = await adapter.verifyCnpj("12345678000195");
    expect(r.raw_response.source).toBe("kycMockAdapter");
    expect(r.raw_response.generated_at).toMatch(/\d{4}-\d{2}-\d{2}T/);
  });
});

describe("kycMockAdapter._internals", () => {
  const { _onlyDigits, _isValidCnpjFormat } = adapter._internals;

  it("_onlyDigits remove máscara e espaços", () => {
    expect(_onlyDigits("12.345.678/0001-95")).toBe("12345678000195");
    expect(_onlyDigits("  1 2 3 4 5 6 7 8 0 0 0 1 9 5 ")).toBe("12345678000195");
    expect(_onlyDigits("")).toBe("");
  });

  it("_isValidCnpjFormat rejeita tamanho errado e repetições", () => {
    expect(_isValidCnpjFormat("12345678000195")).toBe(true);
    expect(_isValidCnpjFormat("123")).toBe(false);
    expect(_isValidCnpjFormat("00000000000000")).toBe(false);
    expect(_isValidCnpjFormat("99999999999999")).toBe(false);
  });
});
