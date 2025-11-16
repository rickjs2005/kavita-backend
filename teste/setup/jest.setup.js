// Limpa mocks entre testes
afterEach(() => {
  jest.clearAllMocks();
  jest.resetModules();
});

// Evita sair por erro de unhandledRejection em testes
process.on('unhandledRejection', (err) => {
  // console.error(err);
});
