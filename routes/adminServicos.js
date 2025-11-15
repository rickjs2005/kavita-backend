// routes/adminServicos.js
const express = require("express");
const router = express.Router();
const multer = require("multer");
const pool = require("../config/pool");
const verifyAdmin = require("../middleware/verifyAdmin");
const storageService = require("../services/storage");

/* ==============================
   Configuração e helpers
============================== */
const COLAB_TABLE = "colaboradores";
const IMAGES_TABLE = "colaborador_images";
const IS_DEV = process.env.NODE_ENV !== "production";

const persistFiles = async (files = []) => {
  if (!files.length) return [];
  const stored = [];
  for (const file of files) {
    const uploaded = await storageService.uploadBuffer(file.buffer, file.originalname, file.mimetype);
    stored.push(uploaded);
  }
  return stored;
};

/* ---------- Multer para upload ---------- */
const imageFilter = (_req, file, cb) => {
  if (!file.mimetype || !file.mimetype.startsWith("image/")) {
    return cb(new Error("Arquivo não é uma imagem."), false);
  }
  cb(null, true);
};

const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: imageFilter,
  limits: {
    fileSize: Number(process.env.UPLOAD_MAX_FILE_SIZE || 5 * 1024 * 1024),
  },
});

/* ---------- Função auxiliar para anexar imagens ---------- */
async function attachImages(rows) {
  if (!rows.length) return rows;
  const ids = rows.map((r) => r.id);
  const [imgs] = await pool.query(
    `SELECT colaborador_id, path FROM ${IMAGES_TABLE} WHERE colaborador_id IN (?)`,
    [ids]
  );
  const bucket = imgs.reduce((acc, r) => {
    (acc[r.colaborador_id] ||= []).push(storageService.toPublicUrl(r.path));
    return acc;
  }, {});
  return rows.map((r) => ({
    ...r,
    images: (bucket[r.id] || []).map((p) => storageService.toPublicUrl(p)),
  }));
}

/* ==============================
   Rotas
============================== */

/**
 * @openapi
 * /api/admin/servicos:
 *   get:
 *     tags: [Admin, Serviços]
 *     summary: Lista todos os colaboradores/serviços cadastrados
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de serviços retornada
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items: { $ref: '#/components/schemas/Service' }
 *       401:
 *         description: Não autorizado
 *       500:
 *         description: Erro interno
 */

/**
 * @openapi
 * /api/admin/servicos:
 *   post:
 *     tags: [Admin, Serviços]
 *     summary: Cadastra um novo serviço/colaborador
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [nome, whatsapp, especialidade_id]
 *             properties:
 *               nome: { type: string }
 *               cargo: { type: string }
 *               whatsapp: { type: string }
 *               descricao: { type: string }
 *               especialidade_id: { type: integer }
 *               images: { type: array, items: { type: string, format: binary } }
 *     responses:
 *       201:
 *         description: Serviço cadastrado
 *       400:
 *         description: Campos obrigatórios ausentes
 *       401:
 *         description: Não autorizado
 *       500:
 *         description: Erro interno
 */

/**
 * @openapi
 * /api/admin/servicos/{id}:
 *   put:
 *     tags: [Admin, Serviços]
 *     summary: Atualiza serviço existente (imagens inclusas)
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
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               nome: { type: string }
 *               cargo: { type: string }
 *               whatsapp: { type: string }
 *               descricao: { type: string }
 *               especialidade_id: { type: integer }
 *               keepImages: { type: string }
 *               images: { type: array, items: { type: string, format: binary } }
 *     responses:
 *       200:
 *         description: Serviço atualizado
 *       404:
 *         description: Serviço não encontrado
 *       401:
 *         description: Não autorizado
 *       500:
 *         description: Erro interno
 */

/**
 * @openapi
 * /api/admin/servicos/{id}:
 *   delete:
 *     tags: [Admin, Serviços]
 *     summary: Remove serviço e apaga imagens relacionadas
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Serviço removido
 *       404:
 *         description: Serviço não encontrado
 *       401:
 *         description: Não autorizado
 *       500:
 *         description: Erro interno
 */

/** 🔹 GET /api/admin/servicos — Lista todos os colaboradores + imagens + especialidade */
router.get("/", verifyAdmin, async (_req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT 
        c.id,
        c.nome,
        c.cargo,
        c.whatsapp,
        c.imagem,
        c.descricao,
        c.especialidade_id,
        e.nome AS especialidade_nome
      FROM ${COLAB_TABLE} c
      LEFT JOIN especialidades e ON c.especialidade_id = e.id
      ORDER BY c.id DESC
    `);
    const withImages = await attachImages(rows);
    res.json(withImages);
  } catch (err) {
    console.error("Erro ao buscar serviços:", err);
    res.status(500).json({ message: "Erro ao buscar serviços." });
  }
});

/** 🔹 POST /api/admin/servicos — Cria colaborador/serviço com múltiplas imagens */
router.post("/", verifyAdmin, upload.array("images"), async (req, res) => {
  const { nome, cargo, whatsapp, descricao, especialidade_id } = req.body;
  const files = req.files || [];

  if (!nome || !whatsapp || !especialidade_id) {
    return res
      .status(400)
      .json({ message: "Campos obrigatórios: nome, whatsapp e especialidade." });
  }

  let uploaded = [];
  try {
    uploaded = await persistFiles(files);
  } catch (err) {
    console.error("Erro ao enviar arquivos para o storage:", err);
    return res.status(500).json({
      message: "Erro ao armazenar imagens.",
      ...(IS_DEV && { error: err.message }),
    });
  }

  const conn = await pool.getConnection();
  let pendingDeletion = [];
  try {
    await conn.beginTransaction();

    const [insert] = await conn.query(
      `INSERT INTO ${COLAB_TABLE} (nome, cargo, whatsapp, imagem, descricao, especialidade_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [nome.trim(), cargo || null, whatsapp.trim(), null, descricao || null, especialidade_id]
    );
    const colaboradorId = insert.insertId;

    if (uploaded.length) {
      const values = uploaded.map((f) => [colaboradorId, f.url]);
      await conn.query(
        `INSERT INTO ${IMAGES_TABLE} (colaborador_id, path) VALUES ?`,
        [values]
      );
      await conn.query(
        `UPDATE ${COLAB_TABLE} SET imagem = ? WHERE id = ?`,
        [values[0][1], colaboradorId]
      );
    }

    await conn.commit();
    res.status(201).json({ message: "Serviço cadastrado com sucesso.", id: colaboradorId });
  } catch (err) {
    await conn.rollback();
    if (uploaded.length) {
      await Promise.all(
        uploaded.map((file) => storageService.deleteFile(file.url).catch(() => {}))
      );
    }
    console.error("Erro ao cadastrar serviço:", err);
    res.status(500).json({ message: "Erro ao cadastrar serviço." });
  } finally {
    conn.release();
  }
});

