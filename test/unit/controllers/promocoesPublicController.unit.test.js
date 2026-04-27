"use strict";

jest.mock("../../../services/promocoesService");
jest.mock("../../../lib", () => ({ response: { ok: jest.fn() } }));

const svc = require("../../../services/promocoesService");
const { response } = require("../../../lib");
const ctrl = require("../../../controllers/promocoesPublicController");
const AppError = require("../../../errors/AppError");

beforeEach(() => jest.clearAllMocks());

describe("promocoesPublicController", () => {
  test("listPromocoes success", async () => {
    svc.listPromocoes.mockResolvedValue([{ id: 1 }]);
    await ctrl.listPromocoes({}, {}, jest.fn());
    expect(response.ok).toHaveBeenCalledWith(expect.anything(), [{ id: 1 }]);
  });

  test("listPromocoes error", async () => {
    svc.listPromocoes.mockRejectedValue(new Error("db"));
    const next = jest.fn();
    await ctrl.listPromocoes({}, {}, next);
    expect(next.mock.calls[0][0]).toBeInstanceOf(AppError);
  });

  test("getPromocao success", async () => {
    svc.getPromocaoByProductId.mockResolvedValue({ id: 1 });
    await ctrl.getPromocao({ params: { productId: 5 } }, {}, jest.fn());
    expect(response.ok).toHaveBeenCalledWith(expect.anything(), { id: 1 });
  });

  test("getPromocao AppError NOT_FOUND devolve 200 com data: null (sem chamar next)", async () => {
    const err = new AppError("Nope", "NOT_FOUND", 404);
    svc.getPromocaoByProductId.mockRejectedValue(err);
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();
    await ctrl.getPromocao({ params: { productId: 999 } }, res, next);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ ok: true, data: null });
    expect(next).not.toHaveBeenCalled();
  });

  test("getPromocao generic error wraps in 500", async () => {
    svc.getPromocaoByProductId.mockRejectedValue(new Error("db"));
    const next = jest.fn();
    await ctrl.getPromocao({ params: { productId: 5 } }, {}, next);
    expect(next.mock.calls[0][0]).toBeInstanceOf(AppError);
    expect(next.mock.calls[0][0].status).toBe(500);
  });
});
