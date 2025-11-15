jest.mock('../../config/pool', () => require('../mocks/pool.mock'));
const pool = require('../mocks/pool.mock');

jest.mock('mercadopago', () => require('../mocks/mercadopago.mock'));
const mercadopago = require('mercadopago');

jest.mock('../../utils/passwords', () => ({
  compare: jest.fn(),
  hash: jest.fn(),
}));
const passwords = require('../../utils/passwords');

const jwt = require('jsonwebtoken');

const loginRouter = require('../../routes/login');
const checkoutRouter = require('../../routes/checkoutRoutes');
const paymentRouter = require('../../routes/payment');
const adminRouter = require('../../routes/adminProdutos');

function createReqRes({ method = 'POST', body = {}, params = {}, headers = {} } = {}) {
  const req = {
    method,
    body,
    params,
    headers,
    query: {},
    get: (name) => headers[name.toLowerCase()],
  };
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    send: jest.fn().mockReturnThis(),
  };
  return { req, res };
}

describe('API integration flows', () => {
  beforeEach(() => {
    pool.query.mockReset();
    pool.execute.mockReset();
    pool.getConnection.mockClear();
    Object.values(pool.__connection).forEach((fn) => fn.mockReset?.());
    mercadopago.preferences.create.mockReset();
    mercadopago.payment.findById.mockReset();
    passwords.compare.mockReset();
    passwords.hash.mockReset();
  });

  test('POST /api/login retorna token para credenciais válidas', async () => {
    const handler = loginRouter.__getRouteHandler('post', '/');
    const { req, res } = createReqRes({ body: { email: 'admin@kavita.com', senha: '123456' } });

    pool.query.mockResolvedValueOnce([[{ id: 1, nome: 'Admin', email: req.body.email, senha: 'hash', role: 'admin' }], []]);
    passwords.compare.mockResolvedValueOnce(true);

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json.mock.calls[0][0]).toHaveProperty('token');
    expect(res.json.mock.calls[0][0].usuario).toMatchObject({ id: 1, email: 'admin@kavita.com' });
  });

  test('POST /api/checkout cria pedido e retorna 201', async () => {
    const handler = checkoutRouter.__getRouteHandler('post', '/');
    const payload = {
      usuario_id: 2,
      formaPagamento: 'pix',
      endereco: {
        cep: '36940000',
        rua: 'Rua A',
        numero: '123',
        bairro: 'Centro',
        cidade: 'Manhuaçu',
        estado: 'MG',
      },
      produtos: [{ id: 5, quantidade: 2 }],
    };
    const { req, res } = createReqRes({ body: payload });

    const conn = pool.__connection;
    pool.getConnection.mockResolvedValueOnce(conn);
    conn.beginTransaction.mockResolvedValueOnce();
    conn.query
      .mockResolvedValueOnce([{ insertId: 77 }])
      .mockResolvedValueOnce([[{ id: 5, nome: 'Produto', estoque: 10, preco: 25.5 }]])
      .mockResolvedValueOnce([{}])
      .mockResolvedValueOnce([{}]);
    conn.commit.mockResolvedValueOnce();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, pedido_id: 77 }));
    expect(conn.commit).toHaveBeenCalled();
  });

  test('POST /api/payment/start cria preferência no Mercado Pago', async () => {
    const handler = paymentRouter.__getRouteHandler('post', '/start');
    const { req, res } = createReqRes({ body: { pedidoId: 12 } });

    const conn = pool.__connection;
    pool.getConnection.mockResolvedValueOnce(conn);
    conn.query
      .mockResolvedValueOnce([[{ id: 12, status: 'novo' }]])
      .mockResolvedValueOnce([[{ quantidade: 1, valor_unitario: 99.9 }]])
      .mockResolvedValueOnce([{}]);
    mercadopago.preferences.create.mockResolvedValueOnce({
      body: { id: 'pref-1', init_point: 'https://mp', sandbox_init_point: 'https://sandbox' },
    });

    await handler(req, res);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ preferenceId: 'pref-1' }));
    expect(conn.query).toHaveBeenCalledWith(expect.stringContaining('UPDATE pedidos SET status ='), [12]);
  });

  test('POST /api/payment/webhook atualiza status do pedido', async () => {
    const handler = paymentRouter.__getRouteHandler('post', '/webhook');
    const { req, res } = createReqRes({ body: { type: 'payment', data: { id: 'pay-123' } } });

    const conn = pool.__connection;
    pool.getConnection.mockResolvedValue(conn);
    mercadopago.payment.findById.mockResolvedValueOnce({
      body: {
        status: 'approved',
        metadata: { pedidoId: 31 },
      },
    });
    conn.query.mockResolvedValueOnce([{}]);

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(conn.query).toHaveBeenCalledWith(expect.stringContaining('UPDATE pedidos'), ['pago', 'pay-123', 31]);
  });

  test('GET /api/admin/produtos retorna lista com imagens', async () => {
    const handler = adminRouter.__getRouteHandler('get', '/');
    const { req, res } = createReqRes({ method: 'GET', headers: { authorization: 'Bearer fake' } });

    jest.spyOn(jwt, 'verify').mockReturnValueOnce({ id: 1, role: 'admin' });
    pool.query
      .mockResolvedValueOnce([[{ id: 1, name: 'Pasto', quantity: 3 }]])
      .mockResolvedValueOnce([[{ product_id: 1, path: '/uploads/pasto.jpg' }]]);

    await handler(req, res);

    expect(res.json.mock.calls[0][0][0]).toMatchObject({ id: 1, images: ['/uploads/pasto.jpg'] });
  });
});
