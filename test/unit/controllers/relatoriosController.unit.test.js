"use strict";

jest.mock("../../../repositories/relatoriosRepository");
jest.mock("../../../lib", () => ({
  response: { ok: jest.fn() },
}));

const repo = require("../../../repositories/relatoriosRepository");
const { response } = require("../../../lib");
const ctrl = require("../../../controllers/relatoriosController");

function makeReq(q = {}) { return { query: q }; }
function makeRes() { return {}; }
function makeNext() { return jest.fn(); }

beforeEach(() => jest.clearAllMocks());

const handlers = [
  { name: "getVendas", fn: ctrl.getVendas, repoFn: "getVendasPorDia", data: [{ dia: "2026-01-01", total: 100 }] },
  { name: "getProdutosMaisVendidos", fn: ctrl.getProdutosMaisVendidos, repoFn: "getProdutosMaisVendidos", data: [{ name: "P1", vendidos: 10 }] },
  { name: "getClientesTop", fn: ctrl.getClientesTop, repoFn: "getClientesTop", data: [{ nome: "C1", total_gasto: 500 }] },
  { name: "getEstoque", fn: ctrl.getEstoque, repoFn: "getEstoque", data: [{ id: 1, quantity: 5 }] },
  { name: "getEstoqueBaixo", fn: ctrl.getEstoqueBaixo, repoFn: "getEstoqueBaixo", data: [{ id: 1, quantity: 2 }] },
  { name: "getServicos", fn: ctrl.getServicos, repoFn: "getServicosPorEspecialidade", data: { totalServicos: 5 } },
  { name: "getServicosRanking", fn: ctrl.getServicosRanking, repoFn: "getServicosRanking", data: [{ nome: "S1" }] },
];

describe("relatoriosController", () => {
  handlers.forEach(({ name, fn, repoFn, data }) => {
    describe(name, () => {
      test("success — calls response.ok", async () => {
        repo[repoFn].mockResolvedValue(data);
        await fn(makeReq(), makeRes(), makeNext());
        expect(response.ok).toHaveBeenCalled();
      });

      test("error — calls next", async () => {
        const err = new Error("db");
        repo[repoFn].mockRejectedValue(err);
        const next = makeNext();
        await fn(makeReq(), makeRes(), next);
        expect(next).toHaveBeenCalledWith(err);
      });
    });
  });
});
