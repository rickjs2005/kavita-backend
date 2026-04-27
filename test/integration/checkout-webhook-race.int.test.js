"use strict";
// test/integration/checkout-webhook-race.int.test.js
//
// Integração contra MySQL REAL (kavita_migrations_test).
//
// Por que rodar contra DB real:
//   Mocks não pegam mismatches entre o SQL do repository e o schema vivente
//   da tabela `webhook_events` — exatamente o problema que motivou esta
//   sprint (ADR docs/decisions/0001-webhook-events-unified-schema.md).
//   A partir desta sprint, toda integração externa (gateway, contratos,
//   KYC) deve ter pelo menos 1 teste contra banco real.
//
// O que está mockado:
//   - SDK do Mercado Pago (Payment.get) — API externa, não disponível em CI
//   - services/comunicacaoService — fluxo fire-and-forget de notificação
//
// O que é REAL:
//   - Pool MySQL conectado em DB_NAME_TEST
//   - Middleware validateMPSignature (HMAC + timing-safe)
//   - paymentWebhookService → paymentRepository → tabela webhook_events
//   - Tabela `pedidos`
//
// Cenários:
//   1. Caminho feliz — webhook approved processa pedido + grava webhook_event
//   2. Pedido órfão — webhook com pedidoId inexistente é parqueado (PARKED:*)
//   3. Idempotência — mesmo evento 3x produz 1 row em webhook_events

const crypto = require("crypto");
const request = require("supertest");
const express = require("express");

// IMPORTANTE: setar antes de qualquer require que dependa de config.
process.env.DB_NAME = process.env.DB_NAME_TEST || "kavita_migrations_test";
process.env.MP_WEBHOOK_SECRET = "test-webhook-secret-32chars-long!";

// Mock SDK Mercado Pago — exposed via module export pra cada test poder
// re-configurar a resposta esperada.
const mockPaymentGet = jest.fn();
jest.mock("mercadopago", () => ({
  Payment: jest.fn().mockImplementation(() => ({ get: mockPaymentGet })),
}));
jest.mock("../../config/mercadopago", () => ({ getMPClient: jest.fn(() => ({})) }));

// Mock fire-and-forget de notificação para evitar crashes pós-teardown
// (o service usa setImmediate + require lazy de comunicacaoService).
jest.mock("../../services/comunicacaoService", () => ({
  dispararEventoComunicacao: jest.fn().mockResolvedValue(undefined),
}));

// Pool e router são REAIS — depois dos mocks acima.
const pool = require("../../config/pool");
const paymentRouter = require("../../routes/ecommerce/payment");
const errorHandler = require("../../middleware/errorHandler");

const TEST_SECRET = process.env.MP_WEBHOOK_SECRET;
const TEST_EMAIL = "webhook-race-int-test@kavita.test";
const EVENT_PREFIX = "integration-test-webhook-race-";

let app;
let testUserId;
let testPedidoId;

function signWebhook(dataId, ts, requestId) {
  const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
  const hmac = crypto.createHmac("sha256", TEST_SECRET).update(manifest).digest("hex");
  return `ts=${ts},v1=${hmac}`;
}

async function cleanupFixtures() {
  await pool.query(
    `DELETE FROM webhook_events
       WHERE provider = 'mercadopago'
         AND provider_event_id LIKE ?`,
    [`${EVENT_PREFIX}%`]
  );
  if (testUserId) {
    await pool.query("DELETE FROM pedidos WHERE usuario_id = ?", [testUserId]);
  }
  await pool.query("DELETE FROM usuarios WHERE email = ?", [TEST_EMAIL]);
}

beforeAll(async () => {
  app = express();
  app.use(express.json());
  app.use("/api/payment", paymentRouter);
  app.use(errorHandler);

  await cleanupFixtures();

  const [userResult] = await pool.query(
    `INSERT INTO usuarios (nome, email, senha, status_conta, criado_em)
     VALUES (?, ?, ?, 'ativo', NOW())`,
    ["Webhook Race Test", TEST_EMAIL, "test-hash-not-real"]
  );
  testUserId = userResult.insertId;

  const [pedidoResult] = await pool.query(
    `INSERT INTO pedidos
        (usuario_id, endereco, forma_pagamento, total, status_pagamento)
     VALUES (?, '{}', 'pix', 99.99, 'pendente')`,
    [testUserId]
  );
  testPedidoId = pedidoResult.insertId;
});

afterAll(async () => {
  await cleanupFixtures();
  // Pool fica aberto para outros testes que rodem depois — é singleton de
  // process. Jest pode reclamar de open handles; aceitável para este caso.
});

afterEach(async () => {
  // Drena setImmediate da notificação pós-aprovado (igual ao unit test).
  await new Promise((resolve) => setImmediate(resolve));
});

