// routes/favorites.js
const express = require('express');
const router = express.Router();
const pool = require('../config/pool');
const authenticateToken = require('../middleware/authenticateToken');

// Todas as rotas de favoritos exigem usuário autenticado
router.use(authenticateToken);

// mesma ideia do attachImages de routes/products.js
async function attachImages(products) {
  if (!products?.length) return products;

  const ids = products.map((p) => p.id);
  const placeholders = ids.map(() => '?').join(',');

  const [rows] = await pool.query(
    `SELECT product_id, path AS image_url
       FROM product_images
      WHERE product_id IN (${placeholders})
      ORDER BY id ASC`,
    ids
  );

  const map = new Map();
  for (const r of rows) {
    if (!map.has(r.product_id)) map.set(r.product_id, []);
    map.get(r.product_id).push(r.image_url);
  }

  return products.map((p) => ({
    ...p,
    images: map.get(p.id) || [],
  }));
}

/**
 * @openapi
 * /api/favorites:
 *   get:
 *     tags: [Privado, Favoritos]
 *     summary: Lista produtos favoritos do usuário autenticado
 *     responses:
 *       200:
 *         description: Lista de produtos favoritos
 *   post:
 *     tags: [Privado, Favoritos]
 *     summary: Adiciona um produto aos favoritos do usuário
 *   delete:
 *     tags: [Privado, Favoritos]
 *     summary: Remove um produto dos favoritos do usuário
 */

// GET /api/favorites -> lista produtos favoritos
router.get('/', async (req, res) => {
  try {
    const userId = req.user.id;

    const [rows] = await pool.query(
      `
      SELECT p.*
        FROM favorites f
        JOIN products p ON p.id = f.product_id
       WHERE f.user_id = ?
       ORDER BY f.created_at DESC
      `,
      [userId]
    );

    const data = await attachImages(rows);
    return res.json({ data });
  } catch (err) {
    console.error('[GET /api/favorites] Erro:', err);
    return res.status(500).json({ message: 'Erro interno no servidor.' });
  }
});

// POST /api/favorites  { productId }
router.post('/', async (req, res) => {
  try {
    const userId = req.user.id;
    const { productId } = req.body;

    if (!productId) {
      return res.status(400).json({ message: 'productId é obrigatório.' });
    }

    // garante que o produto existe
    const [products] = await pool.query(
      'SELECT id FROM products WHERE id = ?',
      [productId]
    );
    if (!products.length) {
      return res.status(404).json({ message: 'Produto não encontrado.' });
    }

    await pool.query(
      'INSERT IGNORE INTO favorites (user_id, product_id) VALUES (?, ?)',
      [userId, productId]
    );

    return res.status(201).json({ success: true });
  } catch (err) {
    console.error('[POST /api/favorites] Erro:', err);
    return res.status(500).json({ message: 'Erro interno no servidor.' });
  }
});

// DELETE /api/favorites/:productId
router.delete('/:productId', async (req, res) => {
  try {
    const userId = req.user.id;
    const productId = Number(req.params.productId);

    if (!Number.isInteger(productId)) {
      return res.status(400).json({ message: 'productId inválido.' });
    }

    await pool.query(
      'DELETE FROM favorites WHERE user_id = ? AND product_id = ?',
      [userId, productId]
    );

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('[DELETE /api/favorites/:productId] Erro:', err);
    return res.status(500).json({ message: 'Erro interno no servidor.' });
  }
});

module.exports = router;
