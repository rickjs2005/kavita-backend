const request = require('supertest');
const jwt = require('jsonwebtoken');

jest.mock('../../config/pool', () => require('../mocks/sqlite-pool.mock'));

const pool = require('../mocks/sqlite-pool.mock');
const app = require('../../server');

const ADMIN_TOKEN = jwt.sign({ id: 999, role: 'admin' }, process.env.JWT_SECRET || 'test_secret');

async function seedBaseData() {
  const [{ insertId: categoryId }] = await pool.query(
    'INSERT INTO categories (name, slug) VALUES (?, ?)',
    ['Insumos', 'insumos']
  );

  const [{ insertId: productId }] = await pool.query(
    'INSERT INTO products (category_id, name, description, price, quantity) VALUES (?, ?, ?, ?, ?)',
    [categoryId, 'Produto Orgânico', 'Adubo premium', 45.5, 10]
  );

  const [{ insertId: userId }] = await pool.query(
    'INSERT INTO usuarios (nome, email) VALUES (?, ?)',
    ['Cliente Teste', 'cliente@example.com']
  );

  return { categoryId, productId, userId };
}

let baseData;

beforeEach(async () => {
  await pool.reset();
  baseData = await seedBaseData();
});

const enderecoPayload = {
  cep: '12345678',
  rua: 'Rua das Flores',
  numero: '100',
  bairro: 'Centro',
  cidade: 'Manhuaçu',
  estado: 'MG',
  complemento: 'Apto 2',
};

function buildCheckoutPayload(overrides = {}) {
  return {
    usuario_id: baseData.userId,
    formaPagamento: 'pix',
    endereco: enderecoPayload,
    produtos: [
      { id: baseData.productId, quantidade: 2 },
    ],
    ...overrides,
  };
}

describe('Checkout e pedidos com base real', () => {
  test('POST /api/checkout persiste pedido com endereço JSON e atualiza estoque', async () => {
    const response = await request(app).post('/api/checkout').send(buildCheckoutPayload());

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ success: true, pedido_id: expect.any(Number) });

    const [pedidos] = await pool.query('SELECT * FROM pedidos');
    expect(pedidos).toHaveLength(1);

    const pedido = pedidos[0];
    const endereco = JSON.parse(pedido.endereco);
    expect(endereco).toMatchObject({
      cep: '12345678',
      rua: 'Rua das Flores',
      numero: '100',
      bairro: 'Centro',
      cidade: 'Manhuaçu',
      estado: 'MG',
      complemento: 'Apto 2',
    });

    expect(Number(pedido.total)).toBeCloseTo(91.0); // 45.5 * 2

    const [[produto]] = await pool.query('SELECT quantity FROM products WHERE id = ?', [baseData.productId]);
    expect(produto.quantity).toBe(8);

    const [itens] = await pool.query(
      'SELECT quantidade, valor_unitario FROM pedidos_produtos WHERE pedido_id = ?',
      [pedido.id]
    );
    expect(itens).toHaveLength(1);
    expect(itens[0].quantidade).toBe(2);
    expect(Number(itens[0].valor_unitario)).toBeCloseTo(45.5);
  });

  test('GET /api/admin/pedidos retorna endereço normalizado e itens do pedido', async () => {
    await request(app).post('/api/checkout').send(buildCheckoutPayload());

    const res = await request(app)
      .get('/api/admin/pedidos')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(1);

    const pedido = res.body[0];
    expect(pedido).toMatchObject({
      usuario: 'Cliente Teste',
      forma_pagamento: 'pix',
      status: 'pendente',
      total: expect.any(Number),
    });

    expect(pedido.endereco).toMatchObject({
      cep: '12345678',
      rua: 'Rua das Flores',
      numero: '100',
      bairro: 'Centro',
      cidade: 'Manhuaçu',
      estado: 'MG',
      complemento: 'Apto 2',
    });

    expect(pedido.itens).toEqual([
      {
        produto: 'Produto Orgânico',
        quantidade: 2,
        preco_unitario: 45.5,
      },
    ]);
    expect(pedido.total).toBeCloseTo(91.0);
  });

  test('GET /api/pedidos/:id expõe itens com valores históricos', async () => {
    const checkout = await request(app).post('/api/checkout').send(buildCheckoutPayload());
    const pedidoId = checkout.body.pedido_id;

    const res = await request(app).get(`/api/pedidos/${pedidoId}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: pedidoId,
      forma_pagamento: 'pix',
      total: 91.0,
    });

    expect(res.body.endereco).toMatchObject({
      cep: '12345678',
      rua: 'Rua das Flores',
    });

    expect(res.body.itens).toEqual([
      {
        id: baseData.productId,
        nome: 'Produto Orgânico',
        preco: 45.5,
        quantidade: 2,
      },
    ]);
  });
});
