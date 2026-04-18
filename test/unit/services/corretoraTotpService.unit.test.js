/**
 * test/unit/services/corretoraTotpService.unit.test.js
 *
 * ETAPA 2.1 — TOTP + backup codes.
 */

const speakeasy = require("speakeasy");

describe("services/corretoraTotpService", () => {
  const usersRepoPath = require.resolve(
    "../../../repositories/corretoraUsersRepository",
  );
  const backupRepoPath = require.resolve(
    "../../../repositories/corretoraBackupCodesRepository",
  );

  let svc;
  let usersRepo;
  let backupRepo;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();

    jest.doMock(usersRepoPath, () => ({
      setTotpSecret: jest.fn().mockResolvedValue(1),
      enableTotp: jest.fn().mockResolvedValue(1),
      disableTotp: jest.fn().mockResolvedValue(1),
    }));
    jest.doMock(backupRepoPath, () => ({
      replaceAllForUser: jest.fn().mockResolvedValue(undefined),
      listUnused: jest.fn().mockResolvedValue([]),
      markUsed: jest.fn().mockResolvedValue(1),
      countUnused: jest.fn().mockResolvedValue(0),
      deleteAllForUser: jest.fn().mockResolvedValue(undefined),
    }));

    usersRepo = require(usersRepoPath);
    backupRepo = require(backupRepoPath);
    svc = require("../../../services/corretoraTotpService");

    jest.spyOn(console, "warn").mockImplementation(() => {});
    jest.spyOn(console, "info").mockImplementation(() => {});
  });

  afterEach(() => {
    console.warn.mockRestore?.();
    console.info.mockRestore?.();
  });

  describe("setupTotp()", () => {
    it("retorna secret + otpauth_url + qr_data_url", async () => {
      const user = {
        id: 1,
        email: "a@b.com",
        totp_enabled: false,
      };
      const r = await svc.setupTotp(user);
      expect(r.secret).toMatch(/^[A-Z2-7]+=*$/); // base32
      expect(r.otpauth_url).toMatch(/^otpauth:\/\/totp/);
      expect(r.qr_data_url).toMatch(/^data:image\/png;base64,/);
      expect(usersRepo.setTotpSecret).toHaveBeenCalledWith(1, r.secret);
    });

    it("bloqueia (409) quando já está ativo", async () => {
      await expect(
        svc.setupTotp({ id: 1, email: "a@b.com", totp_enabled: true }),
      ).rejects.toMatchObject({ status: 409 });
    });
  });

  describe("verifyToken()", () => {
    it("aceita código válido dentro da janela", () => {
      const secret = speakeasy.generateSecret({ length: 20 });
      const code = speakeasy.totp({
        secret: secret.base32,
        encoding: "base32",
      });
      const ok = svc.verifyToken({ secret: secret.base32, code });
      expect(ok).toBe(true);
    });

    it("rejeita código inválido", () => {
      const secret = speakeasy.generateSecret({ length: 20 });
      expect(svc.verifyToken({ secret: secret.base32, code: "000000" })).toBe(false);
    });

    it("rejeita entrada sem 6 dígitos", () => {
      expect(svc.verifyToken({ secret: "ABC", code: "12" })).toBe(false);
      expect(svc.verifyToken({ secret: "", code: "123456" })).toBe(false);
    });
  });

  describe("confirmTotpSetup()", () => {
    it("400 quando user ainda não gerou secret", async () => {
      await expect(
        svc.confirmTotpSetup({ id: 1, totp_secret: null }, "123456"),
      ).rejects.toMatchObject({ status: 400 });
    });

    it("401 quando código é inválido", async () => {
      const secret = speakeasy.generateSecret({ length: 20 });
      await expect(
        svc.confirmTotpSetup(
          { id: 1, totp_secret: secret.base32 },
          "000000",
        ),
      ).rejects.toMatchObject({ status: 401 });
    });

    it("ativa 2FA + devolve 10 backup codes plaintext em sucesso", async () => {
      const secret = speakeasy.generateSecret({ length: 20 });
      const code = speakeasy.totp({
        secret: secret.base32,
        encoding: "base32",
      });
      const r = await svc.confirmTotpSetup(
        { id: 7, totp_secret: secret.base32 },
        code,
      );
      expect(r.backup_codes).toHaveLength(10);
      // Formato: 8 chars alfanuméricos ABCDEFGHJKLMNPQRSTUVWXYZ23456789
      for (const bc of r.backup_codes) {
        expect(bc).toMatch(/^[A-Z2-9]{8}$/);
      }
      expect(backupRepo.replaceAllForUser).toHaveBeenCalledWith({
        userId: 7,
        hashes: expect.any(Array),
      });
      expect(usersRepo.enableTotp).toHaveBeenCalledWith(7);
    });
  });

  describe("consumeBackupCode()", () => {
    it("retorna false quando input curto demais", async () => {
      expect(await svc.consumeBackupCode(1, "abc")).toBe(false);
    });

    it("consome + marca usado quando bate com hash", async () => {
      const bcrypt = require("bcrypt");
      const plaintext = "ABC12345";
      const hash = await bcrypt.hash(plaintext, 4);
      backupRepo.listUnused.mockResolvedValue([
        { id: 99, code_hash: hash },
      ]);
      const ok = await svc.consumeBackupCode(1, plaintext);
      expect(ok).toBe(true);
      expect(backupRepo.markUsed).toHaveBeenCalledWith(99);
    });

    it("normaliza input (upper + remove hífens/espaços)", async () => {
      const bcrypt = require("bcrypt");
      const plaintext = "ABC12345";
      const hash = await bcrypt.hash(plaintext, 4);
      backupRepo.listUnused.mockResolvedValue([
        { id: 99, code_hash: hash },
      ]);
      // Input com hífen e case misto
      const ok = await svc.consumeBackupCode(1, "abc-12345");
      expect(ok).toBe(true);
    });
  });

  describe("disableTotp()", () => {
    it("chama delete + disableTotp", async () => {
      await svc.disableTotp(7);
      expect(backupRepo.deleteAllForUser).toHaveBeenCalledWith(7);
      expect(usersRepo.disableTotp).toHaveBeenCalledWith(7);
    });
  });
});