describe("Webhook MP race condition (integração contra MySQL real)", () => {
  test("1. caminho feliz: webhook approved → pedido pago + webhook_event processado", async () => {
    mockPaymentGet.mockResolvedValue({
      status: "approved",
      metadata: { pedidoId: testPedidoId },
    });

    const eventId = `${EVENT_PREFIX}happy-path`;
    const dataId = "mp-payment-1";
    const ts = String(Date.now());
    const reqId = "req-int-1";
    const signature = signWebhook(dataId, ts, reqId);

    const res = await request(app)
      .post("/api/payment/webhook")
      .set("x-signature", signature)
      .set("x-request-id", reqId)
      .send({ id: eventId, type: "payment", data: { id: dataId } });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);

    // 1.a — webhook_event registrado e processado
    const [eventRows] = await pool.query(
      `SELECT processed_at, processing_error, retry_count
         FROM webhook_events
        WHERE provider = 'mercadopago' AND provider_event_id = ?`,
      [eventId]
    );
    expect(eventRows).toHaveLength(1);
    expect(eventRows[0].processed_at).not.toBeNull();
    expect(eventRows[0].processing_error).toBeNull();

    // 1.b — pedido virou pago de fato
    const [pedidoRows] = await pool.query(
      "SELECT status_pagamento, pagamento_id FROM pedidos WHERE id = ?",
      [testPedidoId]
    );
    expect(pedidoRows[0].status_pagamento).toBe("pago");
    expect(pedidoRows[0].pagamento_id).toBe(dataId);
  });

  test("2. pedido órfão: webhook com pedidoId inexistente vira PARKED:PENDING_ORDER_MATCH", async () => {
    const ORPHAN_PEDIDO_ID = 999999999; // não existe na tabela
    mockPaymentGet.mockResolvedValue({
      status: "approved",
      metadata: { pedidoId: ORPHAN_PEDIDO_ID },
    });

    const eventId = `${EVENT_PREFIX}orphan-park`;
    const dataId = "mp-payment-2";
    const ts = String(Date.now());
    const reqId = "req-int-2";
    const signature = signWebhook(dataId, ts, reqId);

    const res = await request(app)
      .post("/api/payment/webhook")
      .set("x-signature", signature)
      .set("x-request-id", reqId)
      .send({ id: eventId, type: "payment", data: { id: dataId } });

    // 200 — MP não retentar; evento parqueado intencionalmente
    expect(res.status).toBe(200);

    const [eventRows] = await pool.query(
      `SELECT processed_at, processing_error, retry_count
         FROM webhook_events
        WHERE provider = 'mercadopago' AND provider_event_id = ?`,
      [eventId]
    );
    expect(eventRows).toHaveLength(1);
    // processed_at NULL = aguarda retry futuro
    expect(eventRows[0].processed_at).toBeNull();
    // marker PARKED:* no formato canônico
    expect(eventRows[0].processing_error).toBe(
      `PARKED:PENDING_ORDER_MATCH:pedidoId=${ORPHAN_PEDIDO_ID}`
    );

    // findParkedPendingOrderMatch vê este registro
    const repo = require("../../repositories/paymentRepository");
    const parked = await repo.findParkedPendingOrderMatch(10);
    const ours = parked.find((r) => r.provider_event_id === eventId);
    expect(ours).toBeTruthy();
    expect(ours.processing_error).toMatch(/^PARKED:PENDING_ORDER_MATCH:/);
  });

  test("3. idempotência: mesmo webhook 3x produz 1 row em webhook_events", async () => {
    // Reset do pedido para simular novo pagamento.
    await pool.query(
      "UPDATE pedidos SET status_pagamento = 'pendente', pagamento_id = NULL WHERE id = ?",
      [testPedidoId]
    );

    mockPaymentGet.mockResolvedValue({
      status: "approved",
      metadata: { pedidoId: testPedidoId },
    });

    const eventId = `${EVENT_PREFIX}idempotency`;
    const dataId = "mp-payment-3";
    const ts = String(Date.now());
    const reqId = "req-int-3";
    const signature = signWebhook(dataId, ts, reqId);

    const payload = { id: eventId, type: "payment", data: { id: dataId } };

    // Dispara 3 vezes seguidas (simula re-delivery do MP).
    for (let i = 0; i < 3; i++) {
      const res = await request(app)
        .post("/api/payment/webhook")
        .set("x-signature", signature)
        .set("x-request-id", reqId)
        .send(payload);
      expect(res.status).toBe(200);
    }

    // UNIQUE (provider, provider_event_id) garante 1 row
    const [eventRows] = await pool.query(
      `SELECT id, processed_at, retry_count
         FROM webhook_events
        WHERE provider = 'mercadopago' AND provider_event_id = ?`,
      [eventId]
    );
    expect(eventRows).toHaveLength(1);
    expect(eventRows[0].processed_at).not.toBeNull();

    // Pedido pago — não regrediu nem duplicou.
    const [pedidoRows] = await pool.query(
      "SELECT status_pagamento FROM pedidos WHERE id = ?",
      [testPedidoId]
    );
    expect(pedidoRows[0].status_pagamento).toBe("pago");
  });
});
