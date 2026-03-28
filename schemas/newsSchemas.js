"use strict";
// schemas/newsSchemas.js
// Zod schemas para validação das rotas de news/posts (admin).

const { z } = require("zod");

// ---------------------------------------------------------------------------
// Params compartilhado — /posts/:id
// ---------------------------------------------------------------------------

const PostIdParamSchema = z.object({
  id: z
    .string({ required_error: "ID inválido." })
    .regex(/^[1-9]\d*$/, "ID inválido.")
    .transform(Number),
});

// ---------------------------------------------------------------------------
// POST /api/admin/news/posts
// ---------------------------------------------------------------------------

const CreatePostSchema = z.object({
  title: z
    .string({ required_error: "title é obrigatório." })
    .min(1, "title é obrigatório.")
    .max(220, "title inválido (máx 220)."),

  content: z
    .string({ required_error: "content é obrigatório." })
    .min(1, "content é obrigatório."),

  // slug opcional: se omitido, gerado automaticamente a partir do title no controller
  slug: z.string().max(240, "slug inválido (máx 240).").optional(),

  excerpt: z.string().max(500, "excerpt inválido (máx 500).").optional().nullable(),
  cover_image_url: z.string().max(500, "cover_image_url inválido (máx 500).").optional().nullable(),
  category: z.string().max(80, "category inválido (máx 80).").optional().nullable(),
  tags: z.string().max(500, "tags inválido (máx 500).").optional().nullable(),

  status: z
    .enum(["draft", "published", "archived"], {
      errorMap: () => ({ message: "status inválido (draft|published|archived)." }),
    })
    .optional()
    .default("draft"),

  // Validação de formato e lógica de auto-set ocorrem no controller
  published_at: z.string().optional().nullable(),
});

// ---------------------------------------------------------------------------
// PUT /api/admin/news/posts/:id  (patch semântico — todos opcionais)
// ---------------------------------------------------------------------------

const UpdatePostSchema = z.object({
  title: z.string().min(1, "title não pode ser vazio.").max(220, "title inválido (máx 220).").optional(),
  content: z.string().min(1, "content não pode ser vazio.").optional(),
  slug: z.string().max(240, "slug inválido (máx 240).").optional().nullable(),
  excerpt: z.string().max(500, "excerpt inválido (máx 500).").optional().nullable(),
  cover_image_url: z.string().max(500, "cover_image_url inválido (máx 500).").optional().nullable(),
  category: z.string().max(80, "category inválido (máx 80).").optional().nullable(),
  tags: z.string().max(500, "tags inválido (máx 500).").optional().nullable(),
  status: z
    .enum(["draft", "published", "archived"], {
      errorMap: () => ({ message: "status inválido (draft|published|archived)." }),
    })
    .optional(),
  published_at: z.string().optional().nullable(),
});

module.exports = {
  PostIdParamSchema,
  CreatePostSchema,
  UpdatePostSchema,
};
