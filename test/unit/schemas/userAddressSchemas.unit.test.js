/**
 * test/unit/schemas/userAddressSchemas.unit.test.js
 *
 * O que está sendo testado:
 *   AddressParamSchema
 *     - string de inteiro positivo → transform para Number
 *     - "0", negativo, não-numérico, ausente → "ID inválido."
 *
 *   AddressBodySchema — campos comuns obrigatórios
 *     - cep, cidade, estado ausentes → falha com mensagens individuais
 *
 *   AddressBodySchema — URBANA (padrão quando tipo_localidade omitido ou não-RURAL)
 *     - payload completo → success
 *     - endereco ausente (sem aliases) → falha
 *     - alias rua → aceito
 *     - alias logradouro → aceito
 *     - bairro ausente → falha
 *     - numero ausente sem sem_numero → falha
 *     - sem_numero=true sem numero → success
 *     - tipo_localidade em minúscula ("urbana") → tratado como URBANA
 *
 *   AddressBodySchema — RURAL
 *     - payload RURAL completo → success
 *     - comunidade ausente → falha
 *     - observacoes_acesso ausente (sem aliases) → falha
 *     - alias ponto_referencia → aceito
 *     - alias referencia → aceito
 *     - RURAL não exige endereco/bairro/numero → success
 *     - tipo_localidade em minúscula ("rural") → tratado como RURAL
 */

"use strict";

const { AddressBodySchema, AddressParamSchema } = require("../../../schemas/userAddressSchemas");

// ---------------------------------------------------------------------------
// AddressParamSchema
// ---------------------------------------------------------------------------

