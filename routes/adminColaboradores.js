const express = require("express");
const router = express.Router();

const pool = require("../config/pool");
const verifyAdmin = require("../middleware/verifyAdmin");

/**
 * @openapi
 * tags:
 *   - name: Admin - Colaboradores
 *     description: Gestão de colaboradores (prestadores de serviço) pela área administrativa
 *   - name: Public - Colaboradores
 *     description: Cadastro público de prestadores de serviço via site Kavita
 */

/**
 * @openapi
 * /api/admin/colaboradores:
 *   post:
 *     tags: [Admin - Colaboradores]
 *     summary: Cadastra um novo colaborador (admin)
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - nome
 *               - whatsapp
 *               - especialidade_id
 *             properties:
 *               nome:
 *                 type: string
 *               cargo:
 *                 type: string
 *               whatsapp:
 *                 type: string
 *               imagem:
 *                 type: string
 *                 nullable: true
 *               descricao:
 *                 type: string
 *                 nullable: true
 *               especialidade_id:
 *                 type: integer
 *     responses:
 *       201:
 *         description: Colaborador cadastrado com sucesso
 *       400:
 *         description: Campos obrigatórios ausentes ou inválidos
 *       401:
 *         description: Não autorizado
 *       500:
 *         description: Erro interno no servidor
 */

// ✅ POST /api/admin/colaboradores — cadastra colaborador via painel admin
router.post("/", verifyAdmin, async (req, res) => {
  const { nome, cargo, whatsapp, imagem, descricao, especialidade_id } = req.body;

  if (!nome || !whatsapp || !especialidade_id) {
    return res.status(400).json({
      message: "Campos obrigatórios: nome, WhatsApp e especialidade.",
    });
  }

  try {
    const especialidadeId = parseInt(especialidade_id, 10);

    if (Number.isNaN(especialidadeId)) {
      return res.status(400).json({ message: "ID da especialidade inválido." });
    }

    await pool.query(
      `
        INSERT INTO colaboradores (
          nome,
          cargo,
          whatsapp,
          imagem,
          descricao,
          especialidade_id,
          verificado
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      [
        nome,
        cargo || null,
        whatsapp,
        imagem || null,
        descricao || null,
        especialidadeId,
        1, // ✅ cadastrado pelo admin → já entra verificado
      ]
    );

    return res.status(201).json({ message: "Colaborador cadastrado com sucesso!" });
  } catch (err) {
    console.error("Erro ao salvar colaborador (admin):", err);
    return res.status(500).json({ message: "Erro ao salvar colaborador." });
  }
});

/**
 * @openapi
 * /api/admin/colaboradores/public:
 *   post:
 *     tags: [Public - Colaboradores]
 *     summary: Recebe cadastro público de prestador de serviço (Trabalhe Conosco)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - nome
 *               - whatsapp
 *               - especialidade_id
 *             properties:
 *               nome:
 *                 type: string
 *               cargo:
 *                 type: string
 *               whatsapp:
 *                 type: string
 *               imagem:
 *                 type: string
 *                 nullable: true
 *               descricao:
 *                 type: string
 *                 nullable: true
 *               especialidade_id:
 *                 type: integer
 *     responses:
 *       201:
 *         description: Cadastro recebido para análise
 *       400:
 *         description: Campos obrigatórios ausentes ou inválidos
 *       500:
 *         description: Erro interno no servidor
 */

// ✅ POST /api/admin/colaboradores/public — cadastro vindo do site (sem auth)
router.post("/public", async (req, res) => {
  const { nome, cargo, whatsapp, imagem, descricao, especialidade_id } = req.body;

  if (!nome || !whatsapp || !especialidade_id) {
    return res.status(400).json({
      message: "Campos obrigatórios: nome, WhatsApp e especialidade.",
    });
  }

  try {
    const especialidadeId = parseInt(especialidade_id, 10);

    if (Number.isNaN(especialidadeId)) {
      return res.status(400).json({ message: "ID da especialidade inválido." });
    }

    await pool.query(
      `
        INSERT INTO colaboradores (
          nome,
          cargo,
          whatsapp,
          imagem,
          descricao,
          especialidade_id,
          verificado
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      [
        nome,
        cargo || null,
        whatsapp,
        imagem || null,
        descricao || null,
        especialidadeId,
        0, // ✅ cadastro público → entra como pendente
      ]
    );

    return res.status(201).json({
      message:
        "Cadastro recebido! A equipe da Kavita vai analisar seus dados e liberar seu perfil.",
    });
  } catch (err) {
    console.error("Erro ao salvar colaborador (public):", err);
    return res.status(500).json({ message: "Erro ao salvar cadastro." });
  }
});

/**
 * @openapi
 * /api/admin/colaboradores/{id}:
 *   delete:
 *     tags: [Admin - Colaboradores]
 *     summary: Exclui colaborador pelo ID
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Colaborador removido com sucesso
 *       404:
 *         description: Colaborador não encontrado
 *       401:
 *         description: Não autorizado
 *       500:
 *         description: Erro ao deletar colaborador
 */

// ✅ DELETE /api/admin/colaboradores/:id — remove colaborador
router.delete("/:id", verifyAdmin, async (req, res) => {
  const { id } = req.params;

  try {
    const [result] = await pool.query(
      "DELETE FROM colaboradores WHERE id = ?",
      [id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Colaborador não encontrado." });
    }

    return res.status(200).json({ message: "Colaborador removido com sucesso." });
  } catch (err) {
    console.error("Erro ao deletar colaborador:", err);
    return res.status(500).json({ message: "Erro ao deletar colaborador." });
  }
});

/**
 * @openapi
 * /api/admin/colaboradores/pending:
 *   get:
 *     tags: [Admin - Colaboradores]
 *     summary: Lista colaboradores ainda não verificados
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de colaboradores pendentes
 *       401:
 *         description: Não autorizado
 *       500:
 *         description: Erro ao listar colaboradores pendentes
 */

// ✅ GET /api/admin/colaboradores/pending — lista não verificados
router.get("/pending", verifyAdmin, async (_req, res) => {
  try {
    const [rows] = await pool.query(
      `
        SELECT
          id,
          nome,
          cargo,
          whatsapp,
          descricao,
          especialidade_id,
          verificado,
          created_at
        FROM colaboradores
        WHERE verificado = 0
        ORDER BY created_at DESC
      `
    );

    return res.json(rows);
  } catch (err) {
    console.error("Erro ao listar colaboradores pendentes:", err);
    return res
      .status(500)
      .json({ message: "Erro ao listar colaboradores pendentes." });
  }
});

/**
 * @openapi
 * /api/admin/colaboradores/{id}/verify:
 *   put:
 *     tags: [Admin - Colaboradores]
 *     summary: Marca colaborador como verificado
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Colaborador verificado com sucesso
 *       404:
 *         description: Colaborador não encontrado
 *       401:
 *         description: Não autorizado
 *       500:
 *         description: Erro ao verificar colaborador
 */

// ✅ PUT /api/admin/colaboradores/:id/verify — marca como verificado
router.put("/:id/verify", verifyAdmin, async (req, res) => {
  const { id } = req.params;

  try {
    const [result] = await pool.query(
      "UPDATE colaboradores SET verificado = 1 WHERE id = ?",
      [id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Colaborador não encontrado." });
    }

    return res.json({ message: "Colaborador verificado com sucesso." });
  } catch (err) {
    console.error("Erro ao verificar colaborador:", err);
    return res.status(500).json({ message: "Erro ao verificar colaborador." });
  }
});

module.exports = router;
