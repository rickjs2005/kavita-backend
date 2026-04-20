// test/unit/services/clicksignAdapter.unit.test.js
//
// Cobertura unit do adapter ClickSign (Fase 10.1 — PR 2):
// verifySignature (HMAC timing-safe) e translateWebhookEvent
// (mapeamento de event → domain event).
"use strict";

const crypto = require("crypto");

const adapter = require("../../../services/contratos/clicksignAdapter");

describe("clicksignAdapter.verifySignature", () => {
  const ORIGINAL_SECRET = process.env.CLICKSIGN_HMAC_SECRET;

  beforeAll(() => {
    process.env.CLICKSIGN_HMAC_SECRET = "segredo-de-teste";
  });
  afterAll(() => {
    process.env.CLICKSIGN_HMAC_SECRET = ORIGINAL_SECRET;
  });

  function sign(rawBody, secret = "segredo-de-teste") {
    return crypto
      .createHmac("sha256", secret)
      .update(Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody, "utf8"))
      .digest("hex");
  }

  it("aceita assinatura válida com prefixo sha256=", () => {
    const raw = '{"event":{"name":"auto_close"}}';
    const hex = sign(raw);
    const ok = adapter.verifySignature({
      rawBody: Buffer.from(raw, "utf8"),
      signatureHeader: `sha256=${hex}`,
    });
    expect(ok).toBe(true);
  });

  it("aceita assinatura sem prefixo sha256=", () => {
    const raw = '{"event":{"name":"close"}}';
    const hex = sign(raw);
    const ok = adapter.verifySignature({
      rawBody: raw,
      signatureHeader: hex,
    });
    expect(ok).toBe(true);
  });

  it("rejeita assinatura com chave errada", () => {
    const raw = '{"a":1}';
    const hex = sign(raw, "outra-chave");
    const ok = adapter.verifySignature({
      rawBody: raw,
      signatureHeader: `sha256=${hex}`,
    });
    expect(ok).toBe(false);
  });

  it("rejeita quando header ausente", () => {
    const ok = adapter.verifySignature({
      rawBody: "{}",
      signatureHeader: "",
    });
    expect(ok).toBe(false);
  });

  it("rejeita quando HMAC_SECRET não configurado", () => {
    const prev = process.env.CLICKSIGN_HMAC_SECRET;
    delete process.env.CLICKSIGN_HMAC_SECRET;
    const raw = "{}";
    const hex = crypto
      .createHmac("sha256", "qualquer")
      .update(raw)
      .digest("hex");
    const ok = adapter.verifySignature({
      rawBody: raw,
      signatureHeader: `sha256=${hex}`,
    });
    expect(ok).toBe(false);
    process.env.CLICKSIGN_HMAC_SECRET = prev;
  });

  it("rejeita header malformado (não hexadecimal de 64 chars)", () => {
    const ok = adapter.verifySignature({
      rawBody: "{}",
      signatureHeader: "sha256=lixo-nao-hex",
    });
    expect(ok).toBe(false);
  });
});

describe("clicksignAdapter.translateWebhookEvent", () => {
  const base = {
    document: { key: "doc-abc-123" },
    event: { occurred_at: "2026-04-20T15:00:00Z" },
  };

  it("mapeia auto_close → signed", () => {
    const result = adapter.translateWebhookEvent({
      ...base,
      event: { ...base.event, name: "auto_close" },
    });
    expect(result).toMatchObject({
      provider: "clicksign",
      event_type: "auto_close",
      status_hint: "signed",
      document_id: "doc-abc-123",
    });
    expect(result.provider_event_id).toContain("doc-abc-123");
    expect(result.provider_event_id).toContain("auto_close");
  });

  it("mapeia cancel → cancelled com motivo", () => {
    const result = adapter.translateWebhookEvent({
      ...base,
      event: { ...base.event, name: "cancel" },
    });
    expect(result.status_hint).toBe("cancelled");
    expect(result.cancel_reason).toMatch(/ClickSign/i);
  });

  it("mapeia refuse → cancelled com motivo de recusa", () => {
    const result = adapter.translateWebhookEvent({
      ...base,
      event: { ...base.event, name: "refuse" },
    });
    expect(result.status_hint).toBe("cancelled");
    expect(result.cancel_reason).toMatch(/recusad/i);
  });

  it("mapeia deadline → expired", () => {
    const result = adapter.translateWebhookEvent({
      ...base,
      event: { ...base.event, name: "deadline" },
    });
    expect(result.status_hint).toBe("expired");
  });

  it("retorna status_hint null para eventos informativos (sign parcial)", () => {
    const result = adapter.translateWebhookEvent({
      ...base,
      event: { ...base.event, name: "sign" },
    });
    expect(result.status_hint).toBeNull();
    expect(result.event_type).toBe("sign");
  });

  it("retorna null para payload vazio ou sem event.name", () => {
    expect(adapter.translateWebhookEvent({})).toBeNull();
    expect(adapter.translateWebhookEvent(null)).toBeNull();
    expect(adapter.translateWebhookEvent({ event: {} })).toBeNull();
  });

  it("provider_event_id é determinístico para o mesmo evento (idempotência)", () => {
    const payload = {
      ...base,
      event: { ...base.event, name: "auto_close" },
    };
    const a = adapter.translateWebhookEvent(payload);
    const b = adapter.translateWebhookEvent(payload);
    expect(a.provider_event_id).toBe(b.provider_event_id);
  });
});

describe("clicksignAdapter.isConfigured", () => {
  it("false quando faltam envs", () => {
    const prevToken = process.env.CLICKSIGN_API_TOKEN;
    const prevSecret = process.env.CLICKSIGN_HMAC_SECRET;
    delete process.env.CLICKSIGN_API_TOKEN;
    delete process.env.CLICKSIGN_HMAC_SECRET;
    expect(adapter.isConfigured()).toBe(false);
    process.env.CLICKSIGN_API_TOKEN = prevToken;
    process.env.CLICKSIGN_HMAC_SECRET = prevSecret;
  });

  it("true quando as duas envs estão setadas", () => {
    const prevToken = process.env.CLICKSIGN_API_TOKEN;
    const prevSecret = process.env.CLICKSIGN_HMAC_SECRET;
    process.env.CLICKSIGN_API_TOKEN = "tok";
    process.env.CLICKSIGN_HMAC_SECRET = "sec";
    expect(adapter.isConfigured()).toBe(true);
    process.env.CLICKSIGN_API_TOKEN = prevToken;
    process.env.CLICKSIGN_HMAC_SECRET = prevSecret;
  });
});
