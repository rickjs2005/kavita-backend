/**
 * test/unit/services/categoriasAdminService.unit.test.js
 *
 * Testes unitários de services/categoriasAdminService.js.
 *
 * Cobre:
 *   slugify()     — função pura, sem mock
 *   list()        — delega ao repo
 *   create()      — slug derivado de name ou slug, ER_DUP_ENTRY → 409
 *   update()      — fetch-or-throw, field-merge exato (regra de slug preservado)
 *   updateStatus()— affectedRows=0 → 404
 *   remove()      — affectedRows=0 → 404
 */

"use strict";

const REPO_PATH = require.resolve("../../../repositories/categoriasRepository");
const SERVICE_PATH = require.resolve("../../../services/categoriasAdminService");

// ---------------------------------------------------------------------------
// slugify — função pura, testada sem mock de repo
// ---------------------------------------------------------------------------

describe("categoriasAdminService.slugify", () => {
  let slugify;

  beforeAll(() => {
    jest.resetModules();
    slugify = require(SERVICE_PATH).slugify;
  });

  test("lowercase + trim", () => {
    expect(slugify("  Ração  ")).toBe("racao");
  });

  test("acentos removidos", () => {
    expect(slugify("Higiene Animal")).toBe("higiene-animal");
  });

  test("espaços viram hífens, hífens consecutivos colapsam", () => {
    // múltiplos espaços → hífens → colapsam; inline -- também colapsa
    expect(slugify("Brinquedo  Top --  Cão")).toBe("brinquedo-top-cao");
    expect(slugify("a  b")).toBe("a-b");
    expect(slugify("a--b")).toBe("a-b");
  });

  test("caracteres especiais removidos", () => {
    expect(slugify("Cat@Goria!")).toBe("catgoria");
  });

  test("string vazia → string vazia", () => {
    expect(slugify("")).toBe("");
  });
});

// ---------------------------------------------------------------------------
// Restante dos testes — com mock do repository
// ---------------------------------------------------------------------------

