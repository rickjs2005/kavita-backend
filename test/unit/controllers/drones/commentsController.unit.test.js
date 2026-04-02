"use strict";

jest.mock("../../../../services/dronesService");
jest.mock("../../../../lib", () => ({
  response: { ok: jest.fn() },
}));

const dronesService = require("../../../../services/dronesService");
const { response } = require("../../../../lib");
const ctrl = require("../../../../controllers/drones/commentsController");
const AppError = require("../../../../errors/AppError");

function makeReq(overrides = {}) {
  return { query: {}, params: {}, ...overrides };
}
function makeRes() { return {}; }
function makeNext() { return jest.fn(); }

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => console.error.mockRestore());

describe("commentsController", () => {
  describe("listComments", () => {
    test("success with default params", async () => {
      const result = { items: [], total: 0 };
      dronesService.listCommentsAdmin.mockResolvedValue(result);
      await ctrl.listComments(makeReq(), makeRes(), makeNext());
      expect(dronesService.listCommentsAdmin).toHaveBeenCalledWith({
        page: 1, limit: 20, status: undefined, model_key: undefined,
      });
      expect(response.ok).toHaveBeenCalledWith(expect.anything(), result);
    });

    test("parses query params", async () => {
      dronesService.listCommentsAdmin.mockResolvedValue({ items: [] });
      await ctrl.listComments(
        makeReq({ query: { page: "3", limit: "50", status: "approved", model_key: "agras" } }),
        makeRes(), makeNext()
      );
      expect(dronesService.listCommentsAdmin).toHaveBeenCalledWith({
        page: 3, limit: 50, status: "APPROVED", model_key: "agras",
      });
    });

    test("error → next(AppError)", async () => {
      dronesService.listCommentsAdmin.mockRejectedValue(new Error("db"));
      const next = makeNext();
      await ctrl.listComments(makeReq(), makeRes(), next);
      expect(next).toHaveBeenCalled();
      expect(next.mock.calls[0][0]).toBeInstanceOf(AppError);
    });
  });

  describe("approveComment", () => {
    test("success", async () => {
      dronesService.setCommentApproval.mockResolvedValue(1);
      await ctrl.approveComment(makeReq({ params: { id: "5" } }), makeRes(), makeNext());
      expect(dronesService.setCommentApproval).toHaveBeenCalledWith(5, true);
      expect(response.ok).toHaveBeenCalledWith(expect.anything(), { id: 5 }, "Comentário aprovado.");
    });

    test("invalid id → AppError 400", async () => {
      const next = makeNext();
      await ctrl.approveComment(makeReq({ params: { id: "abc" } }), makeRes(), next);
      expect(next.mock.calls[0][0].code).toBe("VALIDATION_ERROR");
    });

    test("not found → 404", async () => {
      dronesService.setCommentApproval.mockResolvedValue(0);
      const next = makeNext();
      await ctrl.approveComment(makeReq({ params: { id: "5" } }), makeRes(), next);
      expect(next.mock.calls[0][0].code).toBe("NOT_FOUND");
    });
  });

  describe("rejectComment", () => {
    test("success", async () => {
      dronesService.setCommentApproval.mockResolvedValue(1);
      await ctrl.rejectComment(makeReq({ params: { id: "5" } }), makeRes(), makeNext());
      expect(dronesService.setCommentApproval).toHaveBeenCalledWith(5, false);
      expect(response.ok).toHaveBeenCalledWith(expect.anything(), { id: 5 }, "Comentário reprovado.");
    });

    test("not found → 404", async () => {
      dronesService.setCommentApproval.mockResolvedValue(0);
      const next = makeNext();
      await ctrl.rejectComment(makeReq({ params: { id: "5" } }), makeRes(), next);
      expect(next.mock.calls[0][0].code).toBe("NOT_FOUND");
    });
  });

  describe("deleteComment", () => {
    test("success", async () => {
      dronesService.deleteComment.mockResolvedValue(1);
      await ctrl.deleteComment(makeReq({ params: { id: "5" } }), makeRes(), makeNext());
      expect(response.ok).toHaveBeenCalledWith(expect.anything(), { id: 5 }, "Comentário removido.");
    });

    test("not found → 404", async () => {
      dronesService.deleteComment.mockResolvedValue(0);
      const next = makeNext();
      await ctrl.deleteComment(makeReq({ params: { id: "5" } }), makeRes(), next);
      expect(next.mock.calls[0][0].code).toBe("NOT_FOUND");
    });

    test("error → wraps in AppError", async () => {
      dronesService.deleteComment.mockRejectedValue(new Error("boom"));
      const next = makeNext();
      await ctrl.deleteComment(makeReq({ params: { id: "5" } }), makeRes(), next);
      expect(next.mock.calls[0][0]).toBeInstanceOf(AppError);
      expect(next.mock.calls[0][0].status).toBe(500);
    });
  });
});