describe("AddressParamSchema", () => {
  test("'5' → success, transforma em number 5", () => {
    const r = AddressParamSchema.safeParse({ id: "5" });
    expect(r.success).toBe(true);
    expect(r.data.id).toBe(5);
  });

  test("'1' (mínimo) → success", () => {
    const r = AddressParamSchema.safeParse({ id: "1" });
    expect(r.success).toBe(true);
    expect(r.data.id).toBe(1);
  });

  test("'0' → falha com 'ID inválido.'", () => {
    const r = AddressParamSchema.safeParse({ id: "0" });
    expect(r.success).toBe(false);
    expect(r.error.issues[0].message).toBe("ID inválido.");
  });

  test("'-1' → falha com 'ID inválido.'", () => {
    const r = AddressParamSchema.safeParse({ id: "-1" });
    expect(r.success).toBe(false);
    expect(r.error.issues[0].message).toBe("ID inválido.");
  });

  test("'abc' → falha com 'ID inválido.'", () => {
    const r = AddressParamSchema.safeParse({ id: "abc" });
    expect(r.success).toBe(false);
    expect(r.error.issues[0].message).toBe("ID inválido.");
  });

  test("ausente → falha", () => {
    const r = AddressParamSchema.safeParse({});
    expect(r.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// AddressBodySchema — campos comuns obrigatórios
// ---------------------------------------------------------------------------

describe("AddressBodySchema — campos comuns obrigatórios", () => {
  const VALID_URBANA = () => ({
    tipo_localidade: "URBANA",
    cep: "36940000",
    cidade: "Manhuaçu",
    estado: "MG",
    endereco: "Rua A",
    bairro: "Centro",
    numero: "10",
  });

  test("payload URBANA completo → success", () => {
    expect(AddressBodySchema.safeParse(VALID_URBANA()).success).toBe(true);
  });

  test("cep ausente → falha com 'cep é obrigatório.'", () => {
    const { cep: _, ...body } = VALID_URBANA();
    const r = AddressBodySchema.safeParse(body);
    expect(r.success).toBe(false);
    const msgs = r.error.issues.map((i) => i.message);
    expect(msgs).toContain("cep é obrigatório.");
  });

  test("cep vazio → falha com 'cep é obrigatório.'", () => {
    const r = AddressBodySchema.safeParse({ ...VALID_URBANA(), cep: "" });
    expect(r.success).toBe(false);
    const msgs = r.error.issues.map((i) => i.message);
    expect(msgs).toContain("cep é obrigatório.");
  });

  test("cep só espaços → falha com 'cep é obrigatório.'", () => {
    const r = AddressBodySchema.safeParse({ ...VALID_URBANA(), cep: "   " });
    expect(r.success).toBe(false);
    const msgs = r.error.issues.map((i) => i.message);
    expect(msgs).toContain("cep é obrigatório.");
  });

  test("cidade ausente → falha com 'cidade é obrigatória.'", () => {
    const { cidade: _, ...body } = VALID_URBANA();
    const r = AddressBodySchema.safeParse(body);
    expect(r.success).toBe(false);
    const msgs = r.error.issues.map((i) => i.message);
    expect(msgs).toContain("cidade é obrigatória.");
  });

  test("estado ausente → falha com 'estado é obrigatório.'", () => {
    const { estado: _, ...body } = VALID_URBANA();
    const r = AddressBodySchema.safeParse(body);
    expect(r.success).toBe(false);
    const msgs = r.error.issues.map((i) => i.message);
    expect(msgs).toContain("estado é obrigatório.");
  });

  test("cep+cidade+estado ausentes → 3 issues distintos", () => {
    const r = AddressBodySchema.safeParse({
      tipo_localidade: "URBANA",
      endereco: "Rua A",
      bairro: "Centro",
      numero: "10",
    });
    expect(r.success).toBe(false);
    const msgs = r.error.issues.map((i) => i.message);
    expect(msgs).toContain("cep é obrigatório.");
    expect(msgs).toContain("cidade é obrigatória.");
    expect(msgs).toContain("estado é obrigatório.");
  });
});

// ---------------------------------------------------------------------------
// AddressBodySchema — URBANA
// ---------------------------------------------------------------------------

describe("AddressBodySchema — URBANA", () => {
  const BASE = () => ({
    cep: "36940000",
    cidade: "Manhuaçu",
    estado: "MG",
    endereco: "Rua A",
    bairro: "Centro",
    numero: "10",
  });

  test("tipo_localidade omitido → trata como URBANA (success com campos URBANA)", () => {
    expect(AddressBodySchema.safeParse(BASE()).success).toBe(true);
  });

  test("tipo_localidade='urbana' (minúscula) → trata como URBANA", () => {
    const r = AddressBodySchema.safeParse({ ...BASE(), tipo_localidade: "urbana" });
    expect(r.success).toBe(true);
  });

  test("tipo_localidade='URBANA' explícito → success", () => {
    const r = AddressBodySchema.safeParse({ ...BASE(), tipo_localidade: "URBANA" });
    expect(r.success).toBe(true);
  });

  test("endereco vazio sem aliases → falha com mensagem de endereco", () => {
    const r = AddressBodySchema.safeParse({ ...BASE(), endereco: "" });
    expect(r.success).toBe(false);
    const msgs = r.error.issues.map((i) => i.message);
    expect(msgs).toContain("endereco (ou rua/logradouro) é obrigatório para URBANA.");
  });

  test("alias rua aceito quando endereco vazio", () => {
    const r = AddressBodySchema.safeParse({ ...BASE(), endereco: "", rua: "Rua B" });
    expect(r.success).toBe(true);
  });

  test("alias logradouro aceito quando endereco e rua vazios", () => {
    const r = AddressBodySchema.safeParse({
      ...BASE(),
      endereco: "",
      rua: "",
      logradouro: "Av. Principal",
    });
    expect(r.success).toBe(true);
  });

  test("todos os aliases vazios → falha com mensagem de endereco", () => {
    const r = AddressBodySchema.safeParse({
      ...BASE(),
      endereco: "",
      rua: "",
      logradouro: "",
    });
    expect(r.success).toBe(false);
    const msgs = r.error.issues.map((i) => i.message);
    expect(msgs).toContain("endereco (ou rua/logradouro) é obrigatório para URBANA.");
  });

  test("bairro ausente → falha com mensagem de bairro", () => {
    const r = AddressBodySchema.safeParse({ ...BASE(), bairro: "" });
    expect(r.success).toBe(false);
    const msgs = r.error.issues.map((i) => i.message);
    expect(msgs).toContain("bairro é obrigatório para URBANA.");
  });

  test("numero ausente sem sem_numero → falha com mensagem de numero", () => {
    const r = AddressBodySchema.safeParse({ ...BASE(), numero: "" });
    expect(r.success).toBe(false);
    const msgs = r.error.issues.map((i) => i.message);
    expect(msgs).toContain("numero é obrigatório para URBANA (ou use sem_numero=true).");
  });

  test("sem_numero=true sem numero → success", () => {
    const r = AddressBodySchema.safeParse({ ...BASE(), numero: "", sem_numero: true });
    expect(r.success).toBe(true);
  });

  test("sem_numero='true' (string) sem numero → success", () => {
    const r = AddressBodySchema.safeParse({ ...BASE(), numero: "", sem_numero: "true" });
    expect(r.success).toBe(true);
  });

  test("sem_numero='1' (string) sem numero → success", () => {
    const r = AddressBodySchema.safeParse({ ...BASE(), numero: "", sem_numero: "1" });
    expect(r.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// AddressBodySchema — RURAL
// ---------------------------------------------------------------------------

describe("AddressBodySchema — RURAL", () => {
  const BASE_RURAL = () => ({
    tipo_localidade: "RURAL",
    cep: "36940000",
    cidade: "Manhuaçu",
    estado: "MG",
    comunidade: "Córrego São José",
    observacoes_acesso: "Estrada de terra, após a ponte",
  });

  test("payload RURAL completo → success", () => {
    expect(AddressBodySchema.safeParse(BASE_RURAL()).success).toBe(true);
  });

  test("tipo_localidade='rural' (minúscula) → trata como RURAL", () => {
    const r = AddressBodySchema.safeParse({ ...BASE_RURAL(), tipo_localidade: "rural" });
    expect(r.success).toBe(true);
  });

  test("RURAL não exige endereco/bairro/numero → success sem esses campos", () => {
    const r = AddressBodySchema.safeParse(BASE_RURAL());
    expect(r.success).toBe(true);
  });

  test("comunidade ausente → falha com mensagem de comunidade", () => {
    const r = AddressBodySchema.safeParse({ ...BASE_RURAL(), comunidade: "" });
    expect(r.success).toBe(false);
    const msgs = r.error.issues.map((i) => i.message);
    expect(msgs).toContain("comunidade é obrigatória para RURAL.");
  });

  test("observacoes_acesso vazia sem aliases → falha com mensagem de observacoes_acesso", () => {
    const r = AddressBodySchema.safeParse({ ...BASE_RURAL(), observacoes_acesso: "" });
    expect(r.success).toBe(false);
    const msgs = r.error.issues.map((i) => i.message);
    expect(msgs).toContain(
      "observacoes_acesso (ou ponto_referencia/referencia) é obrigatório para RURAL."
    );
  });

  test("alias ponto_referencia aceito quando observacoes_acesso vazio", () => {
    const r = AddressBodySchema.safeParse({
      ...BASE_RURAL(),
      observacoes_acesso: "",
      ponto_referencia: "Perto da ponte",
    });
    expect(r.success).toBe(true);
  });

  test("alias referencia aceito quando observacoes_acesso e ponto_referencia vazios", () => {
    const r = AddressBodySchema.safeParse({
      ...BASE_RURAL(),
      observacoes_acesso: "",
      ponto_referencia: "",
      referencia: "Após a fazenda",
    });
    expect(r.success).toBe(true);
  });

  test("todos os aliases de observacoes_acesso vazios → falha", () => {
    const r = AddressBodySchema.safeParse({
      ...BASE_RURAL(),
      observacoes_acesso: "",
      ponto_referencia: "",
      referencia: "",
    });
    expect(r.success).toBe(false);
    const msgs = r.error.issues.map((i) => i.message);
    expect(msgs).toContain(
      "observacoes_acesso (ou ponto_referencia/referencia) é obrigatório para RURAL."
    );
  });
});
