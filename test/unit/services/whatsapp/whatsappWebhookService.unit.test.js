/**
 * test/unit/services/whatsapp/whatsappWebhookService.unit.test.js
 *
 * Etapa 4 — webhook Meta. Cobre verifySubscription, verifySignature
 * (HMAC), processWebhookPayload (status updates + inbound),
 * idempotência via provider_message_id.
 */

jest.mock("../../../../repositories/whatsappRepository", () => ({
  findActiveTemplate: jest.fn(),
  findAnyTemplate: jest.fn(),
  insertMessage: jest.fn(),
  updateMessageResult: jest.fn(),
  getMessageById: jest.fn(),
  findMessageByProviderId: jest.fn(),
  updateMessageStatusByProviderId: jest.fn(),
  findInboundByProviderId: jest.fn(),
  insertInbound: jest.fn(),
}));

const crypto = require("node:crypto");
const repo = require("../../../../repositories/whatsappRepository");
const svc = require("../../../../services/whatsapp/whatsappWebhookService");

function hmacOf(rawBody, secret) {
  return crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
}

describe("services/whatsapp/whatsappWebhookService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN = "verify-token-123";
    process.env.WHATSAPP_WEBHOOK_SECRET = "shhh-secret";
  });

  afterEach(() => {
    delete process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
    delete process.env.WHATSAPP_WEBHOOK_SECRET;
  });

  // -------------------------------------------------------------------------
  // verifySubscription (GET hub.challenge)
  // -------------------------------------------------------------------------

  describe("verifySubscription", () => {
    test("ok: token bate, retorna challenge", () => {
      const r = svc.verifySubscription({
        "hub.mode": "subscribe",
        "hub.verify_token": "verify-token-123",
        "hub.challenge": "1357",
      });
      expect(r.ok).toBe(true);
      expect(r.challenge).toBe("1357");
    });

    test("falha: token errado", () => {
      const r = svc.verifySubscription({
        "hub.mode": "subscribe",
        "hub.verify_token": "wrong",
        "hub.challenge": "1",
      });
      expect(r.ok).toBe(false);
      expect(r.reason).toBe("invalid_token");
    });

    test("falha: mode errado", () => {
      const r = svc.verifySubscription({
        "hub.mode": "unsubscribe",
        "hub.verify_token": "verify-token-123",
      });
      expect(r.ok).toBe(false);
      expect(r.reason).toBe("invalid_mode");
    });

    test("falha: env nao configurada", () => {
      delete process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
      const r = svc.verifySubscription({
        "hub.mode": "subscribe",
        "hub.verify_token": "anything",
      });
      expect(r.ok).toBe(false);
      expect(r.reason).toBe("verify_token_not_configured");
    });
  });

  // -------------------------------------------------------------------------
  // verifySignature (HMAC-SHA256)
  // -------------------------------------------------------------------------

  describe("verifySignature", () => {
    test("ok: assinatura correta com prefixo sha256=", () => {
      const raw = Buffer.from('{"x":1}', "utf8");
      const sig = "sha256=" + hmacOf(raw, "shhh-secret");
      expect(svc.verifySignature({ rawBody: raw, signatureHeader: sig })).toBe(
        true,
      );
    });

    test("ok: aceita assinatura sem prefixo", () => {
      const raw = Buffer.from('{"x":1}', "utf8");
      const sig = hmacOf(raw, "shhh-secret");
      expect(svc.verifySignature({ rawBody: raw, signatureHeader: sig })).toBe(
        true,
      );
    });

    test("falha: assinatura quebrada", () => {
      const raw = Buffer.from('{"x":1}', "utf8");
      expect(
        svc.verifySignature({
          rawBody: raw,
          signatureHeader: "sha256=deadbeef",
        }),
      ).toBe(false);
    });

    test("falha: secret nao configurado", () => {
      delete process.env.WHATSAPP_WEBHOOK_SECRET;
      const raw = Buffer.from('{"x":1}', "utf8");
      expect(
        svc.verifySignature({
          rawBody: raw,
          signatureHeader: "sha256=anything",
        }),
      ).toBe(false);
    });

    test("falha: rawBody vazio", () => {
      expect(
        svc.verifySignature({
          rawBody: Buffer.alloc(0),
          signatureHeader: "sha256=anything",
        }),
      ).toBe(false);
    });

    test("timing-safe: rejeita comprimentos diferentes sem throw", () => {
      const raw = Buffer.from('{"x":1}', "utf8");
      expect(
        svc.verifySignature({ rawBody: raw, signatureHeader: "sha256=abc" }),
      ).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // processWebhookPayload — status updates
  // -------------------------------------------------------------------------

  describe("processWebhookPayload — status", () => {
    function statusEvent(id, status) {
      return {
        object: "whatsapp_business_account",
        entry: [
          {
            changes: [
              {
                field: "messages",
                value: {
                  statuses: [
                    {
                      id,
                      status,
                      timestamp: "1700000000",
                      recipient_id: "5533999991234",
                    },
                  ],
                },
              },
            ],
          },
        ],
      };
    }

    test("delivered: chama repo.updateMessageStatusByProviderId", async () => {
      repo.updateMessageStatusByProviderId.mockResolvedValue({
        updated: true,
        fromStatus: "sent",
        toStatus: "delivered",
      });
      const summary = await svc.processWebhookPayload(
        statusEvent("wamid.aaa", "delivered"),
      );
      expect(summary.processedStatuses).toBe(1);
      expect(summary.skippedStatuses).toBe(0);
      expect(repo.updateMessageStatusByProviderId).toHaveBeenCalledWith(
        "wamid.aaa",
        "delivered",
        expect.objectContaining({
          timestamp: expect.any(Date),
          error_message: null,
        }),
      );
    });

    test("read após delivered: passa direto pro repo (idempotência mora lá)", async () => {
      repo.updateMessageStatusByProviderId.mockResolvedValue({
        updated: true,
        fromStatus: "delivered",
        toStatus: "read",
      });
      const summary = await svc.processWebhookPayload(
        statusEvent("wamid.bbb", "read"),
      );
      expect(summary.processedStatuses).toBe(1);
    });

    test("status duplicado: skipped no summary", async () => {
      repo.updateMessageStatusByProviderId.mockResolvedValue({
        updated: false,
        fromStatus: "delivered",
        toStatus: "delivered",
      });
      const summary = await svc.processWebhookPayload(
        statusEvent("wamid.ccc", "delivered"),
      );
      expect(summary.processedStatuses).toBe(0);
      expect(summary.skippedStatuses).toBe(1);
    });

    test("failed com errors[]: passa error_message para o repo", async () => {
      repo.updateMessageStatusByProviderId.mockResolvedValue({
        updated: true,
        fromStatus: "sent",
        toStatus: "failed",
      });
      await svc.processWebhookPayload({
        object: "whatsapp_business_account",
        entry: [
          {
            changes: [
              {
                field: "messages",
                value: {
                  statuses: [
                    {
                      id: "wamid.fff",
                      status: "failed",
                      timestamp: "1700000000",
                      errors: [
                        {
                          code: 131026,
                          title: "Message Undeliverable",
                          message: "Recipient cannot receive",
                        },
                      ],
                    },
                  ],
                },
              },
            ],
          },
        ],
      });
      expect(repo.updateMessageStatusByProviderId).toHaveBeenCalledWith(
        "wamid.fff",
        "failed",
        expect.objectContaining({
          error_message: expect.stringContaining("Message Undeliverable"),
        }),
      );
    });

    test("status desconhecido (ex.: 'deleted'): ignorado", async () => {
      const summary = await svc.processWebhookPayload(
        statusEvent("wamid.ddd", "deleted"),
      );
      expect(summary.processedStatuses).toBe(0);
      expect(summary.skippedStatuses).toBe(1);
      expect(repo.updateMessageStatusByProviderId).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // processWebhookPayload — inbound
  // -------------------------------------------------------------------------

  describe("processWebhookPayload — inbound", () => {
    function inboundTextEvent(id, body) {
      return {
        object: "whatsapp_business_account",
        entry: [
          {
            changes: [
              {
                field: "messages",
                value: {
                  messages: [
                    {
                      id,
                      from: "5533999991234",
                      timestamp: "1700000000",
                      type: "text",
                      text: { body },
                    },
                  ],
                },
              },
            ],
          },
        ],
      };
    }

    test("texto novo: insere em whatsapp_inbound", async () => {
      repo.findInboundByProviderId.mockResolvedValue(null);
      repo.insertInbound.mockResolvedValue({ id: 7 });
      const summary = await svc.processWebhookPayload(
        inboundTextEvent("wamid.in1", "Quero vender 100 sacas"),
      );
      expect(summary.insertedInbound).toBe(1);
      expect(repo.insertInbound).toHaveBeenCalledWith(
        expect.objectContaining({
          sender_phone: "5533999991234",
          provider_message_id: "wamid.in1",
          body: "Quero vender 100 sacas",
          media_url: null,
        }),
      );
    });

    test("idempotência: provider_message_id repetido => duplicateInbound", async () => {
      repo.findInboundByProviderId.mockResolvedValue({ id: 1 });
      const summary = await svc.processWebhookPayload(
        inboundTextEvent("wamid.in2", "oi"),
      );
      expect(summary.insertedInbound).toBe(0);
      expect(summary.duplicateInbound).toBe(1);
      expect(repo.insertInbound).not.toHaveBeenCalled();
    });

    test("media (imagem com caption): persiste meta://media/<id> + caption", async () => {
      repo.findInboundByProviderId.mockResolvedValue(null);
      repo.insertInbound.mockResolvedValue({ id: 9 });
      await svc.processWebhookPayload({
        object: "whatsapp_business_account",
        entry: [
          {
            changes: [
              {
                field: "messages",
                value: {
                  messages: [
                    {
                      id: "wamid.img",
                      from: "5533999991234",
                      timestamp: "1700000000",
                      type: "image",
                      image: { id: "media-abc", caption: "amostra do café" },
                    },
                  ],
                },
              },
            ],
          },
        ],
      });
      const arg = repo.insertInbound.mock.calls[0][0];
      expect(arg.media_url).toBe("meta://media/media-abc");
      expect(arg.body).toBe("amostra do café");
    });
  });

  // -------------------------------------------------------------------------
  // payloads não-aplicáveis
  // -------------------------------------------------------------------------

  test("payload object diferente de whatsapp_business_account: ignora", async () => {
    const summary = await svc.processWebhookPayload({
      object: "instagram",
      entry: [],
    });
    expect(summary.ignored).toBe(1);
    expect(repo.updateMessageStatusByProviderId).not.toHaveBeenCalled();
  });

  test("payload null: retorna ignored", async () => {
    const summary = await svc.processWebhookPayload(null);
    expect(summary.ignored).toBe(1);
  });
});
