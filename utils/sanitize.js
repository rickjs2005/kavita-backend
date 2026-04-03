// utils/sanitize.js
// Utilitários de sanitização.
// sanitizeRichText usa sanitize-html (parser completo) para conteúdo CMS.

/**
 * Remove todas as tags HTML de uma string.
 * Use em campos de texto puro: nomes, telefones, endereços, comentários, títulos.
 */
function stripHtml(str) {
  if (typeof str !== "string") return str;
  return str
    .replace(/<[^>]*>/g, "")  // remove tags
    .replace(/<!--[\s\S]*?-->/g, "") // remove comentários HTML
    .trim();
}

/**
 * Escapa entidades HTML para exibição segura.
 * Use ao refletir dados do banco sem framework de template.
 */
function escapeHtml(str) {
  if (typeof str !== "string") return str;
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

/**
 * Sanitiza conteúdo rich-text (HTML de CMS) usando sanitize-html.
 * Permite formatação básica (p, b, i, ul, ol, li, a, img, h1-h6, br, blockquote)
 * enquanto remove todo o resto (script, iframe, event handlers, etc.).
 */
const sanitizeHtml = require("sanitize-html");

const RICH_TEXT_OPTIONS = {
  allowedTags: [
    ...sanitizeHtml.defaults.allowedTags,
    "img", "h1", "h2", "figure", "figcaption", "span",
  ],
  allowedAttributes: {
    ...sanitizeHtml.defaults.allowedAttributes,
    img: ["src", "alt", "title", "width", "height", "loading"],
    a: ["href", "title", "target", "rel"],
    span: ["class", "style"],
    "*": ["class"],
  },
  allowedSchemes: ["http", "https", "mailto"],
  // Strip dangerous protocols in href/src
  disallowedTagsMode: "discard",
};

function sanitizeRichText(str) {
  if (typeof str !== "string") return str;
  return sanitizeHtml(str, RICH_TEXT_OPTIONS);
}

/**
 * Trunca e sanitiza campo de texto simples em uma operação.
 * Use em títulos, nomes, descrições curtas.
 */
function sanitizeText(str, maxLength = 1000) {
  if (typeof str !== "string") return str;
  return stripHtml(str).substring(0, maxLength).trim();
}

module.exports = { stripHtml, escapeHtml, sanitizeRichText, sanitizeText };
