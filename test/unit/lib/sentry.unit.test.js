/**
 * test/unit/lib/sentry.unit.test.js
 *
 * Cobre o `beforeSend` e `scrubObject` do lib/sentry.js — garante que
 * dados sensíveis não vazam para o dashboard mesmo se algum caller
 * passar payload completo do request.
 */

const sentry = require("../../../lib/sentry");

describe("lib/sentry — scrubObject", () => {
  test("substitui chaves sensíveis por [redacted]", () => {
    const obj = {
      senha: "abc123",
      password: "xyz",
      cpf: "111.222.333-44",
      telefone: "31999990000",
      token: "eyJabc",
      nome: "Rick",
    };
    sentry.__scrubObject(obj);
    expect(obj.senha).toBe("[redacted]");
    expect(obj.password).toBe("[redacted]");
    expect(obj.cpf).toBe("[redacted]");
    expect(obj.telefone).toBe("[redacted]");
    expect(obj.token).toBe("[redacted]");
    expect(obj.nome).toBe("Rick"); // não-sensível preservado
  });

  test("recursivo em objetos aninhados", () => {
    const obj = {
      user: { senha: "abc", nome: "Rick" },
      meta: { extras: { token: "x" } },
    };
    sentry.__scrubObject(obj);
    expect(obj.user.senha).toBe("[redacted]");
    expect(obj.user.nome).toBe("Rick");
    expect(obj.meta.extras.token).toBe("[redacted]");
  });

  test("substitui CPF em strings livres", () => {
    const obj = {
      mensagem: "Erro processando pedido do cliente 111.222.333-44 hoje",
    };
    sentry.__scrubObject(obj);
    expect(obj.mensagem).not.toContain("111.222.333-44");
    expect(obj.mensagem).toContain("[cpf-redacted]");
  });

  test("substitui CPF mesmo sem formatação (11 dígitos)", () => {
    const obj = { detalhe: "CPF: 11122233344 inválido" };
    sentry.__scrubObject(obj);
    expect(obj.detalhe).toContain("[cpf-redacted]");
  });

  test("não quebra com null/undefined", () => {
    expect(sentry.__scrubObject(null)).toBeNull();
    expect(sentry.__scrubObject(undefined)).toBeUndefined();
  });
});

describe("lib/sentry — beforeSend", () => {
  test("retorna null para status < 500 (validação não polui dashboard)", () => {
    const evt = { extra: { status: 400 } };
    expect(sentry.__beforeSend(evt)).toBeNull();
  });

  test("retorna null para 401, 403, 404, 422", () => {
    [401, 403, 404, 422].forEach((s) => {
      expect(sentry.__beforeSend({ extra: { status: s } })).toBeNull();
    });
  });

  test("passa erro 500 e enriquece", () => {
    const evt = {
      extra: { status: 500 },
      request: {
        headers: { cookie: "secret=1", "user-agent": "browser" },
        data: { senha: "abc", nome: "Rick" },
      },
    };
    const out = sentry.__beforeSend(evt);
    expect(out).not.toBeNull();
    expect(out.request.headers.cookie).toBeUndefined();
    expect(out.request.headers["user-agent"]).toBe("browser");
    expect(out.request.data.senha).toBe("[redacted]");
    expect(out.request.data.nome).toBe("Rick");
  });

  test("remove headers sensíveis do MP webhook", () => {
    const evt = {
      extra: { status: 500 },
      request: {
        headers: {
          "x-signature": "ts=1234,v1=abcdef",
          "x-csrf-token": "xyz",
          authorization: "Bearer xxx",
        },
      },
    };
    const out = sentry.__beforeSend(evt);
    expect(out.request.headers["x-signature"]).toBeUndefined();
    expect(out.request.headers["x-csrf-token"]).toBeUndefined();
    expect(out.request.headers.authorization).toBeUndefined();
  });

  test("redaciona token na query string", () => {
    const evt = {
      extra: { status: 500 },
      request: { query_string: "id=1&token=eyJ&secret=foo&keep=bar" },
    };
    const out = sentry.__beforeSend(evt);
    expect(out.request.query_string).toBe(
      "id=1&token=[redacted]&secret=[redacted]&keep=bar",
    );
  });

  test("redaciona breadcrumbs", () => {
    const evt = {
      extra: { status: 500 },
      breadcrumbs: [
        { message: "Erro do CPF 111.222.333-44 no checkout" },
        { data: { senha: "abc" } },
      ],
    };
    const out = sentry.__beforeSend(evt);
    expect(out.breadcrumbs[0].message).not.toContain("111.222.333-44");
    expect(out.breadcrumbs[0].message).toContain("[cpf-redacted]");
    expect(out.breadcrumbs[1].data.senha).toBe("[redacted]");
  });

  test("evento sem status passa adiante (uncaughtException)", () => {
    const evt = { exception: { values: [{ type: "Error" }] } };
    const out = sentry.__beforeSend(evt);
    expect(out).not.toBeNull();
  });

  test("event.extra é redacionado", () => {
    const evt = {
      extra: { status: 500, payload: { token: "abc", id: 1 } },
    };
    const out = sentry.__beforeSend(evt);
    expect(out.extra.payload.token).toBe("[redacted]");
    expect(out.extra.payload.id).toBe(1);
  });
});

describe("lib/sentry — exports são no-ops sem DSN", () => {
  test("captureException sem init não lança", () => {
    expect(() => sentry.captureException(new Error("x"))).not.toThrow();
  });

  test("captureMessage sem init não lança", () => {
    expect(() => sentry.captureMessage("x")).not.toThrow();
  });
});
