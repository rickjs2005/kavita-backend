/**
 * test/unit/services/couponService.unit.test.js
 *
 * Testes unitários de services/couponService.js.
 *
 * validateCouponRules — função pura, sem I/O:
 *   Cobre todos os 5 branch de validação + 2 tipos de cálculo (percentual/fixo) + clamp.
 *
 * applyCoupon — transacional (lockCoupon + validateCouponRules + incrementCouponUsage):
 *   checkoutRepository é mockado; nenhuma conexão real é necessária.
 *
 * Estratégia de isolamento:
 *   - jest.resetModules() + jest.doMock() por grupo para garantir que o mock do
 *     checkoutRepository bate com o require interno do couponService.
 *   - validateCouponRules é testada diretamente (sem mock) pois é pura.
 */

"use strict";

const REPO_PATH = require.resolve("../../../repositories/checkoutRepository");
const SERVICE_PATH = require.resolve("../../../services/couponService");

// ---------------------------------------------------------------------------
// validateCouponRules — função pura
// ---------------------------------------------------------------------------

describe("couponService.validateCouponRules", () => {
  // Carregamos o service sem mock de repository (não é necessário para função pura)
  let validateCouponRules;

  beforeAll(() => {
    jest.resetModules();
    validateCouponRules = require(SERVICE_PATH).validateCouponRules;
  });

  function makeCupom(overrides = {}) {
    return {
      id: 1,
      codigo: "PROMO10",
      tipo: "percentual",
      valor: 10,
      minimo: 0,
      expiracao: null,
      usos: 0,
      max_usos: null,
      ativo: 1,
      ...overrides,
    };
  }

  // ---- Validation branches ----

  test("lança 400 VALIDATION_ERROR quando cupom inativo (ativo=0)", () => {
    const cupom = makeCupom({ ativo: 0 });
    expect(() => validateCouponRules(cupom, 100)).toThrow(
      expect.objectContaining({ status: 400, code: "VALIDATION_ERROR", message: expect.stringContaining("inativo") })
    );
  });

  test("lança 400 quando cupom expirado (expiracao no passado)", () => {
    const cupom = makeCupom({ expiracao: "2000-01-01T00:00:00.000Z" });
    expect(() => validateCouponRules(cupom, 100)).toThrow(
      expect.objectContaining({ status: 400, message: expect.stringContaining("expirado") })
    );
  });

  test("NÃO lança quando expiracao está no futuro", () => {
    const futuro = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
    const cupom = makeCupom({ expiracao: futuro });
    expect(() => validateCouponRules(cupom, 100)).not.toThrow();
  });

  test("NÃO lança quando expiracao é null (sem prazo)", () => {
    const cupom = makeCupom({ expiracao: null });
    expect(() => validateCouponRules(cupom, 100)).not.toThrow();
  });

  test("lança 400 quando usos >= max_usos (limite atingido)", () => {
    const cupom = makeCupom({ usos: 5, max_usos: 5 });
    expect(() => validateCouponRules(cupom, 100)).toThrow(
      expect.objectContaining({ message: expect.stringContaining("limite de usos") })
    );
  });

  test("NÃO lança quando usos < max_usos", () => {
    const cupom = makeCupom({ usos: 4, max_usos: 5 });
    expect(() => validateCouponRules(cupom, 100)).not.toThrow();
  });

  test("NÃO lança quando max_usos é null (ilimitado)", () => {
    const cupom = makeCupom({ usos: 9999, max_usos: null });
    expect(() => validateCouponRules(cupom, 100)).not.toThrow();
  });

  test("lança 400 quando subtotal < minimo do cupom", () => {
    const cupom = makeCupom({ minimo: 200 });
    expect(() => validateCouponRules(cupom, 150)).toThrow(
      expect.objectContaining({ message: expect.stringContaining("R$ 200.00") })
    );
  });

  test("NÃO lança quando subtotal == minimo (borda exata)", () => {
    const cupom = makeCupom({ minimo: 100 });
    expect(() => validateCouponRules(cupom, 100)).not.toThrow();
  });

  // ---- Cálculo de desconto ----

  test("tipo percentual: desconto = subtotal * valor / 100", () => {
    const cupom = makeCupom({ tipo: "percentual", valor: 10 });
    const { desconto, cupomAplicado } = validateCouponRules(cupom, 200);

    expect(desconto).toBe(20);
    expect(cupomAplicado).toMatchObject({ id: 1, codigo: "PROMO10", tipo: "percentual", valor: 10 });
  });

  test("tipo fixo: desconto = valor literal", () => {
    const cupom = makeCupom({ tipo: "fixo", valor: 30 });
    const { desconto } = validateCouponRules(cupom, 200);

    expect(desconto).toBe(30);
  });

  test("clamp: desconto fixo maior que subtotal vira subtotal (não gera total negativo)", () => {
    const cupom = makeCupom({ tipo: "fixo", valor: 500 });
    const { desconto } = validateCouponRules(cupom, 120);

    expect(desconto).toBe(120); // clampado
  });

  test("clamp: desconto mínimo é 0 (valor negativo impossível)", () => {
    const cupom = makeCupom({ tipo: "fixo", valor: -50 });
    const { desconto } = validateCouponRules(cupom, 100);

    expect(desconto).toBe(0);
  });

  test("retorna cupomAplicado com campos id, codigo, tipo e valor", () => {
    const cupom = makeCupom({ id: 42, codigo: "VERÃO25", tipo: "percentual", valor: 25 });
    const { cupomAplicado } = validateCouponRules(cupom, 100);

    expect(cupomAplicado).toEqual({ id: 42, codigo: "VERÃO25", tipo: "percentual", valor: 25 });
  });
});

