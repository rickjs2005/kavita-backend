"use strict";

jest.mock("../../../repositories/climaRepository");
jest.mock("../../../repositories/cotacoesRepository");
jest.mock("../../../repositories/postsRepository");
jest.mock("../../../lib", () => ({ response: { ok: jest.fn() } }));
jest.mock("../../../services/news/newsHelpers", () => ({
  toInt: jest.fn((v, d) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : d; }),
  normalizeSlug: jest.fn((v) => v ? String(v).trim().toLowerCase() : ""),
  isValidSlug: jest.fn((v) => !!v && v.length > 0),
  sanitizeLimitOffset: jest.fn((l, o, maxL) => ({
    lim: Math.min(Math.max(parseInt(l, 10) || maxL, 1), maxL),
    off: Math.max(parseInt(o, 10) || 0, 0),
  })),
}));

const climaRepo = require("../../../repositories/climaRepository");
const cotacoesRepo = require("../../../repositories/cotacoesRepository");
const postsRepo = require("../../../repositories/postsRepository");
const { response } = require("../../../lib");
const ctrl = require("../../../controllers/newsPublicController");
const AppError = require("../../../errors/AppError");

function makeReq(o = {}) { return { query: {}, params: {}, ...o }; }
function makeRes() { return {}; }
function makeNext() { return jest.fn(); }

