// utils/sanitize.js
// Utilitários de sanitização sem dependências externas.
//
// NOTA DE PRODUÇÃO: Para rich text (HTML de CMS) recomenda-se instalar
// o pacote `sanitize-html` e substituir `sanitizeRichText` pela sua versão.
// Esta implementação remove vetores óbvios de XSS mas não é um parser HTML completo.

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
 * Sanitiza conteúdo rich-text (HTML de CMS): remove vetores de XSS mantendo
 * formatação básica. NÃO é um parser HTML completo.
 *
 * Remove: <script>, <iframe>, <object>, <embed>, <form>, <link>, <meta>, <base>,
 *         atributos on*, javascript:, data:, vbscript:
 *
 * Para produção com rich text real, substitua por sanitize-html:
 *   const sanitizeHtml = require("sanitize-html");
 *   sanitizeHtml(str, { allowedTags: sanitizeHtml.defaults.allowedTags, ... })
 */
function sanitizeRichText(str) {
  if (typeof str !== "string") return str;

  return str
    // Remove blocos <script>...</script>
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    // Remove <iframe>
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, "")
    // Remove tags de embedding/execução (self-closing e com conteúdo)
    .replace(/<(object|embed|applet|form|input|button|link|meta|base)\b[^>]*\/?\s*>/gi, "")
    .replace(/<\/(object|embed|applet|form|input|button|link|meta|base)\s*>/gi, "")
    // Remove atributos on* (onclick, onload, onerror, etc.)
    .replace(/\s+on\w+\s*=\s*"[^"]*"/gi, "")
    .replace(/\s+on\w+\s*=\s*'[^']*'/gi, "")
    .replace(/\s+on\w+\s*=\s*[^\s>]*/gi, "")
    // Remove protocolo javascript: em qualquer atributo
    .replace(/javascript\s*:/gi, "removed:")
    // Remove data: URIs (vetor de XSS em src/href)
    .replace(/data\s*:\s*(text\/html|application\/javascript|text\/javascript)/gi, "removed:")
    // Remove vbscript:
    .replace(/vbscript\s*:/gi, "removed:")
    // Remove comentários HTML condicionais do IE
    .replace(/<!--\[if[\s\S]*?<!\[endif\]-->/gi, "")
    .trim();
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
