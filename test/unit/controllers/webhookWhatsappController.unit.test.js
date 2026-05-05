"use strict";

// Etapa 4 — controller do webhook Meta. Foco no contrato HTTP:
//   - GET de verificação devolve challenge cru com 200
//   - GET sem token correto devolve 403 (text/plain "forbidden")
//   - POST com HMAC válido chama processWebhookPayload e devolve 200
//   - POST com HMAC inválido devolve 401 e NÃO chama o processador
//   - JSON inválido (após HMAC ok) devolve 200 reason=invalid_json
//   - exceção do processador devolve 200 reason=process_failed
//
// O processador (whatsappWebhookService.processWebhookPayload) é
// mockado — sua lógica está coberta em whatsappWebhookService.unit.test.js.

const crypto = require("node:crypto");

jest.mock("../../../services/whatsapp/whatsappWebhookService", () => {
  const real = jest.requireActual(
    "../../../services/whatsapp/whatsappWebhookService",
  );
  return {
    verifySubscription: jest.fn(real.verifySubscription),
    verifySignature: jest.fn(real.verifySignature),
    processWebhookPayload: jest.fn(),
  };
});

const svc = require("../../../services/whatsapp/whatsappWebhookService");
const ctrl = require("../../../controllers/public/webhookWhatsappController");

const SECRET = "shhh-secret";
const VERIFY_TOKEN = "verify-token-xyz";

function buildSignedRequest({ payload, secret = SECRET }) {
  const rawBuf = Buffer.from(JSON.stringify(payload), "utf8");
  const hex = crypto.createHmac("sha256", secret).update(rawBuf).digest("hex");
  const headers = { "x-hub-signature-256": `sha256=${hex}` };
  return {
    rawBuf,
    headerValue: `sha256=${hex}`,
    req: {
      ip: "127.0.0.1",
      rawBody: rawBuf,
      body: payload,
      query: {},
      get(name) {
        return headers[String(name).toLowerCase()];
      },
    },
  };
}

function buildRes() {
  return {
    statusCode: 200,
    body: null,
    contentType: null,
    sentText: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    type(t) {
      this.contentType = t;
      return this;
    },
    send(s) {
      this.sentText = s;
      return this;
    },
  };
}

describe("webhookWhatsappController", () => {
  beforeEach(() => {
    process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN = VERIFY_TOKEN;
    process.env.WHATSAPP_WEBHOOK_SECRET = SECRET;
    jest.clearAllMocks();
    svc.processWebhookPayload.mockResolvedValue({
      processedStatuses: 1,
      skippedStatuses: 0,
      insertedInbound: 0,
      duplicateInbound: 0,
      ignored: 0,
      errors: [],
    });
  });

  afterEach(() => {
    delete process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
    delete process.env.WHATSAPP_WEBHOOK_SECRET;
  });

  // -------------------------------------------------------------------------
  // GET de verificação
  // -------------------------------------------------------------------------

  test("GET verify ok: 200 + challenge cru", async () => {
    const req = {
      query: {
        "hub.mode": "subscribe",
        "hub.verify_token": VERIFY_TOKEN,
        "hub.challenge": "1357",
      },
      ip: "127.0.0.1",
    };
    const res = buildRes();
    await ctrl.verify(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.contentType).toBe("text/plain");
    expect(res.sentText).toBe("1357");
  });

  test("GET verify token errado: 403 forbidden", async () => {
    const req = {
      query: {
        "hub.mode": "subscribe",
        "hub.verify_token": "errado",
        "hub.challenge": "x",
      },
      ip: "127.0.0.1",
    };
    const res = buildRes();
    await ctrl.verify(req, res);
    expect(res.statusCode).toBe(403);
    expect(res.sentText).toBe("forbidden");
  });

  // -------------------------------------------------------------------------
  // POST ingest
  // -------------------------------------------------------------------------

  test("POST ingest com HMAC válido: 200 + summary", async () => {
    const payload = { object: "whatsapp_business_account", entry: [] };
    const { req } = buildSignedRequest({ payload });
    const res = buildRes();
    await ctrl.ingest(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.summary).toBeDefined();
    expect(svc.processWebhookPayload).toHaveBeenCalledTimes(1);
  });

  test("POST ingest com HMAC inválido: 401 e NÃO chama processador", async () => {
    const payload = { object: "whatsapp_business_account", entry: [] };
    const { rawBuf } = buildSignedRequest({ payload });
    const req = {
      ip: "127.0.0.1",
      rawBody: rawBuf,
      body: payload,
      get() {
        return "sha256=deadbeef"; // assinatura invalida
      },
    };
    const res = buildRes();
    await ctrl.ingest(req, res);
    expect(res.statusCode).toBe(401);
    expect(res.body.code).toBe("AUTH_ERROR");
    expect(svc.processWebhookPayload).not.toHaveBeenCalled();
  });

  test("POST ingest sem header de assinatura: 401", async () => {
    const payload = { object: "whatsapp_business_account", entry: [] };
    const rawBuf = Buffer.from(JSON.stringify(payload), "utf8");
    const req = {
      ip: "127.0.0.1",
      rawBody: rawBuf,
      body: payload,
      get() {
        return "";
      },
    };
    const res = buildRes();
    await ctrl.ingest(req, res);
    expect(res.statusCode).toBe(401);
    expect(svc.processWebhookPayload).not.toHaveBeenCalled();
  });

  test("POST ingest com JSON inválido (mas HMAC válido sobre o lixo): 200 reason=invalid_json", async () => {
    const rawBuf = Buffer.from("nao-eh-json", "utf8");
    const hex = crypto.createHmac("sha256", SECRET).update(rawBuf).digest("hex");
    const req = {
      ip: "127.0.0.1",
      rawBody: rawBuf,
      body: rawBuf, // Buffer
      get(name) {
        if (String(name).toLowerCase() === "x-hub-signature-256") {
          return `sha256=${hex}`;
        }
        return "";
      },
    };
    const res = buildRes();
    await ctrl.ingest(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(false);
    expect(res.body.reason).toBe("invalid_json");
  });

  test("POST ingest com exceção no processador: 200 reason=process_failed", async () => {
    svc.processWebhookPayload.mockRejectedValue(new Error("db down"));
    const payload = { object: "whatsapp_business_account", entry: [] };
    const { req } = buildSignedRequest({ payload });
    const res = buildRes();
    await ctrl.ingest(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(false);
    expect(res.body.reason).toBe("process_failed");
  });
});
