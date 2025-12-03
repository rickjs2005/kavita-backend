// routes/adminLogsRoutes.js
const express = require("express");
const router = express.Router();
const pool = require("../config/pool");
const requirePermission = require("../middleware/requirePermission");

/**
 * @openapi
 * tags:
 *   name: Admin Logs
 *   description: Logs de auditoria do painel admin
 */

/**
 * @openapi
 * /api/admin/logs:
 *   get:
 *     tags:
 *       - Admin Logs
 *     summary: Lista logs administrativos com filtros e paginação
 *     description: >
 *       Retorna os registros de auditoria do painel admin, permitindo filtrar
 *       por ação, entidade, administrador e intervalo de datas.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *         description: "Quantidade máxima de registros retornados."
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *         description: "Deslocamento para paginação (ex: 0, 20, 40...)."
 *       - in: query
 *         name: acao
 *         schema:
 *           type: string
 *         description: "Filtra pela ação (ex: 'criou', 'editou', 'excluiu')."
 *       - in: query
 *         name: entidade
 *         schema:
 *           type: string
 *         description: "Filtra pela entidade (ex: 'produto', 'pedido', 'cupom')."
 *       - in: query
 *         name: admin_id
 *         schema:
 *           type: integer
 *         description: "Filtra pelos registros de um administrador específico."
 *       - in: query
 *         name: admin_email
 *         schema:
 *           type: string
 *         description: "Filtro parcial por email do admin."
 *       - in: query
 *         name: data_inicio
 *         schema:
 *           type: string
 *           format: date-time
 *         description: "Data/hora inicial para filtro (ex: 2025-12-01T00:00:00Z)."
 *       - in: query
 *         name: data_fim
 *         schema:
 *           type: string
 *           format: date-time
 *         description: "Data/hora final para filtro (ex: 2025-12-31T23:59:59Z)."
 *     responses:
 *       200:
 *         description: Lista de logs retornada com sucesso (array simples)
 *       401:
 *         description: Não autorizado
 *       403:
 *         description: Sem permissão (logs_view)
 *       500:
 *         description: Erro interno no servidor
 */
router.get(
  "/",
  requirePermission("logs_view"),
  async (req, res) => {
    const rawLimit = Number(req.query.limit) || 20;
    const limit = Math.min(rawLimit, 100); // segurança
    const offset = Number(req.query.offset) || 0;

    const {
      acao,
      entidade,
      admin_id,
      admin_email,
      data_inicio,
      data_fim,
    } = req.query;

    const whereParts = [];
    const params = [];

    if (acao) {
      whereParts.push("l.acao = ?");
      params.push(acao);
    }

    if (entidade) {
      whereParts.push("l.entidade = ?");
      params.push(entidade);
    }

    if (admin_id) {
      whereParts.push("l.admin_id = ?");
      params.push(Number(admin_id));
    }

    if (admin_email) {
      whereParts.push("a.email LIKE ?");
      params.push(`%${admin_email}%`);
    }

    // Aqui estou assumindo que a coluna de data na tabela é "data" (TIMESTAMP)
    if (data_inicio) {
      whereParts.push("l.data >= ?");
      params.push(data_inicio);
    }

    if (data_fim) {
      whereParts.push("l.data <= ?");
      params.push(data_fim);
    }

    const whereSql = whereParts.length
      ? `WHERE ${whereParts.join(" AND ")}`
      : "";

    try {
      const [rows] = await pool.query(
        `
          SELECT 
            l.id,
            l.acao,
            l.entidade,
            l.entidade_id,
            l.data,
            l.admin_id,
            a.nome  AS admin_nome,
            a.email AS admin_email,
            a.role  AS admin_role
          FROM admin_logs l
          JOIN admins a ON a.id = l.admin_id
          ${whereSql}
          ORDER BY l.data DESC
          LIMIT ?
          OFFSET ?
        `,
        [...params, limit, offset]
      );

      // 👉 frontend espera um ARRAY de logs
      return res.json(rows);
    } catch (err) {
      console.error("Erro ao buscar admin_logs:", err);
      return res
        .status(500)
        .json({ message: "Erro ao buscar logs de admin." });
    }
  }
);

/**
 * @openapi
 * /api/admin/logs/{id}:
 *   get:
 *     tags:
 *       - Admin Logs
 *     summary: Retorna um log específico
 *     description: Retorna um registro de log pelo seu ID.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: "ID do log."
 *     responses:
 *       200:
 *         description: Log encontrado com sucesso
 *       401:
 *         description: Não autorizado
 *       403:
 *         description: Sem permissão
 *       404:
 *         description: Log não encontrado
 *       500:
 *         description: Erro interno no servidor
 */
router.get(
  "/:id",
  requirePermission("logs_view"),
  async (req, res) => {
    const { id } = req.params;

    try {
      const [rows] = await pool.query(
        `
          SELECT 
            l.id,
            l.acao,
            l.entidade,
            l.entidade_id,
            l.data,
            l.admin_id,
            a.nome  AS admin_nome,
            a.email AS admin_email,
            a.role  AS admin_role
          FROM admin_logs l
          JOIN admins a ON a.id = l.admin_id
          WHERE l.id = ?
          LIMIT 1
        `,
        [id]
      );

      if (!rows.length) {
        return res.status(404).json({ message: "Log não encontrado." });
      }

      return res.json(rows[0]);
    } catch (err) {
      console.error("Erro ao buscar log específico:", err);
      return res
        .status(500)
        .json({ message: "Erro ao buscar log específico." });
    }
  }
);

module.exports = router;