/** 🔹 PUT /api/admin/servicos/:id — Atualiza colaborador + imagens (mantém/remover novas) */
router.put("/:id", verifyAdmin, upload.array("images"), async (req, res) => {
  const { id } = req.params;
  const { nome, cargo, whatsapp, descricao, especialidade_id, keepImages = "[]" } = req.body;
  const newFiles = req.files || [];

  let keep = [];
  try {
    keep = JSON.parse(keepImages || "[]");
  } catch {
    keep = [];
  }

  let uploaded = [];
  try {
    uploaded = await persistFiles(newFiles);
  } catch (err) {
    console.error("Erro ao enviar arquivos para o storage:", err);
    return res.status(500).json({
      message: "Erro ao armazenar novas imagens.",
      ...(IS_DEV && { error: err.message }),
    });
  }

  const conn = await pool.getConnection();
  let pendingDeletion = [];
  try {
    await conn.beginTransaction();

    const [exists] = await conn.query(`SELECT id FROM ${COLAB_TABLE} WHERE id = ?`, [id]);
    if (!exists.length) {
      await conn.rollback();
      return res.status(404).json({ message: "Serviço não encontrado." });
    }

    await conn.query(
      `UPDATE ${COLAB_TABLE}
         SET nome=?, cargo=?, whatsapp=?, descricao=?, especialidade_id=?
       WHERE id=?`,
      [nome.trim(), cargo || null, whatsapp.trim(), descricao || null, especialidade_id, id]
    );

    // imagens atuais
    const [curImgs] = await conn.query(
      `SELECT path FROM ${IMAGES_TABLE} WHERE colaborador_id = ?`,
      [id]
    );
    const currentPaths = curImgs.map((r) => r.path);
    const toRemove = currentPaths.filter((p) => !keep.includes(p));

    if (toRemove.length) {
      await conn.query(
        `DELETE FROM ${IMAGES_TABLE} WHERE colaborador_id = ? AND path IN (?)`,
        [id, toRemove]
      );
      pendingDeletion = toRemove;
    }

    if (uploaded.length) {
      const values = uploaded.map((f) => [id, f.url]);
      await conn.query(
        `INSERT INTO ${IMAGES_TABLE} (colaborador_id, path) VALUES ?`,
        [values]
      );
      keep = [...keep, ...values.map((v) => v[1])];
    }

    const firstImage = keep[0] || null;
    await conn.query(`UPDATE ${COLAB_TABLE} SET imagem = ? WHERE id = ?`, [firstImage, id]);

    await conn.commit();
    if (pendingDeletion.length) {
      await Promise.all(
        pendingDeletion.map((file) => storageService.deleteFile(file).catch(() => {}))
      );
    }
    res.json({ message: "Serviço atualizado com sucesso." });
  } catch (err) {
    await conn.rollback();
    if (uploaded.length) {
      await Promise.all(
        uploaded.map((file) => storageService.deleteFile(file.url).catch(() => {}))
      );
    }
    console.error("Erro ao atualizar serviço:", err);
    res.status(500).json({ message: "Erro ao atualizar serviço." });
  } finally {
    conn.release();
  }
});

/** 🔹 DELETE /api/admin/servicos/:id — Exclui colaborador e apaga imagens */
router.delete("/:id", verifyAdmin, async (req, res) => {
  const { id } = req.params;
  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    const [imgs] = await conn.query(
      `SELECT path FROM ${IMAGES_TABLE} WHERE colaborador_id = ?`,
      [id]
    );

    await conn.query(`DELETE FROM ${IMAGES_TABLE} WHERE colaborador_id = ?`, [id]);
    const [result] = await conn.query(`DELETE FROM ${COLAB_TABLE} WHERE id = ?`, [id]);

    if (result.affectedRows === 0) {
      await conn.rollback();
      return res.status(404).json({ message: "Serviço não encontrado." });
    }

    await conn.commit();

    await Promise.all(
      imgs.map((r) => storageService.deleteFile(r.path).catch(() => {}))
    );

    res.json({ message: "Serviço removido com sucesso." });
  } catch (err) {
    await conn.rollback();
    console.error("Erro ao remover serviço:", err);
    res.status(500).json({ message: "Erro ao remover serviço." });
  } finally {
    conn.release();
  }
});

module.exports = router;
