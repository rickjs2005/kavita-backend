"use strict";

const poolPath = require.resolve("../../../config/pool");
const checkoutRepoPath = require.resolve("../../../repositories/checkoutRepository");
const orderRepoPath = require.resolve("../../../repositories/orderRepository");
const couponSvcPath = require.resolve("../../../services/couponService");
const notifSvcPath = require.resolve("../../../services/checkoutNotificationService");
const cartRepoPath = require.resolve("../../../repositories/cartRepository");

describe("checkoutService", () => {
  let svc, checkoutRepo, orderRepo, couponService;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();

    jest.doMock(poolPath, () => ({
      query: jest.fn(),
      getConnection: jest.fn(),
    }));

    jest.doMock(checkoutRepoPath, () => ({
      getProductPrices: jest.fn(),
      getActivePromotions: jest.fn(),
      findCouponByCode: jest.fn(),
    }));

    jest.doMock(orderRepoPath, () => ({
      restoreStock: jest.fn(),
    }));

    jest.doMock(couponSvcPath, () => ({
      applyCoupon: jest.fn(),
      validateCouponRules: jest.fn(),
      previewCoupon: jest.fn(),
      validateRestrictions: jest.fn(),
    }));

    jest.doMock(notifSvcPath, () => ({
      notifyOrderCreated: jest.fn().mockResolvedValue(),
    }));

    jest.doMock(cartRepoPath, () => ({
      convertCart: jest.fn().mockResolvedValue(),
    }));

    svc = require("../../../services/checkoutService");
    checkoutRepo = require(checkoutRepoPath);
    orderRepo = require(orderRepoPath);
    couponService = require(couponSvcPath);
  });

  // -----------------------------------------------------------------------
  // restoreStock (re-export wrapper)
  // -----------------------------------------------------------------------

  test("restoreStock delega ao orderRepo.restoreStock", async () => {
    orderRepo.restoreStock.mockResolvedValue();

    await svc.restoreStock("mock-conn", 42);

    expect(orderRepo.restoreStock).toHaveBeenCalledWith("mock-conn", 42);
  });

  // -----------------------------------------------------------------------
  // previewCoupon
  // -----------------------------------------------------------------------

  describe("previewCoupon", () => {
    test("400 se produtos vazio", async () => {
      await expect(
        svc.previewCoupon({ codigo: "X", produtos: [] })
      ).rejects.toMatchObject({ status: 400 });
    });

    test("400 se produtos com ids inválidos (filtrados para vazio)", async () => {
      await expect(
        svc.previewCoupon({ codigo: "X", produtos: [{ id: "abc" }] })
      ).rejects.toMatchObject({ status: 400 });
    });

    test("400 se cupom não encontrado", async () => {
      checkoutRepo.getProductPrices.mockResolvedValue([{ id: 1, price: 100 }]);
      checkoutRepo.getActivePromotions.mockResolvedValue([]);
      checkoutRepo.findCouponByCode.mockResolvedValue(null);

      await expect(
        svc.previewCoupon({ codigo: "INEXISTENTE", produtos: [{ id: 1, quantidade: 1 }] })
      ).rejects.toMatchObject({ status: 400 });
    });

    test("400 se subtotal <= 0 (todos os produtos sem preço)", async () => {
      checkoutRepo.getProductPrices.mockResolvedValue([]);
      checkoutRepo.getActivePromotions.mockResolvedValue([]);
      checkoutRepo.findCouponByCode.mockResolvedValue({ id: 1 });

      await expect(
        svc.previewCoupon({ codigo: "CUP", produtos: [{ id: 99, quantidade: 1 }] })
      ).rejects.toMatchObject({ status: 400 });
    });

    test("sucesso — retorna desconto com preço de lista", async () => {
      checkoutRepo.getProductPrices.mockResolvedValue([{ id: 1, price: 100 }]);
      checkoutRepo.getActivePromotions.mockResolvedValue([]);
      checkoutRepo.findCouponByCode.mockResolvedValue({ id: 5, tipo: "percentual", valor: 10 });
      couponService.previewCoupon.mockResolvedValue({
        desconto: 10,
        cupomAplicado: { id: 5 },
      });

      const result = await svc.previewCoupon({
        codigo: "DESC10",
        produtos: [{ id: 1, quantidade: 1 }],
      });

      expect(result.desconto).toBe(10);
      expect(result.total_original).toBe(100);
      expect(result.total_com_desconto).toBe(90);
    });

    test("sucesso — promoção substitui preço de lista", async () => {
      checkoutRepo.getProductPrices.mockResolvedValue([{ id: 1, price: 200 }]);
      checkoutRepo.getActivePromotions.mockResolvedValue([{ product_id: 1, final_price: 150 }]);
      checkoutRepo.findCouponByCode.mockResolvedValue({ id: 5 });
      couponService.previewCoupon.mockResolvedValue({
        desconto: 15,
        cupomAplicado: { id: 5 },
      });

      const result = await svc.previewCoupon({
        codigo: "CUP",
        produtos: [{ id: 1, quantidade: 2 }],
      });

      // 150 * 2 = 300, desconto 15
      expect(result.total_original).toBe(300);
      expect(result.total_com_desconto).toBe(285);
    });

    test("ignora itens com quantidade <= 0", async () => {
      checkoutRepo.getProductPrices.mockResolvedValue([
        { id: 1, price: 100 },
        { id: 2, price: 50 },
      ]);
      checkoutRepo.getActivePromotions.mockResolvedValue([]);
      checkoutRepo.findCouponByCode.mockResolvedValue({ id: 1 });
      couponService.previewCoupon.mockResolvedValue({
        desconto: 5,
        cupomAplicado: { id: 1 },
      });

      const result = await svc.previewCoupon({
        codigo: "X",
        produtos: [
          { id: 1, quantidade: 1 },
          { id: 2, quantidade: 0 }, // ignorado
        ],
      });

      // Só produto 1: 100
      expect(result.total_original).toBe(100);
    });
  });
});
