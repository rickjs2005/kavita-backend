// routes/adminCupons.js — CRUD de cupons com Swagger
const express = require("express");
const router = express.Router();
const pool = require("../config/pool");
const verifyAdmin = require("../middleware/verifyAdmin");

const CUPONS_TABLE = "cupons";
const IS_DEV = process.env.NODE_ENV !== "production";

/**
 * @openapi
 * tags:
 *   - name: Cupons
 *     description: Gestão de cupons de desconto (painel admin)
 */

/**
 * @openapi
 * components:
 *   schemas:
 *     CupomInput:
 *       type: object
 *       properties:
 *         codigo:
 *           type: string
 *           example: PROMO10
 *         tipo:
 *           type: string
 *           enum: [percentual, valor]
 *           example: percentual
 *         valor:
 *           type: number
 *           format: float
 *           example: 10.0
 *         minimo:
 *           type: number
 *           format: float
 *           example: 100.0
 *         expiracao:
 *           type: string
 *           nullable: true
 *           description: Data/hora de expiração no formato ISO (yyyy-MM-ddTHH:mm)
 *           example: "2025-12-31T23:59"
 *         max_usos:
 *           type: integer
 *           nullable: true
 *           example: 50
 *         ativo:
 *           type: boolean
 *           example: true
 *     Cupom:
 *       allOf:
 *         - $ref: '#/components/schemas/CupomInput'
 *         - type: object
 *           properties:
 *             id:
 *               type: integer
 *             usos:
 *               type: integer
 */

/**
 * @openapi
 * /api/admin/cupons:
 *   get:
 *     tags: [Admin, Cupons]
 *     summary: Lista todos os cupons
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de cupons
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Cupom'
 *       401:
 *         description: Não autorizado
 */
router.get("/", verifyAdmin, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, codigo, tipo, valor, minimo, expiracao, usos, max_usos, ativo
       FROM ${CUPONS_TABLE}
       ORDER BY id DESC`
    );
    res.json(rows);
  } catch (err) {
    console.error("Erro ao buscar cupons:", err);
    res.status(500).json({
      message: "Erro ao buscar cupons.",
      ...(IS_DEV && { error: err.message, code: err.code }),
    });
  }
});

/**
 * @openapi
 * /api/admin/cupons:
 *   post:
 *     tags: [Admin, Cupons]
 *     summary: Cria um novo cupom
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CupomInput'
 *     responses:
 *       201:
 *         description: Cupom criado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Cupom'
 *       400:
 *         description: Dados inválidos
 *       409:
 *         description: Código de cupom já existe
 */
router.post("/", verifyAdmin, async (req, res) => {
  try {
    let { codigo, tipo, valor, minimo, expiracao, max_usos, ativo } = req.body;

    if (!codigo || !tipo || !valor) {
      return res.status(400).json({
        message: "Campos obrigatórios: codigo, tipo, valor.",
      });
    }

    if (!["percentual", "valor"].includes(tipo)) {
      return res
        .status(400)
        .json({ message: "Tipo inválido. Use 'percentual' ou 'valor'." });
    }

    valor = Number(valor) || 0;
    minimo = Number(minimo) || 0;
    max_usos = max_usos === null || max_usos === "" ? null : Number(max_usos);
    ativo = ativo === false || ativo === 0 ? 0 : 1;
    expiracao = expiracao || null; // pode vir "" do front

    const [result] = await pool.query(
      `INSERT INTO ${CUPONS_TABLE}
       (codigo, tipo, valor, minimo, expiracao, usos, max_usos, ativo)
       VALUES (?, ?, ?, ?, ?, 0, ?, ?)`,
      [codigo, tipo, valor, minimo, expiracao, max_usos, ativo]
    );

    const [rows] = await pool.query(
      `SELECT id, codigo, tipo, valor, minimo, expiracao, usos, max_usos, ativo
       FROM ${CUPONS_TABLE}
       WHERE id = ?`,
      [result.insertId]
    );

    res.status(201).json(rows[0]);
  } catch (err) {
    console.error("Erro ao criar cupom:", err);

    if (err.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        message: "Já existe um cupom com esse código.",
        ...(IS_DEV && { error: err.message }),
      });
    }

    res.status(500).json({
      message: "Erro ao criar cupom.",
      ...(IS_DEV && { error: err.message, code: err.code }),
    });
  }
});

/**
 * @openapi
 * /api/admin/cupons/{id}:
 *   put:
 *     tags: [Admin, Cupons]
 *     summary: Atualiza um cupom
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CupomInput'
 *     responses:
 *       200:
 *         description: Cupom atualizado
 *       404:
 *         description: Cupom não encontrado
 */
router.put("/:id", verifyAdmin, async (req, res) => {
  const { id } = req.params;

  try {
    let { codigo, tipo, valor, minimo, expiracao, max_usos, ativo } = req.body;

    if (!codigo || !tipo || !valor) {
      return res.status(400).json({
        message: "Campos obrigatórios: codigo, tipo, valor.",
      });
    }

    if (!["percentual", "valor"].includes(tipo)) {
      return res
        .status(400)
        .json({ message: "Tipo inválido. Use 'percentual' ou 'valor'." });
    }

    valor = Number(valor) || 0;
    minimo = Number(minimo) || 0;
    max_usos = max_usos === null || max_usos === "" ? null : Number(max_usos);
    ativo = ativo === false || ativo === 0 ? 0 : 1;
    expiracao = expiracao || null;

    const [result] = await pool.query(
      `UPDATE ${CUPONS_TABLE}
       SET codigo = ?, tipo = ?, valor = ?, minimo = ?, expiracao = ?, max_usos = ?, ativo = ?
       WHERE id = ?`,
      [codigo, tipo, valor, minimo, expiracao, max_usos, ativo, id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Cupom não encontrado." });
    }

    const [rows] = await pool.query(
      `SELECT id, codigo, tipo, valor, minimo, expiracao, usos, max_usos, ativo
       FROM ${CUPONS_TABLE}
       WHERE id = ?`,
      [id]
    );

    res.json(rows[0]);
  } catch (err) {
    console.error("Erro ao atualizar cupom:", err);

    if (err.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        message: "Já existe um cupom com esse código.",
        ...(IS_DEV && { error: err.message }),
      });
    }

    res.status(500).json({
      message: "Erro ao atualizar cupom.",
      ...(IS_DEV && { error: err.message, code: err.code }),
    });
  }
});

/**
 * @openapi
 * /api/admin/cupons/{id}:
 *   delete:
 *     tags: [Admin, Cupons]
 *     summary: Remove um cupom
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
 *         description: Cupom removido
 *       404:
 *         description: Cupom não encontrado
 */
router.delete("/:id", verifyAdmin, async (req, res) => {
  const { id } = req.params;

  try {
    const [result] = await pool.query(
      `DELETE FROM ${CUPONS_TABLE} WHERE id = ?`,
      [id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Cupom não encontrado." });
    }

    res.json({ message: "Cupom removido com sucesso." });
  } catch (err) {
    console.error("Erro ao remover cupom:", err);
    res.status(500).json({
      message: "Erro ao remover cupom.",
      ...(IS_DEV && { error: err.message, code: err.code }),
    });
  }
});

module.exports = router;
