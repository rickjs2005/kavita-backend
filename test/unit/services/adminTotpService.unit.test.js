"use strict";

// Tests do F1 — adminTotpService.

jest.mock("../../../repositories/adminRepository");
jest.mock("../../../repositories/adminBackupCodesRepository");
jest.mock("../../../lib/logger", () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
}));

const speakeasy = require("speakeasy");
const bcrypt = require("bcrypt");

const adminRepo = require("../../../repositories/adminRepository");
const backupRepo = require("../../../repositories/adminBackupCodesRepository");
const adminTotp = require("../../../services/adminTotpService");

describe("adminTotpService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("setupTotp", () => {
    test("rejeita 409 se MFA já ativo", async () => {
      const admin = { id: 1, email: "a@x", mfa_active: 1 };
      await expect(adminTotp.setupTotp(admin)).rejects.toMatchObject({
        status: 409,
      });
    });

    test("gera secret + qr e persiste em mfa_secret com mfa_active=0", async () => {
      const admin = { id: 1, email: "a@x", mfa_active: 0 };
      adminRepo.setMfaSecret.mockResolvedValue();

      const out = await adminTotp.setupTotp(admin);

      expect(out.secret).toMatch(/^[A-Z2-7]+=*$/);
      expect(out.otpauth_url).toMatch(/^otpauth:\/\/totp\//);
      expect(out.qr_data_url).toMatch(/^data:image\/png;base64,/);
      expect(adminRepo.setMfaSecret).toHaveBeenCalledWith(1, out.secret);
    });
  });

  describe("confirmTotpSetup", () => {
    test("rejeita 400 se mfa_secret ausente (não fez setup)", async () => {
      adminRepo.findAdminWithMfaById.mockResolvedValue({ id: 1, mfa_secret: null, mfa_active: 0 });
      await expect(adminTotp.confirmTotpSetup({ id: 1 }, "123456")).rejects.toMatchObject({
        status: 400,
      });
    });

    test("rejeita 409 se MFA já ativo", async () => {
      adminRepo.findAdminWithMfaById.mockResolvedValue({ id: 1, mfa_secret: "X", mfa_active: 1 });
      await expect(adminTotp.confirmTotpSetup({ id: 1 }, "123456")).rejects.toMatchObject({
        status: 409,
      });
    });

    test("rejeita 401 com código TOTP inválido", async () => {
      adminRepo.findAdminWithMfaById.mockResolvedValue({
        id: 1,
        mfa_secret: speakeasy.generateSecret().base32,
        mfa_active: 0,
      });
      await expect(adminTotp.confirmTotpSetup({ id: 1 }, "000000")).rejects.toMatchObject({
        status: 401,
      });
    });

    test("liga MFA + grava 10 hashes e devolve 10 codes plaintext", async () => {
      const secret = speakeasy.generateSecret({ length: 20 }).base32;
      // F1.6 — service agora pega o secret EM CLARO via findDecryptedMfaSecret.
      // findAdminWithMfaById só checa flags; o secret retornado dele
      // representa o blob cifrado (qualquer string aqui basta).
      adminRepo.findAdminWithMfaById.mockResolvedValue({ id: 1, mfa_secret: "v1:dummy:dummy:dummy", mfa_active: 0 });
      adminRepo.findDecryptedMfaSecret.mockResolvedValue(secret);
      adminRepo.enableMfa.mockResolvedValue();
      backupRepo.replaceAllForAdmin.mockResolvedValue();

      const code = speakeasy.totp({ secret, encoding: "base32" });
      const result = await adminTotp.confirmTotpSetup({ id: 1 }, code);

      expect(result.backup_codes).toHaveLength(10);
      // Plaintexts diferentes entre si
      expect(new Set(result.backup_codes).size).toBe(10);
      // Cada plaintext bate contra um dos hashes que foi gravado
      const passedToRepo = backupRepo.replaceAllForAdmin.mock.calls[0][0];
      expect(passedToRepo.adminId).toBe(1);
      expect(passedToRepo.hashes).toHaveLength(10);
      // Sanity: o primeiro plaintext bate em algum hash (todos válidos bcrypt)
      const matched = await Promise.all(
        passedToRepo.hashes.map((h) => bcrypt.compare(result.backup_codes[0], h)),
      );
      expect(matched.filter(Boolean).length).toBe(1);

      expect(adminRepo.enableMfa).toHaveBeenCalledWith(1);
    });
  });

  describe("consumeBackupCode", () => {
    test("retorna false quando lista está vazia", async () => {
      backupRepo.listUnused.mockResolvedValue([]);
      const ok = await adminTotp.consumeBackupCode(1, "ABCD-EFGH");
      expect(ok).toBe(false);
    });

    test("retorna true e marca used quando o código bate", async () => {
      const plaintext = "ABCDEFGH";
      const hash = await bcrypt.hash(plaintext, 10);
      backupRepo.listUnused.mockResolvedValue([{ id: 99, code_hash: hash }]);
      backupRepo.markUsed.mockResolvedValue();

      const ok = await adminTotp.consumeBackupCode(1, "abcd-efgh");

      expect(ok).toBe(true);
      expect(backupRepo.markUsed).toHaveBeenCalledWith(99);
    });

    test("retorna false quando código não bate em nenhum", async () => {
      const hash = await bcrypt.hash("OUTRACOISA", 10);
      backupRepo.listUnused.mockResolvedValue([{ id: 99, code_hash: hash }]);
      const ok = await adminTotp.consumeBackupCode(1, "ABCDEFGH");
      expect(ok).toBe(false);
      expect(backupRepo.markUsed).not.toHaveBeenCalled();
    });

    test("recusa entrada muito curta sem ir ao banco", async () => {
      const ok = await adminTotp.consumeBackupCode(1, "AB");
      expect(ok).toBe(false);
      expect(backupRepo.listUnused).not.toHaveBeenCalled();
    });
  });

  describe("regenerateBackupCodes", () => {
    test("rejeita 409 se MFA não está ativo", async () => {
      adminRepo.findAdminWithMfaById.mockResolvedValue({ id: 1, mfa_active: 0 });
      await expect(adminTotp.regenerateBackupCodes(1)).rejects.toMatchObject({
        status: 409,
      });
    });

    test("regenera 10 plaintexts e substitui no repo", async () => {
      adminRepo.findAdminWithMfaById.mockResolvedValue({ id: 1, mfa_active: 1 });
      backupRepo.replaceAllForAdmin.mockResolvedValue();

      const result = await adminTotp.regenerateBackupCodes(1);
      expect(result.backup_codes).toHaveLength(10);
      expect(backupRepo.replaceAllForAdmin).toHaveBeenCalled();
    });
  });

  describe("disableTotp", () => {
    test("apaga codes, desliga MFA e incrementa tokenVersion", async () => {
      backupRepo.deleteAllForAdmin.mockResolvedValue();
      adminRepo.disableMfa.mockResolvedValue();
      adminRepo.incrementTokenVersion.mockResolvedValue();

      await adminTotp.disableTotp(42);

      expect(backupRepo.deleteAllForAdmin).toHaveBeenCalledWith(42);
      expect(adminRepo.disableMfa).toHaveBeenCalledWith(42);
      expect(adminRepo.incrementTokenVersion).toHaveBeenCalledWith(42);
    });
  });

  describe("getStatus", () => {
    test("admin sem 2FA: enabled=false, pendente=false, count=0", async () => {
      adminRepo.findAdminWithMfaById.mockResolvedValue({ id: 1, mfa_active: 0, mfa_secret: null });
      const s = await adminTotp.getStatus(1);
      expect(s).toEqual({ enabled: false, setup_pending: false, backup_codes_remaining: 0 });
    });

    test("admin com setup pendente: enabled=false, pendente=true", async () => {
      adminRepo.findAdminWithMfaById.mockResolvedValue({ id: 1, mfa_active: 0, mfa_secret: "ABC" });
      const s = await adminTotp.getStatus(1);
      expect(s).toEqual({ enabled: false, setup_pending: true, backup_codes_remaining: 0 });
    });

    test("admin ativo: count vem do repo", async () => {
      adminRepo.findAdminWithMfaById.mockResolvedValue({ id: 1, mfa_active: 1, mfa_secret: "ABC" });
      backupRepo.countUnused.mockResolvedValue(7);
      const s = await adminTotp.getStatus(1);
      expect(s).toEqual({ enabled: true, setup_pending: false, backup_codes_remaining: 7 });
    });
  });
});
