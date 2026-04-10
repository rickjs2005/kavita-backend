/**
 * test/integration/publicSupportConfig.int.test.js
 *
 * Rotas testadas (routes/public/publicSupportConfig.js):
 *   GET /  → getPublicConfig
 */

"use strict";

const request = require("supertest");
const { makeTestApp } = require("../testUtils");

describe("Public Support Config routes", () => {
  const MOUNT_PATH = "/api/public/support-config";

  let app;
  let mockCtrl;

  beforeEach(() => {
    jest.resetModules();

    mockCtrl = {
      getPublicConfig: jest.fn((req, res) =>
        res.status(200).json({
          ok: true,
          data: {
            hero_title: "Precisa de ajuda?",
            show_faq: true,
            show_form: true,
            show_trust: true,
          },
        })
      ),
    };

    const ctrlPath = require.resolve("../../controllers/supportConfigController");
    jest.doMock(ctrlPath, () => mockCtrl);

    const router = require("../../routes/public/publicSupportConfig");
    app = makeTestApp(MOUNT_PATH, router);
  });

  test("GET / → 200 com config publica", async () => {
    const res = await request(app).get(MOUNT_PATH);

    expect(res.status).toBe(200);
    expect(mockCtrl.getPublicConfig).toHaveBeenCalledTimes(1);
    expect(res.body.ok).toBe(true);
    expect(res.body.data).toEqual(
      expect.objectContaining({
        hero_title: expect.any(String),
        show_faq: expect.any(Boolean),
      })
    );
  });
});
