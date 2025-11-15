jest.mock('../../config/pool', () => require('../mocks/pool.mock'));
const pool = require('../mocks/pool.mock');

const router = require('../../routes/adminProdutos');

function createRes() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
}

describe('adminProdutos helpers', () => {
  test('parseMoneyBR converte formatos brasileiros', () => {
    const { parseMoneyBR } = router.__helpers;
    expect(parseMoneyBR('1.234,56')).toBeCloseTo(1234.56);
    expect(parseMoneyBR('R$ 19,90')).toBeCloseTo(19.9);
  });

  test('toInt retorna fallback quando inválido', () => {
    const { toInt } = router.__helpers;
    expect(toInt('42')).toBe(42);
    expect(toInt('foo', 7)).toBe(7);
  });
});

describe('POST /api/admin/produtos handler', () => {
  const handler = router.__getRouteHandler('post', '/');

  beforeEach(() => {
    pool.getConnection.mockReset();
    const conn = pool.__connection;
    conn.beginTransaction.mockReset();
    conn.commit.mockReset();
    conn.rollback.mockReset();
    conn.query.mockReset();
    conn.release.mockReset();
  });

  test('retorna 400 quando preço inválido', async () => {
    const res = createRes();
    const req = {
      body: {
        name: 'Produto',
        price: 'abc',
        quantity: '1',
        category_id: '1',
      },
      files: [],
    };

    await handler(req, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ message: 'Preço inválido.' });
    expect(pool.getConnection).not.toHaveBeenCalled();
  });

  test('insere produto com imagens quando dados válidos', async () => {
    const conn = pool.__connection;
    pool.getConnection.mockResolvedValueOnce(conn);
    conn.beginTransaction.mockResolvedValueOnce();
    conn.query
      .mockResolvedValueOnce([{ insertId: 5 }]) // insert produto
      .mockResolvedValueOnce([{}]) // insert imagens
      .mockResolvedValueOnce([{}]); // update imagem capa
    conn.commit.mockResolvedValueOnce();

    const res = createRes();
    const req = {
      body: {
        name: 'Produto',
        price: '199,90',
        quantity: '4',
        category_id: '2',
        description: 'desc',
      },
      files: [{ filename: 'foto.jpg' }],
    };

    await handler(req, res, jest.fn());

    expect(pool.getConnection).toHaveBeenCalled();
    expect(conn.beginTransaction).toHaveBeenCalled();
    expect(conn.commit).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({ message: 'Produto adicionado com sucesso.', id: 5 });
  });
});
