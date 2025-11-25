// routes/adminCarts.js
const express = require("express");
const router = express.Router();
const pool = require("../config/pool");
const verifyAdmin = require("../middleware/verifyAdmin");

const DEFAULT_ABANDON_THRESHOLD_HOURS =
  Number(process.env.ABANDON_CART_HOURS) || 24;

/* ------------------------------------------------------------------ */
/*                               Swagger                              */
/* ------------------------------------------------------------------ */

/**
 * @openapi
 * tags:
 *   - name: AdminCarrinhos
 *     description: Gestão de carrinhos abandonados no painel admin
 */

/**
 * @openapi
 * components:
 *   schemas:
 *     AbandonedCartItem:
 *       type: object
 *       properties:
 *         produto_id:
 *           type: integer
 *           example: 42
 *         produto:
 *           type: string
 *           example: "Ração Premium 25kg"
 *         quantidade:
 *           type: integer
 *           example: 2
 *         preco_unitario:
 *           type: number
 *           format: float
 *           example: 129.9
 *
 *     AbandonedCart:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *         carrinho_id:
 *           type: integer
 *         usuario_id:
 *           type: integer
 *         usuario_nome:
 *           type: string
 *         usuario_email:
 *           type: string
 *         usuario_telefone:
 *           type: string
 *         itens:
 *           type: array
 *           items:
 *             $ref: "#/components/schemas/AbandonedCartItem"
 *         total_estimado:
 *           type: number
 *           format: float
 *         criado_em:
 *           type: string
 *           format: date-time
 *         atualizado_em:
 *           type: string
 *           format: date-time
 *         recuperado:
 *           type: boolean
 *
 *   parameters:
 *     AbandonCartHoursQuery:
 *       in: query
 *       name: horas
 *       schema:
 *         type: integer
 *         minimum: 1
 *         maximum: 720
 *       required: false
 *       description: |
 *         Quantidade de horas para considerar um carrinho como abandonado.
 *         Se não informado, usa ABANDON_CART_HOURS ou 24h como padrão.
 */

/**
 * @openapi
 * /api/admin/carrinhos:
 *   get:
 *     summary: Lista carrinhos abandonados
 *     description: |
 *       1. Registra carrinhos **abertos** e antigos em `carrinhos_abandonados`
 *          (se ainda não existirem lá).
 *       2. Agenda notificações padrão em
 *          `carrinhos_abandonados_notifications` (se a tabela existir).
 *       3. Retorna todos os registros de `carrinhos_abandonados` com dados
 *          do usuário.
 *     tags:
 *       - AdminCarrinhos
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: "#/components/parameters/AbandonCartHoursQuery"
 *     responses:
 *       200:
 *         description: Lista de carrinhos abandonados
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 carrinhos:
 *                   type: array
 *                   items:
 *                     $ref: "#/components/schemas/AbandonedCart"
 *       401:
 *         description: Não autorizado (admin não autenticado)
 *       500:
 *         description: Erro interno ao buscar carrinhos abandonados
 */

/**
 * @openapi
 * /api/admin/carrinhos/{id}/notificar:
 *   post:
 *     summary: Registra notificação de carrinho abandonado
 *     description: |
 *       Cria um registro em `carrinhos_abandonados_notifications` com
 *       `scheduled_at = NOW()` e `status = 'pending'` para o worker
 *       processar (WhatsApp ou e-mail).
 *     tags:
 *       - AdminCarrinhos
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID do carrinho abandonado
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - tipo
 *             properties:
 *               tipo:
 *                 type: string
 *                 enum: [whatsapp, email]
 *                 example: "whatsapp"
 *     responses:
 *       200:
 *         description: Notificação registrada
 *       400:
 *         description: Requisição inválida (tipo/ID/carrinho recuperado)
 *       404:
 *         description: Carrinho abandonado não encontrado
 *       500:
 *         description: Erro interno ao registrar notificação
 */

/* ------------------------------------------------------------------ */
/*                           Funções auxiliares                       */
/* ------------------------------------------------------------------ */

function parseItens(row) {
  try {
    const itens = JSON.parse(row.itens || "[]");
    return Array.isArray(itens) ? itens : [];
  } catch {
    return [];
  }
}

/* ------------------------------------------------------------------ */
/*                        GET /api/admin/carrinhos                    */
/* ------------------------------------------------------------------ */

