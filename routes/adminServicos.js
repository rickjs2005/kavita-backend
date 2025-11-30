// routes/adminServicos.js
const express = require("express");
const router = express.Router();
const pool = require("../config/pool");
const verifyAdmin = require("../middleware/verifyAdmin");
const mediaService = require("../services/mediaService");

/* ==============================
   Configuração e helpers
============================== */
const COLAB_TABLE = "colaboradores";
const IMAGES_TABLE = "colaborador_images";
const IS_DEV = process.env.NODE_ENV !== "production";

/* ---------- Upload Helpers ---------- */
const upload = mediaService.upload;
const mapUploadedFiles = (files = []) =>
  files
    .filter((file) => !!file?.filename)
    .map((file) => ({ path: mediaService.toPublicPath(file.filename) }));

/* ---------- Função auxiliar para anexar imagens ---------- */
async function attachImages(rows) {
  if (!rows.length) return rows;
  const ids = rows.map((r) => r.id);
  const [imgs] = await pool.query(
    `SELECT colaborador_id, path FROM ${IMAGES_TABLE} WHERE colaborador_id IN (?)`,
    [ids]
  );
  const bucket = imgs.reduce((acc, r) => {
    (acc[r.colaborador_id] ||= []).push(r.path);
    return acc;
  }, {});
  return rows.map((r) => ({ ...r, images: bucket[r.id] || [] }));
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
 *         description: Lista de serviços
 *       401:
 *         description: Não autorizado
 *       500:
 *         description: Erro interno
 */
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
        c.verificado,
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

/** 🔹 POST /api/admin/servicos — Cria novo colaborador + imagens
 *
 * @openapi
 * /api/admin/servicos:
 *   post:
 *     tags: [Admin, Serviços]
 *     summary: Cria um novo serviço/colaborador
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
 *         description: Serviço criado
 *       400:
 *         description: Erro de validação
 *       401:
 *         description: Não autorizado
 *       500:
 *         description: Erro interno
 */
router.post("/", verifyAdmin, upload.array("images"), async (req, res) => {
  const { nome, cargo, whatsapp, descricao, especialidade_id } = req.body;
  const files = req.files || [];

  if (!nome || !whatsapp || !especialidade_id) {
    return res
      .status(400)
      .json({ message: "Campos obrigatórios: nome, whatsapp e especialidade." });
  }

  const conn = await pool.getConnection();
  let uploadedMedia = [];
  try {
    await conn.beginTransaction();

    // 🔹 TUDO que for criado via admin já nasce verificado = 1
    const [insert] = await conn.query(
      `INSERT INTO ${COLAB_TABLE} (nome, cargo, whatsapp, imagem, descricao, especialidade_id, verificado)
       VALUES (?, ?, ?, ?, ?, ?, 1)`,
      [nome.trim(), cargo || null, whatsapp.trim(), null, descricao || null, especialidade_id]
    );
    const colaboradorId = insert.insertId;

    if (files.length) {
      uploadedMedia = await mediaService.persistMedia(files, { folder: "services" });
      if (uploadedMedia.length) {
        const values = uploadedMedia.map((media) => [colaboradorId, media.path]);
        await conn.query(
          `INSERT INTO ${IMAGES_TABLE} (colaborador_id, path) VALUES ?`,
          [values]
        );
        await conn.query(
          `UPDATE ${COLAB_TABLE} SET imagem = ? WHERE id = ?`,
          [uploadedMedia[0].path, colaboradorId]
        );
      }
    }

    await conn.commit();
    res.status(201).json({ message: "Serviço cadastrado com sucesso.", id: colaboradorId });
  } catch (err) {
    await conn.rollback();
    console.error("Erro ao cadastrar serviço:", err);
    if (uploadedMedia.length) {
      try {
        await mediaService.cleanupMedia(uploadedMedia);
      } catch (cleanupErr) {
        console.error("Erro ao limpar mídia após falha:", cleanupErr);
      }
    }
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
    keep = JSON.parse(keepImages);
    if (!Array.isArray(keep)) throw new Error();
  } catch {
    return res.status(400).json({ message: "keepImages precisa ser um array JSON." });
  }

  const conn = await pool.getConnection();
  let newlyUploaded = [];

  try {
    await conn.beginTransaction();

    await conn.query(
      `
      UPDATE ${COLAB_TABLE}
      SET nome = ?, cargo = ?, whatsapp = ?, descricao = ?, especialidade_id = ?
      WHERE id = ?
      `,
      [nome, cargo || null, whatsapp, descricao || null, especialidade_id, id]
    );

    const [existingImagesRows] = await conn.query(
      `SELECT id, path FROM ${IMAGES_TABLE} WHERE colaborador_id = ?`,
      [id]
    );
    const existingImages = existingImagesRows || [];

    const toKeep = existingImages.filter((img) => keep.includes(img.path));
    const toRemove = existingImages.filter((img) => !keep.includes(img.path));

    const removeIds = toRemove.map((img) => img.id);
    const imagesToDeletePaths = toRemove.map((img) => img.path);

    if (removeIds.length) {
      await conn.query(
        `DELETE FROM ${IMAGES_TABLE} WHERE id IN (?) AND colaborador_id = ?`,
        [removeIds, id]
      );
    }

    if (newFiles.length) {
      newlyUploaded = await mediaService.persistMedia(newFiles, { folder: "services" });

      if (newlyUploaded.length) {
        const values = newlyUploaded.map((media) => [id, media.path]);
        await conn.query(
          `INSERT INTO ${IMAGES_TABLE} (colaborador_id, path) VALUES ?`,
          [values]
        );
      }
    }

    const finalImages = [...toKeep.map((img) => img.path), ...newlyUploaded.map((m) => m.path)];
    const mainImage = finalImages.length ? finalImages[0] : null;

    await conn.query(
      `UPDATE ${COLAB_TABLE} SET imagem = ? WHERE id = ?`,
      [mainImage, id]
    );

    await conn.commit();

    if (imagesToDeletePaths.length) {
      try {
        await mediaService.cleanupMedia(imagesToDeletePaths.map((p) => ({ path: p })));
      } catch (cleanupErr) {
        console.error("Erro ao remover arquivos antigos do disco:", cleanupErr);
      }
    }

    res.json({ message: "Serviço atualizado com sucesso." });
  } catch (err) {
    await conn.rollback();
    console.error("Erro ao atualizar serviço:", err);

    if (newlyUploaded.length) {
      try {
        await mediaService.cleanupMedia(newlyUploaded);
      } catch (cleanupErr) {
        console.error("Erro ao limpar mídia após falha no update:", cleanupErr);
      }
    }

    res.status(500).json({ message: "Erro ao atualizar serviço." });
  } finally {
    conn.release();
  }
});

/**
 * @openapi
 * /api/admin/servicos/{id}:
 *   delete:
 *     tags: [Admin, Serviços]
 *     summary: Remove um serviço/colaborador
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
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
router.delete("/:id", verifyAdmin, async (req, res) => {
  const { id } = req.params;
  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    const [images] = await conn.query(
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

    if (images.length) {
      try {
        await mediaService.cleanupMedia(images.map((img) => ({ path: img.path })));
      } catch (cleanupErr) {
        console.error("Erro ao apagar arquivos de mídia:", cleanupErr);
      }
    }

    res.json({ message: "Serviço removido com sucesso." });
  } catch (err) {
    await conn.rollback();
    console.error("Erro ao remover serviço:", err);
    res.status(500).json({ message: "Erro ao remover serviço." });
  } finally {
    conn.release();
  }
});

/**
 * @openapi
 * /api/admin/servicos/{id}/verificado:
 *   patch:
 *     tags: [Admin, Serviços]
 *     summary: Atualiza status de verificação do serviço/colaborador
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               verificado:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Status de verificação atualizado
 *       400:
 *         description: Requisição inválida
 *       404:
 *         description: Serviço não encontrado
 *       401:
 *         description: Não autorizado
 *       500:
 *         description: Erro interno
 */
router.patch("/:id/verificado", verifyAdmin, async (req, res) => {
  const { id } = req.params;
  const { verificado } = req.body || {};

  if (typeof verificado !== "boolean") {
    return res.status(400).json({ message: "Campo 'verificado' precisa ser boolean." });
  }

  try {
    const [result] = await pool.query(
      `UPDATE ${COLAB_TABLE} SET verificado = ? WHERE id = ?`,
      [verificado ? 1 : 0, id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Serviço não encontrado." });
    }

    return res.json({
      message: `Serviço ${verificado ? "verificado" : "marcado como não verificado"} com sucesso.`,
      verificado,
    });
  } catch (err) {
    console.error("Erro ao atualizar verificado do serviço:", err);
    return res
      .status(500)
      .json({ message: "Erro ao atualizar status de verificação do serviço." });
  }
});

module.exports = router;
