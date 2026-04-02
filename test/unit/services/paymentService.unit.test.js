"use strict";

const repoPath = require.resolve("../../../repositories/paymentRepository");
const mpConfigPath = require.resolve("../../../config/mercadopago");

describe("paymentService", () => {
  let svc, repo;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();

    jest.doMock(repoPath, () => ({
      getPedidoById: jest.fn(),
      getTotalPedido: jest.fn(),
      setPedidoStatusPendente: jest.fn(),
      getActiveMethods: jest.fn(),
      getAllMethods: jest.fn(),
      createMethod: jest.fn(),
      findMethodById: jest.fn(),
      updateMethodById: jest.fn(),
      softDeleteMethod: jest.fn(),
    }));

    jest.doMock("mercadopago", () => ({
      Preference: jest.fn().mockImplementation(() => ({
        create: jest.fn(),
      })),
    }));

    jest.doMock(mpConfigPath, () => ({
      getMPClient: jest.fn(),
    }));

    svc = require("../../../services/paymentService");
    repo = require(repoPath);
  });

  // -----------------------------------------------------------------------
  // normalizeFormaPagamento
  // -----------------------------------------------------------------------

  describe("normalizeFormaPagamento", () => {
    test.each([
      ["pix", "pix"],
      ["PIX", "pix"],
      ["boleto", "boleto"],
      ["prazo", "prazo"],
      ["cartao_mp", "cartao"],
      ["cartao-mp", "cartao"],
      ["bank_transfer via pix", "pix"],
      ["ticket boleto", "boleto"],
      ["crédito", "cartao"],
      ["mercadopago", "cartao"],
      ["", ""],
      [null, ""],
      [undefined, ""],
      ["xyz", ""],
    ])("'%s' → '%s'", (input, expected) => {
      expect(svc.normalizeFormaPagamento(input)).toBe(expected);
    });
  });

  // -----------------------------------------------------------------------
  // buildPreferenceBody
  // -----------------------------------------------------------------------

  describe("buildPreferenceBody", () => {
    beforeEach(() => {
      process.env.APP_URL = "https://app.test";
      delete process.env.MP_WEBHOOK_URL;
      delete process.env.NODE_ENV;
    });

    test("monta body com items, back_urls, metadata", () => {
      const body = svc.buildPreferenceBody({ total: 100, pedidoId: 42, formaPagamento: "pix" });

      expect(body.items[0].unit_price).toBe(100);
      expect(body.items[0].id).toBe("pedido-42");
      expect(body.metadata.pedidoId).toBe(42);
      expect(body.back_urls.success).toContain("pedidoId=42");
    });

    test("pix exclui credit_card, debit_card, ticket", () => {
      const body = svc.buildPreferenceBody({ total: 50, pedidoId: 1, formaPagamento: "pix" });

      const excluded = body.payment_methods.excluded_payment_types.map((t) => t.id);
      expect(excluded).toContain("credit_card");
      expect(excluded).not.toContain("bank_transfer");
    });

    test("boleto exclui credit_card, debit_card, bank_transfer", () => {
      const body = svc.buildPreferenceBody({ total: 50, pedidoId: 1, formaPagamento: "boleto" });

      const excluded = body.payment_methods.excluded_payment_types.map((t) => t.id);
      expect(excluded).toContain("bank_transfer");
      expect(excluded).not.toContain("ticket");
    });

    test("cartao exclui bank_transfer, ticket", () => {
      const body = svc.buildPreferenceBody({ total: 50, pedidoId: 1, formaPagamento: "cartao_mp" });

      const excluded = body.payment_methods.excluded_payment_types.map((t) => t.id);
      expect(excluded).toContain("bank_transfer");
      expect(excluded).toContain("ticket");
    });

    test("sem forma reconhecida → sem payment_methods", () => {
      const body = svc.buildPreferenceBody({ total: 50, pedidoId: 1, formaPagamento: "prazo" });

      expect(body.payment_methods).toBeUndefined();
    });

    test("produção → auto_return=approved", () => {
      process.env.NODE_ENV = "production";
      const body = svc.buildPreferenceBody({ total: 50, pedidoId: 1, formaPagamento: "pix" });

      expect(body.auto_return).toBe("approved");
    });

    test("MP_WEBHOOK_URL → notification_url setado", () => {
      process.env.MP_WEBHOOK_URL = "https://hook.test/webhook";
      const body = svc.buildPreferenceBody({ total: 50, pedidoId: 1, formaPagamento: "pix" });

      expect(body.notification_url).toBe("https://hook.test/webhook");
    });
  });

  // -----------------------------------------------------------------------
  // startPayment
  // -----------------------------------------------------------------------

  describe("startPayment", () => {
    beforeEach(() => {
      process.env.APP_URL = "https://app.test";
    });

    test("404 se pedido não existe", async () => {
      repo.getPedidoById.mockResolvedValue(null);

      await expect(svc.startPayment(1, 99)).rejects.toMatchObject({ status: 404 });
    });

    test("404 se usuario_id não bate (ownership)", async () => {
      repo.getPedidoById.mockResolvedValue({ usuario_id: 5, status_pagamento: "pendente" });

      await expect(svc.startPayment(1, 99)).rejects.toMatchObject({ status: 404 });
    });

    test("409 se status não é elegível (já pago)", async () => {
      repo.getPedidoById.mockResolvedValue({ usuario_id: 1, status_pagamento: "pago", forma_pagamento: "pix" });

      await expect(svc.startPayment(1, 1)).rejects.toMatchObject({ status: 409 });
    });

    test("400 se forma_pagamento = 'prazo' (não MP)", async () => {
      repo.getPedidoById.mockResolvedValue({ usuario_id: 1, status_pagamento: "pendente", forma_pagamento: "prazo" });

      await expect(svc.startPayment(1, 1)).rejects.toMatchObject({ status: 400 });
    });

    test("400 se forma_pagamento inválida/vazia", async () => {
      repo.getPedidoById.mockResolvedValue({ usuario_id: 1, status_pagamento: "pendente", forma_pagamento: "" });

      await expect(svc.startPayment(1, 1)).rejects.toMatchObject({ status: 400 });
    });

    test("400 se total <= 0", async () => {
      repo.getPedidoById.mockResolvedValue({ usuario_id: 1, status_pagamento: "pendente", forma_pagamento: "pix" });
      repo.getTotalPedido.mockResolvedValue(0);

      await expect(svc.startPayment(1, 1)).rejects.toMatchObject({ status: 400 });
    });

    test("sucesso retorna preferenceId + init_point", async () => {
      repo.getPedidoById.mockResolvedValue({ usuario_id: 1, status_pagamento: "pendente", forma_pagamento: "pix" });
      repo.getTotalPedido.mockResolvedValue(150);

      const { Preference } = require("mercadopago");
      Preference.mockImplementation(() => ({
        create: jest.fn().mockResolvedValue({
          id: "pref-abc",
          init_point: "https://mp.com/pay",
          sandbox_init_point: "https://sandbox.mp.com/pay",
        }),
      }));

      const result = await svc.startPayment(1, 1);

      expect(result.preferenceId).toBe("pref-abc");
      expect(result.init_point).toBe("https://mp.com/pay");
      expect(repo.setPedidoStatusPendente).toHaveBeenCalledWith(1);
    });
  });

  // -----------------------------------------------------------------------
  // CRUD methods
  // -----------------------------------------------------------------------

  describe("addMethod", () => {
    test("400 se code vazio", async () => {
      await expect(svc.addMethod({ code: "", label: "X" })).rejects.toMatchObject({ status: 400 });
    });

    test("400 se label vazio", async () => {
      await expect(svc.addMethod({ code: "pix", label: "" })).rejects.toMatchObject({ status: 400 });
    });

    test("400 em ER_DUP_ENTRY", async () => {
      repo.createMethod.mockRejectedValue({ code: "ER_DUP_ENTRY" });

      await expect(svc.addMethod({ code: "pix", label: "Pix" })).rejects.toMatchObject({ status: 400 });
    });

    test("sucesso delega ao repo", async () => {
      repo.createMethod.mockResolvedValue({ id: 1, code: "pix", label: "Pix" });

      const result = await svc.addMethod({ code: "pix", label: "Pix", is_active: 1 });

      expect(result.code).toBe("pix");
    });
  });

  describe("editMethod", () => {
    test("400 se id inválido", async () => {
      await expect(svc.editMethod(0, { label: "X" })).rejects.toMatchObject({ status: 400 });
    });

    test("400 se code fornecido mas vazio", async () => {
      await expect(svc.editMethod(1, { code: "" })).rejects.toMatchObject({ status: 400 });
    });

    test("400 se label fornecido mas vazio", async () => {
      await expect(svc.editMethod(1, { label: " " })).rejects.toMatchObject({ status: 400 });
    });

    test("400 se nenhum campo", async () => {
      await expect(svc.editMethod(1, {})).rejects.toMatchObject({ status: 400 });
    });

    test("404 se método não existe", async () => {
      repo.findMethodById.mockResolvedValue(null);

      await expect(svc.editMethod(1, { label: "X" })).rejects.toMatchObject({ status: 404 });
    });

    test("400 em ER_DUP_ENTRY no update", async () => {
      repo.findMethodById.mockResolvedValue({ id: 1 });
      repo.updateMethodById.mockRejectedValue({ code: "ER_DUP_ENTRY" });

      await expect(svc.editMethod(1, { code: "pix" })).rejects.toMatchObject({ status: 400 });
    });

    test("sucesso atualiza campos fornecidos", async () => {
      repo.findMethodById.mockResolvedValue({ id: 1 });
      repo.updateMethodById.mockResolvedValue({ id: 1, label: "PIX 2" });

      const result = await svc.editMethod(1, { label: "PIX 2", description: "", is_active: 0, sort_order: 5 });

      expect(repo.updateMethodById).toHaveBeenCalledWith(
        1,
        expect.arrayContaining(["label = ?", "description = ?", "is_active = ?", "sort_order = ?"]),
        expect.arrayContaining(["PIX 2", null, 0, 5])
      );
    });
  });

  describe("disableMethod", () => {
    test("400 se id inválido", async () => {
      await expect(svc.disableMethod(-1)).rejects.toMatchObject({ status: 400 });
    });

    test("404 se método não existe", async () => {
      repo.findMethodById.mockResolvedValue(null);

      await expect(svc.disableMethod(1)).rejects.toMatchObject({ status: 404 });
    });

    test("sucesso chama softDeleteMethod", async () => {
      repo.findMethodById.mockResolvedValue({ id: 1 });

      await svc.disableMethod(1);

      expect(repo.softDeleteMethod).toHaveBeenCalledWith(1);
    });
  });
});
