// routes/adminCarts.js
const express = require("express");
const router = express.Router();
const pool = require("../config/pool");
const verifyAdmin = require("../middleware/verifyAdmin");

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
 *           example: 10
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
 *           example: 1
 *         carrinho_id:
 *           type: integer
 *           example: 45
 *         usuario_id:
 *           type: integer
 *           example: 7
 *         nome:
 *           type: string
 *           example: "João da Silva"
 *         email:
 *           type: string
 *           example: "joao@email.com"
 *         telefone:
 *           type: string
 *           example: "(33) 99999-0000"
 *         itens:
 *           type: array
 *           items:
 *             $ref: "#/components/schemas/AbandonedCartItem"
 *         total_estimado:
 *           type: number
 *           format: float
 *           example: 259.8
 *         criado_em:
 *           type: string
 *           format: date-time
 *           example: "2025-01-20T14:10:00.000Z"
 *         atualizado_em:
 *           type: string
 *           format: date-time
 *           example: "2025-01-21T08:32:00.000Z"
 *         recuperado:
 *           type: boolean
 *           example: false
 *
 *     AbandonedCartNotificationRequest:
 *       type: object
 *       required:
 *         - tipo
 *       properties:
 *         tipo:
 *           type: string
 *           enum: [whatsapp, email]
 *           example: "whatsapp"
 *
 *     AbandonedCartNotificationResponse:
 *       type: object
 *       properties:
 *         message:
 *           type: string
 *           example: "Notificação de carrinho abandonado via whatsapp registrada com sucesso."
 */

/**
 * @openapi
 * /api/admin/carrinhos:
 *   get:
 *     summary: Lista carrinhos abandonados
 *     description: |
 *       Gera registros em `carrinhos_abandonados` com base nos carrinhos abertos
 *       e retorna a lista de carrinhos abandonados.
 *
 *       Critério padrão para considerar um carrinho abandonado:
 *
 *       - `status = "aberto"` na tabela `carrinhos`
 *       - `criado_em` mais antigo que o limite em horas definido em `ABANDON_CART_HOURS`
 *         (por padrão, 24 horas) ou sobrescrito pelo parâmetro de query `horas`.
 *
 *       A cada chamada, novos carrinhos que se encaixarem no critério são
 *       inseridos em `carrinhos_abandonados` (sem duplicar os já existentes).
 *     tags:
 *       - AdminCarrinhos
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: horas
 *         schema:
 *           type: number
 *           example: 4
 *         required: false
 *         description: >
 *           Número de horas para considerar um carrinho como abandonado.
 *           Se não informado, usa o valor de `ABANDON_CART_HOURS` ou 24 horas.
 *     responses:
 *       200:
 *         description: Lista de carrinhos abandonados
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: "#/components/schemas/AbandonedCart"
 *       401:
 *         description: Não autorizado (admin não autenticado)
 *       500:
 *         description: Erro ao buscar carrinhos abandonados
 */

/**
 * @openapi
 * /api/admin/carrinhos/{id}/notificar:
 *   post:
 *     summary: Registra notificação de carrinho abandonado
 *     description: |
 *       Registra a intenção de notificar um cliente sobre um carrinho abandonado
 *       via WhatsApp ou e-mail. Ideal para ser usado junto a um serviço externo
 *       (Twilio, WhatsApp API, serviço de e-mail, etc).
 *     tags:
 *       - AdminCarrinhos
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: ID do registro em `carrinhos_abandonados`
 *         schema:
 *           type: integer
 *           example: 1
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: "#/components/schemas/AbandonedCartNotificationRequest"
 *     responses:
 *       200:
 *         description: Notificação registrada com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/AbandonedCartNotificationResponse"
 *       400:
 *         description: Erro de validação (ID ou tipo inválido)
 *       401:
 *         description: Não autorizado (admin não autenticado)
 *       404:
 *         description: Carrinho abandonado não encontrado
 *       500:
 *         description: Erro ao notificar carrinho abandonado
 */

