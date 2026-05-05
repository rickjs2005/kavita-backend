/**
 * test/unit/utils/phone.unit.test.js
 *
 * Etapa 3 da reativacao WhatsApp — wrapper utils/phone.js sobre
 * lib/waLink.js. Cobre normalizacao, validacao e mascaramento de
 * PII para logs.
 */

const phone = require("../../../utils/phone");

describe("utils/phone", () => {
  describe("toE164", () => {
    test("normaliza telefone com mascara", () => {
      expect(phone.toE164("(33) 9 9999-1234")).toBe("5533999991234");
    });

    test("aceita ja com prefixo 55", () => {
      expect(phone.toE164("5533999991234")).toBe("5533999991234");
    });

    test("rejeita telefone curto", () => {
      expect(phone.toE164("99991234")).toBeNull();
    });

    test("rejeita vazio/null", () => {
      expect(phone.toE164("")).toBeNull();
      expect(phone.toE164(null)).toBeNull();
      expect(phone.toE164(undefined)).toBeNull();
    });

    test("aceita fixo de 10 digitos com prefixo 55 (12 total)", () => {
      expect(phone.toE164("3333334444")).toBe("553333334444");
    });
  });

  describe("validateBR", () => {
    test("celular valido com mascara -> true", () => {
      expect(phone.validateBR("(33) 9 9999-1234")).toBe(true);
    });

    test("vazio -> false", () => {
      expect(phone.validateBR("")).toBe(false);
      expect(phone.validateBR(null)).toBe(false);
    });

    test("invalido -> false", () => {
      expect(phone.validateBR("123")).toBe(false);
      expect(phone.validateBR("abc")).toBe(false);
    });
  });

  describe("maskPhone", () => {
    test("mascara mantendo 4 primeiros + 4 ultimos", () => {
      expect(phone.maskPhone("(33) 9 9999-1234")).toBe("5533*****1234");
    });

    test("fixo 12 digitos -> mascara mantida", () => {
      expect(phone.maskPhone("3333334444")).toBe("5533****4444");
    });

    test("invalido -> null", () => {
      expect(phone.maskPhone("123")).toBeNull();
      expect(phone.maskPhone("")).toBeNull();
    });
  });
});
