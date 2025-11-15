const request = require("supertest");
const app = require("../../server");

describe("GET /healthz", () => {
  it("should return service health information", async () => {
    const response = await request(app).get("/healthz").expect("Content-Type", /json/);

    expect([200, 503]).toContain(response.status);
    expect(response.body).toHaveProperty("status");
    expect(response.body).toHaveProperty("uptime");
    expect(response.body).toHaveProperty("timestamp");
    expect(response.headers).toHaveProperty("x-request-id");
  });
});