/* ------------------------------------------------------------------ */
/*                    Configuração de threshold dinâmico              */
/* ------------------------------------------------------------------ */

const DEFAULT_ABANDON_THRESHOLD_HOURS = Number(
    process.env.ABANDON_CART_HOURS || 24
);

// Helper: converte JSON de itens em array seguro
function parseItens(row) {
    try {
        if (!row.itens) return [];
        if (Array.isArray(row.itens)) return row.itens;
        return JSON.parse(row.itens);
    } catch {
        return [];
    }
}

/* ------------------------------------------------------------------ */
/*                            GET /admin/carrinhos                    */
/* ------------------------------------------------------------------ */

router.get("/", verifyAdmin, async (req, res) => {
    const conn = await pool.getConnection();

    try {
        // threshold em horas (query > env > default)
        const horasParam = Number(req.query.horas || "");
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
        c.criado_em
      FROM carrinhos c
      LEFT JOIN carrinhos_abandonados ca ON ca.carrinho_id = c.id
      WHERE
        c.status = 'aberto'
        AND ca.id IS NULL
        AND c.criado_em < DATE_SUB(NOW(), INTERVAL ? HOUR)
      ORDER BY c.criado_em ASC
      `,
            [thresholdHours]
        );

        // 2) Para cada carrinho, tentar gerar o registro de abandonado.
        //    Se falhar em algum, apenas loga e continua (não derruba a rota).
        for (const cart of carts) {
            try {
                const [itensRows] = await conn.query(
                    `
          SELECT
            ci.produto_id,
            p.name AS produto,
            ci.quantidade,
            ci.valor_unitario AS preco_unitario
          FROM carrinho_itens ci
          JOIN products p ON p.id = ci.produto_id
          WHERE ci.carrinho_id = ?
          `,
                    [cart.id]
                );

                const itens = itensRows.map((row) => ({
                    produto_id: row.produto_id,
                    produto: row.produto,
                    quantidade: row.quantidade,
                    preco_unitario: Number(
                        row.preco_unituario || row.preco_unitario || 0
                    ),
                }));

                const totalEstimado = itens.reduce(
                    (acc, item) => acc + item.quantidade * item.preco_unitario,
                    0
                );

                await conn.query(
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
                        cart.criado_em,
                    ]
                );
            } catch (errCart) {
                console.warn(
                    "[AdminCarrinhos] Erro ao processar carrinho",
                    cart.id,
                    errCart
                );
                // segue para o próximo carrinho
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

        const resultado = rows.map((row) => ({
            id: row.id,
            carrinho_id: row.carrinho_id,
            usuario_id: row.usuario_id,
            nome: row.usuario_nome,
            email: row.usuario_email,
            telefone: row.usuario_telefone,
            itens: parseItens(row),
            total_estimado: Number(row.total_estimado || 0),
            criado_em: row.criado_em,
            atualizado_em: row.atualizado_em,
            recuperado: !!row.recuperado,
        }));

        // 🔥 Ponto importante:
        // Mesmo se não tiver nenhum, devolvemos [] com status 200.
        return res.json(resultado);
    } catch (err) {
        console.error("Erro em GET /api/admin/carrinhos:", err);
        // 👉 Em vez de 500, devolve lista vazia.
        return res.status(200).json([]);
    } finally {
        conn.release();
    }
});

/* ------------------------------------------------------------------ */
/*                     POST /admin/carrinhos/:id/notificar            */
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

    try {
        const [[row]] = await pool.query(
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

        console.log(
            `[Carrinho Abandonado] Enviar lembrete via ${tipo} para usuário ${row.usuario_id} (${row.usuario_nome})`
        );

        return res.json({
            message: `Notificação de carrinho abandonado via ${tipo} registrada com sucesso.`,
        });
    } catch (err) {
        console.error("Erro em POST /api/admin/carrinhos/:id/notificar:", err);
        res.status(500).json({ message: "Erro ao notificar carrinho abandonado" });
    }
});

module.exports = router;
