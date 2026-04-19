/**
 * test/unit/services/mailTransport.unit.test.js
 *
 * Cobre a factory de transporter (services/mail/transport.js).
 * Foco nos caminhos de decisão por env, não no envio em si
 * (nodemailer é mockado).
 *
 * Casos testados:
 *   1. MAIL_PROVIDER=disabled em dev → stub (não lança)
 *   2. MAIL_PROVIDER=disabled em produção → lança erro claro
 *   3. MAIL_PROVIDER=sendgrid sem SENDGRID_API_KEY → lança
 *   4. MAIL_PROVIDER=smtp sem SMTP_HOST → lança
 *   5. Autodiscovery: SENDGRID_API_KEY presente → escolhe sendgrid
 *   6. Autodiscovery: só EMAIL_USER/EMAIL_PASS → Gmail legado
 *   7. Produção sem nenhuma var de e-mail → lança
 *   8. buildFrom() usa MAIL_FROM quando presente
 *   9. buildFrom() extrai endereço de SMTP_FROM formato "Nome <x@y>"
 *   10. Stub transport tem sendMail que resolve sem enviar
 */

// Isolamos o process.env pra cada teste — permite setar vars sem
// vazar pro próximo `it`.
const ORIGINAL_ENV = process.env;

// Mocka o logger pra não poluir o console com logs esperados.
jest.mock("../../../lib/logger", () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

// Mocka nodemailer.createTransport — retornamos um objeto fake que só
// expõe sendMail para a factory. Assim testamos o roteamento sem
// dependência real de SMTP.
jest.mock("nodemailer", () => ({
  createTransport: jest.fn((opts) => ({
    __mockOpts: opts,
    sendMail: jest.fn(async () => ({ accepted: ["x@y.com"] })),
  })),
}));

function freshTransport() {
  // jest.isolateModules garante que cada teste reavalie o módulo
  // com o process.env atual — sem isso, decisões cacheadas podem
  // contaminar casos.
  let mod;
  jest.isolateModules(() => {
    mod = require("../../../services/mail/transport");
  });
  return mod;
}

describe("services/mail/transport", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...ORIGINAL_ENV };
    // Limpa vars relacionadas; cada teste seta o que precisa.
    delete process.env.MAIL_PROVIDER;
    delete process.env.SENDGRID_API_KEY;
    delete process.env.SMTP_HOST;
    delete process.env.SMTP_PORT;
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASS;
    delete process.env.SMTP_FROM;
    delete process.env.EMAIL_USER;
    delete process.env.EMAIL_PASS;
    delete process.env.MAIL_FROM;
    delete process.env.MAIL_FROM_NAME;
    process.env.NODE_ENV = "test";
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  // ─── createMailTransport ──────────────────────────────────────────

  it("MAIL_PROVIDER=disabled em dev retorna stub transport", () => {
    process.env.MAIL_PROVIDER = "disabled";
    process.env.NODE_ENV = "development";
    const { createMailTransport, PROVIDERS } = freshTransport();
    const t = createMailTransport();
    expect(t.__provider).toBe(PROVIDERS.STUB);
    expect(typeof t.sendMail).toBe("function");
  });

  it("MAIL_PROVIDER=disabled em produção lança erro", () => {
    process.env.MAIL_PROVIDER = "disabled";
    process.env.NODE_ENV = "production";
    const { createMailTransport } = freshTransport();
    expect(() => createMailTransport()).toThrow(/não é permitido em produção/i);
  });

  it("MAIL_PROVIDER=sendgrid sem SENDGRID_API_KEY lança", () => {
    process.env.MAIL_PROVIDER = "sendgrid";
    const { createMailTransport } = freshTransport();
    expect(() => createMailTransport()).toThrow(/SENDGRID_API_KEY/);
  });

  it("MAIL_PROVIDER=sendgrid com chave configura SMTP relay do SendGrid", () => {
    process.env.MAIL_PROVIDER = "sendgrid";
    process.env.SENDGRID_API_KEY = "SG.fake-key";
    const { createMailTransport, PROVIDERS } = freshTransport();
    const t = createMailTransport();
    expect(t.__provider).toBe(PROVIDERS.SENDGRID);
    expect(t.__mockOpts.host).toBe("smtp.sendgrid.net");
    expect(t.__mockOpts.port).toBe(587);
    expect(t.__mockOpts.auth.user).toBe("apikey");
    expect(t.__mockOpts.auth.pass).toBe("SG.fake-key");
  });

  it("MAIL_PROVIDER=smtp sem SMTP_HOST lança", () => {
    process.env.MAIL_PROVIDER = "smtp";
    const { createMailTransport } = freshTransport();
    expect(() => createMailTransport()).toThrow(/SMTP_HOST/);
  });

  it("MAIL_PROVIDER=smtp com host configura transport nodemailer", () => {
    process.env.MAIL_PROVIDER = "smtp";
    process.env.SMTP_HOST = "mail.example.com";
    process.env.SMTP_PORT = "465";
    process.env.SMTP_SECURE = "true";
    process.env.SMTP_USER = "user";
    process.env.SMTP_PASS = "pass";
    const { createMailTransport, PROVIDERS } = freshTransport();
    const t = createMailTransport();
    expect(t.__provider).toBe(PROVIDERS.SMTP);
    expect(t.__mockOpts.host).toBe("mail.example.com");
    expect(t.__mockOpts.port).toBe(465);
    expect(t.__mockOpts.secure).toBe(true);
    expect(t.__mockOpts.auth).toEqual({ user: "user", pass: "pass" });
  });

  it("autodiscovery: SENDGRID_API_KEY sem MAIL_PROVIDER escolhe sendgrid", () => {
    process.env.SENDGRID_API_KEY = "SG.auto";
    const { createMailTransport, PROVIDERS } = freshTransport();
    const t = createMailTransport();
    expect(t.__provider).toBe(PROVIDERS.SENDGRID);
  });

  it("autodiscovery: só EMAIL_USER/EMAIL_PASS em dev cai no Gmail legado", () => {
    process.env.EMAIL_USER = "me@gmail.com";
    process.env.EMAIL_PASS = "appsecret";
    process.env.NODE_ENV = "development";
    const { createMailTransport, PROVIDERS } = freshTransport();
    const t = createMailTransport();
    expect(t.__provider).toBe(PROVIDERS.GMAIL_LEGACY);
    expect(t.__mockOpts.service).toBe("Gmail");
  });

  it("produção sem nenhuma var de e-mail lança", () => {
    process.env.NODE_ENV = "production";
    const { createMailTransport } = freshTransport();
    expect(() => createMailTransport()).toThrow(
      /Nenhum provider de e-mail/,
    );
  });

  it("dev sem nenhuma var cai no stub (não quebra boot)", () => {
    process.env.NODE_ENV = "development";
    const { createMailTransport, PROVIDERS } = freshTransport();
    const t = createMailTransport();
    expect(t.__provider).toBe(PROVIDERS.STUB);
  });

  // ─── stub transport ───────────────────────────────────────────────

  it("stub transport retorna resposta estruturada sem enviar nada", async () => {
    process.env.MAIL_PROVIDER = "disabled";
    process.env.NODE_ENV = "development";
    const { createMailTransport } = freshTransport();
    const t = createMailTransport();
    const result = await t.sendMail({
      to: "x@y.com",
      subject: "oi",
      html: "<p>hi</p>",
    });
    expect(result.messageId).toMatch(/^<stub-/);
    expect(result.accepted).toEqual(["x@y.com"]);
  });

  // ─── buildFrom ────────────────────────────────────────────────────

  it("buildFrom usa MAIL_FROM quando presente", () => {
    process.env.MAIL_FROM = "noreply@kavita.com.br";
    const { buildFrom } = freshTransport();
    expect(buildFrom("Curadoria Kavita")).toBe(
      '"Curadoria Kavita" <noreply@kavita.com.br>',
    );
  });

  it("buildFrom cai pra SMTP_FROM quando MAIL_FROM ausente", () => {
    process.env.SMTP_FROM = '"Kavita" <smtp-from@kavita.com.br>';
    const { buildFrom } = freshTransport();
    expect(buildFrom("X")).toBe('"X" <smtp-from@kavita.com.br>');
  });

  it("buildFrom aceita SMTP_FROM como endereço plano", () => {
    process.env.SMTP_FROM = "plain@kavita.com.br";
    const { buildFrom } = freshTransport();
    expect(buildFrom("X")).toBe('"X" <plain@kavita.com.br>');
  });

  it("buildFrom cai pra EMAIL_USER quando MAIL_FROM e SMTP_FROM ausentes", () => {
    process.env.EMAIL_USER = "legacy@gmail.com";
    const { buildFrom } = freshTransport();
    expect(buildFrom("Y")).toBe('"Y" <legacy@gmail.com>');
  });

  it("buildFrom retorna '' quando nenhum endereço está configurado", () => {
    const { buildFrom } = freshTransport();
    expect(buildFrom("Qualquer")).toBe("");
  });

  it("buildFrom usa MAIL_FROM_NAME como default quando nome contextual não é passado", () => {
    process.env.MAIL_FROM = "a@b.com";
    process.env.MAIL_FROM_NAME = "Kavita Default";
    const { buildFrom } = freshTransport();
    expect(buildFrom()).toBe('"Kavita Default" <a@b.com>');
  });
});
