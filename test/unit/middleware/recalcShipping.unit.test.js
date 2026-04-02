"use strict";

const shippingSvcPath = require.resolve("../../../services/shippingQuoteService");

describe("recalcShipping middleware", () => {
  let recalcShipping;
  let getQuote, parseCep, normalizeItems;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();

    jest.doMock(shippingSvcPath, () => ({
      getQuote: jest.fn(),
      parseCep: jest.fn((v) => String(v || "").replace(/\D/g, "")),
      normalizeItems: jest.fn((items) => items.filter((i) => i.id > 0 && i.quantidade > 0)),
    }));

    recalcShipping = require("../../../middleware/recalcShipping");
    const svc = require(shippingSvcPath);
    getQuote = svc.getQuote;
    parseCep = svc.parseCep;
    normalizeItems = svc.normalizeItems;
  });

  function makeReq(body) {
    return { body: { ...body } };
  }

  // -----------------------------------------------------------------------
  // RETIRADA — early return
  // -----------------------------------------------------------------------

  test("RETIRADA → shipping_price=0, PICKUP, sem chamar getQuote", async () => {
    const req = makeReq({ entrega_tipo: "RETIRADA" });
    const next = jest.fn();

    await recalcShipping(req, {}, next);

    expect(next).toHaveBeenCalledWith();
    expect(req.body.shipping_price).toBe(0);
    expect(req.body.shipping_rule_applied).toBe("PICKUP");
    expect(req.body.shipping_prazo_dias).toBeNull();
    expect(getQuote).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // ENTREGA — CEP inválido
  // -----------------------------------------------------------------------

  test("CEP inválido (curto) → next(AppError 400)", async () => {
    parseCep.mockReturnValue("123"); // menos de 8 dígitos

    const req = makeReq({
      entrega_tipo: "ENTREGA",
      endereco: { cep: "123" },
      produtos: [{ id: 1, quantidade: 1 }],
    });
    const next = jest.fn();

    await recalcShipping(req, {}, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0].status).toBe(400);
    expect(next.mock.calls[0][0].message).toContain("CEP");
  });

  // -----------------------------------------------------------------------
  // ENTREGA — carrinho vazio após normalização (linha 65)
  // -----------------------------------------------------------------------

  test("items vazio após normalização → next(AppError 400)", async () => {
    parseCep.mockReturnValue("30140120");
    normalizeItems.mockReturnValue([]); // todos filtrados

    const req = makeReq({
      entrega_tipo: "ENTREGA",
      endereco: { cep: "30140120" },
      produtos: [{ id: -1, quantidade: 0 }], // inválidos
    });
    const next = jest.fn();

    await recalcShipping(req, {}, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0].status).toBe(400);
    expect(next.mock.calls[0][0].message).toContain("Carrinho vazio");
  });

  // -----------------------------------------------------------------------
  // ENTREGA — sucesso
  // -----------------------------------------------------------------------

  test("sucesso → injeta shipping_* no req.body e chama next()", async () => {
    parseCep.mockReturnValue("30140120");
    normalizeItems.mockReturnValue([{ id: 1, quantidade: 2 }]);
    getQuote.mockResolvedValue({
      price: 15.5,
      ruleApplied: "ZONE_MG",
      prazo_dias: 3,
      cep: "30140120",
    });

    const req = makeReq({
      entrega_tipo: "ENTREGA",
      endereco: { cep: "30140-120" },
      produtos: [{ id: 1, quantidade: 2 }],
    });
    const next = jest.fn();

    await recalcShipping(req, {}, next);

    expect(next).toHaveBeenCalledWith();
    expect(req.body.shipping_price).toBe(15.5);
    expect(req.body.shipping_rule_applied).toBe("ZONE_MG");
    expect(req.body.shipping_prazo_dias).toBe(3);
    expect(req.body.shipping_cep).toBe("30140120");
    expect(req.__shippingCalc).toBeDefined();
  });

  // -----------------------------------------------------------------------
  // Erro inesperado no getQuote
  // -----------------------------------------------------------------------

  test("erro no getQuote → propaga para next", async () => {
    parseCep.mockReturnValue("30140120");
    normalizeItems.mockReturnValue([{ id: 1, quantidade: 1 }]);
    getQuote.mockRejectedValue(new Error("service down"));

    const req = makeReq({
      entrega_tipo: "ENTREGA",
      endereco: { cep: "30140120" },
      produtos: [{ id: 1, quantidade: 1 }],
    });
    const next = jest.fn();

    await recalcShipping(req, {}, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0]).toBeInstanceOf(Error);
  });
});
