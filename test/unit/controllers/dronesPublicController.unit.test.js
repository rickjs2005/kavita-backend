"use strict";

jest.mock("../../../services/dronesService");
jest.mock("../../../services/mediaService", () => ({
  persistMedia: jest.fn(),
}));
jest.mock("../../../controllers/drones/dronesFormatters", () => ({
  classify: jest.fn(),
  safeUnlink: jest.fn(),
  parseJsonField: jest.fn((v) => (typeof v === "string" ? JSON.parse(v) : v)),
  extractItems: jest.fn((r) => (Array.isArray(r) ? r : r?.items || [])),
  parseModelKey: jest.fn((v) => String(v).trim().toLowerCase()),
  ensureModelExists: jest.fn().mockResolvedValue({ key: "t25p", label: "T25P" }),
  DEFAULT_DRONE_MODELS: [{ key: "default", label: "Default" }],
}));

const dronesService = require("../../../services/dronesService");
const formatters = require("../../../controllers/drones/dronesFormatters");
const ctrl = require("../../../controllers/dronesPublicController");

function makeRes() {
  return {
    _status: 200,
    _body: null,
    status(code) { this._status = code; return this; },
    json(body) { this._body = body; return this; },
  };
}

describe("dronesPublicController", () => {
  beforeEach(() => jest.clearAllMocks());

  // -----------------------------------------------------------------------
  // getPage
  // -----------------------------------------------------------------------

  test("getPage retorna null se sem settings", async () => {
    dronesService.getPageSettings.mockResolvedValue(null);
    const res = makeRes();
    const next = jest.fn();

    await ctrl.getPage({}, res, next);

    expect(res._body.ok).toBe(true);
    expect(res._body.data ?? null).toBeNull();
  });

  test("getPage retorna settings com JSON parsed", async () => {
    dronesService.getPageSettings.mockResolvedValue({
      hero_title: "Title",
      specs_items_json: '["a"]',
      features_items_json: '["b"]',
      benefits_items_json: '["c"]',
      sections_order_json: '["d"]',
      models_json: '{"t25p":{}}',
    });
    const res = makeRes();

    await ctrl.getPage({}, res, jest.fn());

    expect(res._body.ok).toBe(true);
    expect(res._body.data.hero_title).toBe("Title");
  });

  test("getPage propaga erro como AppError", async () => {
    dronesService.getPageSettings.mockRejectedValue(new Error("db"));
    const next = jest.fn();

    await ctrl.getPage({}, makeRes(), next);

    expect(next).toHaveBeenCalled();
    expect(next.mock.calls[0][0].status).toBe(500);
  });

  // -----------------------------------------------------------------------
  // getRoot
  // -----------------------------------------------------------------------

  test("getRoot retorna landing + gallery + comments sem model", async () => {
    dronesService.getPageSettings.mockResolvedValue({
      hero_title: "H", hero_subtitle: "S",
      hero_video_path: null, hero_image_fallback_path: null,
      cta_title: null, cta_message_template: null, cta_button_label: null,
      sections_order_json: "[]", models_json: "{}",
    });
    dronesService.listGalleryPublic.mockResolvedValue([]);
    dronesService.listApprovedComments.mockResolvedValue([]);

    const req = { query: {} };
    const res = makeRes();

    await ctrl.getRoot(req, res, jest.fn());

    expect(res._body.ok).toBe(true);
    expect(res._body.data.landing.hero_title).toBe("H");
    expect(res._body.data.model).toBeNull();
    expect(res._body.data.gallery).toEqual([]);
  });

  test("getRoot com model retorna model info", async () => {
    dronesService.getPageSettings.mockResolvedValue({
      hero_title: "H", sections_order_json: "[]",
      models_json: '{"t25p":{"specs":"ok"}}',
    });
    dronesService.listGalleryPublic.mockResolvedValue([]);
    dronesService.listApprovedComments.mockResolvedValue([]);

    const req = { query: { model: "T25P" } };
    const res = makeRes();

    await ctrl.getRoot(req, res, jest.fn());

    expect(res._body.data.model).toEqual({ key: "t25p", label: "T25P" });
  });

  // -----------------------------------------------------------------------
  // listModels
  // -----------------------------------------------------------------------

  test("listModels retorna modelos enriquecidos", async () => {
    dronesService.listDroneModels.mockResolvedValue([{ key: "t25p", label: "T25P" }]);
    dronesService.getSelectionsMapForModels.mockResolvedValue({});
    dronesService.getPageSettings.mockResolvedValue({ models_json: "{}" });
    dronesService.getGalleryItemsByIds.mockResolvedValue([]);

    const res = makeRes();
    await ctrl.listModels({}, res, jest.fn());

    expect(res._body.ok).toBe(true);
    expect(res._body.data.items).toHaveLength(1);
    expect(res._body.data.items[0].key).toBe("t25p");
  });

  test("listModels fallback para DEFAULT_DRONE_MODELS se DB falha", async () => {
    dronesService.listDroneModels.mockRejectedValue(new Error("db"));
    dronesService.getSelectionsMapForModels.mockResolvedValue({});
    dronesService.getPageSettings.mockResolvedValue({ models_json: "{}" });
    dronesService.getGalleryItemsByIds.mockResolvedValue([]);

    const res = makeRes();
    await ctrl.listModels({}, res, jest.fn());

    expect(res._body.data.items[0].key).toBe("default");
  });

  // -----------------------------------------------------------------------
  // getGallery
  // -----------------------------------------------------------------------

  test("getGallery retorna dados do service", async () => {
    dronesService.listGalleryPublic.mockResolvedValue([{ id: 1 }]);
    const res = makeRes();

    await ctrl.getGallery({}, res, jest.fn());

    expect(res._body.ok).toBe(true);
  });

  // -----------------------------------------------------------------------
  // listRepresentatives
  // -----------------------------------------------------------------------

  test("listRepresentatives delega params ao service", async () => {
    dronesService.listRepresentativesPublic.mockResolvedValue({ items: [] });
    const req = { query: { page: "1", limit: "10", busca: "x" } };
    const res = makeRes();

    await ctrl.listRepresentatives(req, res, jest.fn());

    expect(dronesService.listRepresentativesPublic).toHaveBeenCalledWith(
      expect.objectContaining({ busca: "x" })
    );
  });

  // -----------------------------------------------------------------------
  // listApprovedComments
  // -----------------------------------------------------------------------

  test("listApprovedComments sem model", async () => {
    dronesService.listApprovedComments.mockResolvedValue([]);
    const req = { query: {} };
    const res = makeRes();

    await ctrl.listApprovedComments(req, res, jest.fn());

    expect(res._body.ok).toBe(true);
  });

  test("listApprovedComments com model valida existência", async () => {
    dronesService.listApprovedComments.mockResolvedValue([]);
    const req = { query: { model: "t25p" } };
    const res = makeRes();

    await ctrl.listApprovedComments(req, res, jest.fn());

    expect(formatters.ensureModelExists).toHaveBeenCalledWith("t25p");
  });

  // -----------------------------------------------------------------------
  // createComment — auth guard + validação
  // -----------------------------------------------------------------------

  test("createComment rejeita sem user autenticado", async () => {
    const req = { user: null, files: [] };
    const next = jest.fn();

    await ctrl.createComment(req, makeRes(), next);

    expect(next).toHaveBeenCalled();
    expect(next.mock.calls[0][0].status).toBe(401);
  });

  test("createComment rejeita sem comment_text", async () => {
    dronesService.sanitizeText = jest.fn().mockReturnValue("");
    const req = { user: { nome: "Ana" }, body: {}, files: [] };
    const next = jest.fn();

    await ctrl.createComment(req, makeRes(), next);

    expect(next).toHaveBeenCalled();
    expect(next.mock.calls[0][0].status).toBe(400);
  });

  test("createComment sucesso sem arquivos", async () => {
    dronesService.sanitizeText = jest.fn().mockReturnValue("Ótimo!");
    dronesService.createComment.mockResolvedValue(42);
    const req = {
      user: { nome: "Ana" },
      body: { comment_text: "Ótimo!" },
      files: [],
      ip: "127.0.0.1",
      get: jest.fn().mockReturnValue("test-ua"),
    };
    const res = makeRes();

    await ctrl.createComment(req, res, jest.fn());

    expect(res._status).toBe(201);
    expect(res._body.data.id).toBe(42);
  });
});
