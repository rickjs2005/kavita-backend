/**
 * test/integration/publicCorretoras.leads.int.test.js
 *
 * Reproduz o fluxo real do POST /api/public/corretoras/:slug/leads.
 * Objetivo: detectar onde o submit do formulário público quebra.
 *
 * Cenários:
 *   - payload completo do frontend → deve passar em Zod e chegar no service
 *   - payload mínimo (nome + telefone) → idem
 *   - corretora inexistente → 404
 *   - corretora inativa → 409
 *   - campo enum com valor fora do padrão → 400
 */

"use strict";

const request = require("supertest");
const { makeTestApp } = require("../testUtils");

describe("POST /api/public/corretoras/:slug/leads", () => {
  const MOUNT_PATH = "/api/public/corretoras";

  class FakeAppError extends Error {
    constructor(message, code, status, details) {
      super(message);
      this.name = "AppError";
      this.code = code;
      this.status = status;
      if (details !== undefined) this.details = details;
    }
  }

  let app;
  let publicRepo;
  let leadsRepo;
  let notificationsRepo;

  beforeEach(() => {
    jest.resetModules();

    // Mocks dos repositórios usados pelo service
    publicRepo = { findBySlug: jest.fn() };
    leadsRepo = { create: jest.fn().mockResolvedValue(777) };
    notificationsRepo = { create: jest.fn().mockResolvedValue(undefined) };

    // Silencia turnstile em modo dev (sem TURNSTILE_SECRET_KEY)
    delete process.env.TURNSTILE_SECRET_KEY;

    const appErrorPath = require.resolve("../../errors/AppError");
    jest.doMock(appErrorPath, () => FakeAppError);

    jest.doMock(
      require.resolve("../../repositories/corretorasPublicRepository"),
      () => publicRepo,
    );
    jest.doMock(
      require.resolve("../../repositories/corretoraLeadsRepository"),
      () => leadsRepo,
    );
    jest.doMock(
      require.resolve("../../repositories/corretoraNotificationsRepository"),
      () => notificationsRepo,
    );
    jest.doMock(
      require.resolve("../../services/mailService"),
      () => ({
        sendTransactionalEmail: jest.fn().mockResolvedValue(undefined),
      }),
    );
    jest.doMock(
      require.resolve("../../services/analyticsService"),
      () => ({ track: jest.fn() }),
    );

    const router = require("../../routes/public/publicCorretoras");
    app = makeTestApp(MOUNT_PATH, router);

    jest.spyOn(console, "warn").mockImplementation(() => {});
    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    console.warn.mockRestore?.();
    console.error.mockRestore?.();
  });

  const ACTIVE_CORRETORA = {
    id: 42,
    slug: "cafe-do-joao",
    name: "Café do João",
    email: "joao@example.com",
    contact_name: "João",
    status: "active",
  };

  // Payload IDÊNTICO ao que o LeadContactForm.tsx monta em onSubmit
  const FULL_FRONTEND_PAYLOAD = {
    nome: "Maria Produtora",
    telefone: "(33) 99999-0000",
    cidade: "Manhuaçu",
    mensagem: "Tenho 120 sacas natural da safra atual, quero vender.",
    objetivo: "vender",
    tipo_cafe: "natural",
    volume_range: "50_200",
    canal_preferido: "whatsapp",
    corrego_localidade: "Córrego Pedra Bonita",
    safra_tipo: "atual",
  };

  it("aceita payload completo do frontend (cenário feliz)", async () => {
    publicRepo.findBySlug.mockResolvedValue(ACTIVE_CORRETORA);

    const res = await request(app)
      .post(`${MOUNT_PATH}/cafe-do-joao/leads`)
      .send(FULL_FRONTEND_PAYLOAD);

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ ok: true, data: { id: 777 } });
    expect(leadsRepo.create).toHaveBeenCalledTimes(1);
    const createArgs = leadsRepo.create.mock.calls[0][0];
    expect(createArgs).toMatchObject({
      corretora_id: 42,
      nome: "Maria Produtora",
      telefone: "(33) 99999-0000",
      telefone_normalizado: "5533999990000",
      cidade: "Manhuaçu",
      objetivo: "vender",
      tipo_cafe: "natural",
      volume_range: "50_200",
      canal_preferido: "whatsapp",
      corrego_localidade: "Córrego Pedra Bonita",
      safra_tipo: "atual",
    });
  });

  it("aceita payload mínimo (nome + telefone)", async () => {
    publicRepo.findBySlug.mockResolvedValue(ACTIVE_CORRETORA);

    const res = await request(app)
      .post(`${MOUNT_PATH}/cafe-do-joao/leads`)
      .send({ nome: "Ana Silva", telefone: "33988887777" });

    expect(res.status).toBe(201);
    expect(leadsRepo.create).toHaveBeenCalledTimes(1);
  });

  it("404 quando corretora não existe", async () => {
    publicRepo.findBySlug.mockResolvedValue(null);

    const res = await request(app)
      .post(`${MOUNT_PATH}/nao-existe/leads`)
      .send({ nome: "Ana Silva", telefone: "33988887777" });

    expect(res.status).toBe(404);
    expect(leadsRepo.create).not.toHaveBeenCalled();
  });

  it("409 quando corretora está inativa", async () => {
    publicRepo.findBySlug.mockResolvedValue({
      ...ACTIVE_CORRETORA,
      status: "inactive",
    });

    const res = await request(app)
      .post(`${MOUNT_PATH}/cafe-do-joao/leads`)
      .send({ nome: "Ana Silva", telefone: "33988887777" });

    expect(res.status).toBe(409);
    expect(leadsRepo.create).not.toHaveBeenCalled();
  });

  it("400 quando enum volume_range tem valor inválido", async () => {
    publicRepo.findBySlug.mockResolvedValue(ACTIVE_CORRETORA);

    const res = await request(app)
      .post(`${MOUNT_PATH}/cafe-do-joao/leads`)
      .send({
        ...FULL_FRONTEND_PAYLOAD,
        volume_range: "mega_lote", // inválido
      });

    expect(res.status).toBe(400);
    expect(leadsRepo.create).not.toHaveBeenCalled();
  });

  it("400 quando nome está vazio", async () => {
    publicRepo.findBySlug.mockResolvedValue(ACTIVE_CORRETORA);

    const res = await request(app)
      .post(`${MOUNT_PATH}/cafe-do-joao/leads`)
      .send({ nome: "", telefone: "33988887777" });

    expect(res.status).toBe(400);
  });

  it("400 quando telefone é muito curto", async () => {
    publicRepo.findBySlug.mockResolvedValue(ACTIVE_CORRETORA);

    const res = await request(app)
      .post(`${MOUNT_PATH}/cafe-do-joao/leads`)
      .send({ nome: "Ana Silva", telefone: "123" });

    expect(res.status).toBe(400);
  });

  it("strip token Turnstile do body antes de validar (modo dev)", async () => {
    publicRepo.findBySlug.mockResolvedValue(ACTIVE_CORRETORA);

    const res = await request(app)
      .post(`${MOUNT_PATH}/cafe-do-joao/leads`)
      .send({
        nome: "Ana Silva",
        telefone: "33988887777",
        "cf-turnstile-response": "fake-token-ignored-in-dev",
      });

    expect(res.status).toBe(201);
    const createArgs = leadsRepo.create.mock.calls[0][0];
    expect(createArgs["cf-turnstile-response"]).toBeUndefined();
  });
});
