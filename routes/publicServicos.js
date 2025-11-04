// routes/publicServicos.js
const express = require("express");
const router = express.Router();
const pool = require("../config/pool");

/* ------------------ helpers ------------------ */
function normalizeImages(images) {
  if (!images) return [];
  try {
    if (typeof images === "string") {
      const s = images.trim();
      if (s.startsWith("[") && s.endsWith("]")) {
        const arr = JSON.parse(s);
        return Array.isArray(arr) ? arr.filter(Boolean) : [];
      }
      return s
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean);
    }
    if (Array.isArray(images)) return images.filter(Boolean);
    return [];
  } catch {
    return [];
  }
}

/** Carrega as imagens dos colaboradores numa única consulta e agrega em memória */
async function attachImages(rows) {
  if (!rows.length) return rows;
  const ids = rows.map((r) => r.id);
  const [imgs] = await pool.query(
    "SELECT colaborador_id, path FROM colaborador_images WHERE colaborador_id IN (?)",
    [ids]
  );
  const bucket = imgs.reduce((acc, it) => {
    (acc[it.colaborador_id] ||= []).push(it.path);
    return acc;
  }, {});
  return rows.map((r) => ({
    ...r,
    images: (bucket[r.id] || []).filter(Boolean),
  }));
}

/* =====================================================
   GET /api/public/servicos
   - Lista serviços públicos “espelhando” a lógica do admin:
     • base: colaboradores
     • join: especialidades
     • imagens: de colaborador_images (capa = c.imagem || primeira)
===================================================== */
router.get("/", async (_req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT
        c.id,
        c.nome,
        c.cargo,
        c.whatsapp,
        c.imagem    AS imagem_capa,     -- capa salva no colaborador
        c.descricao AS descricao,
        c.especialidade_id,
        e.nome      AS especialidade_nome
      FROM colaboradores c
      LEFT JOIN especialidades e ON e.id = c.especialidade_id
      ORDER BY c.id DESC
    `);

    const withImages = await attachImages(rows);

    const data = withImages.map((r) => {
      // Caso queira suportar "images" vindas como JSON/CSV no futuro:
      const extraFromColab = normalizeImages(r.images); // já é array, mas passamos no normalizador por segurança
      const imagem = r.imagem_capa || extraFromColab[0] || null;

      return {
        id: r.id,
        nome: r.nome,
        descricao: r.descricao,
        imagem,             // capa final
        images: extraFromColab,
        cargo: r.cargo,
        whatsapp: r.whatsapp,
        especialidade_id: r.especialidade_id,
        especialidade_nome: r.especialidade_nome,
      };
    });

    res.json(data);
  } catch (err) {
    console.error("Erro ao listar serviços públicos:", err);
    res.status(500).json({ message: "Erro interno ao listar serviços." });
  }
});

/* =====================================================
   GET /api/public/servicos/:id
   - Detalhe de um serviço/colaborador específico
===================================================== */
router.get("/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const [rows] = await pool.query(
      `
      SELECT
        c.id,
        c.nome,
        c.cargo,
        c.whatsapp,
        c.imagem    AS imagem_capa,
        c.descricao AS descricao,
        c.especialidade_id,
        e.nome      AS especialidade_nome
      FROM colaboradores c
      LEFT JOIN especialidades e ON e.id = c.especialidade_id
      WHERE c.id = ?
      `,
      [id]
    );

    if (!rows.length) {
      return res.status(404).json({ message: "Serviço não encontrado." });
    }

    const withImages = await attachImages(rows);
    const r = withImages[0];

    const lista = normalizeImages(r.images);
    const imagem = r.imagem_capa || lista[0] || null;

    res.json({
      id: r.id,
      nome: r.nome,
      descricao: r.descricao,
      imagem,
      images: lista,
      cargo: r.cargo,
      whatsapp: r.whatsapp,
      especialidade_id: r.especialidade_id,
      especialidade_nome: r.especialidade_nome,
    });
  } catch (err) {
    console.error("Erro ao obter serviço público:", err);
    res.status(500).json({ message: "Erro interno ao obter serviço." });
  }
});

module.exports = router;
