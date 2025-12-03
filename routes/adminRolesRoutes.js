const express = require("express");
const router = express.Router();
const pool = require("../config/pool");
const verifyAdmin = require("../middleware/verifyAdmin");
const requirePermission = require("../middleware/requirePermission");
const logAdminAction = require("../utils/adminLogger");

/**
 * @openapi
 * tags:
 *   - name: Admin
 *     description: Rotas de administração
 *   - name: Roles
 *     description: Perfis de acesso do painel admin
 */

/**
 * @openapi
 * /api/admin/roles:
 *   get:
 *     tags: [Admin, Roles]
 *     summary: Lista todos os perfis de acesso (roles) com suas permissões
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de roles retornada com sucesso.
 *       401:
 *         description: Não autenticado.
 *       403:
 *         description: Sem permissão para gerenciar roles.
 *       500:
 *         description: Erro ao listar roles.
 *   post:
 *     tags: [Admin, Roles]
 *     summary: Cria um novo perfil de acesso
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - nome
 *               - slug
 *             properties:
 *               nome:
 *                 type: string
 *               slug:
 *                 type: string
 *               descricao:
 *                 type: string
 *     responses:
 *       201:
 *         description: Role criado com sucesso.
 *       400:
 *         description: Dados inválidos.
 *       401:
 *         description: Não autenticado.
 *       403:
 *         description: Sem permissão para gerenciar roles.
 *       409:
 *         description: Já existe um role com esse slug.
 *       500:
 *         description: Erro ao criar role.
 */

/**
 * @openapi
 * /api/admin/roles/{id}:
 *   get:
 *     tags: [Admin, Roles]
 *     summary: Detalhes de um perfil de acesso (com permissões)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Role retornado com sucesso.
 *       401:
 *         description: Não autenticado.
 *       403:
 *         description: Sem permissão para gerenciar roles.
 *       404:
 *         description: Role não encontrado.
 *       500:
 *         description: Erro ao buscar role.
 *   put:
 *     tags: [Admin, Roles]
 *     summary: Atualiza nome/descrição e permissões de um perfil de acesso
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               nome:
 *                 type: string
 *               descricao:
 *                 type: string
 *               permissions:
 *                 type: array
 *                 description: "Lista de chaves de permissões, por exemplo admins_view"
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: Role atualizado com sucesso.
 *       400:
 *         description: Dados inválidos.
 *       401:
 *         description: Não autenticado.
 *       403:
 *         description: Sem permissão para gerenciar roles.
 *       404:
 *         description: Role não encontrado.
 *       500:
 *         description: Erro ao atualizar role.
 *   delete:
 *     tags: [Admin, Roles]
 *     summary: Remove um perfil de acesso
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Role removido com sucesso.
 *       400:
 *         description: Role de sistema não pode ser removido.
 *       401:
 *         description: Não autenticado.
 *       403:
 *         description: Sem permissão para gerenciar roles.
 *       404:
 *         description: Role não encontrado.
 *       500:
 *         description: Erro ao remover role.
 */

/**
 * GET /api/admin/roles
 */
router.get(
  "/",
  verifyAdmin,
  requirePermission("roles_manage"),
  async (req, res) => {
    try {
      const [rows] = await pool.query(
        `
        SELECT 
          r.id,
          r.nome,
          r.slug,
          r.descricao,
          r.is_system,
          r.criado_em,
          GROUP_CONCAT(p.chave ORDER BY p.chave) AS permissions
        FROM admin_roles r
        LEFT JOIN admin_role_permissions rp ON rp.role_id = r.id
        LEFT JOIN admin_permissions p ON p.id = rp.permission_id
        GROUP BY r.id
        ORDER BY r.is_system DESC, r.nome ASC
      `
      );

      const data = rows.map((r) => ({
        id: r.id,
        nome: r.nome,
        slug: r.slug,
        descricao: r.descricao,
        is_system: r.is_system,
        criado_em: r.criado_em,
        permissions: r.permissions
          ? r.permissions.split(",").filter(Boolean)
          : [],
      }));

      res.json(data);
    } catch (err) {
      console.error("Erro ao listar roles:", err.message);
      res.status(500).json({ message: "Erro ao listar roles." });
    }
  }
);

/**
 * GET /api/admin/roles/:id
 */
router.get(
  "/:id",
  verifyAdmin,
  requirePermission("roles_manage"),
  async (req, res) => {
    const { id } = req.params;

    try {
      const [rows] = await pool.query(
        `
        SELECT 
          r.id,
          r.nome,
          r.slug,
          r.descricao,
          r.is_system,
          r.criado_em,
          GROUP_CONCAT(p.chave ORDER BY p.chave) AS permissions
        FROM admin_roles r
        LEFT JOIN admin_role_permissions rp ON rp.role_id = r.id
        LEFT JOIN admin_permissions p ON p.id = rp.permission_id
        WHERE r.id = ?
        GROUP BY r.id
      `,
        [id]
      );

      if (!rows.length) {
        return res.status(404).json({ message: "Role não encontrado." });
      }

      const r = rows[0];
      res.json({
        id: r.id,
        nome: r.nome,
        slug: r.slug,
        descricao: r.descricao,
        is_system: r.is_system,
        criado_em: r.criado_em,
        permissions: r.permissions
          ? r.permissions.split(",").filter(Boolean)
          : [],
      });
    } catch (err) {
      console.error("Erro ao buscar role:", err.message);
      res.status(500).json({ message: "Erro ao buscar role." });
    }
  }
);

