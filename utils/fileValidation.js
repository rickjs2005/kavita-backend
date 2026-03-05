// utils/fileValidation.js
const fs = require("fs");
const path = require("path");

const MAGIC_BYTES = {
  png: { bytes: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), ext: ".png" },
  jpeg: { bytes: Buffer.from([0xff, 0xd8, 0xff]), ext: ".jpg" },
  webp: { bytes: Buffer.from([0x52, 0x49, 0x46, 0x46]), ext: ".webp" }, // RIFF
  gif: { bytes: Buffer.from([0x47, 0x49, 0x46]), ext: ".gif" },
};

/**
 * Validar magic bytes de arquivo de imagem.
 * @param {string} filePath
 * @param {string[]=} allowedMimes - lista opcional de mimes permitidos (ex: ["image/png"])
 * @returns {{ valid: boolean, detectedMime: (string|null), error?: string }}
 */
function validateFileMagicBytes(filePath, allowedMimes = null) {
  try {
    if (!fs.existsSync(filePath)) {
      return { valid: false, detectedMime: null, error: "Arquivo não existe" };
    }

    const fd = fs.openSync(filePath, "r");
    const buffer = Buffer.alloc(16);
    fs.readSync(fd, buffer, 0, 16, 0);
    fs.closeSync(fd);

    let detectedMime = null;

    if (buffer.subarray(0, 8).equals(MAGIC_BYTES.png.bytes)) {
      detectedMime = "image/png";
    } else if (buffer.subarray(0, 3).equals(MAGIC_BYTES.jpeg.bytes)) {
      detectedMime = "image/jpeg";
    } else if (buffer.subarray(0, 4).equals(MAGIC_BYTES.webp.bytes)) {
      // RIFF....WEBP (WEBP em 8..12)
      const webpCode = buffer.subarray(8, 12).toString("ascii");
      if (webpCode === "WEBP") detectedMime = "image/webp";
    } else if (buffer.subarray(0, 3).equals(MAGIC_BYTES.gif.bytes)) {
      detectedMime = "image/gif";
    }

    if (!detectedMime) {
      return { valid: false, detectedMime: null, error: "Magic bytes inválidos" };
    }

    // Se foi passada whitelist, valida contra ela
    if (Array.isArray(allowedMimes) && allowedMimes.length > 0 && !allowedMimes.includes(detectedMime)) {
      return { valid: false, detectedMime, error: "Tipo de arquivo não permitido" };
    }

    return { valid: true, detectedMime };
  } catch (err) {
    return { valid: false, detectedMime: null, error: err.message };
  }
}

/**
 * Sanitizar filename (anti path traversal + limita tamanho)
 */
function sanitizeFilename(originalFilename) {
  const fallback = `file_${Date.now()}`;
  if (!originalFilename) return fallback;

  // remove path e mantém só o "nome.ext"
  const basename = path.basename(String(originalFilename));

  const ext = path.extname(basename); // inclui o ponto
  const nameOnly = path.basename(basename, ext);

  const safeName = nameOnly
    .replace(/[^\w\s.-]/g, "") // remove chars perigosos
    .replace(/\s+/g, "_")      // espaço -> _
    .replace(/\.+/g, ".")      // colapsa "...." para "."
    .replace(/^\.+/, "")       // remove dots no começo (".env", "..x")
    .replace(/\.\.+/g, ".");   // evita ".." no meio

  // limite que o teste espera: ~100 + ext
  const MAX_NAME = 100;
  const trimmed = safeName.substring(0, MAX_NAME);

  const result = `${trimmed}${ext}`.replace(/_+/g, "_"); // limpeza extra opcional
  return result && result !== ext ? result : fallback;
}

module.exports = {
  validateFileMagicBytes,
  sanitizeFilename,
};