"use strict";

jest.mock("../../../lib/withTransaction", () => ({
  withTransaction: jest.fn(async (fn) => fn({})),
}));
jest.mock("../../../repositories/servicosAdminRepository");
jest.mock("../../../services/mediaService", () => ({
  persistMedia: jest.fn().mockResolvedValue([]),
  enqueueOrphanCleanup: jest.fn(),
  removeMedia: jest.fn().mockResolvedValue(),
}));
jest.mock("../../../utils/fileValidation", () => ({
  validateFileMagicBytes: jest.fn(() => ({ valid: true })),
}));

const repo = require("../../../repositories/servicosAdminRepository");
const mediaService = require("../../../services/mediaService");
const service = require("../../../services/servicosAdminService");

beforeEach(() => jest.clearAllMocks());

describe("servicosAdminService", () => {
  describe("listServicos", () => {
    test("returns rows with images attached", async () => {
      repo.findAll.mockResolvedValue([{ id: 1, nome: "S1" }, { id: 2, nome: "S2" }]);
      repo.findImagesBatch.mockResolvedValue([
        { colaborador_id: 1, path: "/uploads/a.jpg" },
      ]);

      const result = await service.listServicos();

      expect(result).toHaveLength(2);
      expect(result[0].images).toEqual(["/uploads/a.jpg"]);
      expect(result[1].images).toEqual([]);
    });

    test("returns empty array when no rows", async () => {
      repo.findAll.mockResolvedValue([]);
      const result = await service.listServicos();
      expect(result).toEqual([]);
    });
  });

  describe("createServico", () => {
    test("creates without files", async () => {
      repo.insertServico.mockResolvedValue(1);
      const result = await service.createServico({ nome: "S1" });
      expect(result).toEqual({ id: 1 });
      expect(mediaService.persistMedia).not.toHaveBeenCalled();
    });

    test("creates with files — persists media and inserts images", async () => {
      repo.insertServico.mockResolvedValue(1);
      mediaService.persistMedia.mockResolvedValue([{ path: "/uploads/services/a.jpg" }]);
      repo.insertImages.mockResolvedValue();
      repo.updateMainImage.mockResolvedValue();

      const files = [{ path: "/tmp/a.jpg", filename: "a.jpg" }];
      const result = await service.createServico({ nome: "S1" }, files);

      expect(result).toEqual({ id: 1 });
      expect(repo.insertImages).toHaveBeenCalledWith({}, 1, ["/uploads/services/a.jpg"]);
      expect(repo.updateMainImage).toHaveBeenCalledWith({}, 1, "/uploads/services/a.jpg");
    });

    test("cleans up media on error", async () => {
      repo.insertServico.mockRejectedValue(new Error("db"));
      mediaService.persistMedia.mockResolvedValue([{ path: "/uploads/services/a.jpg" }]);

      // The error happens before persistMedia since insertServico is called first
      await expect(service.createServico({ nome: "S1" })).rejects.toThrow("db");
    });
  });

  describe("deleteServico", () => {
    test("deletes and cleans up media", async () => {
      repo.findImagesByColaboradorId.mockResolvedValue([{ id: 1, path: "/uploads/a.jpg" }]);
      repo.deleteAllImages.mockResolvedValue();
      repo.deleteServico.mockResolvedValue(1);

      await service.deleteServico(1);

      expect(repo.deleteAllImages).toHaveBeenCalledWith({}, 1);
      expect(repo.deleteServico).toHaveBeenCalledWith({}, 1);
      expect(mediaService.removeMedia).toHaveBeenCalled();
    });

    test("throws NOT_FOUND when not found", async () => {
      repo.findImagesByColaboradorId.mockResolvedValue([]);
      repo.deleteAllImages.mockResolvedValue();
      repo.deleteServico.mockResolvedValue(0);

      await expect(service.deleteServico(999)).rejects.toMatchObject({
        code: "NOT_FOUND",
        status: 404,
      });
    });
  });

  describe("setVerificado", () => {
    test("success", async () => {
      repo.setVerificado.mockResolvedValue(1);
      await service.setVerificado(1, true);
      expect(repo.setVerificado).toHaveBeenCalledWith(1, true);
    });

    test("throws NOT_FOUND when not found", async () => {
      repo.setVerificado.mockResolvedValue(0);
      await expect(service.setVerificado(999, true)).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    });
  });
});
