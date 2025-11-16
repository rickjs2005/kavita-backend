jest.mock('../../config/pool', () => require('../mocks/pool.mock'));
jest.mock('mercadopago', () => require('../mocks/mercadopago.mock'), { virtual: true });
const pool = require('../mocks/pool.mock');

// ⚠️ Ajuste: só funciona se você realmente tiver esse arquivo:
const checkoutController = require('../../controllers/checkoutController');


function mockRes() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn()
  };
}

describe('UNIT checkoutController.create', () => {
  test('valida campos obrigatórios', async () => {
    const req = { body: { usuario_id: 1, produtos: [] } };
    const res = mockRes();

    await checkoutController.create(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('retorna 409 quando estoque não suficiente', async () => {
    const req = {
      body: {
        usuario_id: 1,
        formaPagamento: 'mercadopago',
        endereco: { cep: '12345678', rua: 'A', numero: '1', bairro: 'B', cidade: 'C', estado: 'MG' },
        produtos: [{ id: 10, quantidade: 5, valorUnitario: 50 }]
      }
    };
    const res = mockRes();

    pool.query
      .mockResolvedValueOnce([[{ id: 1 }], []])        // usuario
      .mockResolvedValueOnce([[{ id: 10, quantity: 1 }], []]); // estoque

    await checkoutController.create(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
  });
});
