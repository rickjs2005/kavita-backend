const express = require("express");
const router = express.Router();
const path = require("path");
const multer = require("multer");

const pool = require("../config/pool");
const verifyAdmin = require("../middleware/verifyAdmin");

/* ========================
   UPLOAD CONFIG - MULTER
======================== */

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/colaboradores");
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const base = path.basename(file.originalname, ext);
    cb(null, `${base}-${Date.now()}${ext}`);
  },
});

const upload = multer({ storage });

/* ========================
   FUNÇÃO MOCK DE E-MAIL
======================== */

async function sendColaboradorAprovadoEmail(email, nome) {
  if (!email) return;
  console.log(
    `[EMAIL] Enviar para ${email}: Olá ${nome}, seu cadastro na Kavita foi aprovado!`
  );
}

/* ========================
   POST /public  (Trabalhe conosco)
   - recebe multipart/form-data
   - salva em colaboradores + colaborador_images
======================== */

router.post("/public", upload.single("imagem"), async (req, res) => {
  try {
    const {
      nome,
      cargo,
      whatsapp,
      email,
      descricao,
      especialidade_id,
    } = req.body;

    if (!nome || !whatsapp || !especialidade_id || !email) {
      return res.status(400).json({
        message:
          "Campos obrigatórios: nome, WhatsApp, e-mail e especialidade.",
      });
    }

    const especialidadeId = Number(especialidade_id);

    const [result] = await pool.query(
      `
      INSERT INTO colaboradores
      (nome, cargo, whatsapp, email, descricao, especialidade_id, verificado)
      VALUES (?, ?, ?, ?, ?, ?, 0)
    `,
      [
        nome,
        cargo || null,
        whatsapp,
        email,
        descricao || null,
        especialidadeId,
      ]
    );

    const colaboradorId = result.insertId;

    if (req.file) {
      const imagePath = `/uploads/colaboradores/${req.file.filename}`;

      await pool.query(
        "INSERT INTO colaborador_images (colaborador_id, path) VALUES (?, ?)",
        [colaboradorId, imagePath]
      );
    }

    return res.status(201).json({
      message:
        "Cadastro enviado! Você será avisado por e-mail quando seu perfil for aprovado.",
    });
  } catch (err) {
    console.error("Erro ao cadastrar colaborador (public):", err);
    return res
      .status(500)
      .json({ message: "Erro interno ao salvar o cadastro." });
  }
});

/* ========================
   POST /  (cadastra via admin)
======================== */

router.post("/", verifyAdmin, upload.single("imagem"), async (req, res) => {
  try {
    const {
      nome,
      cargo,
      whatsapp,
      email,
      descricao,
      especialidade_id,
    } = req.body;

    if (!nome || !whatsapp || !especialidade_id || !email) {
      return res.status(400).json({
        message:
          "Campos obrigatórios: nome, WhatsApp, e-mail e especialidade.",
      });
    }

    const especialidadeId = Number(especialidade_id);

    const [result] = await pool.query(
      `
      INSERT INTO colaboradores
      (nome, cargo, whatsapp, email, descricao, especialidade_id, verificado)
      VALUES (?, ?, ?, ?, ?, ?, 1)
    `,
      [
        nome,
        cargo || null,
        whatsapp,
        email,
        descricao || null,
        especialidadeId,
      ]
    );

    const colaboradorId = result.insertId;

    if (req.file) {
      const imagePath = `/uploads/colaboradores/${req.file.filename}`;

      await pool.query(
        "INSERT INTO colaborador_images (colaborador_id, path) VALUES (?, ?)",
        [colaboradorId, imagePath]
      );
    }

    return res
      .status(201)
      .json({ message: "Colaborador cadastrado com sucesso!" });
  } catch (err) {
    console.error("Erro ao salvar colaborador (admin):", err);
    return res.status(500).json({ message: "Erro ao salvar colaborador." });
  }
});

/* ========================
   GET /pending
======================== */

router.get("/pending", verifyAdmin, async (_req, res) => {
  try {
    const [rows] = await pool.query(
      `
      SELECT c.*, i.path AS imagem
      FROM colaboradores c
      LEFT JOIN colaborador_images i
        ON i.colaborador_id = c.id
      WHERE c.verificado = 0
      ORDER BY c.created_at DESC
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

/* ========================
   PUT /:id/verify
======================== */

router.put("/:id/verify", verifyAdmin, async (req, res) => {
  const { id } = req.params;

  try {
    const [rows] = await pool.query(
      "SELECT email, nome FROM colaboradores WHERE id = ?",
      [id]
    );

    if (!rows.length) {
      return res.status(404).json({ message: "Colaborador não encontrado." });
    }

    await pool.query(
      "UPDATE colaboradores SET verificado = 1 WHERE id = ?",
      [id]
    );

    await sendColaboradorAprovadoEmail(rows[0].email, rows[0].nome);

    return res.json({ message: "Colaborador verificado com sucesso!" });
  } catch (err) {
    console.error("Erro ao verificar colaborador:", err);
    return res.status(500).json({ message: "Erro ao verificar colaborador." });
  }
});

/* ========================
   DELETE /:id
======================== */

router.delete("/:id", verifyAdmin, async (req, res) => {
  const { id } = req.params;

  try {
    await pool.query("DELETE FROM colaborador_images WHERE colaborador_id = ?", [
      id,
    ]);

    const [result] = await pool.query(
      "DELETE FROM colaboradores WHERE id = ?",
      [id]
    );

    if (!result.affectedRows) {
      return res.status(404).json({ message: "Colaborador não encontrado." });
    }

    return res.json({ message: "Colaborador removido com sucesso." });
  } catch (err) {
    console.error("Erro ao deletar colaborador:", err);
    return res.status(500).json({ message: "Erro ao deletar colaborador." });
  }
});

module.exports = router;
