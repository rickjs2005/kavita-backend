"use strict";

// F1.6 — testes do vault.

const crypto = require("node:crypto");

// Cada teste roda com a key isolada — beforeEach restaura.
const ORIG_KEY = process.env.MFA_ENCRYPTION_KEY;
const ORIG_NODE_ENV = process.env.NODE_ENV;
const TEST_KEY = crypto.randomBytes(32).toString("base64");

function loadFresh() {
  jest.resetModules();
  return require("../../../lib/cryptoVault");
}

describe("lib/cryptoVault", () => {
  beforeEach(() => {
    process.env.MFA_ENCRYPTION_KEY = TEST_KEY;
    process.env.NODE_ENV = "test";
  });

  afterAll(() => {
    if (ORIG_KEY === undefined) delete process.env.MFA_ENCRYPTION_KEY;
    else process.env.MFA_ENCRYPTION_KEY = ORIG_KEY;
    if (ORIG_NODE_ENV === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = ORIG_NODE_ENV;
  });

  describe("encryptString + decryptString round-trip", () => {
    test("roda sucesso pra string ASCII curta", () => {
      const v = loadFresh();
      const ct = v.encryptString("ABCDEFGHIJKLMNOP");
      expect(ct).toMatch(/^v1:/);
      expect(v.decryptString(ct)).toBe("ABCDEFGHIJKLMNOP");
    });

    test("roda sucesso pra string com Unicode", () => {
      const v = loadFresh();
      const plain = "Café com ☕ e 🥐 — secrétissimo";
      const ct = v.encryptString(plain);
      expect(v.decryptString(ct)).toBe(plain);
    });

    test("cada encrypt produz IV diferente (não-determinismo)", () => {
      const v = loadFresh();
      const a = v.encryptString("mesmo input");
      const b = v.encryptString("mesmo input");
      expect(a).not.toBe(b);
      expect(v.decryptString(a)).toBe(v.decryptString(b));
    });

    test("formato self-describing: v1:<iv>:<tag>:<ct>", () => {
      const v = loadFresh();
      const ct = v.encryptString("teste");
      const parts = ct.split(":");
      expect(parts).toHaveLength(4);
      expect(parts[0]).toBe("v1");
      expect(Buffer.from(parts[1], "base64")).toHaveLength(12); // IV
      expect(Buffer.from(parts[2], "base64")).toHaveLength(16); // tag
      expect(Buffer.from(parts[3], "base64").length).toBeGreaterThan(0);
    });
  });

  describe("integridade — auth tag rejeita adulteração", () => {
    test("trocar 1 char do ciphertext → throw", () => {
      const v = loadFresh();
      const ct = v.encryptString("inviolavel");
      const parts = ct.split(":");
      const tampered = Buffer.from(parts[3], "base64");
      tampered[0] = tampered[0] ^ 0x01;
      const adulterado = `v1:${parts[1]}:${parts[2]}:${tampered.toString("base64")}`;
      expect(() => v.decryptString(adulterado)).toThrow(/falha de autenticação|adulterado/i);
    });

    test("trocar tag → throw", () => {
      const v = loadFresh();
      const ct = v.encryptString("inviolavel");
      const parts = ct.split(":");
      const tag = Buffer.from(parts[2], "base64");
      tag[0] = tag[0] ^ 0x01;
      const adulterado = `v1:${parts[1]}:${tag.toString("base64")}:${parts[3]}`;
      expect(() => v.decryptString(adulterado)).toThrow();
    });

    test("trocar key → throw", () => {
      const v = loadFresh();
      const ct = v.encryptString("inviolavel");
      // muda a key e tenta decifrar
      process.env.MFA_ENCRYPTION_KEY = crypto.randomBytes(32).toString("base64");
      const v2 = loadFresh();
      expect(() => v2.decryptString(ct)).toThrow();
    });
  });

  describe("compat plaintext em dev/test", () => {
    test("dev/test devolve plaintext sem prefixo como veio", () => {
      const v = loadFresh();
      expect(v.decryptString("LEGACY_PLAINTEXT_BASE32")).toBe("LEGACY_PLAINTEXT_BASE32");
    });
  });

  describe("rejeição de plaintext em produção", () => {
    test("production REJEITA plaintext sem prefixo v1:", () => {
      process.env.NODE_ENV = "production";
      const v = loadFresh();
      expect(() => v.decryptString("LEGACY_PLAINTEXT_BASE32")).toThrow(
        /PLAINTEXT detectado em produção/i,
      );
    });

    test("production aceita normalmente o formato v1:", () => {
      const vEnc = loadFresh();
      const ct = vEnc.encryptString("ok-em-prod");
      process.env.NODE_ENV = "production";
      const vDec = loadFresh();
      expect(vDec.decryptString(ct)).toBe("ok-em-prod");
    });
  });

  describe("validação de chave", () => {
    test("ausente → throw", () => {
      delete process.env.MFA_ENCRYPTION_KEY;
      const v = loadFresh();
      expect(() => v.encryptString("x")).toThrow(/MFA_ENCRYPTION_KEY ausente/);
    });

    test("formato inválido → throw", () => {
      process.env.MFA_ENCRYPTION_KEY = "muito-curta";
      const v = loadFresh();
      expect(() => v.encryptString("x")).toThrow(/formato inválido/i);
    });

    test("aceita 32 bytes em hex (64 chars)", () => {
      process.env.MFA_ENCRYPTION_KEY = crypto.randomBytes(32).toString("hex");
      const v = loadFresh();
      expect(() => v.encryptString("x")).not.toThrow();
    });

    test("aceita 32 bytes em base64", () => {
      process.env.MFA_ENCRYPTION_KEY = crypto.randomBytes(32).toString("base64");
      const v = loadFresh();
      expect(() => v.encryptString("x")).not.toThrow();
    });

    test("rejeita key com tamanho diferente de 32 bytes", () => {
      process.env.MFA_ENCRYPTION_KEY = crypto.randomBytes(16).toString("hex");
      const v = loadFresh();
      // 16 bytes em hex = 32 chars, não casa com regex /64/ nem /44/, então throw
      expect(() => v.encryptString("x")).toThrow();
    });
  });

  describe("isEncrypted", () => {
    test.each([
      ["v1:abc:def:ghi", true],
      ["LEGACY_PLAINTEXT", false],
      ["", false],
      [null, false],
      [undefined, false],
      [{ obj: 1 }, false],
    ])("isEncrypted(%p) === %p", (input, expected) => {
      const v = loadFresh();
      expect(v.isEncrypted(input)).toBe(expected);
    });
  });

  describe("inputs de borda", () => {
    test("encrypt rejeita string vazia", () => {
      const v = loadFresh();
      expect(() => v.encryptString("")).toThrow(/vazia/i);
    });

    test("encrypt rejeita não-string", () => {
      const v = loadFresh();
      expect(() => v.encryptString(123)).toThrow(/string/i);
      expect(() => v.encryptString(null)).toThrow();
    });

    test("decrypt rejeita string vazia", () => {
      const v = loadFresh();
      expect(() => v.decryptString("")).toThrow(/vazio/i);
    });

    test("decrypt rejeita formato v1: com partes faltando", () => {
      const v = loadFresh();
      expect(() => v.decryptString("v1:onlyone")).toThrow(/formato inesperado/i);
      expect(() => v.decryptString("v1:a:b")).toThrow(/formato inesperado/i);
    });
  });
});
