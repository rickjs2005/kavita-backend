/**
 * test/unit/services/motoristaAuthService.unit.test.js
 *
 * Cobre o fluxo de magic-link:
 *   - requestMagicLink: bumpa token_version, retorna link, tenta WhatsApp
 *   - requestMagicLink: motorista inativo -> 403
 *   - requestMagicLink: telefone desconhecido -> nao revela (anti-enum)
 *   - consumeMagicLink: token expirado -> 401
 *   - consumeMagicLink: bump invalida outros links + sessoes
 *   - consumeMagicLink: 2a tentativa do MESMO token falha (uso unico real)
 *   - verifyMotoristaToken: aceita session jwt, recusa magic jwt
 */

"use strict";

describe("services/motoristaAuthService", () => {
  function loadWithMocks({
    motoristaStub,
    whatsappStub = jest
      .fn()
      .mockResolvedValue({ status: "manual_pending", url: "https://wa.me/x", erro: null }),
    findByIdImpl,
    findByPhoneImpl,
  } = {}) {
    jest.resetModules();
    process.env.JWT_SECRET = "test-secret-aaaa-bbbb-cccc";
    process.env.APP_URL = "http://localhost:3000";

    // motorista pode evoluir entre chamadas (token_version++)
    let current = motoristaStub
      ? { ...motoristaStub }
      : null;

    jest.doMock(
      require.resolve("../../../repositories/motoristasRepository"),
      () => ({
        findById: jest.fn(async (id) => {
          if (findByIdImpl) return findByIdImpl(id);
          return current && current.id === id ? { ...current } : null;
        }),
        findByTelefone: jest.fn(async (tel) => {
          if (findByPhoneImpl) return findByPhoneImpl(tel);
          return current && current.telefone === tel ? { ...current } : null;
        }),
        bumpTokenVersion: jest.fn(async (id) => {
          if (current && current.id === id) current.token_version += 1;
        }),
        touchLogin: jest.fn().mockResolvedValue(),
      }),
    );

    jest.doMock(require.resolve("../../../services/whatsapp"), () => ({
      sendWhatsapp: whatsappStub,
    }));

    jest.doMock(require.resolve("../../../lib/logger"), () => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    }));

    return require("../../../services/motoristaAuthService");
  }

  // ---------------------------------------------------------------------------
  // requestMagicLink
  // ---------------------------------------------------------------------------

  test("requestMagicLink por telefone: bumpa token_version + retorna link + tenta WhatsApp", async () => {
    const whatsappStub = jest
      .fn()
      .mockResolvedValue({ status: "manual_pending", url: "https://wa.me/x", erro: null });
    const svc = loadWithMocks({
      motoristaStub: { id: 1, nome: "Joao", telefone: "5533999999999",
                        ativo: 1, token_version: 0 },
      whatsappStub,
    });
    const r = await svc.requestMagicLink({ telefone: "33999999999" });
    expect(r.sent).toBe(true);
    expect(r.link).toMatch(/\/motorista\/verificar\?token=/);
    expect(whatsappStub).toHaveBeenCalledTimes(1);
    expect(whatsappStub.mock.calls[0][0].telefone).toBe("5533999999999");
  });

  test("requestMagicLink: motorista inativo -> 403", async () => {
    const svc = loadWithMocks({
      motoristaStub: { id: 1, nome: "X", telefone: "5533999999999",
                        ativo: 0, token_version: 0 },
    });
    await expect(svc.requestMagicLink({ telefone: "33999999999" })).rejects.toMatchObject({
      status: 403,
    });
  });

  test("requestMagicLink: telefone desconhecido nao lanca, mas sent=false", async () => {
    const svc = loadWithMocks({});
    const r = await svc.requestMagicLink({ telefone: "33988887777" });
    expect(r.sent).toBe(false);
    expect(r.link).toBeNull();
  });

  test("requestMagicLink: telefone invalido -> 400", async () => {
    const svc = loadWithMocks({});
    await expect(svc.requestMagicLink({ telefone: "abc" })).rejects.toMatchObject({
      status: 400,
    });
  });

  test("requestMagicLink por motoristaId: aceita admin clicando 'enviar'", async () => {
    const whatsappStub = jest
      .fn()
      .mockResolvedValue({ status: "manual_pending", url: "https://wa.me/x", erro: null });
    const svc = loadWithMocks({
      motoristaStub: { id: 7, nome: "Maria", telefone: "5533988887777",
                        ativo: 1, token_version: 0 },
      whatsappStub,
    });
    const r = await svc.requestMagicLink({ motoristaId: 7 });
    expect(r.sent).toBe(true);
    expect(r.telefone).toBe("5533988887777");
  });

  // ---------------------------------------------------------------------------
  // consumeMagicLink — uso unico real
  // ---------------------------------------------------------------------------

  test("consumeMagicLink: 2a tentativa do MESMO token falha (uso unico)", async () => {
    const svc = loadWithMocks({
      motoristaStub: { id: 1, nome: "Joao", telefone: "5533999999999",
                        ativo: 1, token_version: 0 },
    });
    const issued = await svc.requestMagicLink({ telefone: "33999999999" });
    const url = new URL(issued.link);
    const token = url.searchParams.get("token");

    const first = await svc.consumeMagicLink({ token });
    expect(first.motorista.id).toBe(1);
    expect(first.cookie.name).toBe("motoristaToken");

    await expect(svc.consumeMagicLink({ token })).rejects.toMatchObject({
      status: 401,
    });
  });

  test("consumeMagicLink: token aleatorio invalido -> 401", async () => {
    const svc = loadWithMocks({});
    await expect(svc.consumeMagicLink({ token: "lixo.qualquer.aaa" })).rejects.toMatchObject({
      status: 401,
    });
  });

  test("consumeMagicLink: ausente -> 400", async () => {
    const svc = loadWithMocks({});
    await expect(svc.consumeMagicLink({ token: "" })).rejects.toMatchObject({
      status: 400,
    });
  });

  // ---------------------------------------------------------------------------
  // verifyMotoristaToken (validar sessao)
  // ---------------------------------------------------------------------------

  test("verifyMotoristaToken: aceita session jwt; recusa magic jwt", async () => {
    const svc = loadWithMocks({
      motoristaStub: { id: 1, nome: "Joao", telefone: "5533999999999",
                        ativo: 1, token_version: 0 },
    });

    const issued = await svc.requestMagicLink({ telefone: "33999999999" });
    const magicToken = new URL(issued.link).searchParams.get("token");

    // magic-link nao serve como sessao
    expect(await svc.verifyMotoristaToken(magicToken)).toBeNull();

    const session = await svc.consumeMagicLink({ token: magicToken });
    const sessionJwt = session.jwt;

    const motorista = await svc.verifyMotoristaToken(sessionJwt);
    expect(motorista).toMatchObject({ id: 1 });
  });

  test("verifyMotoristaToken: sessao invalida apos novo magic-link (token_version++)", async () => {
    const svc = loadWithMocks({
      motoristaStub: { id: 1, nome: "Joao", telefone: "5533999999999",
                        ativo: 1, token_version: 0 },
    });
    const issued = await svc.requestMagicLink({ telefone: "33999999999" });
    const magicToken = new URL(issued.link).searchParams.get("token");
    const session = await svc.consumeMagicLink({ token: magicToken });

    // Admin gera NOVO magic-link enquanto motorista esta logado
    await svc.requestMagicLink({ telefone: "33999999999" });

    // Sessao antiga vira invalida (token_version mudou)
    expect(await svc.verifyMotoristaToken(session.jwt)).toBeNull();
  });
});