beforeEach(() => {
  // mockClear preserves implementations set in jest.mock factory
  [climaRepo, cotacoesRepo, postsRepo].forEach((m) =>
    Object.values(m).forEach((fn) => typeof fn.mockClear === "function" && fn.mockClear())
  );
  response.ok.mockClear();
  jest.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => console.error.mockRestore());

describe("newsPublicController", () => {
  describe("listClima", () => {
    test("success", async () => {
      climaRepo.listClimaPublic.mockResolvedValue([{ id: 1 }]);
      await ctrl.listClima(makeReq(), makeRes(), makeNext());
      expect(response.ok).toHaveBeenCalledWith(expect.anything(), [{ id: 1 }]);
    });

    test("error", async () => {
      climaRepo.listClimaPublic.mockRejectedValue(new Error("db"));
      const next = makeNext();
      await ctrl.listClima(makeReq(), makeRes(), next);
      expect(next.mock.calls[0][0]).toBeInstanceOf(AppError);
    });
  });

  describe("getClima", () => {
    test("success", async () => {
      climaRepo.getClimaPublicBySlug.mockResolvedValue({ id: 1, slug: "bh" });
      await ctrl.getClima(makeReq({ params: { slug: "bh" } }), makeRes(), makeNext());
      expect(response.ok).toHaveBeenCalledWith(expect.anything(), { id: 1, slug: "bh" });
    });

    test("not found → 404", async () => {
      climaRepo.getClimaPublicBySlug.mockResolvedValue(null);
      const next = makeNext();
      await ctrl.getClima(makeReq({ params: { slug: "missing" } }), makeRes(), next);
      expect(next.mock.calls[0][0].code).toBe("NOT_FOUND");
    });

    test("empty slug → 400", async () => {
      const next = makeNext();
      await ctrl.getClima(makeReq({ params: { slug: "" } }), makeRes(), next);
      expect(next.mock.calls[0][0].code).toBe("VALIDATION_ERROR");
    });
  });

  describe("listCotacoes", () => {
    test("success without group_key", async () => {
      cotacoesRepo.listCotacoesPublic.mockResolvedValue([{ id: 1 }]);
      await ctrl.listCotacoes(makeReq(), makeRes(), makeNext());
      expect(response.ok).toHaveBeenCalled();
    });

    test("success with group_key", async () => {
      cotacoesRepo.listCotacoesPublic.mockResolvedValue([]);
      await ctrl.listCotacoes(makeReq({ query: { group_key: "soja" } }), makeRes(), makeNext());
      expect(cotacoesRepo.listCotacoesPublic).toHaveBeenCalledWith({ group_key: "soja" });
    });
  });

  describe("getCotacao", () => {
    test("success", async () => {
      cotacoesRepo.getCotacaoPublicBySlug.mockResolvedValue({ id: 1 });
      await ctrl.getCotacao(makeReq({ params: { slug: "soja" } }), makeRes(), makeNext());
      expect(response.ok).toHaveBeenCalled();
    });

    test("not found → 404", async () => {
      cotacoesRepo.getCotacaoPublicBySlug.mockResolvedValue(null);
      const next = makeNext();
      await ctrl.getCotacao(makeReq({ params: { slug: "missing" } }), makeRes(), next);
      expect(next.mock.calls[0][0].code).toBe("NOT_FOUND");
    });
  });

  describe("getCotacoesHistoryBatch", () => {
    test("success — passes deduped slugs and capped limit", async () => {
      cotacoesRepo.listCotacoesHistoryPublicBatch.mockResolvedValue({
        soja: [{ id: 1, price: 10 }],
        milho: [{ id: 2, price: 5 }],
      });
      await ctrl.getCotacoesHistoryBatch(
        makeReq({ query: { slugs: "soja, milho ,soja", limit: "200" } }),
        makeRes(),
        makeNext(),
      );
      expect(cotacoesRepo.listCotacoesHistoryPublicBatch).toHaveBeenCalledWith(
        ["soja", "milho"], // deduped + normalized
        50, // capped at 50
      );
      expect(response.ok).toHaveBeenCalled();
    });

    test("missing slugs → 400", async () => {
      const next = makeNext();
      await ctrl.getCotacoesHistoryBatch(makeReq({ query: {} }), makeRes(), next);
      expect(next.mock.calls[0][0].code).toBe("VALIDATION_ERROR");
    });

    test("only invalid slugs → 400", async () => {
      const next = makeNext();
      await ctrl.getCotacoesHistoryBatch(
        makeReq({ query: { slugs: "  ,  " } }),
        makeRes(),
        next,
      );
      expect(next.mock.calls[0][0].code).toBe("VALIDATION_ERROR");
    });

    test("repo error → 500 via AppError", async () => {
      cotacoesRepo.listCotacoesHistoryPublicBatch.mockRejectedValue(new Error("db"));
      const next = makeNext();
      await ctrl.getCotacoesHistoryBatch(
        makeReq({ query: { slugs: "soja" } }),
        makeRes(),
        next,
      );
      expect(next.mock.calls[0][0]).toBeInstanceOf(AppError);
    });

    test("caps to 12 slugs", async () => {
      cotacoesRepo.listCotacoesHistoryPublicBatch.mockResolvedValue({});
      const slugs = Array.from({ length: 20 }, (_, i) => `slug-${i}`).join(",");
      await ctrl.getCotacoesHistoryBatch(
        makeReq({ query: { slugs } }),
        makeRes(),
        makeNext(),
      );
      const passed = cotacoesRepo.listCotacoesHistoryPublicBatch.mock.calls[0][0];
      expect(passed).toHaveLength(12);
    });
  });

  describe("listPosts", () => {
    test("success", async () => {
      postsRepo.listPostsPublic.mockResolvedValue([{ id: 1 }]);
      await ctrl.listPosts(makeReq(), makeRes(), makeNext());
      expect(response.ok).toHaveBeenCalled();
    });
  });

  describe("getPost", () => {
    test("success and increments views", async () => {
      postsRepo.getPostPublicBySlug.mockResolvedValue({ id: 1 });
      postsRepo.incrementPostViews.mockResolvedValue();
      await ctrl.getPost(makeReq({ params: { slug: "hello-world" } }), makeRes(), makeNext());
      expect(response.ok).toHaveBeenCalled();
      expect(postsRepo.incrementPostViews).toHaveBeenCalledWith("hello-world");
    });

    test("not found → 404", async () => {
      postsRepo.getPostPublicBySlug.mockResolvedValue(null);
      const next = makeNext();
      await ctrl.getPost(makeReq({ params: { slug: "missing" } }), makeRes(), next);
      expect(next.mock.calls[0][0].code).toBe("NOT_FOUND");
    });

    test("view increment failure is silent", async () => {
      postsRepo.getPostPublicBySlug.mockResolvedValue({ id: 1 });
      postsRepo.incrementPostViews.mockRejectedValue(new Error("db"));
      await ctrl.getPost(makeReq({ params: { slug: "hello" } }), makeRes(), makeNext());
      expect(response.ok).toHaveBeenCalled();
    });
  });

  describe("overview", () => {
    test("success aggregates all sources", async () => {
      climaRepo.listClimaPublic.mockResolvedValue([{ id: 1 }]);
      cotacoesRepo.listCotacoesPublic.mockResolvedValue([{ id: 2 }]);
      postsRepo.listPostsPublic.mockResolvedValue([{ id: 3 }]);
      await ctrl.overview(makeReq(), makeRes(), makeNext());
      expect(response.ok).toHaveBeenCalled();
      const data = response.ok.mock.calls[0][1];
      expect(data.clima).toHaveLength(1);
      expect(data.cotacoes).toHaveLength(1);
      expect(data.posts).toHaveLength(1);
    });

    test("error", async () => {
      climaRepo.listClimaPublic.mockRejectedValue(new Error("db"));
      const next = makeNext();
      await ctrl.overview(makeReq(), makeRes(), next);
      expect(next.mock.calls[0][0]).toBeInstanceOf(AppError);
    });
  });
});
