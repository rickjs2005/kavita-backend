/**
 * test/unit/schemas/newsSchemas.unit.test.js
 *
 * O que está sendo testado:
 *   - PostIdParamSchema: transform "5" → 5, rejeita "0" e "abc"
 *   - CreatePostSchema: title e content obrigatórios, status default "draft"
 *   - CreatePostSchema: limites de tamanho e valores do enum status
 *   - UpdatePostSchema: todos os campos opcionais (patch semântico)
 */

"use strict";

const {
  PostIdParamSchema,
  CreatePostSchema,
  UpdatePostSchema,
} = require("../../../schemas/newsSchemas");

// ---------------------------------------------------------------------------
// PostIdParamSchema
// ---------------------------------------------------------------------------

describe("PostIdParamSchema", () => {
  test("'10' → transforma em número 10", () => {
    const r = PostIdParamSchema.safeParse({ id: "10" });
    expect(r.success).toBe(true);
    expect(r.data.id).toBe(10);
  });

  test("'0' é inválido", () => {
    const r = PostIdParamSchema.safeParse({ id: "0" });
    expect(r.success).toBe(false);
  });

  test("'abc' é inválido", () => {
    const r = PostIdParamSchema.safeParse({ id: "abc" });
    expect(r.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// CreatePostSchema
// ---------------------------------------------------------------------------

describe("CreatePostSchema — campos obrigatórios", () => {
  test("title e content são obrigatórios", () => {
    const r = CreatePostSchema.safeParse({});
    expect(r.success).toBe(false);
    const fields = r.error.issues.map((i) => i.path.join("."));
    expect(fields).toContain("title");
    expect(fields).toContain("content");
  });

  test("title vazio é inválido", () => {
    const r = CreatePostSchema.safeParse({ title: "", content: "texto" });
    expect(r.success).toBe(false);
  });

  test("post mínimo válido: title + content", () => {
    const r = CreatePostSchema.safeParse({ title: "Título", content: "Conteúdo." });
    expect(r.success).toBe(true);
  });
});

describe("CreatePostSchema — status", () => {
  test("status não informado → default 'draft'", () => {
    const r = CreatePostSchema.safeParse({ title: "T", content: "C" });
    expect(r.success).toBe(true);
    expect(r.data.status).toBe("draft");
  });

  test("status 'published' é válido", () => {
    const r = CreatePostSchema.safeParse({ title: "T", content: "C", status: "published" });
    expect(r.success).toBe(true);
    expect(r.data.status).toBe("published");
  });

  test("status 'archived' é válido", () => {
    const r = CreatePostSchema.safeParse({ title: "T", content: "C", status: "archived" });
    expect(r.success).toBe(true);
  });

  test("status inválido é rejeitado", () => {
    const r = CreatePostSchema.safeParse({ title: "T", content: "C", status: "active" });
    expect(r.success).toBe(false);
    const msg = r.error.issues[0].message;
    expect(msg).toContain("draft");
  });
});

describe("CreatePostSchema — limites de tamanho", () => {
  test("title com 220 chars é válido (máximo)", () => {
    const r = CreatePostSchema.safeParse({ title: "A".repeat(220), content: "C" });
    expect(r.success).toBe(true);
  });

  test("title com 221 chars é inválido", () => {
    const r = CreatePostSchema.safeParse({ title: "A".repeat(221), content: "C" });
    expect(r.success).toBe(false);
  });

  test("campos opcionais null são aceitos", () => {
    const r = CreatePostSchema.safeParse({
      title: "Título",
      content: "Conteúdo.",
      excerpt: null,
      cover_image_url: null,
      category: null,
      tags: null,
    });
    expect(r.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// UpdatePostSchema — patch semântico
// ---------------------------------------------------------------------------

describe("UpdatePostSchema", () => {
  test("objeto vazio é válido (todos os campos opcionais)", () => {
    const r = UpdatePostSchema.safeParse({});
    expect(r.success).toBe(true);
  });

  test("subconjunto de campos é válido", () => {
    const r = UpdatePostSchema.safeParse({ title: "Novo Título" });
    expect(r.success).toBe(true);
  });

  test("title vazio é inválido mesmo sendo opcional", () => {
    const r = UpdatePostSchema.safeParse({ title: "" });
    expect(r.success).toBe(false);
  });

  test("status inválido é rejeitado mesmo sendo opcional", () => {
    const r = UpdatePostSchema.safeParse({ status: "rascunho" });
    expect(r.success).toBe(false);
  });

  test("status 'published' aceito no update", () => {
    const r = UpdatePostSchema.safeParse({ status: "published" });
    expect(r.success).toBe(true);
  });
});
