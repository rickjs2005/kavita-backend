"use strict";

const speakeasy = require("speakeasy");

const totp = require("../../../lib/totp");

describe("lib/totp", () => {
  describe("generateSecret", () => {
    test("retorna secret base32 + otpauth_url + qr_data_url", async () => {
      const out = await totp.generateSecret({ label: "Kavita:teste@x.com" });
      expect(out.secret).toMatch(/^[A-Z2-7]+=*$/); // base32 RFC 4648
      expect(out.otpauth_url).toMatch(/^otpauth:\/\/totp\//);
      // O speakeasy põe o label (incluindo "Kavita:" se passado) na URL
      expect(decodeURIComponent(out.otpauth_url)).toContain("Kavita");
      expect(out.qr_data_url).toMatch(/^data:image\/png;base64,/);
    });

    test("inclui o label na URL", async () => {
      const out = await totp.generateSecret({ label: "admin@kavita.com.br" });
      expect(decodeURIComponent(out.otpauth_url)).toContain("admin@kavita.com.br");
    });
  });

  describe("sanitizeCode", () => {
    test.each([
      ["123456", "123456"],
      ["123 456", "123456"],
      ["123-456", "123456"],
      ["abc123def456", "123456"],
      ["", ""],
      [null, ""],
      [undefined, ""],
      ["12345678901", "12345678"], // trunca em 8
    ])("sanitizeCode(%p) === %p", (input, expected) => {
      expect(totp.sanitizeCode(input)).toBe(expected);
    });
  });

  describe("verifyToken", () => {
    test("aceita código gerado pelo speakeasy no mesmo instante", () => {
      const secret = speakeasy.generateSecret({ length: 20 }).base32;
      const code = speakeasy.totp({ secret, encoding: "base32" });
      expect(totp.verifyToken({ secret, code })).toBe(true);
    });

    test("rejeita código inválido", () => {
      const secret = speakeasy.generateSecret({ length: 20 }).base32;
      expect(totp.verifyToken({ secret, code: "000000" })).toBe(false);
    });

    test("rejeita quando secret ausente", () => {
      expect(totp.verifyToken({ secret: "", code: "123456" })).toBe(false);
      expect(totp.verifyToken({ secret: null, code: "123456" })).toBe(false);
    });

    test("rejeita código com tamanho diferente de 6", () => {
      const secret = speakeasy.generateSecret({ length: 20 }).base32;
      expect(totp.verifyToken({ secret, code: "12345" })).toBe(false);
      expect(totp.verifyToken({ secret, code: "1234567" })).toBe(false);
    });

    test("aceita window=±30s (clock skew)", () => {
      // Step de 30s para trás
      const secret = speakeasy.generateSecret({ length: 20 }).base32;
      const previous = speakeasy.totp({
        secret,
        encoding: "base32",
        time: Math.floor(Date.now() / 1000) - 30,
      });
      expect(totp.verifyToken({ secret, code: previous })).toBe(true);
    });
  });

  describe("generateBackupCode", () => {
    test("retorna string com BACKUP_CODE_LENGTH chars do alfabeto sem 0/O/1/I", () => {
      const code = totp.generateBackupCode();
      expect(code).toHaveLength(totp.BACKUP_CODE_LENGTH);
      for (const ch of code) {
        expect(totp.BACKUP_CODE_ALPHABET.includes(ch)).toBe(true);
      }
      expect(code).not.toMatch(/[01OI]/);
    });

    test("alfabeto não tem caracteres ambíguos", () => {
      expect(totp.BACKUP_CODE_ALPHABET).not.toContain("0");
      expect(totp.BACKUP_CODE_ALPHABET).not.toContain("O");
      expect(totp.BACKUP_CODE_ALPHABET).not.toContain("1");
      expect(totp.BACKUP_CODE_ALPHABET).not.toContain("I");
    });

    test("100 codes não geram duplicatas (entropia mínima)", () => {
      const set = new Set();
      for (let i = 0; i < 100; i += 1) set.add(totp.generateBackupCode());
      expect(set.size).toBe(100);
    });
  });

  describe("generateBackupCodes", () => {
    test("default count=10", () => {
      const codes = totp.generateBackupCodes();
      expect(codes).toHaveLength(10);
    });

    test("count custom respeitado", () => {
      const codes = totp.generateBackupCodes(3);
      expect(codes).toHaveLength(3);
    });

    test("todos codes únicos no batch", () => {
      const codes = totp.generateBackupCodes(20);
      expect(new Set(codes).size).toBe(20);
    });
  });

  describe("normalizeBackupCodeInput", () => {
    test.each([
      ["abcd-efgh", "ABCDEFGH"],
      ["AB CD EF GH", "ABCDEFGH"],
      ["abcdefgh", "ABCDEFGH"],
      [" \t hello \n ", "HELLO"],
      ["", ""],
      [null, ""],
      [undefined, ""],
    ])("normalizeBackupCodeInput(%p) === %p", (input, expected) => {
      expect(totp.normalizeBackupCodeInput(input)).toBe(expected);
    });
  });
});
