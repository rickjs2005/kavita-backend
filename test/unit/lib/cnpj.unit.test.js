"use strict";

const {
  normalizeCnpj,
  isValidCnpj,
  formatCnpj,
  maskCnpj,
} = require("../../../lib/cnpj");

describe("lib/cnpj", () => {
  describe("normalizeCnpj", () => {
    test("remove mascara", () => {
      expect(normalizeCnpj("12.345.678/0001-90")).toBe("12345678000190");
    });
    test("aceita ja normalizado", () => {
      expect(normalizeCnpj("12345678000190")).toBe("12345678000190");
    });
    test("trata null/undefined", () => {
      expect(normalizeCnpj(null)).toBeNull();
      expect(normalizeCnpj(undefined)).toBeNull();
    });
    test("vazio retorna string vazia", () => {
      expect(normalizeCnpj("")).toBe("");
    });
  });

  describe("isValidCnpj", () => {
    test("aceita CNPJs validos conhecidos", () => {
      // CNPJs de empresas reais publicas (algoritmo passa)
      expect(isValidCnpj("11222333000181")).toBe(true);
      expect(isValidCnpj("00.000.000/0001-91")).toBe(true); // Banco do Brasil
      expect(isValidCnpj("33.000.167/0001-01")).toBe(true); // Petrobras
    });

    test("rejeita CNPJ com tamanho errado", () => {
      expect(isValidCnpj("123")).toBe(false);
      expect(isValidCnpj("123456789012345")).toBe(false);
    });

    test("rejeita sequencias repetidas", () => {
      expect(isValidCnpj("00000000000000")).toBe(false);
      expect(isValidCnpj("11111111111111")).toBe(false);
      expect(isValidCnpj("99999999999999")).toBe(false);
    });

    test("rejeita digitos verificadores incorretos", () => {
      expect(isValidCnpj("11222333000180")).toBe(false); // DV2 errado
      expect(isValidCnpj("11222333000182")).toBe(false); // DV2 errado
    });

    test("trata null e nao-string", () => {
      expect(isValidCnpj(null)).toBe(false);
      expect(isValidCnpj(undefined)).toBe(false);
      expect(isValidCnpj(123)).toBe(false);
    });

    test("aceita string formatada", () => {
      expect(isValidCnpj("11.222.333/0001-81")).toBe(true);
    });
  });

  describe("formatCnpj", () => {
    test("formata para mascara padrao", () => {
      expect(formatCnpj("12345678000190")).toBe("12.345.678/0001-90");
    });
    test("retorna null se invalido", () => {
      expect(formatCnpj("123")).toBeNull();
      expect(formatCnpj(null)).toBeNull();
    });
    test("idempotente quando ja formatado", () => {
      expect(formatCnpj("12.345.678/0001-90")).toBe("12.345.678/0001-90");
    });
  });

  describe("maskCnpj", () => {
    test("mascara digitos do meio", () => {
      expect(maskCnpj("12345678000190")).toBe("1234********90");
    });
    test("retorna null se invalido", () => {
      expect(maskCnpj("123")).toBeNull();
      expect(maskCnpj(null)).toBeNull();
    });
  });
});
