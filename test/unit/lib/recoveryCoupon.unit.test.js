/**
 * test/unit/lib/recoveryCoupon.unit.test.js
 *
 * C2 — utilitários de cupom de recuperação. Cobre:
 *   - código é determinístico (mesmo cartId → mesmo código)
 *   - código é único por cartId
 *   - secret diferente gera hash diferente
 *   - prefixo + estrutura
 *   - data de expiração
 *   - defaults da regra de negócio
 */

describe("lib/recoveryCoupon", () => {
  const path = require.resolve("../../../lib/recoveryCoupon");

  beforeEach(() => {
    jest.resetModules();
    delete process.env.RECOVERY_COUPON_SECRET;
  });

  describe("buildRecoveryCode()", () => {
    test("código tem formato RECOVER-{id}-{hash}", () => {
      process.env.RECOVERY_COUPON_SECRET = "test-secret";
      const { buildRecoveryCode } = require(path);
      const code = buildRecoveryCode(42);
      expect(code).toMatch(/^RECOVER-42-[A-F0-9]{6}$/);
    });

    test("determinístico: mesmo cartId → mesmo código", () => {
      process.env.RECOVERY_COUPON_SECRET = "fixed-secret";
      const { buildRecoveryCode } = require(path);
      const a = buildRecoveryCode(42);
      const b = buildRecoveryCode(42);
      expect(a).toBe(b);
    });

    test("ids diferentes → códigos diferentes", () => {
      process.env.RECOVERY_COUPON_SECRET = "fixed-secret";
      const { buildRecoveryCode } = require(path);
      expect(buildRecoveryCode(1)).not.toBe(buildRecoveryCode(2));
      expect(buildRecoveryCode(99)).not.toBe(buildRecoveryCode(100));
    });

    test("secret diferente muda o hash do mesmo id", () => {
      process.env.RECOVERY_COUPON_SECRET = "secret-a";
      const { buildRecoveryCode: buildA } = require(path);
      const codeA = buildA(42);

      jest.resetModules();
      process.env.RECOVERY_COUPON_SECRET = "secret-b";
      const { buildRecoveryCode: buildB } = require(path);
      const codeB = buildB(42);

      expect(codeA).not.toBe(codeB);
      // Mas ambos seguem mesmo formato
      expect(codeA).toMatch(/^RECOVER-42-[A-F0-9]{6}$/);
      expect(codeB).toMatch(/^RECOVER-42-[A-F0-9]{6}$/);
    });

    test("aceita id como string ou number", () => {
      process.env.RECOVERY_COUPON_SECRET = "x";
      const { buildRecoveryCode } = require(path);
      expect(buildRecoveryCode(42)).toBe(buildRecoveryCode("42"));
    });
  });

  describe("buildExpirationDate()", () => {
    test("default 48h a partir de agora", () => {
      const { buildExpirationDate, RECOVERY_DEFAULTS } = require(path);
      expect(RECOVERY_DEFAULTS.expiracaoHours).toBe(48);
      const exp = buildExpirationDate();
      const diffH = (exp.getTime() - Date.now()) / 1000 / 60 / 60;
      expect(diffH).toBeGreaterThan(47.9);
      expect(diffH).toBeLessThan(48.1);
    });

    test("aceita override de horas", () => {
      const { buildExpirationDate } = require(path);
      const exp = buildExpirationDate(24);
      const diffH = (exp.getTime() - Date.now()) / 1000 / 60 / 60;
      expect(diffH).toBeGreaterThan(23.9);
      expect(diffH).toBeLessThan(24.1);
    });
  });

  describe("RECOVERY_DEFAULTS", () => {
    test("valores fixados conforme decisão de negócio (10% / 48h / 1 uso)", () => {
      const { RECOVERY_DEFAULTS } = require(path);
      expect(RECOVERY_DEFAULTS.tipo).toBe("percentual");
      expect(RECOVERY_DEFAULTS.valor).toBe(10);
      expect(RECOVERY_DEFAULTS.expiracaoHours).toBe(48);
      expect(RECOVERY_DEFAULTS.max_usos).toBe(1);
      expect(RECOVERY_DEFAULTS.max_usos_por_usuario).toBe(1);
      expect(RECOVERY_DEFAULTS.minimo).toBe(0);
    });

    test("é imutável (Object.freeze impede mutação)", () => {
      const { RECOVERY_DEFAULTS } = require(path);
      // Em non-strict mode o assignment falha silenciosamente — checamos
      // o efeito (valor não mudou) em vez de capturar TypeError.
      try {
        RECOVERY_DEFAULTS.valor = 99;
      } catch {
        // strict mode: ok, lançou
      }
      expect(RECOVERY_DEFAULTS.valor).toBe(10);
      expect(Object.isFrozen(RECOVERY_DEFAULTS)).toBe(true);
    });
  });
});
