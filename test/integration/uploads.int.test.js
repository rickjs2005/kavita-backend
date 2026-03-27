// test/integration/uploads.int.test.js
"use strict";

const request = require("supertest");
const path = require("path");
const fs = require("fs");

// Set required env vars before loading server
process.env.EMAIL_USER = process.env.EMAIL_USER || "test@test.com";
process.env.EMAIL_PASS = process.env.EMAIL_PASS || "testpass";
process.env.APP_URL = process.env.APP_URL || "http://localhost:3000";
process.env.BACKEND_URL = process.env.BACKEND_URL || "http://localhost:5000";
process.env.DB_HOST = process.env.DB_HOST || "localhost";
process.env.DB_USER = process.env.DB_USER || "root";
process.env.DB_PASSWORD = process.env.DB_PASSWORD || "password";
process.env.DB_NAME = process.env.DB_NAME || "kavita_test";

// Mock dependencies that require DB/external services before loading server
jest.mock("../../config/pool", () => ({
  query: jest.fn(),
  execute: jest.fn(),
  getConnection: jest.fn(),
}));

jest.mock("../../workers/abandonedCartNotificationsWorker", () => ({
  startAbandonedCartNotificationsWorker: jest.fn(),
}));

jest.mock("../../middleware/adaptiveRateLimiter", () =>
  () => (_req, _res, next) => next()
);

const app = require("../../server");

const UPLOADS_DIR = path.join(process.cwd(), "uploads");
const TEST_FILENAME = "test-static-middleware.txt";
const TEST_FILEPATH = path.join(UPLOADS_DIR, TEST_FILENAME);
const TEST_CONTENT = "kavita static file test";
const NONEXISTENT_FILE = "/uploads/arquivo-que-nao-existe-xyz.webp";

describe("Static File Serving — /uploads", () => {
  beforeAll(() => {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    fs.writeFileSync(TEST_FILEPATH, TEST_CONTENT);
  });

  afterAll(() => {
    if (fs.existsSync(TEST_FILEPATH)) {
      fs.unlinkSync(TEST_FILEPATH);
    }
  });

  test("200: arquivo existente em /uploads é servido corretamente", async () => {
    const res = await request(app).get(`/uploads/${TEST_FILENAME}`);
    expect(res.status).toBe(200);
    expect(res.text).toBe(TEST_CONTENT);
  });

  test("404: arquivo inexistente em /uploads retorna 404", async () => {
    const res = await request(app).get(NONEXISTENT_FILE);
    expect(res.status).toBe(404);
  });

  test("404: arquivo inexistente em /uploads retorna mensagem de rota não encontrada com o caminho correto", async () => {
    const res = await request(app).get(NONEXISTENT_FILE);
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({
      message: expect.stringContaining(`GET ${NONEXISTENT_FILE}`),
    });
  });
});
