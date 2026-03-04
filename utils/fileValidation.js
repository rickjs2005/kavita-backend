// utils/fileValidation.js
// Magic-byte validation and filename sanitization for uploaded files.

const fs = require("fs");
const path = require("path");

// Magic bytes (file signatures) for supported image types
const MAGIC_SIGNATURES = [
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  { bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], mime: "image/png" },
  // JPEG: FF D8 FF
  { bytes: [0xff, 0xd8, 0xff], mime: "image/jpeg" },
  // WEBP: 52 49 46 46 .. .. .. .. 57 45 42 50  (RIFF....WEBP)
  // We check RIFF at offset 0 and WEBP at offset 8
  { bytes: [0x52, 0x49, 0x46, 0x46], offset: 0, extraBytes: [0x57, 0x45, 0x42, 0x50], extraOffset: 8, mime: "image/webp" },
  // GIF87a / GIF89a
  { bytes: [0x47, 0x49, 0x46, 0x38, 0x37, 0x61], mime: "image/gif" },
  { bytes: [0x47, 0x49, 0x46, 0x38, 0x39, 0x61], mime: "image/gif" },
];

/**
 * Reads the first bytes of a file and compares against known magic signatures.
 * Returns the detected MIME type string, or null if unrecognised / unreadable.
 *
 * @param {string} filePath - Absolute path to the file on disk
 * @returns {string|null} detected MIME type or null
 */
function detectMimeFromMagicBytes(filePath) {
  const HEADER_BYTES = 12;
  let buffer;

  try {
    const fd = fs.openSync(filePath, "r");
    buffer = Buffer.alloc(HEADER_BYTES);
    fs.readSync(fd, buffer, 0, HEADER_BYTES, 0);
    fs.closeSync(fd);
  } catch {
    return null;
  }

  for (const sig of MAGIC_SIGNATURES) {
    const offset = sig.offset || 0;
    const match = sig.bytes.every((b, i) => buffer[offset + i] === b);
    if (!match) continue;

    if (sig.extraBytes) {
      const extraMatch = sig.extraBytes.every((b, i) => buffer[sig.extraOffset + i] === b);
      if (!extraMatch) continue;
    }

    return sig.mime;
  }

  return null;
}

/**
 * Validates that the file at filePath has one of the expected magic-byte signatures.
 *
 * @param {string} filePath - Absolute path to the uploaded file
 * @param {string[]} [allowedMimes] - Allowed MIME types; defaults to common image types
 * @returns {{ valid: boolean, detectedMime: string|null }}
 */
function validateFileMagicBytes(
  filePath,
  allowedMimes = ["image/png", "image/jpeg", "image/webp", "image/gif"]
) {
  const detectedMime = detectMimeFromMagicBytes(filePath);
  const valid = detectedMime !== null && allowedMimes.includes(detectedMime);
  return { valid, detectedMime };
}

/**
 * Sanitizes a filename to prevent path-traversal attacks and remove special chars.
 * Only keeps alphanumeric characters, dashes, underscores, and a single dot before the extension.
 *
 * @param {string} originalFilename
 * @returns {string} sanitized filename
 */
function sanitizeFilename(originalFilename) {
  if (!originalFilename || typeof originalFilename !== "string") {
    return "upload";
  }

  // Remove any path components
  const basename = path.basename(originalFilename);

  // Extract extension (max 10 chars to prevent abuse)
  const extRaw = path.extname(basename).toLowerCase();
  const safeExt = /^\.[a-z0-9]{1,10}$/.test(extRaw) ? extRaw : "";

  // Strip extension, sanitize the rest
  const nameWithoutExt = path.basename(basename, extRaw);
  const safeName = nameWithoutExt
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .replace(/_{2,}/g, "_")
    .slice(0, 100)
    .replace(/^_+|_+$/g, "") || "upload";

  return `${safeName}${safeExt}`;
}

module.exports = { validateFileMagicBytes, sanitizeFilename };
