/**
 * test/unit/controllers/drones/helpers.unit.test.js
 *
 * Testes unitários de controllers/drones/helpers.js.
 *
 * Motivação: helpers.js é o ponto único de verdade para classificação
 * de mídia e validação de model key no domínio drones.
 * dronesPublicController.js e galleryController.js importam daqui.
 * Qualquer regressão aqui afeta ambos os contextos (público e admin).
 *
 * Funções cobertas:
 *   classify(file)       — retorna { media_type, max } ou null
 *   safeUnlink(file)     — não lança, mesmo com path inválido
 *   parseJsonField(v)    — parse seguro de JSON com fallback null
 *   extractItems(result) — normaliza array ou { items } para array
 *   normalizeBool(v)     — converte string/null para boolean
 *   parseModelKey(key)   — valida e normaliza key de modelo
 *   ensureModelExists()  — delegado ao service; testado via mock
 */

"use strict";

jest.mock("../../../../services/dronesService", () => ({
  getDroneModelByKey: jest.fn(),
}));

const dronesService = require("../../../../services/dronesService");
const helpers = require("../../../../controllers/drones/helpers");

beforeEach(() => {
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// classify
// ---------------------------------------------------------------------------

describe("helpers.classify", () => {
  test("image/jpeg → { media_type: 'IMAGE', max: 5MB }", () => {
    const result = helpers.classify({ mimetype: "image/jpeg", size: 100 });
    expect(result).toEqual({ media_type: "IMAGE", max: 5 * 1024 * 1024 });
  });

  test("image/png → IMAGE", () => {
    expect(helpers.classify({ mimetype: "image/png" })).toMatchObject({ media_type: "IMAGE" });
  });

  test("image/webp → IMAGE", () => {
    expect(helpers.classify({ mimetype: "image/webp" })).toMatchObject({ media_type: "IMAGE" });
  });

  test("video/mp4 → { media_type: 'VIDEO', max: 30MB }", () => {
    const result = helpers.classify({ mimetype: "video/mp4" });
    expect(result).toEqual({ media_type: "VIDEO", max: 30 * 1024 * 1024 });
  });

  test("tipo não permitido → null", () => {
    expect(helpers.classify({ mimetype: "application/pdf" })).toBeNull();
  });

  test("mimetype ausente → null", () => {
    expect(helpers.classify({})).toBeNull();
  });

  test("file null → null", () => {
    expect(helpers.classify(null)).toBeNull();
  });

  test("image/gif (não listado) → null", () => {
    expect(helpers.classify({ mimetype: "image/gif" })).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// safeUnlink
// ---------------------------------------------------------------------------

describe("helpers.safeUnlink", () => {
  test("não lança quando file é null", () => {
    expect(() => helpers.safeUnlink(null)).not.toThrow();
  });

  test("não lança quando file.path não existe no disco", () => {
    expect(() => helpers.safeUnlink({ path: "/tmp/inexistente-xyz-abc.jpg" })).not.toThrow();
  });

  test("não lança quando file é objeto vazio", () => {
    expect(() => helpers.safeUnlink({})).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// parseJsonField
// ---------------------------------------------------------------------------

describe("helpers.parseJsonField", () => {
  test("string JSON válida → objeto", () => {
    expect(helpers.parseJsonField('{"a":1}')).toEqual({ a: 1 });
  });

  test("objeto já parseado → retorna como está", () => {
    const obj = { x: 2 };
    expect(helpers.parseJsonField(obj)).toBe(obj);
  });

  test("string inválida → null", () => {
    expect(helpers.parseJsonField("{quebrado")).toBeNull();
  });

  test("null → null", () => {
    expect(helpers.parseJsonField(null)).toBeNull();
  });

  test("undefined → null", () => {
    expect(helpers.parseJsonField(undefined)).toBeNull();
  });

  test("string vazia → null", () => {
    expect(helpers.parseJsonField("")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// extractItems
// ---------------------------------------------------------------------------

describe("helpers.extractItems", () => {
  test("array direto → retorna o próprio array", () => {
    const arr = [1, 2, 3];
    expect(helpers.extractItems(arr)).toBe(arr);
  });

  test("{ items: [...] } → retorna items", () => {
    const items = [{ id: 1 }];
    expect(helpers.extractItems({ items })).toBe(items);
  });

  test("null → array vazio", () => {
    expect(helpers.extractItems(null)).toEqual([]);
  });

  test("objeto sem items → array vazio", () => {
    expect(helpers.extractItems({ total: 0 })).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// normalizeBool
// ---------------------------------------------------------------------------

describe("helpers.normalizeBool", () => {
  test('"0" → false', () => {
    expect(helpers.normalizeBool("0")).toBe(false);
  });

  test('"false" → false', () => {
    expect(helpers.normalizeBool("false")).toBe(false);
  });

  test('"1" → true', () => {
    expect(helpers.normalizeBool("1")).toBe(true);
  });

  test('"true" → true', () => {
    expect(helpers.normalizeBool("true")).toBe(true);
  });

  test("undefined com default true → true", () => {
    expect(helpers.normalizeBool(undefined, true)).toBe(true);
  });

  test("undefined com default false → false", () => {
    expect(helpers.normalizeBool(undefined, false)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// parseModelKey
// ---------------------------------------------------------------------------

describe("helpers.parseModelKey", () => {
  test("chave válida → retorna lowercase trimada", () => {
    expect(helpers.parseModelKey("T25P")).toBe("t25p");
    expect(helpers.parseModelKey("  t70p  ")).toBe("t70p");
  });

  test("chave com underscore válida", () => {
    expect(helpers.parseModelKey("t_100")).toBe("t_100");
  });

  test("chave vazia → AppError 400", () => {
    expect(() => helpers.parseModelKey("")).toThrow(
      expect.objectContaining({ status: 400, code: "VALIDATION_ERROR" })
    );
  });

  test("chave muito curta (1 char) → AppError 400", () => {
    expect(() => helpers.parseModelKey("x")).toThrow(
      expect.objectContaining({ status: 400 })
    );
  });

  test("chave muito longa (21 chars) → AppError 400", () => {
    expect(() => helpers.parseModelKey("a".repeat(21))).toThrow(
      expect.objectContaining({ status: 400 })
    );
  });

  test("chave com caracteres especiais → AppError 400", () => {
    expect(() => helpers.parseModelKey("t25-p")).toThrow(
      expect.objectContaining({ status: 400 })
    );
  });

  test("null → AppError 400", () => {
    expect(() => helpers.parseModelKey(null)).toThrow(
      expect.objectContaining({ status: 400 })
    );
  });
});

// ---------------------------------------------------------------------------
// ensureModelExists
// ---------------------------------------------------------------------------

describe("helpers.ensureModelExists", () => {
  test("modelo encontrado → retorna o registro", async () => {
    const row = { key: "t25p", label: "DJI Agras T25P" };
    dronesService.getDroneModelByKey.mockResolvedValue(row);

    const result = await helpers.ensureModelExists("t25p");

    expect(result).toBe(row);
    expect(dronesService.getDroneModelByKey).toHaveBeenCalledWith("t25p");
  });

  test("modelo não encontrado → AppError 404 NOT_FOUND", async () => {
    dronesService.getDroneModelByKey.mockResolvedValue(null);

    await expect(helpers.ensureModelExists("inexistente")).rejects.toMatchObject({
      status: 404,
      code: "NOT_FOUND",
    });
  });
});
