const request = require('supertest');
const crypto = require('crypto');

jest.mock('../../config/pool', () => require('../mocks/pool.mock'));
jest.mock('mercadopago', () => require('../mocks/mercadopago.mock'), { virtual: true });

const pool = require('../mocks/pool.mock');
const mercadopago = require('../mocks/mercadopago.mock');
const app = require('../../server');

const createSignature = (timestamp, body, secret) => {
  const ts = String(timestamp);
  const payload = JSON.stringify(body || {});
  const hash = crypto.createHmac('sha256', secret).update(`${ts}.${payload}`).digest('hex');
  return `ts=${ts},v1=${hash}`;
};

describe('INT /api/payment/webhook', () => {
  const secret = 'test-secret';
  let connection;

  beforeEach(() => {
    process.env.MP_WEBHOOK_SECRET = secret;
    jest.clearAllMocks();
    connection = {
      beginTransaction: jest.fn().mockResolvedValue(),
      commit: jest.fn().mockResolvedValue(),
      rollback: jest.fn().mockResolvedValue(),
      query: jest.fn().mockResolvedValue([[], []]),
      release: jest.fn()
    };
    pool.getConnection.mockResolvedValue(connection);
  });

  afterAll(() => {
    delete process.env.MP_WEBHOOK_SECRET;
  });

  test('200 - processa notificação válida e atualiza pedido', async () => {
    const body = { type: 'payment', data: { id: 'pay_123' } };
    const signature = createSignature(1700000000, body, secret);

    connection.query
      .mockResolvedValueOnce([[null], []])
      .mockResolvedValueOnce([{ insertId: 42 }])
      .mockResolvedValueOnce([{ affectedRows: 1 }])
      .mockResolvedValueOnce([{ affectedRows: 1 }]);

    mercadopago.payment.findById.mockResolvedValue({
      body: {
        status: 'approved',
        metadata: { pedidoId: 321 }
      }
    });

    const res = await request(app)
      .post('/api/payment/webhook')
      .set('x-idempotency-key', 'IDEMP-1')
      .set('x-signature', signature)
      .send(body);

    expect(res.status).toBe(200);
    expect(connection.beginTransaction).toHaveBeenCalled();
    expect(connection.commit).toHaveBeenCalled();
    expect(mercadopago.payment.findById).toHaveBeenCalledWith('pay_123');
    expect(connection.query).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining('UPDATE pedidos'),
      ['pago', 'pay_123', 321, 'pago', 'pay_123']
    );
    expect(connection.query).toHaveBeenNthCalledWith(
      4,
      expect.stringContaining('UPDATE webhook_events'),
      ['pago', 42]
    );
  });

  test('401 - rejeita assinatura inválida e não acessa banco', async () => {
    const body = { type: 'payment', data: { id: 'pay_999' } };

    const res = await request(app)
      .post('/api/payment/webhook')
      .set('x-idempotency-key', 'IDEMP-2')
      .set('x-signature', 'ts=1,v1=fake')
      .send(body);

    expect(res.status).toBe(401);
    expect(pool.getConnection).not.toHaveBeenCalled();
    expect(mercadopago.payment.findById).not.toHaveBeenCalled();
  });

  test('200 - ignora evento já processado mantendo idempotência', async () => {
    const body = { type: 'payment', data: { id: 'pay_777' } };
    const signature = createSignature(1700000001, body, secret);

    connection.query.mockResolvedValueOnce([[{ id: 55, processed_at: new Date(), status: 'pago' }], []]);

    const res = await request(app)
      .post('/api/payment/webhook')
      .set('x-idempotency-key', 'IDEMP-3')
      .set('x-signature', signature)
      .send(body);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('idempotent', true);
    expect(connection.commit).toHaveBeenCalled();
    expect(mercadopago.payment.findById).not.toHaveBeenCalled();
  });
});
