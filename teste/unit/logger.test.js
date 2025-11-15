const { PassThrough } = require("stream");
const { createLogger } = require("../../config/logger");

describe("Structured logger", () => {
  it("should emit JSON lines containing requestId and message", () => {
    const stream = new PassThrough();
    let output = "";
    stream.on("data", (chunk) => {
      output += chunk.toString();
    });

    const logger = createLogger({ level: "info", destination: stream });
    logger.info({ requestId: "test-123", extra: true }, "log structured message");
    stream.end();

    const lines = output.trim().split("\n").filter(Boolean);
    expect(lines.length).toBeGreaterThan(0);
    const parsed = JSON.parse(lines[0]);
    expect(parsed).toMatchObject({
      requestId: "test-123",
      msg: "log structured message",
      service: "kavita-backend",
    });
    expect(parsed).toHaveProperty("level", 30);
    expect(parsed).toHaveProperty("time");
  });
});
