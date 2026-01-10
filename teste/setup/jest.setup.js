// teste/setup/jest.setup.js

/**
 * SetupAfterEnv do Jest (estável e seguro):
 * - limpa mocks entre testes
 * - silencia console.error/console.warn (sem quebrar restore)
 * - não altera lógica de produção
 */

let errorSpy;
let warnSpy;

beforeAll(() => {
  // Se já houver spy/mocks, ainda assim garantimos spies válidos
  // e guardamos as referências para restaurar corretamente.
  errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
  warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
});

beforeEach(() => {
  jest.clearAllMocks();
});

afterAll(() => {
  // Restaura pelos handlers do spy (nunca via console.error.mockRestore diretamente)
  if (errorSpy && typeof errorSpy.mockRestore === "function") errorSpy.mockRestore();
  if (warnSpy && typeof warnSpy.mockRestore === "function") warnSpy.mockRestore();

  // Segurança extra: restaura qualquer spy que tenha sobrado
  jest.restoreAllMocks();
});
