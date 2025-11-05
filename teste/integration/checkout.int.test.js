const request = require('supertest');

jest.mock('../../config/pool', () => require('../mocks/pool.mock'));
jest.mock('mercadopago', () => require('../mocks/mercadopago.mock'), { virtual: true });
jest.mock('nodemailer', () => require('../mocks/nodemailer.mock'), { virtual: true });

const pool = require('../mocks/pool.mock');
const app = require('../../server');


describe('INT /api/checkout', () => {
  const payload = {
    usuario_id: 1,
    formaPagamento: "mercadopago",
    endereco: {
      cep: "12345678", rua: "Rua A", numero: "100", bairro: "Centro", cidade: "Manhuaçu", estado: "MG"
    },
    produtos: [
      { id: 10, nome: "Produto X", quantidade: 2, valorUnitario: 50 }
    ]
  };

  test('201 - cria pedido e retorna dados de pagamento', async () => {
    // Mock fluxo: valida usuário -> checa estoque -> cria pedido -> cria itens -> atualiza estoque
    // 1) SELECT usuário
    pool.query
      .mockResolvedValueOnce([[{ id: 1, nome: 'Rick' }], []])     // usuario
      .mockResolvedValueOnce([[{ id: 10, quantity: 5, price: 50 }], []]) // estoque produto
      .mockResolvedValueOnce([{ insertId: 123 }])                  // insert pedido
      .mockResolvedValueOnce([{ affectedRows: 1 }])                // insert item
      .mockResolvedValueOnce([{ affectedRows: 1 }]);               // update estoque

    const res = await request(app)
      .post('/api/checkout')
      .send(payload);

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('pedidoId', 123);
    // Se sua rota retorna link do MP:
    // expect(res.body).toHaveProperty('payment.init_point');
  });

  test('400 - payload inválido (sem produtos)', async () => {
    const res = await request(app)
      .post('/api/checkout')
      .send({ ...payload, produtos: [] });

    expect(res.status).toBe(400);
  });

  test('409 - estoque insuficiente', async () => {
    pool.query
      .mockResolvedValueOnce([[{ id: 1 }], []])        // usuario
      .mockResolvedValueOnce([[{ id: 10, quantity: 1 }], []]); // produto com estoque 1

    const res = await request(app)
      .post('/api/checkout')
      .send(payload);

    expect(res.status).toBe(409);
  });
});
