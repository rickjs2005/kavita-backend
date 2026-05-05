/**
 * test/unit/config/env.unit.test.js
 *
 * Testa o comportamento de startup do config/env.js:
 * - Variáveis obrigatórias ausentes → throw
 * - Variáveis sensíveis em produção → throw quando inválidas
 * - Em dev, ausência de obrigatórias-em-prod → warn (sem throw)
 */

"use strict";

// Vars mínimas para que ensureRequiredEnv não lance por elas em DEV.
const BASE_ENV = {
  JWT_SECRET: "test-secret-min-32-chars-xxxxxxxxxx",
  EMAIL_USER: "test@test.com",
  EMAIL_PASS: "testpass",
  APP_URL: "http://localhost:3000",
  BACKEND_URL: "http://localhost:5000",
  DB_HOST: "localhost",
  DB_USER: "root",
  DB_PASSWORD: "pass",
  DB_NAME: "kavita_test",
};

// Conjunto que satisfaz TODAS as validações de produção. Cada teste de
// produção parte daqui e remove/sobrescreve apenas a var que pretende
// testar — assim adicionar uma validação nova não exige reescrever todos
// os testes.
const PROD_OK = {
  ...BASE_ENV,
  NODE_ENV: "production",
  APP_URL: "https://kavita.com.br",
  BACKEND_URL: "https://api.kavita.com.br",
  PUBLIC_SITE_URL: "https://kavita.com.br",
  MP_ACCESS_TOKEN: "APP_USR-test-token-123",
  MP_WEBHOOK_SECRET: "super-secret-webhook-key",
  MP_WEBHOOK_URL: "https://api.kavita.com.br/api/payment/webhook",
  CPF_ENCRYPTION_KEY: "test-cpf-key-32-chars-minimum!!!",
  MFA_ENCRYPTION_KEY: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
  CONTRATO_SIGNER_PROVIDER: "clicksign",
  CLICKSIGN_API_TOKEN: "test-clicksign-token",
  CLICKSIGN_HMAC_SECRET: "test-clicksign-hmac",
  CLICKSIGN_API_URL: "https://app.clicksign.com",
  MAIL_PROVIDER: "smtp",
  KYC_PROVIDER: "bigdatacorp",
};

const RELEVANT_KEYS = [
  ...Object.keys(BASE_ENV),
  "PUBLIC_SITE_URL",
  "MP_ACCESS_TOKEN",
  "MP_WEBHOOK_SECRET",
  "MP_WEBHOOK_URL",
  "CPF_ENCRYPTION_KEY",
  "MFA_ENCRYPTION_KEY",
  "CONTRATO_SIGNER_PROVIDER",
  "CLICKSIGN_API_TOKEN",
  "CLICKSIGN_HMAC_SECRET",
  "CLICKSIGN_API_URL",
  "MAIL_PROVIDER",
  "KYC_PROVIDER",
  "NODE_ENV",
];

function loadEnv(extraEnv = {}, removeKeys = []) {
  jest.resetModules();
  jest.doMock("dotenv", () => ({ config: () => {} }));

  const saved = {};
  const allEnv = { ...extraEnv };

  for (const k of RELEVANT_KEYS) {
    saved[k] = process.env[k];
    if (removeKeys.includes(k)) {
      delete process.env[k];
    } else if (k in allEnv) {
      process.env[k] = allEnv[k];
    } else {
      delete process.env[k];
    }
  }

  let error = null;
  let config = null;
  try {
    config = require("../../../config/env");
  } catch (e) {
    error = e;
  }

  for (const k of RELEVANT_KEYS) {
    if (saved[k] === undefined) {
      delete process.env[k];
    } else {
      process.env[k] = saved[k];
    }
  }

  return { config, error };
}

