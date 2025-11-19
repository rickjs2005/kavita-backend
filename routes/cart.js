// routes/cart.js
const express = require('express');
const router = express.Router();
const pool = require('../config/pool');
const authenticateToken = require('../middleware/authenticateToken');

router.use(authenticateToken);

// GET carrinho atual
router.get('/', async (req, res) => {
  const userId = req.user.id;
  try {
    const [[carrinho]] = await pool.query(
      'SELECT * FROM carrinhos WHERE usuario_id = ? AND status = "aberto" ORDER BY id DESC LIMIT 1',
      [userId]
    );

    if (!carrinho) return res.json({ items: [] });

    const [itens] = await pool.query(
      `SELECT ci.id, ci.produto_id, ci.quantidade, ci.valor_unitario, p.name as nome, p.image
       FROM carrinho_itens ci
       JOIN products p ON p.id = ci.produto_id
       WHERE ci.carrinho_id = ?`,
      [carrinho.id]
    );

    res.json({ carrinho_id: carrinho.id, items: itens });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Erro ao carregar carrinho' });
  }
});

// POST novo item no carrinho
router.post('/items', async (req, res) => {
  const { produto_id, quantidade } = req.body;
  const userId = req.user.id;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [[carrinho]] = await conn.query(
      'SELECT * FROM carrinhos WHERE usuario_id = ? AND status = "aberto" ORDER BY id DESC LIMIT 1',
      [userId]
    );

    let carrinhoId = carrinho?.id;
    if (!carrinhoId) {
      const [newCart] = await conn.query(
        'INSERT INTO carrinhos (usuario_id) VALUES (?)',
        [userId]
      );
      carrinhoId = newCart.insertId;
    }

    const [[produto]] = await conn.query('SELECT price FROM products WHERE id = ?', [produto_id]);
    if (!produto) throw new Error('Produto não encontrado');

    const [[existente]] = await conn.query(
      'SELECT * FROM carrinho_itens WHERE carrinho_id = ? AND produto_id = ?',
      [carrinhoId, produto_id]
    );

    if (existente) {
      await conn.query(
        'UPDATE carrinho_itens SET quantidade = quantidade + ? WHERE id = ?',
        [quantidade, existente.id]
      );
    } else {
      await conn.query(
        `INSERT INTO carrinho_itens (carrinho_id, produto_id, quantidade, valor_unitario)
         VALUES (?, ?, ?, ?)`,
        [carrinhoId, produto_id, quantidade, produto.price]
      );
    }

    await conn.commit();
    res.status(200).json({ message: 'Produto adicionado ao carrinho' });
  } catch (e) {
    await conn.rollback();
    res.status(500).json({ message: 'Erro ao adicionar item ao carrinho' });
  } finally {
    conn.release();
  }
});

module.exports = router;
