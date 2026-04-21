// test/unit/services/producerPrivacyService.unit.test.js
//
// Teste crítico: a exportação LGPD NÃO pode vazar senha, token,
// CPF ou dados internos. Mocka os repositórios e confirma a
// projeção segura do payload.
"use strict";

jest.mock("../../../repositories/producerAccountsRepository");
jest.mock("../../../repositories/privacyRequestsRepository");
jest.mock("../../../repositories/corretoraLeadsRepository");
jest.mock("../../../repositories/contratoRepository");

const producerRepo = require("../../../repositories/producerAccountsRepository");
const privacyRepo = require("../../../repositories/privacyRequestsRepository");
const leadsRepo = require("../../../repositories/corretoraLeadsRepository");
const contratoRepo = require("../../../repositories/contratoRepository");

const service = require("../../../services/producerPrivacyService");

describe("producerPrivacyService.buildExportPayload", () => {
  beforeEach(() => {
    producerRepo.findById.mockReset();
    leadsRepo.listByProducerEmail = jest.fn();
    contratoRepo.listByProducerEmail = jest.fn();
  });

  it("retorna payload com dados do titular e contagens", async () => {
    producerRepo.findById.mockResolvedValue({
      id: 42,
      email: "joao@example.com",
      nome: "João Silva",
      cidade: "Manhuaçu",
      telefone: "33999990000",
      created_at: "2026-01-01T00:00:00Z",
      last_login_at: "2026-04-20T10:00:00Z",
      privacy_policy_version: "2026-04-20.1",
      privacy_policy_accepted_at: "2026-04-20T10:00:00Z",
      // Campos que NUNCA devem ir pro export:
      token_version: 3,
      pending_deletion_at: null,
    });
    leadsRepo.listByProducerEmail.mockResolvedValue([
      {
        id: 1,
        corretora_id: 4,
        nome: "João Silva",
        telefone: "33999990000",
        email: "joao@example.com",
        cidade: "Manhuaçu",
        source_ip: "200.0.0.1",
        user_agent: "Mozilla/5.0",
        status: "closed",
        consentimento_contato: 1,
      },
    ]);
    contratoRepo.listByProducerEmail.mockResolvedValue([
      {
        id: 99,
        tipo: "disponivel",
        status: "signed",
        hash_sha256: "abcd" + "f".repeat(60),
        qr_verification_token: "token-uuid",
        signer_envelope_id: "envelope-1",
        signer_document_id: "doc-1",
        pdf_url: "storage/contratos/4/abc.pdf",
      },
    ]);

    const payload = await service.buildExportPayload(42);

    expect(payload.__schema).toBe("kavita.lgpd.export.v1");
    expect(payload.titular.email).toBe("joao@example.com");
    expect(payload.leads_enviados).toHaveLength(1);
    expect(payload.contratos).toHaveLength(1);
  });

  it("NÃO inclui token_version nem campos de sessão no titular", async () => {
    producerRepo.findById.mockResolvedValue({
      id: 42,
      email: "e@x.com",
      nome: "E",
      cidade: null,
      telefone: null,
      created_at: "2026-01-01",
      last_login_at: null,
      privacy_policy_version: null,
      privacy_policy_accepted_at: null,
      token_version: 5,
    });
    leadsRepo.listByProducerEmail.mockResolvedValue([]);
    contratoRepo.listByProducerEmail.mockResolvedValue([]);

    const payload = await service.buildExportPayload(42);
    const json = JSON.stringify(payload);
    // Checamos presença como CHAVE de JSON (ex.: `"token_version":`)
    // para evitar falso-positivo em texto explicativo das
    // `notas_legais` (onde "senhas" aparece legitimamente).
    expect(json).not.toContain('"token_version":');
    expect(json).not.toContain('"password":');
    expect(json).not.toContain('"password_hash":');
    expect(json).not.toContain('"senha":');
    expect(json).not.toContain('"senha_hash":');
    expect(json).not.toContain('"cpf_hash":');
    expect(json).not.toContain('"totp_secret":');
  });

  it("NÃO inclui source_ip, user_agent ou notas internas em leads", async () => {
    producerRepo.findById.mockResolvedValue({
      id: 1,
      email: "e@x.com",
      nome: "X",
      created_at: "2026-01-01",
    });
    leadsRepo.listByProducerEmail.mockResolvedValue([
      {
        id: 10,
        corretora_id: 4,
        nome: "X",
        telefone: "123",
        email: "e@x.com",
        cidade: "Y",
        source_ip: "1.2.3.4-SECRET",
        user_agent: "Evil-Agent",
        nota_interna: "NUNCA-MOSTRAR-AO-TITULAR",
        status: "new",
      },
    ]);
    contratoRepo.listByProducerEmail.mockResolvedValue([]);

    const payload = await service.buildExportPayload(1);
    const json = JSON.stringify(payload);
    expect(json).not.toContain("source_ip");
    expect(json).not.toContain("1.2.3.4-SECRET");
    expect(json).not.toContain("Evil-Agent");
    expect(json).not.toContain("nota_interna");
    expect(json).not.toContain("NUNCA-MOSTRAR-AO-TITULAR");
  });

  it("NÃO inclui envelope_id ou document_id da ClickSign nos contratos", async () => {
    producerRepo.findById.mockResolvedValue({
      id: 1,
      email: "e@x.com",
      nome: "X",
      created_at: "2026-01-01",
    });
    leadsRepo.listByProducerEmail.mockResolvedValue([]);
    contratoRepo.listByProducerEmail.mockResolvedValue([
      {
        id: 7,
        tipo: "disponivel",
        status: "signed",
        hash_sha256: "h".repeat(64),
        qr_verification_token: "tok",
        signer_envelope_id: "SHOULD-NOT-LEAK-envelope-abc",
        signer_document_id: "SHOULD-NOT-LEAK-doc-xyz",
        pdf_url: "storage/contratos/1/x.pdf",
      },
    ]);

    const payload = await service.buildExportPayload(1);
    const json = JSON.stringify(payload);
    expect(json).not.toContain("SHOULD-NOT-LEAK-envelope-abc");
    expect(json).not.toContain("SHOULD-NOT-LEAK-doc-xyz");
    expect(json).not.toContain("pdf_url");
  });

  it("lança 404 se titular não existe", async () => {
    producerRepo.findById.mockResolvedValue(null);
    await expect(service.buildExportPayload(999)).rejects.toMatchObject({
      status: 404,
    });
  });
});

