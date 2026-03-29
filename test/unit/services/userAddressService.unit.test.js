/**
 * test/unit/services/userAddressService.unit.test.js
 *
 * Cobre:
 *   normalizeInput — aliases, URBANA, RURAL, placeholders defensivos, sem_numero
 *   list           — delega ao repo
 *   create         — validação, transação, clearDefault condicional
 *   update         — ID inválido, validação, transação, NOT_FOUND, rollback
 *   remove         — NOT_FOUND, sucesso
 */

"use strict";

const { makeMockConn } = require("../../testUtils");

const POOL_PATH = require.resolve("../../../config/pool");
const REPO_PATH = require.resolve("../../../repositories/addressRepository");
const SVC_PATH = require.resolve("../../../services/userAddressService");

// ---------------------------------------------------------------------------
// Setup helper
// ---------------------------------------------------------------------------

function setupModule(repoOverrides = {}, connOverride = null) {
  jest.resetModules();

  const mockConn = connOverride || makeMockConn();

  const poolMock = {
    query: jest.fn(),
    getConnection: jest.fn().mockResolvedValue(mockConn),
  };

  const repoMock = {
    findByUserId: jest.fn(),
    clearDefaultForUser: jest.fn().mockResolvedValue(undefined),
    createAddress: jest.fn().mockResolvedValue(undefined),
    updateAddress: jest.fn().mockResolvedValue({ affectedRows: 1 }),
    deleteById: jest.fn().mockResolvedValue({ affectedRows: 1 }),
    ...repoOverrides,
  };

  jest.doMock(POOL_PATH, () => poolMock);
  jest.doMock(REPO_PATH, () => repoMock);

  const svc = require(SVC_PATH);
  return { svc, repoMock, poolMock, mockConn };
}

// ---------------------------------------------------------------------------
// normalizeInput — URBANA
// ---------------------------------------------------------------------------

