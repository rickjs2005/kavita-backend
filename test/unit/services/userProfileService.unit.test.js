"use strict";

jest.mock("../../../repositories/userRepository");
jest.mock("../../../utils/cpf", () => ({
  sanitizeCPF: jest.fn((v) => v),
  isValidCPF: jest.fn(() => true),
}));
jest.mock("../../../utils/cpfCrypto", () => ({
  encryptCPF: jest.fn((v) => `enc_${v}`),
  hashCPF: jest.fn((v) => (v ? `hash_${v}` : null)),
}));
jest.mock("../../../utils/sanitize", () => ({
  sanitizeText: jest.fn((str) => str),
}));

const userRepo = require("../../../repositories/userRepository");
const { isValidCPF } = require("../../../utils/cpf");
const service = require("../../../services/userProfileService");

beforeEach(() => {
  jest.clearAllMocks();
  isValidCPF.mockReturnValue(true);
});

describe("userProfileService", () => {
  // -----------------------------------------------------------------------
  // getProfile
  // -----------------------------------------------------------------------
  describe("getProfile", () => {
    test("returns user when found", async () => {
      const user = { id: 7, nome: "Rick" };
      userRepo.findProfileById.mockResolvedValue(user);

      const result = await service.getProfile(7);

      expect(result).toEqual(user);
      expect(userRepo.findProfileById).toHaveBeenCalledWith(7);
    });

    test("throws NOT_FOUND when user does not exist", async () => {
      userRepo.findProfileById.mockResolvedValue(null);

      await expect(service.getProfile(999)).rejects.toMatchObject({
        code: "NOT_FOUND",
        status: 404,
      });
    });
  });

  // -----------------------------------------------------------------------
  // getProfileAdmin
  // -----------------------------------------------------------------------
  describe("getProfileAdmin", () => {
    test("returns user with status_conta", async () => {
      const user = { id: 42, nome: "Admin", status_conta: "ativo" };
      userRepo.findProfileByIdAdmin.mockResolvedValue(user);

      const result = await service.getProfileAdmin(42);

      expect(result).toEqual(user);
    });

    test("throws NOT_FOUND when user does not exist", async () => {
      userRepo.findProfileByIdAdmin.mockResolvedValue(null);

      await expect(service.getProfileAdmin(999)).rejects.toMatchObject({
        code: "NOT_FOUND",
        status: 404,
      });
    });
  });

  // -----------------------------------------------------------------------
  // updateProfile
  // -----------------------------------------------------------------------
  describe("updateProfile", () => {
    test("updates simple fields", async () => {
      const user = { id: 7, nome: "Rick", cidade: "BH" };
      userRepo.findProfileById
        .mockResolvedValueOnce(user)    // getProfile check
        .mockResolvedValueOnce({ ...user, cidade: "SP" }); // return after update
      userRepo.updateUserById.mockResolvedValue();

      const result = await service.updateProfile(7, { cidade: "SP" });

      expect(userRepo.updateUserById).toHaveBeenCalledWith(
        7,
        ["cidade = ?"],
        ["SP"]
      );
      expect(result.cidade).toBe("SP");
    });

    test("handles CPF update with validation and encryption", async () => {
      const user = { id: 7, nome: "Rick" };
      userRepo.findProfileById
        .mockResolvedValueOnce(user)
        .mockResolvedValueOnce(user);
      userRepo.cpfExistsForOtherUser.mockResolvedValue(false);
      userRepo.updateUserById.mockResolvedValue();

      await service.updateProfile(7, { cpf: "11111111111" });

      expect(userRepo.cpfExistsForOtherUser).toHaveBeenCalledWith("11111111111", 7);
      expect(userRepo.updateUserById).toHaveBeenCalledWith(
        7,
        ["cpf = ?", "cpf_hash = ?"],
        ["enc_11111111111", "hash_11111111111"]
      );
    });

    test("clears CPF when null", async () => {
      const user = { id: 7 };
      userRepo.findProfileById.mockResolvedValue(user);
      userRepo.updateUserById.mockResolvedValue();

      await service.updateProfile(7, { cpf: null });

      expect(userRepo.updateUserById).toHaveBeenCalledWith(
        7,
        ["cpf = NULL", "cpf_hash = NULL"],
        []
      );
    });

    test("throws VALIDATION_ERROR for invalid CPF", async () => {
      userRepo.findProfileById.mockResolvedValue({ id: 7 });
      isValidCPF.mockReturnValue(false);

      await expect(service.updateProfile(7, { cpf: "000" })).rejects.toMatchObject({
        code: "VALIDATION_ERROR",
        status: 400,
      });
    });

    test("throws CONFLICT when CPF belongs to another user", async () => {
      userRepo.findProfileById.mockResolvedValue({ id: 7 });
      userRepo.cpfExistsForOtherUser.mockResolvedValue(true);

      await expect(service.updateProfile(7, { cpf: "11111111111" })).rejects.toMatchObject({
        code: "CONFLICT",
        status: 409,
      });
    });

    test("throws VALIDATION_ERROR when no fields to update", async () => {
      userRepo.findProfileById.mockResolvedValue({ id: 7 });

      await expect(service.updateProfile(7, {})).rejects.toMatchObject({
        code: "VALIDATION_ERROR",
        status: 400,
      });
    });

    test("throws NOT_FOUND when user does not exist", async () => {
      userRepo.findProfileById.mockResolvedValue(null);

      await expect(service.updateProfile(999, { nome: "X" })).rejects.toMatchObject({
        code: "NOT_FOUND",
        status: 404,
      });
    });
  });

  // -----------------------------------------------------------------------
  // updateProfileAdmin
  // -----------------------------------------------------------------------
  describe("updateProfileAdmin", () => {
    test("uses findProfileByIdAdmin for existence check and return", async () => {
      const user = { id: 42, status_conta: "ativo" };
      userRepo.findProfileByIdAdmin
        .mockResolvedValueOnce(user)
        .mockResolvedValueOnce({ ...user, nome: "Updated" });
      userRepo.updateUserById.mockResolvedValue();

      const result = await service.updateProfileAdmin(42, { nome: "Updated" });

      expect(userRepo.findProfileByIdAdmin).toHaveBeenCalledTimes(2);
      expect(result.nome).toBe("Updated");
    });
  });
});
