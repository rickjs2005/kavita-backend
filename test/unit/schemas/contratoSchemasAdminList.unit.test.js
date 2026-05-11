// test/unit/schemas/contratoSchemasAdminList.unit.test.js
//
// Cobre adminListContratosQuerySchema (Fase 10.10).
"use strict";

const {
  adminListContratosQuerySchema,
} = require("../../../schemas/contratoSchemas");

describe("adminListContratosQuerySchema", () => {
  it("default page=1 e limit=20 quando nada é informado", () => {
    const parsed = adminListContratosQuerySchema.parse({});
    expect(parsed.page).toBe(1);
    expect(parsed.limit).toBe(20);
    expect(parsed.status).toBeUndefined();
  });

  it("coerce de string para number em corretora_id/lead_id/page/limit", () => {
    const parsed = adminListContratosQuerySchema.parse({
      corretora_id: "7",
      lead_id: "99",
      page: "3",
      limit: "50",
    });
    expect(parsed.corretora_id).toBe(7);
    expect(parsed.lead_id).toBe(99);
    expect(parsed.page).toBe(3);
    expect(parsed.limit).toBe(50);
  });

  it("rejeita status fora do ENUM", () => {
    expect(() =>
      adminListContratosQuerySchema.parse({ status: "deleted" }),
    ).toThrow();
  });

  it("rejeita tipo fora do ENUM", () => {
    expect(() =>
      adminListContratosQuerySchema.parse({ tipo: "spot" }),
    ).toThrow();
  });

  it("rejeita date_from fora do formato YYYY-MM-DD", () => {
    expect(() =>
      adminListContratosQuerySchema.parse({ date_from: "10/05/2026" }),
    ).toThrow();
  });

  it("aceita q válido e trimm a/transforma vazio em undefined", () => {
    const parsed = adminListContratosQuerySchema.parse({ q: "  João  " });
    expect(parsed.q).toBe("João");
  });

  it("limit acima do máximo (100) é rejeitado", () => {
    expect(() =>
      adminListContratosQuerySchema.parse({ limit: "9999" }),
    ).toThrow();
  });

  it("strip: campos desconhecidos são removidos silenciosamente", () => {
    const parsed = adminListContratosQuerySchema.parse({
      hacker_payload: "<script>",
      status: "signed",
    });
    expect(parsed).toEqual({
      status: "signed",
      page: 1,
      limit: 20,
    });
    expect(parsed.hacker_payload).toBeUndefined();
  });
});