describe("userAddressService.normalizeInput — URBANA", () => {
  let normalizeInput;

  beforeAll(() => {
    jest.resetModules();
    normalizeInput = require("../../../services/userAddressService").normalizeInput;
  });

  const base = () => ({
    tipo_localidade: "URBANA",
    cep: "36940-000",
    cidade: "Manhuaçu",
    estado: "mg",
    endereco: "Rua A",
    bairro: "Centro",
    numero: "10",
  });

  test("ok:true para payload URBANA completo", () => {
    expect(normalizeInput(base()).ok).toBe(true);
  });

  test("normaliza cep (remove traços)", () => {
    const { data } = normalizeInput(base());
    expect(data.cep).toBe("36940000");
  });

  test("normaliza estado para uppercase", () => {
    const { data } = normalizeInput(base());
    expect(data.estado).toBe("MG");
  });

  test("alias rua → endereco", () => {
    const raw = { ...base(), endereco: "", rua: "Rua B" };
    const { data } = normalizeInput(raw);
    expect(data.endereco).toBe("Rua B");
  });

  test("alias logradouro → endereco", () => {
    const raw = { ...base(), endereco: "", rua: "", logradouro: "Av. Principal" };
    const { data } = normalizeInput(raw);
    expect(data.endereco).toBe("Av. Principal");
  });

  test("alias referencia → ponto_referencia", () => {
    const raw = { ...base(), referencia: "Perto da praça" };
    const { data } = normalizeInput(raw);
    expect(data.ponto_referencia).toBe("Perto da praça");
  });

  test("sem_numero=true → numero='S/N' mesmo sem numero no payload", () => {
    const raw = { ...base(), numero: "", sem_numero: true };
    const { data } = normalizeInput(raw);
    expect(data.numero).toBe("S/N");
  });

  test("is_default=1 → data.is_default=1", () => {
    const { data } = normalizeInput({ ...base(), is_default: 1 });
    expect(data.is_default).toBe(1);
  });

  test("is_default='true' (string) → data.is_default=1", () => {
    const { data } = normalizeInput({ ...base(), is_default: "true" });
    expect(data.is_default).toBe(1);
  });

  test("comunidade e observacoes_acesso são null para URBANA", () => {
    const { data } = normalizeInput(base());
    expect(data.comunidade).toBeNull();
    expect(data.observacoes_acesso).toBeNull();
  });

  test("ok:false quando cep ausente", () => {
    const { ok, errors } = normalizeInput({ ...base(), cep: "" });
    expect(ok).toBe(false);
    expect(errors.some((e) => e.includes("cep"))).toBe(true);
  });

  test("ok:false quando endereco e aliases ausentes", () => {
    const { ok, errors } = normalizeInput({ ...base(), endereco: "", rua: "", logradouro: "" });
    expect(ok).toBe(false);
    expect(errors.some((e) => e.includes("endereco"))).toBe(true);
  });

  test("ok:false quando bairro ausente", () => {
    const { ok, errors } = normalizeInput({ ...base(), bairro: "" });
    expect(ok).toBe(false);
    expect(errors.some((e) => e.includes("bairro"))).toBe(true);
  });

  test("ok:false quando numero ausente e sem_numero=false", () => {
    const { ok, errors } = normalizeInput({ ...base(), numero: "", sem_numero: false });
    expect(ok).toBe(false);
    expect(errors.some((e) => e.includes("numero"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// normalizeInput — RURAL
// ---------------------------------------------------------------------------

describe("userAddressService.normalizeInput — RURAL", () => {
  let normalizeInput;

  beforeAll(() => {
    jest.resetModules();
    normalizeInput = require("../../../services/userAddressService").normalizeInput;
  });

  const base = () => ({
    tipo_localidade: "RURAL",
    cep: "36940000",
    cidade: "Manhuaçu",
    estado: "MG",
    comunidade: "Córrego São José",
    observacoes_acesso: "Estrada de terra",
  });

  test("ok:true para payload RURAL completo", () => {
    expect(normalizeInput(base()).ok).toBe(true);
  });

  test("tipo_localidade normalizado para RURAL", () => {
    const { data } = normalizeInput({ ...base(), tipo_localidade: "rural" });
    expect(data.tipo_localidade).toBe("RURAL");
  });

  test("placeholders defensivos: bairro='RURAL', numero='S/N', endereco=comunidade", () => {
    const { data } = normalizeInput(base());
    expect(data.bairro).toBe("RURAL");
    expect(data.numero).toBe("S/N");
    expect(data.endereco).toBe("Córrego São José");
  });

  test("comunidade e observacoes_acesso gravados corretamente", () => {
    const { data } = normalizeInput(base());
    expect(data.comunidade).toBe("Córrego São José");
    expect(data.observacoes_acesso).toBe("Estrada de terra");
  });

  test("ponto_referencia aceito como alias de observacoes_acesso em RURAL", () => {
    const raw = { ...base(), observacoes_acesso: "", ponto_referencia: "Perto da ponte" };
    const { data, ok } = normalizeInput(raw);
    expect(ok).toBe(true);
    expect(data.observacoes_acesso).toBe("Perto da ponte");
  });

  test("ok:false quando comunidade ausente", () => {
    const { ok, errors } = normalizeInput({ ...base(), comunidade: "" });
    expect(ok).toBe(false);
    expect(errors.some((e) => e.includes("comunidade"))).toBe(true);
  });

  test("ok:false quando observacoes_acesso e aliases ausentes", () => {
    const raw = { ...base(), observacoes_acesso: "", ponto_referencia: "", referencia: "" };
    const { ok, errors } = normalizeInput(raw);
    expect(ok).toBe(false);
    expect(errors.some((e) => e.includes("observacoes_acesso"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// list
// ---------------------------------------------------------------------------

describe("userAddressService.list", () => {
  test("delega para repo.findByUserId e retorna resultado", async () => {
    const rows = [{ id: 1, cep: "36940000" }];
    const { svc, repoMock } = setupModule({ findByUserId: jest.fn().mockResolvedValue(rows) });

    const result = await svc.list(7);

    expect(result).toBe(rows);
    expect(repoMock.findByUserId).toHaveBeenCalledWith(7);
  });
});

// ---------------------------------------------------------------------------
// create
// ---------------------------------------------------------------------------

describe("userAddressService.create", () => {
  const validBody = () => ({
    tipo_localidade: "URBANA",
    cep: "36940000",
    cidade: "Manhuaçu",
    estado: "MG",
    endereco: "Rua A",
    bairro: "Centro",
    numero: "10",
  });

  test("VALIDATION_ERROR quando normalizeInput retorna erros", async () => {
    const { svc, poolMock } = setupModule();
    await expect(svc.create(7, {})).rejects.toMatchObject({
      status: 400,
      code: "VALIDATION_ERROR",
    });
    expect(poolMock.getConnection).not.toHaveBeenCalled();
  });

  test("commit chamado em criação bem-sucedida", async () => {
    const { svc, mockConn } = setupModule();
    await svc.create(7, validBody());
    expect(mockConn.beginTransaction).toHaveBeenCalled();
    expect(mockConn.commit).toHaveBeenCalled();
    expect(mockConn.rollback).not.toHaveBeenCalled();
    expect(mockConn.release).toHaveBeenCalled();
  });

  test("clearDefaultForUser chamado quando is_default=true", async () => {
    const { svc, repoMock } = setupModule();
    await svc.create(7, { ...validBody(), is_default: 1 });
    expect(repoMock.clearDefaultForUser).toHaveBeenCalledWith(expect.anything(), 7);
  });

  test("clearDefaultForUser NÃO chamado quando is_default=false", async () => {
    const { svc, repoMock } = setupModule();
    await svc.create(7, { ...validBody(), is_default: 0 });
    expect(repoMock.clearDefaultForUser).not.toHaveBeenCalled();
  });

  test("createAddress chamado com userId e dados normalizados", async () => {
    const { svc, repoMock } = setupModule();
    await svc.create(7, validBody());
    expect(repoMock.createAddress).toHaveBeenCalledWith(
      expect.anything(),
      7,
      expect.objectContaining({ cep: "36940000", estado: "MG" })
    );
  });

  test("rollback e re-throw em erro de banco", async () => {
    const dbError = new Error("insert fail");
    const { svc, mockConn } = setupModule({
      createAddress: jest.fn().mockRejectedValue(dbError),
    });
    await expect(svc.create(7, validBody())).rejects.toBe(dbError);
    expect(mockConn.rollback).toHaveBeenCalled();
    expect(mockConn.release).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// update
// ---------------------------------------------------------------------------

describe("userAddressService.update", () => {
  const validBody = () => ({
    tipo_localidade: "URBANA",
    cep: "36940000",
    cidade: "Manhuaçu",
    estado: "MG",
    endereco: "Rua A",
    bairro: "Centro",
    numero: "10",
  });

  test("VALIDATION_ERROR quando addressId=0", async () => {
    const { svc, poolMock } = setupModule();
    await expect(svc.update(7, 0, validBody())).rejects.toMatchObject({
      status: 400,
      code: "VALIDATION_ERROR",
      message: "ID inválido.",
    });
    expect(poolMock.getConnection).not.toHaveBeenCalled();
  });

  test("VALIDATION_ERROR quando body inválido", async () => {
    const { svc, poolMock } = setupModule();
    await expect(svc.update(7, 5, {})).rejects.toMatchObject({
      status: 400,
      code: "VALIDATION_ERROR",
    });
    expect(poolMock.getConnection).not.toHaveBeenCalled();
  });

  test("NOT_FOUND quando affectedRows=0 (endereço não pertence ao usuário)", async () => {
    const { svc, mockConn } = setupModule({
      updateAddress: jest.fn().mockResolvedValue({ affectedRows: 0 }),
    });
    await expect(svc.update(7, 999, validBody())).rejects.toMatchObject({
      status: 404,
      code: "NOT_FOUND",
      message: "Endereço não encontrado.",
    });
    expect(mockConn.rollback).toHaveBeenCalled();
    expect(mockConn.commit).not.toHaveBeenCalled();
    expect(mockConn.release).toHaveBeenCalled();
  });

  test("commit em atualização bem-sucedida", async () => {
    const { svc, mockConn } = setupModule();
    await svc.update(7, 10, validBody());
    expect(mockConn.commit).toHaveBeenCalled();
    expect(mockConn.rollback).not.toHaveBeenCalled();
  });

  test("clearDefault antes do updateAddress quando is_default=true", async () => {
    const callOrder = [];
    const { svc } = setupModule({
      clearDefaultForUser: jest.fn().mockImplementation(async () => callOrder.push("clear")),
      updateAddress: jest.fn().mockImplementation(async () => {
        callOrder.push("update");
        return { affectedRows: 1 };
      }),
    });
    await svc.update(7, 10, { ...validBody(), is_default: 1 });
    expect(callOrder).toEqual(["clear", "update"]);
  });
});

// ---------------------------------------------------------------------------
// remove
// ---------------------------------------------------------------------------

describe("userAddressService.remove", () => {
  test("NOT_FOUND quando affectedRows=0", async () => {
    const { svc } = setupModule({
      deleteById: jest.fn().mockResolvedValue({ affectedRows: 0 }),
    });
    await expect(svc.remove(7, 999)).rejects.toMatchObject({
      status: 404,
      code: "NOT_FOUND",
      message: "Endereço não encontrado.",
    });
  });

  test("resolve sem erro quando affectedRows=1", async () => {
    const { svc } = setupModule({
      deleteById: jest.fn().mockResolvedValue({ affectedRows: 1 }),
    });
    await expect(svc.remove(7, 10)).resolves.toBeUndefined();
  });

  test("deleteById chamado com userId e addressId", async () => {
    const { svc, repoMock } = setupModule();
    await svc.remove(7, 10);
    expect(repoMock.deleteById).toHaveBeenCalledWith(7, 10);
  });
});