/**
 * POST /api/admin/roles
 */
router.post(
  "/",
  verifyAdmin,
  requirePermission("roles_manage"),
  async (req, res) => {
    const { nome, slug, descricao } = req.body || {};

    if (!nome || !slug) {
      return res
        .status(400)
        .json({ message: "Nome e slug são obrigatórios." });
    }

    try {
      const slugNorm = String(slug).trim().toLowerCase();

      const [existe] = await pool.query(
        "SELECT id FROM admin_roles WHERE slug = ?",
        [slugNorm]
      );
      if (existe.length > 0) {
        return res
          .status(409)
          .json({ message: "Já existe um role com esse slug." });
      }

      const [result] = await pool.query(
        "INSERT INTO admin_roles (nome, slug, descricao, is_system) VALUES (?, ?, ?, 0)",
        [nome, slugNorm, descricao || null]
      );

      logAdminAction({
        adminId: req.admin.id,
        acao: "criar_role",
        entidade: "admin_role",
        entidadeId: result.insertId,
      });

      res.status(201).json({
        id: result.insertId,
        nome,
        slug: slugNorm,
        descricao: descricao || null,
        is_system: 0,
        permissions: [],
      });
    } catch (err) {
      console.error("Erro ao criar role:", err.message);
      res.status(500).json({ message: "Erro ao criar role." });
    }
  }
);

/**
 * PUT /api/admin/roles/:id
 */
router.put(
  "/:id",
  verifyAdmin,
  requirePermission("roles_manage"),
  async (req, res) => {
    const { id } = req.params;
    const { nome, descricao, permissions } = req.body || {};

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      if (nome || typeof descricao !== "undefined") {
        const campos = [];
        const valores = [];

        if (nome) {
          campos.push("nome = ?");
          valores.push(nome);
        }
        if (typeof descricao !== "undefined") {
          campos.push("descricao = ?");
          valores.push(descricao || null);
        }
        valores.push(id);

        if (campos.length) {
          const [resultUpdate] = await conn.query(
            `UPDATE admin_roles SET ${campos.join(", ")} WHERE id = ?`,
            valores
          );

          if (resultUpdate.affectedRows === 0) {
            await conn.rollback();
            conn.release();
            return res.status(404).json({ message: "Role não encontrado." });
          }
        }
      }

      if (Array.isArray(permissions)) {
        await conn.query(
          "DELETE FROM admin_role_permissions WHERE role_id = ?",
          [id]
        );

        if (permissions.length > 0) {
          const [permsRows] = await conn.query(
            "SELECT id, chave FROM admin_permissions WHERE chave IN (?)",
            [permissions]
          );
          const map = new Map(permsRows.map((p) => [p.chave, p.id]));

          const values = [];
          for (const key of permissions) {
            const permId = map.get(key);
            if (permId) {
              values.push([id, permId]);
            }
          }

          if (values.length) {
            await conn.query(
              "INSERT INTO admin_role_permissions (role_id, permission_id) VALUES ?",
              [values]
            );
          }
        }
      }

      await conn.commit();

      logAdminAction({
        adminId: req.admin.id,
        acao: "atualizar_role",
        entidade: "admin_role",
        entidadeId: id,
      });

      res.json({ message: "Role atualizado com sucesso." });
    } catch (err) {
      await conn.rollback();
      console.error("Erro ao atualizar role:", err.message);
      res.status(500).json({ message: "Erro ao atualizar role." });
    } finally {
      conn.release();
    }
  }
);

/**
 * DELETE /api/admin/roles/:id
 */
router.delete(
  "/:id",
  verifyAdmin,
  requirePermission("roles_manage"),
  async (req, res) => {
    const { id } = req.params;

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const [rows] = await conn.query(
        "SELECT id, slug, is_system FROM admin_roles WHERE id = ?",
        [id]
      );

      if (!rows.length) {
        await conn.rollback();
        conn.release();
        return res.status(404).json({ message: "Role não encontrado." });
      }

      const role = rows[0];

      if (role.is_system) {
        await conn.rollback();
        conn.release();
        return res.status(400).json({
          message: "Este role é de sistema e não pode ser removido.",
        });
      }

      await conn.query(
        "DELETE FROM admin_role_permissions WHERE role_id = ?",
        [id]
      );

      await conn.query("DELETE FROM admin_roles WHERE id = ?", [id]);

      await conn.commit();

      logAdminAction({
        adminId: req.admin.id,
        acao: "remover_role",
        entidade: "admin_role",
        entidadeId: id,
      });

      res.json({ message: "Role removido com sucesso." });
    } catch (err) {
      await conn.rollback();
      console.error("Erro ao remover role:", err.message);
      res.status(500).json({ message: "Erro ao remover role." });
    } finally {
      conn.release();
    }
  }
);

module.exports = router;
