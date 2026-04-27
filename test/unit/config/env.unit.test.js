/**
 * test/unit/config/env.unit.test.js
 *
 * Testa o comportamento de startup do config/env.js:
 * - Variáveis obrigatórias ausentes → throw
 * - MP_WEBHOOK_SECRET ausente em produção → throw
 * - MP_WEBHOOK_SECRET ausente em dev → warn (sem throw)
 * - Todas as vars presentes → sem throw
 */

"use strict";

// Vars mínimas para que ensureRequiredEnv não lance por elas
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

function loadEnv(extraEnv = {}) {
  jest.resetModules();

  // Limpar dotenv para não interferir
  jest.doMock("dotenv", () => ({ config: () => {} }));

  // Aplicar env vars para o contexto do teste
  const saved = {};
  const allEnv = { ...BASE_ENV, ...extraEnv };

  // Remove vars que não estamos passando (garante isolamento)
  const relevant = [...Object.keys(BASE_ENV), "MP_ACCESS_TOKEN", "MP_WEBHOOK_SECRET", "CPF_ENCRYPTION_KEY", "NODE_ENV"];
  for (const k of relevant) {
    saved[k] = process.env[k];
    if (k in allEnv) {
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

  // Restaurar env
  for (const k of relevant) {
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

  test("não lança quando todas as vars obrigatórias estão presentes (sem MP_WEBHOOK_SECRET em dev)", () => {
    const { error } = loadEnv({ NODE_ENV: "development" });
    // Em dev, ausência de MP_WEBHOOK_SECRET é warn, não erro
    expect(error).toBeNull();
  });

  test("não lança quando todas as vars incluindo MP_WEBHOOK_SECRET estão presentes em produção", () => {
    const { error } = loadEnv({
      NODE_ENV: "production",
      MP_ACCESS_TOKEN: "test-mp-access-token",
      MP_WEBHOOK_SECRET: "super-secret-webhook-key",
      CPF_ENCRYPTION_KEY: "test-cpf-key-32-chars-minimum!!!",
    });
    expect(error).toBeNull();
  });

  test("lança em produção quando MP_WEBHOOK_SECRET está ausente", () => {
    const { error } = loadEnv({ NODE_ENV: "production" });
    expect(error).not.toBeNull();
    expect(error.message).toMatch(/MP_WEBHOOK_SECRET/);
    expect(error.message).toMatch(/produção/);
  });

  test("emite console.warn (sem throw) em dev quando MP_WEBHOOK_SECRET está ausente", () => {
    const { error } = loadEnv({ NODE_ENV: "development" });
    expect(error).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("MP_WEBHOOK_SECRET")
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
