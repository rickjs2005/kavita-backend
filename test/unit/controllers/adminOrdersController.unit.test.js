"use strict";

jest.mock("../../../services/orderService");
jest.mock("../../../lib", () => ({ response: { ok: jest.fn() } }));
jest.mock("../../../utils/address", () => ({ parseAddress: jest.fn((v) => v) }));

const orderService = require("../../../services/orderService");
const { response } = require("../../../lib");
const ctrl = require("../../../controllers/adminOrdersController");
const AppError = require("../../../errors/AppError");

function makeReq(o = {}) { return { params: {}, body: {}, ...o }; }
function makeRes() { return {}; }
function makeNext() { return jest.fn(); }

beforeEach(() => jest.clearAllMocks());

const mockPedido = {
  pedido_id: 1, usuario_id: 10, usuario_nome: "Rick",
  usuario_email: "r@t.com", usuario_telefone: null, usuario_cpf: null,
  endereco: null, forma_pagamento: "pix",
  status_pagamento: "pago", status_entrega: "enviado",
  total: 100, shipping_price: 10, data_pedido: "2026-04-01",
};
const mockItem = { pedido_id: 1, produto_nome: "P1", quantidade: 2, preco_unitario: 50 };

describe("adminOrdersController", () => {
  describe("listOrders", () => {
    test("success — formats orders", async () => {
      orderService.listOrders.mockResolvedValue({ pedidos: [mockPedido], itens: [mockItem] });
      await ctrl.listOrders(makeReq(), makeRes(), makeNext());
      expect(response.ok).toHaveBeenCalled();
      const data = response.ok.mock.calls[0][1];
      expect(data).toHaveLength(1);
      expect(data[0].id).toBe(1);
      expect(data[0].itens).toHaveLength(1);
    });

    test("error → next", async () => {
      orderService.listOrders.mockRejectedValue(new Error("db"));
      const next = makeNext();
      await ctrl.listOrders(makeReq(), makeRes(), next);
      expect(next.mock.calls[0][0]).toBeInstanceOf(AppError);
    });
  });

  describe("getOrderById", () => {
    test("success", async () => {
      orderService.getOrderById.mockResolvedValue({ pedido: mockPedido, itens: [mockItem] });
      await ctrl.getOrderById(makeReq({ params: { id: 1 } }), makeRes(), makeNext());
      expect(response.ok).toHaveBeenCalled();
    });

    test("not found → 404", async () => {
      orderService.getOrderById.mockResolvedValue(null);
      const next = makeNext();
      await ctrl.getOrderById(makeReq({ params: { id: 999 } }), makeRes(), next);
      expect(next.mock.calls[0][0].code).toBe("NOT_FOUND");
    });
  });

  describe("updatePaymentStatus", () => {
    test("success", async () => {
      orderService.updatePaymentStatus.mockResolvedValue({ found: true });
      await ctrl.updatePaymentStatus(
        makeReq({ params: { id: 1 }, body: { status_pagamento: "pago" } }),
        makeRes(), makeNext()
      );
      expect(response.ok).toHaveBeenCalledWith(expect.anything(), null, expect.any(String));
    });

    test("not found → 404", async () => {
      orderService.updatePaymentStatus.mockResolvedValue({ found: false });
      const next = makeNext();
      await ctrl.updatePaymentStatus(
        makeReq({ params: { id: 999 }, body: { status_pagamento: "pago" } }),
        makeRes(), next
      );
      expect(next.mock.calls[0][0].code).toBe("NOT_FOUND");
    });

    test("AppError from service passes through", async () => {
      const err = new AppError("invalid", "VALIDATION_ERROR", 400);
      orderService.updatePaymentStatus.mockRejectedValue(err);
      const next = makeNext();
      await ctrl.updatePaymentStatus(
        makeReq({ params: { id: 1 }, body: { status_pagamento: "x" } }),
        makeRes(), next
      );
      expect(next.mock.calls[0][0]).toBe(err);
    });
  });

  describe("updateDeliveryStatus", () => {
    test("success", async () => {
      orderService.updateDeliveryStatus.mockResolvedValue({ found: true });
      await ctrl.updateDeliveryStatus(
        makeReq({ params: { id: 1 }, body: { status_entrega: "enviado" } }),
        makeRes(), makeNext()
      );
      expect(response.ok).toHaveBeenCalled();
    });

    test("not found → 404", async () => {
      orderService.updateDeliveryStatus.mockResolvedValue({ found: false });
      const next = makeNext();
      await ctrl.updateDeliveryStatus(
        makeReq({ params: { id: 999 }, body: { status_entrega: "x" } }),
        makeRes(), next
      );
      expect(next.mock.calls[0][0].code).toBe("NOT_FOUND");
    });
  });
});
