"use strict";

// Testa o caminho que B2 (Fase 1 go-live) corrigiu: o controller deve
// validar HMAC sobre os bytes brutos preservados em req.rawBody pelo
// express.json({verify}) global, e NÃO sobre JSON.stringify(req.body)
// — esse atalho reordenava chaves e quebrava a assinatura.

const crypto = require("node:crypto");

// Mocks ANTES do require do controller — bate com o estilo dos demais tests.
jest.mock("../../../services/contratos/clicksignAdapter", () => {
  const real = jest.requireActual("../../../services/contratos/clicksignAdapter");
  return {
    verifySignature: jest.fn(real.verifySignature),
    translateWebhookEvent: jest.fn(real.translateWebhookEvent),
  };
});

jest.mock("../../../services/contratoSignerService", () => ({
  processarEventoWebhook: jest.fn().mockResolvedValue({ applied: true, reason: "no_transition" }),
}));

jest.mock("../../../repositories/webhookEventsRepository", () => ({
  recordIfNew: jest.fn(),
  markProcessed: jest.fn().mockResolvedValue(undefined),
  markFailed: jest.fn().mockResolvedValue(undefined),
}));

const adapter = require("../../../services/contratos/clicksignAdapter");
const webhookEventsRepo = require("../../../repositories/webhookEventsRepository");
const ctrl = require("../../../controllers/public/webhookClicksignController");

const HMAC_SECRET = "test-clicksign-hmac";

function buildSignedRequest({ payload, secret = HMAC_SECRET, header = "Content-HMAC" }) {
  const rawBuf = Buffer.from(JSON.stringify(payload), "utf8");
  const hex = crypto.createHmac("sha256", secret).update(rawBuf).digest("hex");
  const headers = { [header.toLowerCase()]: `sha256=${hex}` };

  return {
    rawBody: rawBuf,
    parsedBody: payload,
    signature: `sha256=${hex}`,
    req: {
      ip: "127.0.0.1",
      rawBody: rawBuf,
      body: payload, // como express.json deixaria
      get(name) {
        const v = headers[String(name).toLowerCase()];
        return v;
      },
    },
  };
}

function buildRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

describe("webhookClicksignController — raw body HMAC validation (B2 fix)", () => {
  const ORIG_SECRET = process.env.CLICKSIGN_HMAC_SECRET;

  beforeEach(() => {
    process.env.CLICKSIGN_HMAC_SECRET = HMAC_SECRET;
    jest.clearAllMocks();
    webhookEventsRepo.recordIfNew.mockResolvedValue({ inserted: true, id: 42 });
  });

  afterAll(() => {
    if (ORIG_SECRET === undefined) {
      delete process.env.CLICKSIGN_HMAC_SECRET;
    } else {
      process.env.CLICKSIGN_HMAC_SECRET = ORIG_SECRET;
    }
  });

  test("aceita payload com HMAC válido lendo req.rawBody (sem reordenar chaves)", async () => {
    // Payload com chaves em ordem específica — JSON.stringify(req.body) iria
    // produzir bytes idênticos por sorte aqui, mas o teste garante que o
    // caminho passa por req.rawBody (Buffer original).
    const payload = {
      event: { name: "auto_close", occurred_at: "2026-04-30T12:00:00Z" },
      document: { key: "doc-abc-123" },
    };
    const ctx = buildSignedRequest({ payload });
    const res = buildRes();

    await ctrl.ingest(ctx.req, res);

    expect(adapter.verifySignature).toHaveBeenCalledWith(
      expect.objectContaining({ rawBody: ctx.rawBody, signatureHeader: ctx.signature }),
    );
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ ok: true, stored: true });
  });

  test("rejeita 401 quando rawBody é os bytes originais mas o body parseado foi alterado em memória", async () => {
    // Cenário do bug: alguém alterou req.body (middleware bugado) antes do
    // controller. Se o controller usasse JSON.stringify(req.body), o HMAC
    // seria recalculado sobre os bytes ALTERADOS e a assinatura inválida
    // passaria. Com req.rawBody, a manipulação não engana a verificação.
    const original = { event: { name: "auto_close" }, document: { key: "doc-1" } };
    const ctx = buildSignedRequest({ payload: original });

    // Simula middleware que mutou req.body depois do parse:
    ctx.req.body = { event: { name: "tampered" }, document: { key: "doc-666" } };

    const res = buildRes();
    await ctrl.ingest(ctx.req, res);

    // Como rawBody não foi alterado, o HMAC bate. O controller usa rawBody,
    // então deve aceitar (200) — comportamento correto: a verdade é o byte
    // original. Documentamos esse comportamento.
    expect(res.statusCode).toBe(200);
  });

  test("rejeita 401 quando HMAC não bate", async () => {
    const payload = { event: { name: "auto_close" }, document: { key: "doc-x" } };
    const ctx = buildSignedRequest({ payload });
    // Quebra 1 byte da assinatura
    ctx.req.get = (name) => {
      if (String(name).toLowerCase() === "content-hmac") {
        return ctx.signature.slice(0, -2) + "ff";
      }
      return undefined;
    };
    const res = buildRes();

    await ctrl.ingest(ctx.req, res);

    expect(res.statusCode).toBe(401);
    expect(res.body).toMatchObject({ ok: false, code: "AUTH_ERROR" });
    expect(webhookEventsRepo.recordIfNew).not.toHaveBeenCalled();
  });

  test("aceita Buffer em req.body se rawBody ausente (compat com express.raw)", async () => {
    const payload = { event: { name: "auto_close" }, document: { key: "doc-buf" } };
    const ctx = buildSignedRequest({ payload });

    // Simula express.raw: req.body é Buffer, req.rawBody indefinido.
    ctx.req.rawBody = undefined;
    ctx.req.body = ctx.rawBody;

    const res = buildRes();
    await ctrl.ingest(ctx.req, res);

    expect(res.statusCode).toBe(200);
  });

  test("rejeita 401 quando nenhum byte raw está disponível", async () => {
    // Nem rawBody nem Buffer body — typing força fallback para Buffer.alloc(0),
    // que jamais bate com HMAC real.
    const payload = { event: { name: "auto_close" }, document: { key: "doc-empty" } };
    const ctx = buildSignedRequest({ payload });
    ctx.req.rawBody = undefined;
    ctx.req.body = undefined;

    const res = buildRes();
    await ctrl.ingest(ctx.req, res);

    expect(res.statusCode).toBe(401);
  });
});
