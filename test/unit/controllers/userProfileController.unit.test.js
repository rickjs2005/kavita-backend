"use strict";

jest.mock("../../../services/userProfileService");
jest.mock("../../../lib", () => ({
  response: {
    ok: jest.fn(),
  },
}));

const service = require("../../../services/userProfileService");
const { response } = require("../../../lib");
const ctrl = require("../../../controllers/userProfileController");

function makeReq(overrides = {}) {
  return { user: { id: 7 }, params: {}, body: {}, ...overrides };
}
function makeRes() { return {}; }
function makeNext() { return jest.fn(); }

beforeEach(() => jest.clearAllMocks());

describe("userProfileController", () => {
  describe("getMe", () => {
    test("success — calls service.getProfile and response.ok", async () => {
      const data = { id: 7, nome: "Rick" };
      service.getProfile.mockResolvedValue(data);

      await ctrl.getMe(makeReq(), makeRes(), makeNext());

      expect(service.getProfile).toHaveBeenCalledWith(7);
      expect(response.ok).toHaveBeenCalledWith(expect.anything(), data);
    });

    test("error — calls next", async () => {
      const err = new Error("db");
      service.getProfile.mockRejectedValue(err);
      const next = makeNext();

      await ctrl.getMe(makeReq(), makeRes(), next);

      expect(next).toHaveBeenCalledWith(err);
      expect(response.ok).not.toHaveBeenCalled();
    });
  });

  describe("updateMe", () => {
    test("success — delegates body to service", async () => {
      const updated = { id: 7, nome: "New" };
      service.updateProfile.mockResolvedValue(updated);
      const body = { nome: "New" };

      await ctrl.updateMe(makeReq({ body }), makeRes(), makeNext());

      expect(service.updateProfile).toHaveBeenCalledWith(7, body);
      expect(response.ok).toHaveBeenCalledWith(expect.anything(), updated);
    });

    test("error — calls next", async () => {
      service.updateProfile.mockRejectedValue(new Error("fail"));
      const next = makeNext();

      await ctrl.updateMe(makeReq({ body: { nome: "X" } }), makeRes(), next);

      expect(next).toHaveBeenCalled();
    });
  });

  describe("getAdminUser", () => {
    test("success — uses params.id", async () => {
      const data = { id: 42, nome: "User" };
      service.getProfileAdmin.mockResolvedValue(data);

      await ctrl.getAdminUser(makeReq({ params: { id: 42 } }), makeRes(), makeNext());

      expect(service.getProfileAdmin).toHaveBeenCalledWith(42);
      expect(response.ok).toHaveBeenCalledWith(expect.anything(), data);
    });
  });

  describe("updateAdminUser", () => {
    test("success — delegates params.id and body", async () => {
      const updated = { id: 42, nome: "Updated" };
      service.updateProfileAdmin.mockResolvedValue(updated);
      const body = { nome: "Updated" };

      await ctrl.updateAdminUser(
        makeReq({ params: { id: 42 }, body }),
        makeRes(),
        makeNext()
      );

      expect(service.updateProfileAdmin).toHaveBeenCalledWith(42, body);
      expect(response.ok).toHaveBeenCalledWith(expect.anything(), updated);
    });

    test("error — calls next", async () => {
      service.updateProfileAdmin.mockRejectedValue(new Error("fail"));
      const next = makeNext();

      await ctrl.updateAdminUser(
        makeReq({ params: { id: 42 }, body: { nome: "X" } }),
        makeRes(),
        next
      );

      expect(next).toHaveBeenCalled();
    });
  });
});
