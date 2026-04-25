/**
 * test/unit/lib/waLink.unit.test.js
 *
 * Cobre:
 *   - normalizePhoneBR: aceita formatos diversos, rejeita inválidos
 *   - buildWaMeLink: gera URL correta, retorna null em casos limite
 */

const { normalizePhoneBR, buildWaMeLink } = require("../../../lib/waLink");

describe("lib/waLink", () => {
  describe("normalizePhoneBR()", () => {
    test.each([
      // [input, expected]
      ["33999991234", "5533999991234"],         // 11 dígitos sem 55
      ["(33) 99999-1234", "5533999991234"],     // formatado
      ["+55 33 99999-1234", "5533999991234"],   // já tem 55
      ["55 33 99999 1234", "5533999991234"],    // espaços
      ["3399991234", "553399991234"],           // 10 dígitos (fixo+DDD)
    ])("%s → %s", (raw, expected) => {
      expect(normalizePhoneBR(raw)).toBe(expected);
    });

    test.each([
      [null],
      [undefined],
      [""],
      ["abc"],
      ["123"],          // muito curto
      ["555555555555555"], // muito longo
    ])("rejeita %p retornando null", (raw) => {
      expect(normalizePhoneBR(raw)).toBeNull();
    });
  });

  describe("buildWaMeLink()", () => {
    test("monta URL correta com encodeURIComponent na mensagem", () => {
      const url = buildWaMeLink({
        telefone: "33999991234",
        mensagem: "Olá, bom dia!",
      });
      expect(url).toBe(
        "https://wa.me/5533999991234?text=Ol%C3%A1%2C%20bom%20dia!",
      );
    });

    test("retorna null se telefone inválido", () => {
      expect(buildWaMeLink({ telefone: "abc", mensagem: "oi" })).toBeNull();
    });

    test("retorna null se mensagem vazia", () => {
      expect(buildWaMeLink({ telefone: "33999991234", mensagem: "" })).toBeNull();
      expect(buildWaMeLink({ telefone: "33999991234", mensagem: "   " })).toBeNull();
    });

    test("preserva quebras de linha no encoding", () => {
      const url = buildWaMeLink({
        telefone: "33999991234",
        mensagem: "Linha 1\nLinha 2",
      });
      expect(url).toContain("Linha%201%0ALinha%202");
    });
  });
});
