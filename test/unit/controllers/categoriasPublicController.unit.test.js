"use strict";

jest.mock("../../../repositories/categoriasRepository");
jest.mock("../../../lib", () => ({ response: { ok: jest.fn() } }));

const repo = require("../../../repositories/categoriasRepository");
const { response } = require("../../../lib");
const ctrl = require("../../../controllers/categoriasPublicController");
const AppError = require("../../../errors/AppError");

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => console.error.mockRestore());

describe("categoriasPublicController", () => {
  test("listCategorias success", async () => {
    repo.findActiveCategories.mockResolvedValue([{ id: 1, name: "Cat" }]);
    await ctrl.listCategorias({}, {}, jest.fn());
    expect(response.ok).toHaveBeenCalledWith(expect.anything(), [{ id: 1, name: "Cat" }]);
  });

  test("listCategorias error → next(AppError 500)", async () => {
    repo.findActiveCategories.mockRejectedValue(new Error("db"));
    const next = jest.fn();
    await ctrl.listCategorias({}, {}, next);
    expect(next.mock.calls[0][0]).toBeInstanceOf(AppError);
    expect(next.mock.calls[0][0].status).toBe(500);
  });
});
