"use strict";

describe("cpfCrypto", () => {
  const ORIGINAL_ENV = process.env.CPF_ENCRYPTION_KEY;

  afterEach(() => {
    if (ORIGINAL_ENV === undefined) {
      delete process.env.CPF_ENCRYPTION_KEY;
    } else {
      process.env.CPF_ENCRYPTION_KEY = ORIGINAL_ENV;
    }
    jest.resetModules();
  });

  function loadModule() {
    jest.resetModules();
    return require("../../../utils/cpfCrypto");
  }

  // -----------------------------------------------------------------------
  // Sem chave — no-op (dev local)
  // -----------------------------------------------------------------------

  describe("sem CPF_ENCRYPTION_KEY", () => {
    beforeEach(() => { delete process.env.CPF_ENCRYPTION_KEY; });

    test("encryptCPF retorna plaintext", () => {
      const { encryptCPF } = loadModule();
      expect(encryptCPF("12345678901")).toBe("12345678901");
    });

    test("decryptCPF retorna plaintext (passthrough)", () => {
      const { decryptCPF } = loadModule();
      expect(decryptCPF("12345678901")).toBe("12345678901");
    });

    test("hashCPF retorna digits como fallback", () => {
      const { hashCPF } = loadModule();
      expect(hashCPF("123.456.789-01")).toBe("12345678901");
    });

    test("encryptCPF(null) retorna null", () => {
      const { encryptCPF } = loadModule();
      expect(encryptCPF(null)).toBeNull();
    });

    test("decryptCPF(null) retorna null", () => {
      const { decryptCPF } = loadModule();
      expect(decryptCPF(null)).toBeNull();
    });

    test("hashCPF(null) retorna null", () => {
      const { hashCPF } = loadModule();
      expect(hashCPF(null)).toBeNull();
    });

    test("encryptCPF('') retorna null", () => {
      const { encryptCPF } = loadModule();
      expect(encryptCPF("")).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // Com chave — encryption real
  // -----------------------------------------------------------------------

  describe("com CPF_ENCRYPTION_KEY", () => {
    beforeEach(() => { process.env.CPF_ENCRYPTION_KEY = "test-key-minimum-32-characters!!"; });

    test("encryptCPF retorna formato iv:authTag:ciphertext", () => {
      const { encryptCPF } = loadModule();
      const encrypted = encryptCPF("12345678901");
      const parts = encrypted.split(":");
      expect(parts).toHaveLength(3);
      expect(parts[0]).toHaveLength(32); // IV hex = 16 bytes = 32 hex chars
      expect(parts[1]).toHaveLength(32); // authTag hex = 16 bytes = 32 hex chars
      expect(parts[2].length).toBeGreaterThan(0); // ciphertext
    });

    test("round-trip: decrypt(encrypt(cpf)) === cpf", () => {
      const { encryptCPF, decryptCPF } = loadModule();
      const cpf = "12345678901";
      const encrypted = encryptCPF(cpf);
      const decrypted = decryptCPF(encrypted);
      expect(decrypted).toBe(cpf);
    });

    test("cada encrypt gera ciphertext diferente (IV aleatório)", () => {
      const { encryptCPF } = loadModule();
      const a = encryptCPF("12345678901");
      const b = encryptCPF("12345678901");
      expect(a).not.toBe(b); // IV diferente a cada chamada
    });

    test("hashCPF retorna hex de 64 chars (SHA-256)", () => {
      const { hashCPF } = loadModule();
      const hash = hashCPF("12345678901");
      expect(hash).toHaveLength(64);
      expect(/^[a-f0-9]+$/.test(hash)).toBe(true);
    });

    test("hashCPF é determinístico (mesmo input = mesmo hash)", () => {
      const { hashCPF } = loadModule();
      expect(hashCPF("12345678901")).toBe(hashCPF("12345678901"));
    });

    test("hashCPF de CPFs diferentes gera hashes diferentes", () => {
      const { hashCPF } = loadModule();
      expect(hashCPF("12345678901")).not.toBe(hashCPF("98765432100"));
    });

    test("encryptCPF strip non-digits antes de criptografar", () => {
      const { encryptCPF, decryptCPF } = loadModule();
      const encrypted = encryptCPF("123.456.789-01");
      expect(decryptCPF(encrypted)).toBe("12345678901");
    });

    test("hashCPF strip non-digits", () => {
      const { hashCPF } = loadModule();
      expect(hashCPF("123.456.789-01")).toBe(hashCPF("12345678901"));
    });

    test("decryptCPF de plaintext legacy (sem :) retorna como está", () => {
      const { decryptCPF } = loadModule();
      expect(decryptCPF("12345678901")).toBe("12345678901");
    });

    test("decryptCPF com ciphertext malformado retorna null", () => {
      const { decryptCPF } = loadModule();
      expect(decryptCPF("aaa:bbb:ccc")).toBeNull(); // hex inválido
    });

    test("decryptCPF com chave errada retorna null", () => {
      const { encryptCPF } = loadModule();
      const encrypted = encryptCPF("12345678901");

      // Muda a chave
      process.env.CPF_ENCRYPTION_KEY = "different-key-32-characters!!!!!";
      const { decryptCPF } = loadModule();
      expect(decryptCPF(encrypted)).toBeNull();
    });
  });
});
