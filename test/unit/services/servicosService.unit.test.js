"use strict";

jest.mock("../../../lib/withTransaction", () => ({
  withTransaction: jest.fn(async (fn) => fn({})),
}));
jest.mock("../../../repositories/servicosRepository");
jest.mock("../../../utils/sanitize", () => ({
  sanitizeText: jest.fn((str) => str),
}));

const repo = require("../../../repositories/servicosRepository");
const service = require("../../../services/servicosService");

beforeEach(() => jest.clearAllMocks());

describe("servicosService", () => {
  describe("normalizeImages", () => {
    const { normalizeImages } = service;

    test("null/undefined → []", () => {
      expect(normalizeImages(null)).toEqual([]);
      expect(normalizeImages(undefined)).toEqual([]);
    });

    test("CSV string → array", () => {
      expect(normalizeImages("a.jpg,b.jpg")).toEqual(["a.jpg", "b.jpg"]);
    });

    test("JSON array string → array", () => {
      expect(normalizeImages('["a.jpg","b.jpg"]')).toEqual(["a.jpg", "b.jpg"]);
    });

    test("already array → filters falsy", () => {
      expect(normalizeImages(["a.jpg", null, ""])).toEqual(["a.jpg"]);
    });
  });

  describe("mapRowToService", () => {
    const { mapRowToService } = service;

    test("maps row with defaults for missing rating", () => {
      const row = {
        id: 1, nome: "S1", descricao: "D", imagem_capa: null,
        images: null, cargo: "C", whatsapp: "123",
        especialidade_id: 1, especialidade_nome: "E",
        rating_avg: null, rating_count: null,
      };
      const result = mapRowToService(row);
      expect(result.rating_avg).toBe(0);
      expect(result.rating_count).toBe(0);
      expect(result.imagem).toBeNull();
    });

    test("uses imagem_capa when available", () => {
      const row = {
        id: 1, nome: "S", descricao: null, imagem_capa: "/cover.jpg",
        images: "a.jpg", cargo: null, whatsapp: null,
        especialidade_id: null, especialidade_nome: null,
        rating_avg: 4.5, rating_count: 10,
      };
      const result = mapRowToService(row);
      expect(result.imagem).toBe("/cover.jpg");
      expect(result.rating_avg).toBe(4.5);
    });
  });

  describe("listServicos", () => {
    test("returns paginated data", async () => {
      repo.countServicos.mockResolvedValue(1);
      repo.findAllPaginated.mockResolvedValue([{
        id: 1, nome: "S", descricao: null, imagem_capa: null, images: null,
        cargo: null, whatsapp: null, especialidade_id: null, especialidade_nome: null,
        rating_avg: 5, rating_count: 1,
      }]);
      repo.findImagesByIds.mockResolvedValue([]);

      const result = await service.listServicos({
        page: 1, limit: 10, sort: "nome", order: "ASC", busca: "", especialidade: null,
      });

      expect(result.total).toBe(1);
      expect(result.data).toHaveLength(1);
      expect(result.data[0].id).toBe(1);
    });
  });

  describe("getServico", () => {
    test("returns service when found", async () => {
      repo.findById.mockResolvedValue({
        id: 1, nome: "S", descricao: null, imagem_capa: null, images: null,
        cargo: null, whatsapp: null, especialidade_id: null, especialidade_nome: null,
        rating_avg: 0, rating_count: 0,
      });
      repo.findImagesByIds.mockResolvedValue([]);

      const result = await service.getServico(1);
      expect(result.id).toBe(1);
    });

    test("throws NOT_FOUND", async () => {
      repo.findById.mockResolvedValue(null);
      await expect(service.getServico(999)).rejects.toMatchObject({ code: "NOT_FOUND" });
    });
  });

  describe("createSolicitacao", () => {
    test("creates and returns id", async () => {
      repo.createSolicitacao.mockResolvedValue(42);
      const result = await service.createSolicitacao({
        colaborador_id: 1, nome_contato: "Rick", whatsapp: "123",
        descricao: "Desc", origem: "site",
      });
      expect(result).toEqual({ id: 42 });
    });
  });

  describe("createAvaliacao", () => {
    test("creates review in transaction", async () => {
      repo.createAvaliacao.mockResolvedValue(10);
      repo.updateRating.mockResolvedValue();

      const result = await service.createAvaliacao({
        colaborador_id: 1, nota: 5, comentario: "Bom", autor_nome: "Rick",
      });

      expect(result).toEqual({ id: 10 });
      expect(repo.createAvaliacao).toHaveBeenCalled();
      expect(repo.updateRating).toHaveBeenCalled();
    });

    test("defaults autor_nome to 'Cliente Kavita'", async () => {
      repo.createAvaliacao.mockResolvedValue(1);
      repo.updateRating.mockResolvedValue();

      await service.createAvaliacao({ colaborador_id: 1, nota: 5, autor_nome: "" });

      const callArgs = repo.createAvaliacao.mock.calls[0][1];
      expect(callArgs.autor_nome).toBe("Cliente Kavita");
    });
  });

  describe("registerView", () => {
    test("increments when exists", async () => {
      repo.existsById.mockResolvedValue(true);
      repo.incrementViews.mockResolvedValue();
      await service.registerView(1);
      expect(repo.incrementViews).toHaveBeenCalledWith(1);
    });

    test("throws NOT_FOUND", async () => {
      repo.existsById.mockResolvedValue(false);
      await expect(service.registerView(999)).rejects.toMatchObject({ code: "NOT_FOUND" });
    });
  });

  describe("registerWhatsappClick", () => {
    test("increments when exists", async () => {
      repo.existsById.mockResolvedValue(true);
      repo.incrementWhatsapp.mockResolvedValue();
      await service.registerWhatsappClick(1);
      expect(repo.incrementWhatsapp).toHaveBeenCalledWith(1);
    });

    test("throws NOT_FOUND", async () => {
      repo.existsById.mockResolvedValue(false);
      await expect(service.registerWhatsappClick(999)).rejects.toMatchObject({ code: "NOT_FOUND" });
    });
  });
});