router.get("/", verifyAdmin, async (req, res) => {
  const conn = await pool.getConnection();

  try {
    const horasParam = Number(req.query.horas);
    const thresholdHours =
      Number.isFinite(horasParam) && horasParam > 0
        ? horasParam
        : DEFAULT_ABANDON_THRESHOLD_HOURS;

    // 1) Buscar carrinhos "abertos" e antigos que ainda não estão em carrinhos_abandonados
    const [carts] = await conn.query(
      `
      SELECT
        c.id,
        c.usuario_id,
        c.created_at
      FROM carrinhos c
      LEFT JOIN carrinhos_abandonados ca ON ca.carrinho_id = c.id
      WHERE
        c.status = 'aberto'
        AND ca.id IS NULL
        AND c.created_at < DATE_SUB(NOW(), INTERVAL ? HOUR)
      ORDER BY c.created_at ASC
      `,
      [thresholdHours]
    );

    // 2) Para cada carrinho, gerar o registro de abandonado + tentar agendar notificações
    for (const cart of carts) {
      try {
        const [itensRows] = await conn.query(
          `
          SELECT
            ci.produto_id,
            p.title AS produto,
            ci.quantidade,
            ci.valor_unitario AS preco_unitario
          FROM carrinho_itens ci
          JOIN products p ON p.id = ci.produto_id
          WHERE ci.carrinho_id = ?
          `,
          [cart.id]
        );

        const itens = itensRows.map((row) => {
          const preco =
            row.preco_unitario === 0 || row.preco_unitario
              ? Number(row.preco_unitario)
              : 0;

          return {
            produto_id: row.produto_id,
            produto: row.produto,
            quantidade: row.quantidade,
            preco_unitario: preco,
          };
        });

        const totalEstimado = itens.reduce(
          (acc, item) => acc + item.quantidade * item.preco_unitario,
          0
        );

        const [abandonRes] = await conn.query(
          `
          INSERT INTO carrinhos_abandonados (
            carrinho_id,
            usuario_id,
            itens,
            total_estimado,
            criado_em,
            atualizado_em,
            recuperado
          )
          VALUES (?, ?, ?, ?, ?, NOW(), 0)
          `,
          [
            cart.id,
            cart.usuario_id,
            JSON.stringify(itens),
            totalEstimado,
            cart.created_at,
          ]
        );

        const abandonedId = abandonRes.insertId;

        // 2.1) Tentar agendar notificações padrão — se der erro, só loga
        try {
          const now = new Date();
          const in1Hour = new Date(now.getTime() + 1 * 60 * 60 * 1000);
          const in4Hours = new Date(now.getTime() + 4 * 60 * 60 * 1000);
          const in24Hours = new Date(now.getTime() + 24 * 60 * 60 * 1000);

          const values = [
            [abandonedId, "whatsapp", in1Hour, "pending"],
            [abandonedId, "email", in4Hours, "pending"],
            [abandonedId, "whatsapp", in24Hours, "pending"],
          ];

          await conn.query(
            `
            INSERT INTO carrinhos_abandonados_notifications (
              carrinho_abandonado_id,
              tipo,
              scheduled_at,
              status
            )
            VALUES ?
            `,
            [values]
          );
        } catch (errNotif) {
          console.warn(
            "[AdminCarrinhos] Erro ao agendar notificações para carrinho abandonado",
            abandonedId,
            errNotif
          );
        }
      } catch (errCart) {
        console.warn(
          "[AdminCarrinhos] Erro ao processar carrinho",
          cart.id,
          errCart
        );
      }
    }

    // 3) Buscar todos os carrinhos abandonados existentes
    const [rows] = await conn.query(
      `
      SELECT
        ca.id,
        ca.carrinho_id,
        ca.usuario_id,
        ca.itens,
        ca.total_estimado,
        ca.criado_em,
        ca.atualizado_em,
        ca.recuperado,
        u.nome       AS usuario_nome,
        u.email      AS usuario_email,
        u.telefone   AS usuario_telefone
      FROM carrinhos_abandonados ca
      JOIN usuarios u ON u.id = ca.usuario_id
      ORDER BY ca.criado_em DESC
      `
    );

    const carrinhos = rows.map((row) => ({
      id: row.id,
      carrinho_id: row.carrinho_id,
      usuario_id: row.usuario_id,
      usuario_nome: row.usuario_nome,
      usuario_email: row.usuario_email,
      usuario_telefone: row.usuario_telefone,
      itens: parseItens(row),
      total_estimado: Number(row.total_estimado || 0),
      criado_em: row.criado_em,
      atualizado_em: row.atualizado_em,
      recuperado: !!row.recuperado,
    }));

    return res.json({ carrinhos });
  } catch (err) {
    console.error("Erro em GET /api/admin/carrinhos:", err);
    return res
      .status(500)
      .json({ message: "Erro ao buscar carrinhos abandonados" });
  } finally {
    conn.release();
  }
});

/* ------------------------------------------------------------------ */
/*             POST /api/admin/carrinhos/:id/notificar                */
/* ------------------------------------------------------------------ */

router.post("/:id/notificar", verifyAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const { tipo } = req.body || {};

  if (!id) {
    return res.status(400).json({ message: "ID inválido." });
  }
  if (!["whatsapp", "email"].includes(tipo)) {
    return res
      .status(400)
      .json({ message: "tipo deve ser 'whatsapp' ou 'email'." });
  }

  const conn = await pool.getConnection();

  try {
    const [[row]] = await conn.query(
      `
      SELECT
        ca.id,
        ca.carrinho_id,
        ca.usuario_id,
        ca.itens,
        ca.total_estimado,
        ca.criado_em,
        ca.recuperado,
        u.nome     AS usuario_nome,
        u.email    AS usuario_email,
        u.telefone AS usuario_telefone
      FROM carrinhos_abandonados ca
      JOIN usuarios u ON u.id = ca.usuario_id
      WHERE ca.id = ?
      `,
      [id]
    );

    if (!row) {
      return res
        .status(404)
        .json({ message: "Carrinho abandonado não encontrado." });
    }

    if (row.recuperado) {
      return res.status(400).json({
        message:
          "Este carrinho já foi marcado como recuperado. Não é necessário enviar nova notificação.",
      });
    }

    await conn.query(
      `
      INSERT INTO carrinhos_abandonados_notifications (
        carrinho_abandonado_id,
        tipo,
        scheduled_at,
        status
      )
      VALUES (?, ?, NOW(), 'pending')
      `,
      [row.id, tipo]
    );

    console.log(
      `[Carrinho Abandonado] Notificação manual via ${tipo} registrada para usuário ${row.usuario_id} (${row.usuario_nome})`
    );

    return res.json({
      message: `Notificação de carrinho abandonado via ${tipo} registrada e será processada pelo worker.`,
    });
  } catch (err) {
    console.error("Erro em POST /api/admin/carrinhos/:id/notificar:", err);
    return res
      .status(500)
      .json({ message: "Erro ao notificar carrinho abandonado" });
  } finally {
    conn.release();
  }
});

module.exports = router;