describe("producerPrivacyService.createDeleteRequest", () => {
  beforeEach(() => {
    producerRepo.findById.mockReset();
    producerRepo.setPendingDeletion = jest.fn();
    privacyRepo.findActivePendingDeletion.mockReset();
    privacyRepo.create.mockReset();
  });

  it("rejeita se já existe pedido ativo", async () => {
    producerRepo.findById.mockResolvedValue({
      id: 1,
      email: "e@x.com",
    });
    privacyRepo.findActivePendingDeletion.mockResolvedValue({
      id: 99,
      status: "pending",
    });

    await expect(
      service.createDeleteRequest({ producerId: 1, reason: null, meta: null }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("agenda purga em 30 dias e marca conta", async () => {
    producerRepo.findById.mockResolvedValue({
      id: 1,
      email: "e@x.com",
    });
    privacyRepo.findActivePendingDeletion.mockResolvedValue(null);
    privacyRepo.create.mockResolvedValue(77);

    const before = Date.now();
    const result = await service.createDeleteRequest({
      producerId: 1,
      reason: "teste",
      meta: { ip: "1.2.3.4" },
    });

    expect(result.id).toBe(77);
    const gracedays = Number(process.env.PRIVACY_DELETION_GRACE_DAYS || 30);
    const diffMs = result.scheduled_purge_at.getTime() - before;
    const expectedMs = gracedays * 24 * 3600 * 1000;
    expect(diffMs).toBeGreaterThan(expectedMs - 5000);
    expect(diffMs).toBeLessThan(expectedMs + 5000);

    expect(producerRepo.setPendingDeletion).toHaveBeenCalledWith(
      1,
      expect.any(Date),
    );
  });
});
