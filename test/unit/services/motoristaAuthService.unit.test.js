/**
 * test/unit/services/motoristaAuthService.unit.test.js
 *
 * Cobre o fluxo de magic-link:
 *   - requestMagicLink: NAO bumpa token_version (sessao ativa preservada)
 *   - requestMagicLink: retorna link, tenta WhatsApp, expoe provider+delivered
 *   - requestMagicLink: motorista inativo -> 403
 *   - requestMagicLink: telefone desconhecido -> nao revela (anti-enum)
 *   - consumeMagicLink: bumpa token_version (uso unico + invalida sessao
 *     anterior + invalida links emitidos em paralelo)
 *   - consumeMagicLink: 2a tentativa do MESMO token falha (uso unico real)
 *   - verifyMotoristaToken: aceita session jwt, recusa magic jwt
 *   - verifyMotoristaToken: sessao SOBREVIVE a novos magic-links
 *     emitidos enquanto motorista esta logado
 *   - manual provider: delivered=false (mensagem nao entregue de fato)
 *   - api provider: delivered=true quando status='sent'
 */

"use strict";

describe("services/motoristaAuthService", () => {
  function loadWithMocks({
    motoristaStub,
    whatsappStub = jest
      .fn()
      .mockResolvedValue({
        provider: "manual",
        status: "manual_pending",
        url: "https://wa.me/x",
        erro: null,
      }),
    providerStub = jest.fn(() => "manual"),
    findByIdImpl,
    findByPhoneImpl,
    bumpSpy = jest.fn(),
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
          bumpSpy(id);
          if (current && current.id === id) current.token_version += 1;
        }),
        touchLogin: jest.fn().mockResolvedValue(),
      }),
    );

    jest.doMock(require.resolve("../../../services/whatsapp"), () => ({
      sendWhatsapp: whatsappStub,
      getProvider: providerStub,
    }));

    const loggerStub = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
    jest.doMock(require.resolve("../../../lib/logger"), () => loggerStub);

    return Object.assign(
      require("../../../services/motoristaAuthService"),
      { _loggerStub: loggerStub, _bumpSpy: bumpSpy, _providerStub: providerStub },
    );
  }

  // ---------------------------------------------------------------------------
  // requestMagicLink
  // ---------------------------------------------------------------------------

  test("requestMagicLink por telefone: NAO bumpa token_version + retorna link + tenta WhatsApp", async () => {
    const whatsappStub = jest
      .fn()
      .mockResolvedValue({
        provider: "manual",
        status: "manual_pending",
        url: "https://wa.me/x",
        erro: null,
      });
    const bumpSpy = jest.fn();
    const svc = loadWithMocks({
      motoristaStub: { id: 1, nome: "Joao", telefone: "5533999999999",
                        ativo: 1, token_version: 0 },
      whatsappStub,
      bumpSpy,
    });
    const r = await svc.requestMagicLink({ telefone: "33999999999" });
    expect(r.sent).toBe(true);
    expect(r.link).toMatch(/\/motorista\/verificar\?token=/);
    expect(r.delivered).toBe(false); // manual_pending != entrega real
    expect(r.whatsapp.provider).toBe("manual");
    expect(whatsappStub).toHaveBeenCalledTimes(1);
    expect(whatsappStub.mock.calls[0][0].telefone).toBe("5533999999999");
    // CRITICO: nao pode bumpar — sessao ativa do motorista deve sobreviver
    expect(bumpSpy).not.toHaveBeenCalled();
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

  // CRITICO: protege contra a regressao do bug original.
  // Antes da correcao, requestMagicLink bumpava token_version, derrubando
  // motorista logado quando admin atribuia uma rota nova (auto-send).
  test("verifyMotoristaToken: sessao SOBREVIVE quando admin gera novo magic-link", async () => {
    const svc = loadWithMocks({
      motoristaStub: { id: 1, nome: "Joao", telefone: "5533999999999",
                        ativo: 1, token_version: 0 },
    });
    const issued = await svc.requestMagicLink({ telefone: "33999999999" });
    const magicToken = new URL(issued.link).searchParams.get("token");
    const session = await svc.consumeMagicLink({ token: magicToken });

    // Sessao funcionando
    expect(await svc.verifyMotoristaToken(session.jwt)).toMatchObject({ id: 1 });

    // Admin (ou auto-send) gera NOVO magic-link enquanto motorista esta logado.
    // Em produção real isso acontece quando uma 2a rota e' atribuida.
    await svc.requestMagicLink({ telefone: "33999999999" });
    await svc.requestMagicLink({ motoristaId: 1 });
    await svc.requestMagicLink({ motoristaId: 1 });

    // Sessao continua valida — bug critico do auto-send corrigido
    expect(await svc.verifyMotoristaToken(session.jwt)).toMatchObject({ id: 1 });
  });

  // ---------------------------------------------------------------------------
  // consumeMagicLink: ainda invalida sessoes anteriores (uso unico real)
  // ---------------------------------------------------------------------------

  test("consumeMagicLink: derruba sessao ANTERIOR (so 1 dispositivo logado)", async () => {
    const svc = loadWithMocks({
      motoristaStub: { id: 1, nome: "Joao", telefone: "5533999999999",
                        ativo: 1, token_version: 0 },
    });
    // 1o login
    const issued1 = await svc.requestMagicLink({ telefone: "33999999999" });
    const token1 = new URL(issued1.link).searchParams.get("token");
    const session1 = await svc.consumeMagicLink({ token: token1 });
    expect(await svc.verifyMotoristaToken(session1.jwt)).toMatchObject({ id: 1 });

    // 2o link (admin gerou novamente; motorista trocou de aparelho)
    const issued2 = await svc.requestMagicLink({ telefone: "33999999999" });
    const token2 = new URL(issued2.link).searchParams.get("token");

    // Sessao 1 ainda funciona (request nao derruba)
    expect(await svc.verifyMotoristaToken(session1.jwt)).toMatchObject({ id: 1 });

    // Mas no momento que o motorista CONSOME o novo link, a sessao 1 morre
    const session2 = await svc.consumeMagicLink({ token: token2 });
    expect(await svc.verifyMotoristaToken(session1.jwt)).toBeNull();
    expect(await svc.verifyMotoristaToken(session2.jwt)).toMatchObject({ id: 1 });

    // E o token1, se um atacante tentasse reutilizar, falha
    await expect(svc.consumeMagicLink({ token: token1 })).rejects.toMatchObject({
      status: 401,
    });
  });

  // ---------------------------------------------------------------------------
  // delivered + provider awareness (Etapa 2 da correcao)
  // ---------------------------------------------------------------------------

  test("requestMagicLink em modo manual: delivered=false (link pronto, mensagem nao entregue)", async () => {
    const whatsappStub = jest.fn().mockResolvedValue({
      provider: "manual",
      status: "manual_pending",
      url: "https://wa.me/x",
      erro: null,
    });
    const svc = loadWithMocks({
      motoristaStub: { id: 1, nome: "Joao", telefone: "5533999999999",
                        ativo: 1, token_version: 0 },
      whatsappStub,
      providerStub: jest.fn(() => "manual"),
    });
    const r = await svc.requestMagicLink({ telefone: "33999999999" });
    expect(r.delivered).toBe(false);
    expect(r.whatsapp.provider).toBe("manual");
    expect(r.whatsapp.status).toBe("manual_pending");
  });

  test("requestMagicLink em modo api com status=sent: delivered=true", async () => {
    const whatsappStub = jest.fn().mockResolvedValue({
      provider: "api",
      status: "sent",
      url: null,
      erro: null,
      messageId: "wamid.x",
    });
    const svc = loadWithMocks({
      motoristaStub: { id: 1, nome: "Joao", telefone: "5533999999999",
                        ativo: 1, token_version: 0 },
      whatsappStub,
      providerStub: jest.fn(() => "api"),
    });
    const r = await svc.requestMagicLink({ telefone: "33999999999" });
    expect(r.delivered).toBe(true);
    expect(r.whatsapp.provider).toBe("api");
    expect(r.whatsapp.status).toBe("sent");
  });

  test("requestMagicLink quando WhatsApp falha: delivered=false + log warn", async () => {
    const whatsappStub = jest.fn().mockRejectedValue(new Error("network down"));
    const svc = loadWithMocks({
      motoristaStub: { id: 1, nome: "Joao", telefone: "5533999999999",
                        ativo: 1, token_version: 0 },
      whatsappStub,
      providerStub: jest.fn(() => "api"),
    });
    const r = await svc.requestMagicLink({ telefone: "33999999999" });
    expect(r.delivered).toBe(false);
    expect(r.whatsapp.status).toBe("error");
    expect(r.whatsapp.erro).toMatch(/network down/);
    expect(svc._loggerStub.warn).toHaveBeenCalledWith(
      expect.objectContaining({ err: "network down" }),
      "motorista.magic_link.whatsapp_failed",
    );
  });

  // ---------------------------------------------------------------------------
  // UX: TTL formatado em horas (480 -> "8 horas") na mensagem WhatsApp
  // ---------------------------------------------------------------------------

  test("mensagem WhatsApp usa TTL humano (8 horas, nao 480 minutos)", async () => {
    process.env.MOTORISTA_MAGIC_TTL_MIN = "480";
    const whatsappStub = jest.fn().mockResolvedValue({
      provider: "manual",
      status: "manual_pending",
      url: "https://wa.me/x",
      erro: null,
    });
    const svc = loadWithMocks({
      motoristaStub: { id: 1, nome: "Joao Carlos", telefone: "5533999999999",
                        ativo: 1, token_version: 0 },
      whatsappStub,
    });
    await svc.requestMagicLink({ telefone: "33999999999" });
    const mensagem = whatsappStub.mock.calls[0][0].mensagem;
    expect(mensagem).toMatch(/Ola Joao!/);
    expect(mensagem).toMatch(/8 horas/);
    expect(mensagem).not.toMatch(/480 minutos/);
    delete process.env.MOTORISTA_MAGIC_TTL_MIN;
  });
});
