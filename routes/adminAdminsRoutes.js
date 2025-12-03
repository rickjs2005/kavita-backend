// routes/adminAdminsRoutes.js
const express = require("express");
const router = express.Router();
const bcrypt = require("bcrypt");
const pool = require("../config/pool");
const verifyAdmin = require("../middleware/verifyAdmin");
const requirePermission = require("../middleware/requirePermission");
const logAdminAction = require("../utils/adminLogger");

/**
 * @openapi
 * /api/admin/admins:
 *   get:
 *     tags: [Admin, Admins]
 *     summary: Lista todos os administradores
 *     security:
 *       - bearerAuth: []
 *   post:
 *     tags: [Admin, Admins]
 *     summary: Cria um novo administrador
 *     security:
 *       - bearerAuth: []
 * /api/admin/admins/{id}:
 *   put:
 *     tags: [Admin, Admins]
 *     summary: Atualiza role/ativo de um administrador
 *     security:
 *       - bearerAuth: []
 *   delete:
 *     tags: [Admin, Admins]
 *     summary: Remove (deleta) um administrador
 *     security:
 *       - bearerAuth: []
 */

/**
 * ✅ LISTAR todos os admins
 * GET /api/admin/admins
 * Somente quem tiver admins_manage
 */
router.get("/", verifyAdmin, requirePermission("admins_manage"), async (req, res) => {
  try {
    const [rows] = await pool.query(
      `
        SELECT 
          id, nome, email, role, ativo, criado_em, ultimo_login
        FROM admins
        ORDER BY role = 'master' DESC, nome ASC
      `
    );
    res.json(rows);
  } catch (err) {
    console.error("Erro ao listar admins:", err.message);
    res.status(500).json({ message: "Erro ao listar admins." });
  }
});

/**
 * ✅ CRIAR novo admin
 * POST /api/admin/admins
 * body: { nome, email, senha, role }
 * Somente quem tiver admins_manage
 */
router.post("/", verifyAdmin, requirePermission("admins_manage"), async (req, res) => {
  const { nome, email, senha, role } = req.body || {};

  if (!nome || !email || !senha || !role) {
    return res
      .status(400)
      .json({ message: "Nome, email, senha e role são obrigatórios." });
  }

  const emailNorm = String(email).trim().toLowerCase();
  const roleSlug = String(role).trim().toLowerCase();

  try {
    // valida se role existe na tabela admin_roles
    const [roleRows] = await pool.query(
      "SELECT id FROM admin_roles WHERE slug = ?",
      [roleSlug]
    );
    if (!roleRows || roleRows.length === 0) {
      return res.status(400).json({
        message: "Role inválido. Crie o perfil primeiro em admin_roles.",
      });
    }

    // verifica se já existe admin com esse email
    const [existe] = await pool.query(
      "SELECT id FROM admins WHERE email = ?",
      [emailNorm]
    );
    if (existe.length > 0) {
      return res
        .status(409)
        .json({ message: "Já existe um admin com esse email." });
    }

    const hash = await bcrypt.hash(String(senha), 10);

    const [result] = await pool.query(
      "INSERT INTO admins (nome, email, senha, role, ativo) VALUES (?, ?, ?, ?, 1)",
      [nome, emailNorm, hash, roleSlug]
    );

    logAdminAction({
      adminId: req.admin.id,
      acao: "criar_admin",
      entidade: "admin",
      entidadeId: result.insertId,
    });

    res.status(201).json({
      id: result.insertId,
      nome,
      email: emailNorm,
      role: roleSlug,
      ativo: 1,
    });
  } catch (err) {
    console.error("Erro ao criar admin:", err.message);
    res.status(500).json({ message: "Erro ao criar admin." });
  }
});

/**
 * ✅ ATUALIZAR role / ativo de um admin
 * PUT /api/admin/admins/:id
 * body: { role?, ativo? }
 * Somente quem tiver admins_manage
 */
router.put(
  "/:id",
  verifyAdmin,
  requirePermission("admins_manage"),
  async (req, res) => {
    const { id } = req.params;
    const { role, ativo } = req.body || {};

    if (!role && typeof ativo === "undefined") {
      return res.status(400).json({
        message: "Envie pelo menos role ou ativo para atualizar.",
      });
    }

    try {
      const campos = [];
      const valores = [];

      if (role) {
        const roleSlug = String(role).trim().toLowerCase();

        // valida se role existe na tabela admin_roles
        const [roleRows] = await pool.query(
          "SELECT id FROM admin_roles WHERE slug = ?",
          [roleSlug]
        );
        if (!roleRows || roleRows.length === 0) {
          return res.status(400).json({
            message: "Role inválido. Crie o perfil primeiro em admin_roles.",
          });
        }

        campos.push("role = ?");
        valores.push(roleSlug);
      }

      if (typeof ativo !== "undefined") {
        campos.push("ativo = ?");
        valores.push(ativo ? 1 : 0);
      }

      valores.push(id);

      const [result] = await pool.query(
        `UPDATE admins SET ${campos.join(", ")} WHERE id = ?`,
        valores
      );

      if (result.affectedRows === 0) {
        return res.status(404).json({ message: "Admin não encontrado." });
      }

      logAdminAction({
        adminId: req.admin.id,
        acao: "atualizar_admin",
        entidade: "admin",
        entidadeId: id,
      });

      res.json({ message: "Admin atualizado com sucesso." });
    } catch (err) {
      console.error("Erro ao atualizar admin:", err.message);
      res.status(500).json({ message: "Erro ao atualizar admin." });
    }
  }
);

/**
 * ✅ REMOVER admin
 * DELETE /api/admin/admins/:id
 * Somente quem tiver admins_manage
 *
 * Bloqueia remover a si mesmo e o master.
 */
router.delete(
  "/:id",
  verifyAdmin,
  requirePermission("admins_manage"),
  async (req, res) => {
    const { id } = req.params;

    try {
      const [rows] = await pool.query(
        "SELECT id, role FROM admins WHERE id = ?",
        [id]
      );

      if (!rows.length) {
        return res.status(404).json({ message: "Admin não encontrado." });
      }

      const admin = rows[0];

      // evita remover a si mesmo
      if (Number(admin.id) === Number(req.admin.id)) {
        return res.status(400).json({
          message: "Você não pode remover a si mesmo.",
        });
      }

      // evita remover master
      if (admin.role === "master") {
        return res.status(400).json({
          message: "O admin master não pode ser removido.",
        });
      }

      await pool.query("DELETE FROM admins WHERE id = ?", [id]);

      logAdminAction({
        adminId: req.admin.id,
        acao: "remover_admin",
        entidade: "admin",
        entidadeId: id,
      });

      res.json({ message: "Admin removido com sucesso." });
    } catch (err) {
      console.error("Erro ao remover admin:", err.message);
      res.status(500).json({ message: "Erro ao remover admin." });
    }
  }
);

module.exports = router;
