/**
 * test/unit/services/supportConfigService.unit.test.js
 *
 * Testa services/supportConfigService.js
 * - Mock do repository
 * - Cobre normalize (bools/JSON), getConfig, updateConfig (merge parcial), getPublicConfig
 */

"use strict";

describe("services/supportConfigService", () => {
  const repoPath = require.resolve("../../../repositories/supportConfigRepository");

  let svc;
  let repo;

  // DB row default — todas as flags como 1, JSON serializados como string
  const dbRow = (overrides = {}) => ({
    id: 1,
    hero_badge: "Central",
    hero_title: "Precisa de ajuda?",
    hero_highlight: "Estamos com voce.",
    hero_description: "Tire duvidas...",
    hero_cta_primary: "Falar pelo WhatsApp",
    hero_cta_secondary: "Enviar mensagem",
    hero_sla: "Resposta em 24h",
    hero_schedule: "Seg-sex 8-18h",
    hero_status: "Ativo",
    whatsapp_button_label: "WhatsApp",
    show_whatsapp_widget: 1,
    show_chatbot: 1,
    show_faq: 1,
    show_form: 1,
    show_trust: 1,
    form_title: "Fale conosco",
    form_subtitle: "Descreva sua duvida",
    form_success_title: "Recebido",
    form_success_message: "Em breve retornamos",
    faq_title: "Duvidas",
    faq_subtitle: "Respostas rapidas",
    faq_topics: '[{"title":"Entrega","description":"...","content":[],"icon":"truck","priority":1,"active":true,"highlighted":true}]',
    trust_title: "Confianca",
    trust_subtitle: "Empresa real",
    trust_items: '[{"label":"Rapido","desc":"24h","icon":"bolt","color":"text-amber-500"}]',
    ...overrides,
  });

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();

    jest.doMock(repoPath, () => ({
      ensureConfig: jest.fn().mockResolvedValue(1),
      findById: jest.fn(),
      updateById: jest.fn().mockResolvedValue(undefined),
      findPublicConfig: jest.fn(),
    }));

    repo = require(repoPath);
    svc = require("../../../services/supportConfigService");
  });

  describe("getConfig()", () => {
    test("garante singleton (ensureConfig) e retorna row normalizada", async () => {
      repo.findById.mockResolvedValueOnce(dbRow());

      const result = await svc.getConfig();

      expect(repo.ensureConfig).toHaveBeenCalledTimes(1);
      expect(repo.findById).toHaveBeenCalledWith(1);
      expect(result).toBeTruthy();
    });

    test("normaliza tinyint(1) para boolean", async () => {
      repo.findById.mockResolvedValueOnce(dbRow({
        show_whatsapp_widget: 0,
        show_chatbot: 1,
        show_faq: 0,
        show_form: 1,
        show_trust: 0,
      }));

      const result = await svc.getConfig();

      expect(result.show_whatsapp_widget).toBe(false);
      expect(result.show_chatbot).toBe(true);
      expect(result.show_faq).toBe(false);
      expect(result.show_form).toBe(true);
      expect(result.show_trust).toBe(false);
    });

    test("parseia faq_topics e trust_items de string JSON", async () => {
      repo.findById.mockResolvedValueOnce(dbRow());

      const result = await svc.getConfig();

      expect(Array.isArray(result.faq_topics)).toBe(true);
      expect(result.faq_topics[0].title).toBe("Entrega");
      expect(Array.isArray(result.trust_items)).toBe(true);
      expect(result.trust_items[0].label).toBe("Rapido");
    });

    test("aceita faq_topics ja como array (compatibilidade)", async () => {
      repo.findById.mockResolvedValueOnce(dbRow({
        faq_topics: [{ title: "Direto", description: "ok" }],
      }));

      const result = await svc.getConfig();

      expect(Array.isArray(result.faq_topics)).toBe(true);
      expect(result.faq_topics[0].title).toBe("Direto");
    });

    test("JSON invalido em faq_topics → null sem crashar", async () => {
      repo.findById.mockResolvedValueOnce(dbRow({ faq_topics: "{not valid" }));

      const result = await svc.getConfig();

      expect(result.faq_topics).toBeNull();
    });
  });

  describe("updateConfig()", () => {
    test("merge parcial: salva apenas campos enviados", async () => {
      repo.findById
        .mockResolvedValueOnce(dbRow()) // current
        .mockResolvedValueOnce(dbRow({ hero_title: "Novo titulo" })); // after update

      await svc.updateConfig({ hero_title: "Novo titulo" });

      expect(repo.updateById).toHaveBeenCalledTimes(1);
      const [, updateData] = repo.updateById.mock.calls[0];
      expect(updateData).toEqual({ hero_title: "Novo titulo" });
      // Nao deve incluir campos nao enviados
      expect(updateData).not.toHaveProperty("hero_badge");
    });

    test("converte boolean para tinyint na escrita", async () => {
      repo.findById
        .mockResolvedValueOnce(dbRow())
        .mockResolvedValueOnce(dbRow({ show_chatbot: 0 }));

      await svc.updateConfig({ show_chatbot: false });

      const [, updateData] = repo.updateById.mock.calls[0];
      expect(updateData.show_chatbot).toBe(0);
    });

    test("serializa faq_topics como JSON string", async () => {
      repo.findById
        .mockResolvedValueOnce(dbRow())
        .mockResolvedValueOnce(dbRow());

      const newTopics = [{ title: "T1", description: "d", content: [], icon: "", priority: 0, active: true, highlighted: false }];
      await svc.updateConfig({ faq_topics: newTopics });

      const [, updateData] = repo.updateById.mock.calls[0];
      expect(typeof updateData.faq_topics).toBe("string");
      expect(JSON.parse(updateData.faq_topics)).toEqual(newTopics);
    });

    test("faq_topics null → salva null", async () => {
      repo.findById
        .mockResolvedValueOnce(dbRow())
        .mockResolvedValueOnce(dbRow({ faq_topics: null }));

      await svc.updateConfig({ faq_topics: null });

      const [, updateData] = repo.updateById.mock.calls[0];
      expect(updateData.faq_topics).toBeNull();
    });

    test("retorna config normalizada apos update", async () => {
      repo.findById
        .mockResolvedValueOnce(dbRow())
        .mockResolvedValueOnce(dbRow({ hero_title: "X", show_chatbot: 0 }));

      const result = await svc.updateConfig({ hero_title: "X", show_chatbot: false });

      expect(result.hero_title).toBe("X");
      expect(result.show_chatbot).toBe(false);
    });
  });

  describe("getPublicConfig()", () => {
    test("garante singleton e retorna row publica normalizada", async () => {
      repo.findPublicConfig.mockResolvedValueOnce(dbRow());

      const result = await svc.getPublicConfig();

      expect(repo.ensureConfig).toHaveBeenCalled();
      expect(repo.findPublicConfig).toHaveBeenCalled();
      expect(result.show_chatbot).toBe(true);
      expect(Array.isArray(result.faq_topics)).toBe(true);
    });

    test("retorna null quando nao ha row no banco", async () => {
      repo.findPublicConfig.mockResolvedValueOnce(null);

      const result = await svc.getPublicConfig();

      expect(result).toBeNull();
    });
  });
});