// ---------------------------------------------------------------------------
// applyCoupon — transacional (requer mock de checkoutRepository)
// ---------------------------------------------------------------------------

describe("couponService.applyCoupon", () => {
  let applyCoupon;
  let repoMock;

  function setupModule() {
    jest.resetModules();

    repoMock = {
      lockCoupon: jest.fn(),
      incrementCouponUsage: jest.fn().mockResolvedValue(undefined),
    };

    jest.doMock(REPO_PATH, () => repoMock);
    applyCoupon = require(SERVICE_PATH).applyCoupon;
  }

  beforeEach(() => {
    setupModule();
    jest.clearAllMocks();
  });

  function makeConn() {
    return {}; // conn é passado diretamente ao repo, não precisa de métodos no mock
  }

  function makeCupomRow(overrides = {}) {
    return {
      id: 10,
      codigo: "PROMO10",
      tipo: "percentual",
      valor: 10,
      minimo: 0,
      expiracao: null,
      usos: 0,
      max_usos: null,
      ativo: 1,
      ...overrides,
    };
  }

  test("lança AppError 400 quando lockCoupon retorna null (cupom não existe)", async () => {
    repoMock.lockCoupon.mockResolvedValue(null);

    await expect(applyCoupon(makeConn(), "INEXISTENTE", 100)).rejects.toMatchObject({
      status: 400,
      code: "VALIDATION_ERROR",
      message: expect.stringContaining("Cupom inválido"),
    });

    expect(repoMock.incrementCouponUsage).not.toHaveBeenCalled();
  });

  test("lança AppError quando cupom inativo (delega para validateCouponRules)", async () => {
    repoMock.lockCoupon.mockResolvedValue(makeCupomRow({ ativo: 0 }));

    await expect(applyCoupon(makeConn(), "PROMO10", 100)).rejects.toMatchObject({
      status: 400,
      message: expect.stringContaining("inativo"),
    });

    expect(repoMock.incrementCouponUsage).not.toHaveBeenCalled();
  });

  test("lança AppError quando cupom expirado (sem incrementar uso)", async () => {
    repoMock.lockCoupon.mockResolvedValue(
      makeCupomRow({ expiracao: "2000-01-01T00:00:00.000Z" })
    );

    await expect(applyCoupon(makeConn(), "PROMO10", 100)).rejects.toMatchObject({
      status: 400,
      message: expect.stringContaining("expirado"),
    });

    expect(repoMock.incrementCouponUsage).not.toHaveBeenCalled();
  });

  test("lança AppError quando limite de usos atingido (sem incrementar uso)", async () => {
    repoMock.lockCoupon.mockResolvedValue(makeCupomRow({ usos: 10, max_usos: 10 }));

    await expect(applyCoupon(makeConn(), "PROMO10", 100)).rejects.toMatchObject({
      status: 400,
      message: expect.stringContaining("limite de usos"),
    });

    expect(repoMock.incrementCouponUsage).not.toHaveBeenCalled();
  });

  test("lança AppError quando subtotal abaixo do mínimo (sem incrementar uso)", async () => {
    repoMock.lockCoupon.mockResolvedValue(makeCupomRow({ minimo: 500 }));

    await expect(applyCoupon(makeConn(), "PROMO10", 100)).rejects.toMatchObject({
      status: 400,
      message: expect.stringContaining("R$ 500.00"),
    });

    expect(repoMock.incrementCouponUsage).not.toHaveBeenCalled();
  });

  test("happy path percentual: calcula desconto, incrementa uso e retorna cupomAplicado", async () => {
    const cupomRow = makeCupomRow({ id: 10, tipo: "percentual", valor: 10 });
    repoMock.lockCoupon.mockResolvedValue(cupomRow);

    const conn = makeConn();
    const result = await applyCoupon(conn, "PROMO10", 200);

    expect(result).toEqual({
      desconto: 20,
      cupomAplicado: { id: 10, codigo: "PROMO10", tipo: "percentual", valor: 10 },
    });

    // lockCoupon deve receber a conn e o código trimado
    expect(repoMock.lockCoupon).toHaveBeenCalledWith(conn, "PROMO10");
    // incrementCouponUsage deve receber a conn e o id do cupom
    expect(repoMock.incrementCouponUsage).toHaveBeenCalledWith(conn, 10);
  });

  test("happy path fixo: calcula desconto fixo corretamente", async () => {
    const cupomRow = makeCupomRow({ id: 5, codigo: "FIXO50", tipo: "fixo", valor: 50 });
    repoMock.lockCoupon.mockResolvedValue(cupomRow);

    const result = await applyCoupon(makeConn(), "FIXO50", 300);

    expect(result.desconto).toBe(50);
    expect(result.cupomAplicado).toMatchObject({ tipo: "fixo", valor: 50 });
    expect(repoMock.incrementCouponUsage).toHaveBeenCalledTimes(1);
  });

  test("normaliza espaços no couponCode antes de chamar lockCoupon", async () => {
    repoMock.lockCoupon.mockResolvedValue(makeCupomRow());

    await applyCoupon(makeConn(), "  PROMO10  ", 100);

    expect(repoMock.lockCoupon).toHaveBeenCalledWith(expect.anything(), "PROMO10");
  });

  test("incrementCouponUsage recebe o conn correto (mesma transação)", async () => {
    const cupomRow = makeCupomRow({ id: 7 });
    repoMock.lockCoupon.mockResolvedValue(cupomRow);

    const conn = { _id: "minha-conn-transacional" }; // objeto específico
    await applyCoupon(conn, "PROMO10", 100);

    expect(repoMock.incrementCouponUsage).toHaveBeenCalledWith(conn, 7);
  });
});
