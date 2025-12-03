// routes/adminPermissionsRoutes.js
const express = require("express");
const router = express.Router();
const pool = require("../config/pool");
const verifyAdmin = require("../middleware/verifyAdmin");
const requirePermission = require("../middleware/requirePermission");
const logAdminAction = require("../utils/adminLogger");

/**
 * GET /api/admin/permissions
 * Lista todas as permissões
 */
router.get("/", verifyAdmin, async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT id, chave, grupo, descricao FROM admin_permissions ORDER BY grupo ASC, chave ASC"
    );
    res.json(rows);
  } catch (err) {
    console.error("Erro ao listar permissões:", err.message);
    res.status(500).json({ message: "Erro ao listar permissões." });
  }
});

/**
 * POST /api/admin/permissions
 * Cria permissão
 */
router.post(
  "/",
  verifyAdmin,
  requirePermission("permissions_manage"),
  async (req, res) => {
    const { chave, grupo, descricao } = req.body || {};

    if (!chave || !grupo) {
      return res
        .status(400)
        .json({ message: "chave e grupo são obrigatórios." });
    }

    const chaveNorm = String(chave).trim().toLowerCase();
    const grupoNorm = String(grupo).trim();

    try {
      const [existe] = await pool.query(
        "SELECT id FROM admin_permissions WHERE chave = ?",
        [chaveNorm]
      );

      if (existe.length > 0) {
        return res
          .status(409)
          .json({ message: "Já existe uma permissão com essa chave." });
      }

      const [result] = await pool.query(
        "INSERT INTO admin_permissions (chave, grupo, descricao) VALUES (?, ?, ?)",
        [chaveNorm, grupoNorm, descricao || null]
      );

      logAdminAction({
        adminId: req.admin.id,
        acao: "criar_permissao",
        entidade: "admin_permission",
        entidadeId: result.insertId,
      });

      res.status(201).json({
        id: result.insertId,
        chave: chaveNorm,
        grupo: grupoNorm,
        descricao: descricao || null,
      });
    } catch (err) {
      console.error("Erro ao criar permissão:", err.message);
      res.status(500).json({ message: "Erro ao criar permissão." });
    }
  }
);

/**
 * PUT /api/admin/permissions/:id
 */
router.put(
  "/:id",
  verifyAdmin,
  requirePermission("permissions_manage"),
  async (req, res) => {
    const { id } = req.params;
    const { chave, grupo, descricao } = req.body || {};

    if (!chave && !grupo && typeof descricao === "undefined") {
      return res.status(400).json({
        message:
          "Envie pelo menos um campo para atualizar (chave, grupo ou descricao).",
      });
    }

    try {
      const campos = [];
      const valores = [];

      if (chave) {
        const chaveNorm = String(chave).trim().toLowerCase();
        campos.push("chave = ?");
        valores.push(chaveNorm);
      }

      if (grupo) {
        const grupoNorm = String(grupo).trim();
        campos.push("grupo = ?");
        valores.push(grupoNorm);
      }

      if (typeof descricao !== "undefined") {
        campos.push("descricao = ?");
        valores.push(descricao || null);
      }

      valores.push(id);

      const [result] = await pool.query(
        `UPDATE admin_permissions SET ${campos.join(", ")} WHERE id = ?`,
        valores
      );

      if (result.affectedRows === 0) {
        return res.status(404).json({ message: "Permissão não encontrada." });
      }

      logAdminAction({
        adminId: req.admin.id,
        acao: "atualizar_permissao",
        entidade: "admin_permission",
        entidadeId: id,
      });

      res.json({ message: "Permissão atualizada com sucesso." });
    } catch (err) {
      console.error("Erro ao atualizar permissão:", err.message);
      res.status(500).json({ message: "Erro ao atualizar permissão." });
    }
  }
);

/**
 * DELETE /api/admin/permissions/:id
 */
router.delete(
  "/:id",
  verifyAdmin,
  requirePermission("permissions_manage"),
  async (req, res) => {
    const { id } = req.params;

    try {
      const [result] = await pool.query(
        "DELETE FROM admin_permissions WHERE id = ?",
        [id]
      );

      if (result.affectedRows === 0) {
        return res.status(404).json({ message: "Permissão não encontrada." });
      }

      logAdminAction({
        adminId: req.admin.id,
        acao: "remover_permissao",
        entidade: "admin_permission",
        entidadeId: id,
      });

      res.json({ message: "Permissão removida com sucesso." });
    } catch (err) {
      console.error("Erro ao remover permissão:", err.message);
      res.status(500).json({ message: "Erro ao remover permissão." });
    }
  }
);

module.exports = router;
