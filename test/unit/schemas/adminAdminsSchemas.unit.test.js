"use strict";

/**
 * test/unit/schemas/adminAdminsSchemas.unit.test.js
 *
 * Foco principal: política de senha forte (P3 da auditoria 2026-05-09).
 */

const {
  createAdminSchema,
  updateAdminSchema,
  senhaForteSchema,
} = require("../../../schemas/adminAdminsSchemas");

describe("senhaForteSchema (P3)", () => {
  test("aceita senha válida (8+ chars, mix de cases + dígito)", () => {
    expect(senhaForteSchema.safeParse("Kavita123").success).toBe(true);
    expect(senhaForteSchema.safeParse("Senha1234").success).toBe(true);
    expect(senhaForteSchema.safeParse("Aa1bcdef").success).toBe(true);
  });

  test("rejeita senha com menos de 8 caracteres", () => {
    const r = senhaForteSchema.safeParse("Aa1xyz");
    expect(r.success).toBe(false);
    expect(r.error.issues[0].message).toMatch(/8 caracteres/);
  });

  test("rejeita senha sem letra minúscula", () => {
    const r = senhaForteSchema.safeParse("KAVITA123");
    expect(r.success).toBe(false);
    expect(r.error.issues.some((i) => /minúscula/i.test(i.message))).toBe(true);
  });

  test("rejeita senha sem letra maiúscula", () => {
    const r = senhaForteSchema.safeParse("kavita123");
    expect(r.success).toBe(false);
    expect(r.error.issues.some((i) => /maiúscula/i.test(i.message))).toBe(true);
  });

  test("rejeita senha sem dígito", () => {
    const r = senhaForteSchema.safeParse("KavitaABC");
    expect(r.success).toBe(false);
    expect(r.error.issues.some((i) => /número/i.test(i.message))).toBe(true);
  });

  test("rejeita senhas fracas comuns", () => {
    expect(senhaForteSchema.safeParse("123456").success).toBe(false); // antiga min(6) passaria
    expect(senhaForteSchema.safeParse("password").success).toBe(false);
    expect(senhaForteSchema.safeParse("12345678").success).toBe(false); // só dígito
  });
});

describe("createAdminSchema", () => {
  test("aceita payload válido com senha forte", () => {
    const r = createAdminSchema.safeParse({
      nome: "Rick",
      email: "RICK@KAVITA.COM",
      senha: "Senha1234",
      role: "Master",
    });
    expect(r.success).toBe(true);
    expect(r.data.email).toBe("rick@kavita.com");
    expect(r.data.role).toBe("master");
  });

  test("rejeita criação com senha fraca antiga (que passaria no min(6))", () => {
    const r = createAdminSchema.safeParse({
      nome: "Rick",
      email: "rick@kavita.com",
      senha: "abc123",
      role: "master",
    });
    expect(r.success).toBe(false);
  });

  test("rejeita email inválido", () => {
    const r = createAdminSchema.safeParse({
      nome: "Rick",
      email: "nope",
      senha: "Senha1234",
      role: "master",
    });
    expect(r.success).toBe(false);
  });
});

describe("updateAdminSchema", () => {
  test("aceita só role", () => {
    const r = updateAdminSchema.safeParse({ role: "viewer" });
    expect(r.success).toBe(true);
  });

  test("aceita só ativo", () => {
    const r = updateAdminSchema.safeParse({ ativo: false });
    expect(r.success).toBe(true);
  });

  test("rejeita payload vazio", () => {
    const r = updateAdminSchema.safeParse({});
    expect(r.success).toBe(false);
  });
});
