/**
 * Factory de mocks do pool (mysql2-like) para testes.
 * - Impede MySQL real.
 * - Permite controlar: pool.query e pool.getConnection().
 */

function makeMockPool() {
  return {
    query: jest.fn(),
    getConnection: jest.fn(),
  };
}

module.exports = { makeMockPool };
