"use strict";
// schemas/heroSchemas.js
// Zod schema for PUT /api/admin/site-hero body validation.
// Applied inside the controller (after multer parses multipart body).

const { z } = require("zod");

const UpdateHeroSchema = z
  .object({
    title: z.string().max(255, "Título muito grande (máx. 255).").optional().default(""),
    subtitle: z.string().max(500, "Subtítulo muito grande (máx. 500).").optional().default(""),
    button_label: z.string().max(80, "Label do botão muito grande (máx. 80).").optional().default(""),
    button_href: z.string().max(255, "Href do botão muito grande (máx. 255).").optional().default(""),
    // Aliases accepted from frontend (ignored by schema, handled manually)
    hero_title: z.string().optional(),
    hero_subtitle: z.string().optional(),
    hero_button_label: z.string().optional(),
    hero_button_href: z.string().optional(),
  })
  .transform((data) => ({
    title: (data.title || data.hero_title || "").trim(),
    subtitle: (data.subtitle || data.hero_subtitle || "").trim(),
    button_label: (data.button_label || data.hero_button_label || "").trim(),
    button_href: (data.button_href || data.hero_button_href || "").trim(),
  }));

module.exports = { UpdateHeroSchema };
