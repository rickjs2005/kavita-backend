/**
 * test/unit/utils/fileValidation.unit.test.js
 *
 * Unit tests for utils/fileValidation.js
 */

"use strict";

const fs = require("fs");
const path = require("path");
const os = require("os");
const { validateFileMagicBytes, sanitizeFilename } = require("../../../utils/fileValidation");

// Helper: write a temp file with given bytes, return path
function writeTempFile(bytes) {
  const tmpPath = path.join(os.tmpdir(), `test_${Date.now()}_${Math.random()}.bin`);
  fs.writeFileSync(tmpPath, Buffer.from(bytes));
  return tmpPath;
}

afterEach(() => {
  // Clean up any temp files created in tests
});

describe("validateFileMagicBytes", () => {
  test("detects valid PNG file", () => {
    const pngHeader = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d];
    const filePath = writeTempFile(pngHeader);
    const { valid, detectedMime } = validateFileMagicBytes(filePath);
    fs.unlinkSync(filePath);
    expect(valid).toBe(true);
    expect(detectedMime).toBe("image/png");
  });

  test("detects valid JPEG file", () => {
    const jpegHeader = [0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01];
    const filePath = writeTempFile(jpegHeader);
    const { valid, detectedMime } = validateFileMagicBytes(filePath);
    fs.unlinkSync(filePath);
    expect(valid).toBe(true);
    expect(detectedMime).toBe("image/jpeg");
  });

  test("detects valid WEBP file", () => {
    // RIFF....WEBP
    const webpHeader = [
      0x52, 0x49, 0x46, 0x46, // RIFF
      0x24, 0x00, 0x00, 0x00, // file size (placeholder)
      0x57, 0x45, 0x42, 0x50, // WEBP
    ];
    const filePath = writeTempFile(webpHeader);
    const { valid, detectedMime } = validateFileMagicBytes(filePath);
    fs.unlinkSync(filePath);
    expect(valid).toBe(true);
    expect(detectedMime).toBe("image/webp");
  });

  test("detects valid GIF file (GIF89a)", () => {
    const gifHeader = [0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00, 0x00, 0x00];
    const filePath = writeTempFile(gifHeader);
    const { valid, detectedMime } = validateFileMagicBytes(filePath);
    fs.unlinkSync(filePath);
    expect(valid).toBe(true);
    expect(detectedMime).toBe("image/gif");
  });

  test("rejects unknown file type", () => {
    const unknownHeader = [0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]; // PDF header
    const filePath = writeTempFile(unknownHeader);
    const { valid, detectedMime } = validateFileMagicBytes(filePath);
    fs.unlinkSync(filePath);
    expect(valid).toBe(false);
    expect(detectedMime).toBeNull();
  });

  test("returns valid:false for non-existent file", () => {
    const { valid } = validateFileMagicBytes("/nonexistent/path/file.png");
    expect(valid).toBe(false);
  });

  test("rejects JPEG when only PNG is allowed", () => {
    const jpegHeader = [0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01];
    const filePath = writeTempFile(jpegHeader);
    const { valid } = validateFileMagicBytes(filePath, ["image/png"]);
    fs.unlinkSync(filePath);
    expect(valid).toBe(false);
  });
});

describe("sanitizeFilename", () => {
  test("removes path traversal sequences", () => {
    const result = sanitizeFilename("../../etc/passwd");
    expect(result).not.toContain("..");
    expect(result).not.toContain("/");
  });

  test("preserves safe extension", () => {
    const result = sanitizeFilename("photo.jpg");
    expect(result).toMatch(/\.jpg$/);
  });

  test("removes special characters", () => {
    const result = sanitizeFilename("my file (1) <test>.png");
    expect(result).toMatch(/^[a-zA-Z0-9_-]+\.png$/);
  });

  test("handles empty input", () => {
    const result = sanitizeFilename("");
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  test("handles null/undefined input", () => {
    const result = sanitizeFilename(null);
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  test("limits filename length", () => {
    const longName = "a".repeat(200) + ".png";
    const result = sanitizeFilename(longName);
    expect(result.length).toBeLessThanOrEqual(110); // 100 name + 4 ext + some tolerance
  });
});
