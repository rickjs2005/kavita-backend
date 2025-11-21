const express = require('express');
const router = express.Router();
const pool = require('../config/pool');
const authenticateToken = require('../middleware/authenticateToken');

router.use(authenticateToken);

/**
 * GET /api/cart
 * Retorna o carrinho ABERTO mais recente do usuário logado.
 */
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
    console.error('GET /api/cart erro:', e);
    res.status(500).json({ message: 'Erro ao carregar carrinho' });
  }
});

/**
 * POST /api/cart/items
 * Adiciona (ou incrementa) um produto no carrinho aberto do usuário.
 */
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

    const [[produto]] = await conn.query(
      'SELECT price FROM products WHERE id = ?',
      [produto_id]
    );
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
    console.error('POST /api/cart/items erro:', e);
    res.status(500).json({ message: 'Erro ao adicionar item ao carrinho' });
  } finally {
    conn.release();
  }
});

/**
 * PATCH /api/cart/items
 * Atualiza a quantidade de um produto no carrinho.
 * Body: { produto_id, quantidade }
 * - Se quantidade <= 0 → remove o item.
 */
router.patch('/items', async (req, res) => {
  const { produto_id, quantidade } = req.body;
  const userId = req.user.id;

  const q = Number(quantidade || 0);
  if (!produto_id) {
    return res.status(400).json({ message: 'produto_id é obrigatório.' });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [[carrinho]] = await conn.query(
      'SELECT * FROM carrinhos WHERE usuario_id = ? AND status = "aberto" ORDER BY id DESC LIMIT 1',
      [userId]
    );

    if (!carrinho) {
      await conn.rollback();
      return res.status(200).json({ message: 'Carrinho já vazio.' });
    }

    if (q <= 0) {
      await conn.query(
        'DELETE FROM carrinho_itens WHERE carrinho_id = ? AND produto_id = ?',
        [carrinho.id, produto_id]
      );
    } else {
      await conn.query(
        'UPDATE carrinho_itens SET quantidade = ? WHERE carrinho_id = ? AND produto_id = ?',
        [q, carrinho.id, produto_id]
      );
    }

    await conn.commit();
    res.json({ message: 'Quantidade atualizada.' });
  } catch (e) {
    await conn.rollback();
    console.error('PATCH /api/cart/items erro:', e);
    res.status(500).json({ message: 'Erro ao atualizar item do carrinho' });
  } finally {
    conn.release();
  }
});

/**
 * DELETE /api/cart/items/:produtoId
 * Remove um item específico do carrinho aberto.
 */
router.delete('/items/:produtoId', async (req, res) => {
  const produtoId = Number(req.params.produtoId);
  const userId = req.user.id;

  if (!produtoId) {
    return res.status(400).json({ message: 'produtoId inválido.' });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [[carrinho]] = await conn.query(
      'SELECT * FROM carrinhos WHERE usuario_id = ? AND status = "aberto" ORDER BY id DESC LIMIT 1',
      [userId]
    );

    if (!carrinho) {
      await conn.rollback();
      return res.status(200).json({ message: 'Carrinho já vazio.' });
    }

    await conn.query(
      'DELETE FROM carrinho_itens WHERE carrinho_id = ? AND produto_id = ?',
      [carrinho.id, produtoId]
    );

    await conn.commit();
    res.json({ message: 'Item removido do carrinho.' });
  } catch (e) {
    await conn.rollback();
    console.error('DELETE /api/cart/items/:produtoId erro:', e);
    res.status(500).json({ message: 'Erro ao remover item do carrinho' });
  } finally {
    conn.release();
  }
});

/**
 * DELETE /api/cart
 * Limpa o carrinho aberto do usuário (e opcionalmente fecha).
 */
router.delete('/', async (req, res) => {
  const userId = req.user.id;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [[carrinho]] = await conn.query(
      'SELECT * FROM carrinhos WHERE usuario_id = ? AND status = "aberto" ORDER BY id DESC LIMIT 1',
      [userId]
    );

    if (!carrinho) {
      await conn.rollback();
      return res.status(200).json({ message: 'Carrinho já estava vazio.' });
    }

    await conn.query(
      'DELETE FROM carrinho_itens WHERE carrinho_id = ?',
      [carrinho.id]
    );

    await conn.query('UPDATE carrinhos SET status = "fechado" WHERE id = ?', [
      carrinho.id,
    ]);

    await conn.commit();
    res.json({ message: 'Carrinho limpo.' });
  } catch (e) {
    await conn.rollback();
    console.error('DELETE /api/cart erro:', e);
    res.status(500).json({ message: 'Erro ao limpar carrinho' });
  } finally {
    conn.release();
  }
});

module.exports = router;