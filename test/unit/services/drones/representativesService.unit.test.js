"use strict";

jest.mock("../../../../repositories/dronesRepository");
jest.mock("../../../../services/drones/helpers", () => ({
  clampInt: jest.fn((v, def, min, max) => Math.min(Math.max(Number(v) || def, min), max)),
  sanitizeText: jest.fn((v) => v || ""),
}));

const dronesRepo = require("../../../../repositories/dronesRepository");
const service = require("../../../../services/drones/representativesService");

beforeEach(() => jest.clearAllMocks());

describe("drones/representativesService", () => {
  describe("listRepresentativesPublic", () => {
    test("returns paginated reps", async () => {
      dronesRepo.countRepresentatives.mockResolvedValue(1);
      dronesRepo.listRepresentativeRows.mockResolvedValue([
        { id: 1, name: "Rep A", phone: "123" },
      ]);

      const result = await service.listRepresentativesPublic({ page: 1, limit: 12 });

      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
    });

    test("filters by busca", async () => {
      dronesRepo.countRepresentatives.mockResolvedValue(0);
      dronesRepo.listRepresentativeRows.mockResolvedValue([]);

      await service.listRepresentativesPublic({ busca: "SP" });

      expect(dronesRepo.countRepresentatives).toHaveBeenCalledWith(
        expect.stringContaining("LIKE"),
        expect.any(Array)
      );
    });
  });

  describe("listRepresentativesAdmin", () => {
    test("returns all reps for admin", async () => {
      dronesRepo.countRepresentatives.mockResolvedValue(2);
      dronesRepo.listRepresentativeRows.mockResolvedValue([{ id: 1 }, { id: 2 }]);

      const result = await service.listRepresentativesAdmin({ page: 1, limit: 20 });

      expect(result.items).toHaveLength(2);
    });
  });

  describe("createRepresentative", () => {
    test("creates and returns id", async () => {
      dronesRepo.insertRepresentative.mockResolvedValue(42);

      const result = await service.createRepresentative({
        name: "Rep", phone: "123", whatsapp: "123", cnpj: "12345678000199",
        address_city: "SP", address_state: "SP",
      });

      expect(result).toBe(42);
    });
  });

  describe("updateRepresentative", () => {
    test("returns affected rows", async () => {
      dronesRepo.updateRepresentative.mockResolvedValue(1);

      const result = await service.updateRepresentative(1, { name: "New" });

      expect(result).toBe(1);
    });
  });

  describe("deleteRepresentative", () => {
    test("returns affected rows", async () => {
      dronesRepo.deleteRepresentative.mockResolvedValue(1);

      const result = await service.deleteRepresentative(1);
      expect(result).toBe(1);
    });
  });
});
