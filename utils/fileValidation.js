// utils/fileValidation.js
const fs = require("fs");
const path = require("path");

const MAGIC_BYTES = {
  png: { bytes: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), ext: ".png" },
  jpeg: { bytes: Buffer.from([0xff, 0xd8, 0xff]), ext: ".jpg" },
  webp: { bytes: Buffer.from([0x52, 0x49, 0x46, 0x46]), ext: ".webp" },
  gif: { bytes: Buffer.from([0x47, 0x49, 0x46]), ext: ".gif" },
};

/**
 * Validar magic bytes de arquivo de imagem.
 * @returns { valid, format, error }
 */
function validateFileMagicBytes(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      return { valid: false, format: null, error: "Arquivo não existe" };
    }

    const fd = fs.openSync(filePath, "r");
    const buffer = Buffer.alloc(16);
    fs.readSync(fd, buffer, 0, 16, 0);
    fs.closeSync(fd);

    if (buffer.subarray(0, 8).equals(MAGIC_BYTES.png.bytes)) {
      return { valid: true, format: "image/png" };
    }

    if (buffer.subarray(0, 3).equals(MAGIC_BYTES.jpeg.bytes)) {
      return { valid: true, format: "image/jpeg" };
    }

    if (buffer.subarray(0, 4).equals(MAGIC_BYTES.webp.bytes)) {
      const webpCode = buffer.subarray(8, 12).toString("ascii");
      if (webpCode === "WEBP") {
        return { valid: true, format: "image/webp" };
      }
    }

    if (buffer.subarray(0, 3).equals(MAGIC_BYTES.gif.bytes)) {
      return { valid: true, format: "image/gif" };
    }

    return { valid: false, format: null, error: "Magic bytes inválidos" };
  } catch (err) {
    return { valid: false, format: null, error: err.message };
  }
}

/**
 * Sanitizar filename
 */
function sanitizeFilename(originalFilename) {
  if (!originalFilename) return `file_${Date.now()}`;
  const basename = path.basename(originalFilename);
  const safe = basename
    .replace(/[^\w\s.-]/g, "")
    .replace(/\s+/g, "_")
    .substring(0, 255);
  return safe || `file_${Date.now()}`;
}

module.exports = {
  validateFileMagicBytes,
  sanitizeFilename,
};