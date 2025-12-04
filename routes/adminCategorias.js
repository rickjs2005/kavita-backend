// routes/adminCategorias.js
const express = require("express");
const router = express.Router();
const pool = require("../config/pool");
const verifyAdmin = require("../middleware/verifyAdmin");

// helper simples para gerar slug a partir do nome
function slugify(str = "") {
  return String(str)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // tira acentos
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")    // tira caracteres estranhos
    .replace(/\s+/g, "-")            // espaço -> -
    .replace(/-+/g, "-");            // vários - -> um só
}

/**
 * @openapi
 * /api/admin/categorias:
 *   get:
 *     tags: [Admin, Categorias]
 *     summary: Lista todas as categorias cadastradas
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de categorias retornada com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id: { type: integer }
 *                   name: { type: string }
 *                   slug: { type: string }
 *                   is_active: { type: boolean }
 *                   sort_order: { type: integer }
 *       401:
 *         description: Não autorizado
 *       500:
 *         description: Erro interno
 */
router.get("/", verifyAdmin, async (_req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT id, name, slug, is_active, sort_order FROM categories ORDER BY sort_order ASC, name ASC"
    );
    res.json(rows);
  } catch (err) {
    console.error("Erro ao buscar categorias:", err);
    res.status(500).json({ message: "Erro ao buscar categorias" });
  }
});

/**
 * @openapi
 * /api/admin/categorias:
 *   post:
 *     tags: [Admin, Categorias]
 *     summary: Cria uma nova categoria
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name: { type: string }
 *               slug: { type: string, nullable: true }
 *               sort_order: { type: integer, nullable: true }
 *     responses:
 *       201:
 *         description: Categoria criada
 *       400:
 *         description: Dados inválidos
 *       401:
 *         description: Não autorizado
 *       500:
 *         description: Erro interno
 */
router.post("/", verifyAdmin, async (req, res) => {
  try {
    const { name = "", slug = "", sort_order = 0 } = req.body;

    if (!name.trim()) {
      return res.status(400).json({ message: "Nome é obrigatório." });
    }

    const finalSlug = slug.trim() ? slugify(slug) : slugify(name);

    const [result] = await pool.query(
      "INSERT INTO categories (name, slug, is_active, sort_order) VALUES (?, ?, 1, ?)",
      [name.trim(), finalSlug, sort_order || 0]
    );

    res.status(201).json({
      id: result.insertId,
      name: name.trim(),
      slug: finalSlug,
      is_active: 1,
      sort_order: sort_order || 0,
    });
  } catch (err) {
    console.error("Erro ao criar categoria:", err);
    if (err.code === "ER_DUP_ENTRY") {
      return res
        .status(400)
        .json({ message: "Já existe uma categoria com esse slug." });
    }
    res.status(500).json({ message: "Erro ao criar categoria." });
  }
});

/**
 * @openapi
 * /api/admin/categorias/{id}:
 *   put:
 *     tags: [Admin, Categorias]
 *     summary: Atualiza nome, slug ou ordem da categoria
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name: { type: string }
 *               slug: { type: string }
 *               sort_order: { type: integer }
 *     responses:
 *       200:
 *         description: Categoria atualizada
 *       404:
 *         description: Categoria não encontrada
 *       500:
 *         description: Erro interno
 */
router.put("/:id", verifyAdmin, async (req, res) => {
  const { id } = req.params;
  const { name, slug, sort_order } = req.body;

  try {
    const [rows] = await pool.query(
      "SELECT id, name, slug, sort_order, is_active FROM categories WHERE id = ?",
      [id]
    );
    if (!rows.length) {
      return res.status(404).json({ message: "Categoria não encontrada." });
    }

    const current = rows[0];

    const newName = name !== undefined ? String(name).trim() : current.name;
    const newSlug =
      slug !== undefined && slug.trim()
        ? slugify(slug)
        : current.slug || slugify(newName);
    const newOrder =
      sort_order !== undefined && sort_order !== null
        ? Number(sort_order) || 0
        : current.sort_order;

    await pool.query(
      "UPDATE categories SET name = ?, slug = ?, sort_order = ? WHERE id = ?",
      [newName, newSlug, newOrder, id]
    );

    res.json({
      id: current.id,
      name: newName,
      slug: newSlug,
      sort_order: newOrder,
      is_active: current.is_active,
    });
  } catch (err) {
    console.error("Erro ao atualizar categoria:", err);
    res.status(500).json({ message: "Erro ao atualizar categoria." });
  }
});

/**
 * @openapi
 * /api/admin/categorias/{id}/status:
 *   patch:
 *     tags: [Admin, Categorias]
 *     summary: Ativa ou desativa uma categoria
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               is_active: { type: boolean }
 *     responses:
 *       200:
 *         description: Status atualizado
 *       404:
 *         description: Categoria não encontrada
 *       500:
 *         description: Erro interno
 */
router.patch("/:id/status", verifyAdmin, async (req, res) => {
  const { id } = req.params;
  const { is_active } = req.body;

  try {
    const [result] = await pool.query(
      "UPDATE categories SET is_active = ? WHERE id = ?",
      [is_active ? 1 : 0, id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Categoria não encontrada." });
    }

    res.json({ message: "Status atualizado com sucesso." });
  } catch (err) {
    console.error("Erro ao atualizar status da categoria:", err);
    res.status(500).json({ message: "Erro ao atualizar status." });
  }
});

/**
 * @openapi
 * /api/admin/categorias/{id}:
 *   delete:
 *     tags: [Admin, Categorias]
 *     summary: Remove uma categoria
 *     description: Em muitos casos é melhor apenas desativar (is_active = 0) para não quebrar produtos antigos.
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Categoria removida
 *       404:
 *         description: Categoria não encontrada
 *       500:
 *         description: Erro interno
 */
router.delete("/:id", verifyAdmin, async (req, res) => {
  const { id } = req.params;

  try {
    // se quiser proteger, pode checar se há produtos ainda nessa categoria antes de deletar
    const [result] = await pool.query("DELETE FROM categories WHERE id = ?", [
      id,
    ]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Categoria não encontrada." });
    }

    res.json({ message: "Categoria removida com sucesso." });
  } catch (err) {
    console.error("Erro ao remover categoria:", err);
    res.status(500).json({ message: "Erro ao remover categoria." });
  }
});

module.exports = router;
