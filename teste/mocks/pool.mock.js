// teste/mocks/pool.mock.js
"use strict";

/**
 * Mock do pool mysql2-like para testes.
 * Padrão do projeto:
 * - pool.query()
 * - pool.getConnection()
 */
function makeMockPool() {
  return {
    query: jest.fn(),
    getConnection: jest.fn(),
  };
}

module.exports = { makeMockPool };
