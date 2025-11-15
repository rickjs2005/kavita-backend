// Mock genérico da pool.
// Ajuste o caminho se seu pool estiver em outro arquivo.
const connection = {
  beginTransaction: jest.fn(),
  commit: jest.fn(),
  rollback: jest.fn(),
  query: jest.fn(),
  release: jest.fn(),
};

const pool = {
  query: jest.fn(),
  execute: jest.fn(),
  getConnection: jest.fn().mockResolvedValue(connection),
  __connection: connection,
};

module.exports = pool;
