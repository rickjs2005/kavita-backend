const path = require('path');

jest.mock('dotenv', () => ({ config: jest.fn() }));

describe('server bootstrap', () => {
  const productModulePath = path.resolve(__dirname, '../../routes/products');

  afterEach(() => {
    jest.resetModules();
    jest.dontMock(productModulePath);
  });

  test('falha imediatamente quando uma rota não pode ser carregada', () => {
    jest.resetModules();

    const consoleErrorSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    try {
      jest.doMock(productModulePath, () => {
        throw new Error('falha ao carregar products');
      });

      expect(() => require('../../server')).toThrow('falha ao carregar products');

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'route_registration_failed' })
      );
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'server_bootstrap_failed' })
      );
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });
});