describe("categoriasAdminService — com mock de repo", () => {
  let svc;
  let repoMock;

  function setupModule() {
    jest.resetModules();
    repoMock = {
      listCategories: jest.fn(),
      findCategoryById: jest.fn(),
      createCategory: jest.fn(),
      updateCategory: jest.fn(),
      updateCategoryStatus: jest.fn(),
      deleteCategory: jest.fn(),
    };
    jest.doMock(REPO_PATH, () => repoMock);
    svc = require(SERVICE_PATH);
  }

  beforeEach(() => {
    setupModule();
    jest.clearAllMocks();
  });

  function makeRow(overrides = {}) {
    return {
      id: 1,
      name: "Ração",
      slug: "racao",
      sort_order: 1,
      is_active: 1,
      ...overrides,
    };
  }

  // ---- list ----

  test("list: delega para repo.listCategories", async () => {
    const rows = [makeRow()];
    repoMock.listCategories.mockResolvedValue(rows);
    const result = await svc.list();
    expect(result).toBe(rows);
    expect(repoMock.listCategories).toHaveBeenCalledTimes(1);
  });

  // ---- create ----

  test("create: usa slugify(name) quando slug está ausente/vazio", async () => {
    repoMock.createCategory.mockResolvedValue(10);
    const result = await svc.create({ name: "Higiene Animal", slug: "", sort_order: 2 });
    expect(result.slug).toBe("higiene-animal");
    expect(repoMock.createCategory).toHaveBeenCalledWith(
      expect.objectContaining({ slug: "higiene-animal" })
    );
  });

  test("create: usa slugify(slug) quando slug está preenchido", async () => {
    repoMock.createCategory.mockResolvedValue(5);
    const result = await svc.create({ name: "Ração", slug: "Racao Premium", sort_order: 0 });
    expect(result.slug).toBe("racao-premium");
  });

  test("create: retorna objeto completo com is_active=1 e sort_order", async () => {
    repoMock.createCategory.mockResolvedValue(42);
    const result = await svc.create({ name: "Brinquedo", slug: "", sort_order: 3 });
    expect(result).toEqual({ id: 42, name: "Brinquedo", slug: "brinquedo", is_active: 1, sort_order: 3 });
  });

  test("create: ER_DUP_ENTRY → AppError 409 CONFLICT", async () => {
    const dupErr = Object.assign(new Error("dup"), { code: "ER_DUP_ENTRY" });
    repoMock.createCategory.mockRejectedValue(dupErr);
    await expect(svc.create({ name: "Ração", slug: "", sort_order: 0 }))
      .rejects.toMatchObject({ status: 409, code: "CONFLICT" });
  });

  test("create: erro não-duplicata é re-lançado sem transformação", async () => {
    const dbErr = new Error("timeout");
    repoMock.createCategory.mockRejectedValue(dbErr);
    await expect(svc.create({ name: "X", slug: "", sort_order: 0 })).rejects.toBe(dbErr);
  });

  // ---- update ----

  test("update: NOT_FOUND quando findCategoryById retorna null", async () => {
    repoMock.findCategoryById.mockResolvedValue(null);
    await expect(svc.update(999, {})).rejects.toMatchObject({ status: 404, code: "NOT_FOUND" });
    expect(repoMock.updateCategory).not.toHaveBeenCalled();
  });

  test("update: slug preservado quando slug não é enviado", async () => {
    repoMock.findCategoryById.mockResolvedValue(makeRow({ slug: "racao-original" }));
    repoMock.updateCategory.mockResolvedValue(undefined);
    const result = await svc.update(1, { name: "Novo Nome" });
    expect(result.slug).toBe("racao-original"); // preservado
    expect(repoMock.updateCategory).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ slug: "racao-original" })
    );
  });

  test("update: slug enviado sobrescreve o atual (slugificado)", async () => {
    repoMock.findCategoryById.mockResolvedValue(makeRow({ slug: "racao-original" }));
    repoMock.updateCategory.mockResolvedValue(undefined);
    const result = await svc.update(1, { slug: "Novo Slug" });
    expect(result.slug).toBe("novo-slug");
  });

  test("update: sort_order preservado quando não enviado", async () => {
    repoMock.findCategoryById.mockResolvedValue(makeRow({ sort_order: 5 }));
    repoMock.updateCategory.mockResolvedValue(undefined);
    const result = await svc.update(1, { name: "X" });
    expect(result.sort_order).toBe(5);
  });

  test("update: sort_order null preserva atual (não zera)", async () => {
    repoMock.findCategoryById.mockResolvedValue(makeRow({ sort_order: 7 }));
    repoMock.updateCategory.mockResolvedValue(undefined);
    const result = await svc.update(1, { sort_order: null });
    expect(result.sort_order).toBe(7);
  });

  test("update: retorna objeto com is_active do banco (não hardcoded)", async () => {
    repoMock.findCategoryById.mockResolvedValue(makeRow({ is_active: 0 }));
    repoMock.updateCategory.mockResolvedValue(undefined);
    const result = await svc.update(1, {});
    expect(result.is_active).toBe(0);
  });

  // ---- updateStatus ----

  test("updateStatus: chama repo com is_active boolean", async () => {
    repoMock.updateCategoryStatus.mockResolvedValue(1);
    await svc.updateStatus(3, true);
    expect(repoMock.updateCategoryStatus).toHaveBeenCalledWith(3, true);
  });

  test("updateStatus: affectedRows=0 → AppError 404 NOT_FOUND", async () => {
    repoMock.updateCategoryStatus.mockResolvedValue(0);
    await expect(svc.updateStatus(999, false)).rejects.toMatchObject({ status: 404, code: "NOT_FOUND" });
  });

  // ---- remove ----

  test("remove: chama repo.deleteCategory com id correto", async () => {
    repoMock.deleteCategory.mockResolvedValue(1);
    await svc.remove(5);
    expect(repoMock.deleteCategory).toHaveBeenCalledWith(5);
  });

  test("remove: affectedRows=0 → AppError 404 NOT_FOUND", async () => {
    repoMock.deleteCategory.mockResolvedValue(0);
    await expect(svc.remove(999)).rejects.toMatchObject({ status: 404, code: "NOT_FOUND" });
  });
});