describe("config/env.js — startup validation", () => {
  let warnSpy;

  beforeEach(() => {
    warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    jest.resetModules();
  });

  afterEach(() => {
    warnSpy.mockRestore();
    jest.resetModules();
  });

  test("não lança em dev quando vars de prod ausentes (apenas warn)", () => {
    const { error } = loadEnv({ ...BASE_ENV, NODE_ENV: "development" });
    expect(error).toBeNull();
  });

  test("não lança em produção quando todas as vars válidas estão presentes", () => {
    const { error } = loadEnv(PROD_OK);
    expect(error).toBeNull();
  });

  test("lança em produção quando MP_WEBHOOK_SECRET está ausente", () => {
    const { error } = loadEnv(PROD_OK, ["MP_WEBHOOK_SECRET"]);
    expect(error).not.toBeNull();
    expect(error.message).toMatch(/MP_WEBHOOK_SECRET/);
    expect(error.message).toMatch(/produção/);
  });

  test("Fase 1 B1 — lança em produção quando MP_WEBHOOK_URL está ausente", () => {
    const { error } = loadEnv(PROD_OK, ["MP_WEBHOOK_URL"]);
    expect(error).not.toBeNull();
    expect(error.message).toMatch(/MP_WEBHOOK_URL/);
  });

  test("Fase 1 B1 — lança em produção quando MP_WEBHOOK_URL não é HTTPS", () => {
    const { error } = loadEnv({
      ...PROD_OK,
      MP_WEBHOOK_URL: "http://insecure.com/webhook",
    });
    expect(error).not.toBeNull();
    expect(error.message).toMatch(/MP_WEBHOOK_URL/);
    expect(error.message).toMatch(/https/);
  });

  test("lança em produção quando MP_ACCESS_TOKEN não começa com APP_USR-", () => {
    const { error } = loadEnv({
      ...PROD_OK,
      MP_ACCESS_TOKEN: "TEST-sandbox-token-123",
    });
    expect(error).not.toBeNull();
    expect(error.message).toMatch(/MP_ACCESS_TOKEN/);
    expect(error.message).toMatch(/APP_USR-/);
  });

  test("Fase 1 B3 — lança em produção quando CONTRATO_SIGNER_PROVIDER=stub", () => {
    const { error } = loadEnv({
      ...PROD_OK,
      CONTRATO_SIGNER_PROVIDER: "stub",
    });
    expect(error).not.toBeNull();
    expect(error.message).toMatch(/CONTRATO_SIGNER_PROVIDER/);
    expect(error.message).toMatch(/clicksign/);
  });

  test("Fase 1 B3 — lança em produção quando CLICKSIGN_API_TOKEN está ausente", () => {
    const { error } = loadEnv(PROD_OK, ["CLICKSIGN_API_TOKEN"]);
    expect(error).not.toBeNull();
    expect(error.message).toMatch(/CLICKSIGN_API_TOKEN/);
  });

  test("Fase 1 B3 — lança em produção quando CLICKSIGN_HMAC_SECRET está ausente", () => {
    const { error } = loadEnv(PROD_OK, ["CLICKSIGN_HMAC_SECRET"]);
    expect(error).not.toBeNull();
    expect(error.message).toMatch(/CLICKSIGN_HMAC_SECRET/);
  });

  test("lança em produção quando CLICKSIGN_API_URL aponta para sandbox", () => {
    const { error } = loadEnv({
      ...PROD_OK,
      CLICKSIGN_API_URL: "https://sandbox.clicksign.com",
    });
    expect(error).not.toBeNull();
    expect(error.message).toMatch(/CLICKSIGN_API_URL/);
    expect(error.message).toMatch(/sandbox/);
  });

  test("lança em produção quando MAIL_PROVIDER=disabled", () => {
    const { error } = loadEnv({
      ...PROD_OK,
      MAIL_PROVIDER: "disabled",
    });
    expect(error).not.toBeNull();
    expect(error.message).toMatch(/MAIL_PROVIDER/);
    expect(error.message).toMatch(/disabled/);
  });

  test("lança em produção quando KYC_PROVIDER=mock", () => {
    const { error } = loadEnv({
      ...PROD_OK,
      KYC_PROVIDER: "mock",
    });
    expect(error).not.toBeNull();
    expect(error.message).toMatch(/KYC_PROVIDER/);
  });

  test("lança em produção quando KYC_PROVIDER está vazio", () => {
    const { error } = loadEnv(PROD_OK, ["KYC_PROVIDER"]);
    expect(error).not.toBeNull();
    expect(error.message).toMatch(/KYC_PROVIDER/);
  });

  test("lança em produção quando APP_URL aponta para localhost", () => {
    const { error } = loadEnv({
      ...PROD_OK,
      APP_URL: "http://localhost:3000",
    });
    expect(error).not.toBeNull();
    expect(error.message).toMatch(/APP_URL/);
    expect(error.message).toMatch(/localhost/);
  });

  test("lança em produção quando BACKEND_URL aponta para 127.0.0.1", () => {
    const { error } = loadEnv({
      ...PROD_OK,
      BACKEND_URL: "http://127.0.0.1:5000",
    });
    expect(error).not.toBeNull();
    expect(error.message).toMatch(/BACKEND_URL/);
    expect(error.message).toMatch(/localhost/);
  });

  test("F1.6 — lança em produção quando MFA_ENCRYPTION_KEY está ausente", () => {
    const { error } = loadEnv(PROD_OK, ["MFA_ENCRYPTION_KEY"]);
    expect(error).not.toBeNull();
    expect(error.message).toMatch(/MFA_ENCRYPTION_KEY/);
  });

  test("emite console.warn (sem throw) em dev quando MP_WEBHOOK_SECRET está ausente", () => {
    const { error } = loadEnv({ ...BASE_ENV, NODE_ENV: "development" });
    expect(error).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("MP_WEBHOOK_SECRET"),
    );
  });

  test("lança quando JWT_SECRET está ausente (var obrigatória global)", () => {
    const saved = process.env.JWT_SECRET;
    delete process.env.JWT_SECRET;
    jest.resetModules();
    jest.doMock("dotenv", () => ({ config: () => {} }));

    let error = null;
    try {
      require("../../../config/env");
    } catch (e) {
      error = e;
    }

    if (saved !== undefined) process.env.JWT_SECRET = saved;
    jest.resetModules();

    expect(error).not.toBeNull();
    expect(error.message).toMatch(/JWT_SECRET/);
  });
});
