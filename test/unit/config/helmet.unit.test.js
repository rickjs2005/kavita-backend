/**
 * test/unit/config/helmet.unit.test.js
 *
 * Garante que a configuração de CSP do Helmet seja correta por ambiente:
 * - em produção: sem origens localhost em qualquer diretiva
 * - fora de produção: localhost presente nas diretivas afetadas
 */

"use strict";

const LOCALHOST_ORIGINS = [
  "http://localhost:5000",
  "http://127.0.0.1:5000",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
];

const AFFECTED_DIRECTIVES = ["imgSrc", "connectSrc", "mediaSrc"];

function loadHelmet(nodeEnv) {
  const original = process.env.NODE_ENV;
  process.env.NODE_ENV = nodeEnv;
  jest.resetModules();
  const config = require("../../../config/helmet");
  process.env.NODE_ENV = original;
  return config;
}

describe("config/helmet — CSP por ambiente", () => {
  describe("em produção (NODE_ENV=production)", () => {
    let directives;

    beforeAll(() => {
      directives = loadHelmet("production").contentSecurityPolicy.directives;
    });

    test.each(AFFECTED_DIRECTIVES)(
      "%s não contém nenhuma origem localhost",
      (directive) => {
        const values = directives[directive] ?? [];
        const found = LOCALHOST_ORIGINS.filter((origin) => values.includes(origin));
        expect(found).toHaveLength(0);
      }
    );

    test("diretivas não-afetadas permanecem inalteradas", () => {
      expect(directives.defaultSrc).toEqual(["'self'"]);
      expect(directives.scriptSrc).toEqual(["'self'"]);
      expect(directives.objectSrc).toEqual(["'none'"]);
      expect(directives.frameSrc).toEqual(["'none'"]);
    });
  });

  describe("fora de produção (NODE_ENV=development)", () => {
    let directives;

    beforeAll(() => {
      directives = loadHelmet("development").contentSecurityPolicy.directives;
    });

    test.each(AFFECTED_DIRECTIVES)(
      "%s contém origens localhost",
      (directive) => {
        const values = directives[directive] ?? [];
        const found = LOCALHOST_ORIGINS.filter((origin) => values.includes(origin));
        expect(found.length).toBeGreaterThan(0);
      }
    );
  });

  describe("fora de produção (NODE_ENV=test)", () => {
    let directives;

    beforeAll(() => {
      directives = loadHelmet("test").contentSecurityPolicy.directives;
    });

    test.each(AFFECTED_DIRECTIVES)(
      "%s contém origens localhost",
      (directive) => {
        const values = directives[directive] ?? [];
        const found = LOCALHOST_ORIGINS.filter((origin) => values.includes(origin));
        expect(found.length).toBeGreaterThan(0);
      }
    );
  });
});
