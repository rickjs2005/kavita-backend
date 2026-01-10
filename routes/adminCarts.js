// routes/adminCarts.js
const express = require("express");
const router = express.Router();
const pool = require("../config/pool");
const verifyAdmin = require("../middleware/verifyAdmin");

const DEFAULT_ABANDON_THRESHOLD_HOURS =
  Number(process.env.ABANDON_CART_HOURS) || 24;

const PUBLIC_SITE_URL = (process.env.PUBLIC_SITE_URL || "").replace(/\/+$/, "");

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
 *     WhatsAppLinkResponse:
 *       type: object
 *       properties:
 *         wa_link:
 *           type: string
 *           example: "https://wa.me/5531999999999?text=Ol%C3%A1..."
 *         message_text:
 *           type: string
 *           example: "Olá Fulano! Você deixou itens no carrinho..."
 *
 *     GenericMessage:
 *       type: object
 *       properties:
 *         message:
 *           type: string
 *           example: "OK"
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
 *          (se ainda não existirem lá), **apenas se houver itens**.
 *       2. Agenda notificações padrão em `carrinhos_abandonados_notifications` (se existir).
 *       3. Retorna todos os registros de `carrinhos_abandonados` com dados do usuário.
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
 *       `scheduled_at = NOW()` e `status = 'pending'`.
 *       - Para **email**: o worker envia automaticamente e marca `sent/failed`.
 *       - Para **whatsapp** (MVP sem API paga): use o endpoint `/whatsapp-link` para abrir o WhatsApp com texto pronto.
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
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/GenericMessage"
 *       400:
 *         description: Requisição inválida (tipo/ID/carrinho recuperado)
 *       404:
 *         description: Carrinho abandonado não encontrado
 *       500:
 *         description: Erro interno ao registrar notificação
 */

/**
 * @openapi
 * /api/admin/carrinhos/{id}/whatsapp-link:
 *   get:
 *     summary: Gera link de WhatsApp (wa.me) com mensagem pronta (MVP sem API paga)
 *     description: |
 *       Gera o texto com itens + total + link de recuperação (MVP: /checkout?cartId=...),
 *       e retorna um link `wa.me` para o admin abrir a conversa e enviar manualmente.
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
 *     responses:
 *       200:
 *         description: Link e texto gerados
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/WhatsAppLinkResponse"
 *       400:
 *         description: Carrinho recuperado ou sem telefone
 *       404:
 *         description: Carrinho abandonado não encontrado
 *       500:
 *         description: Erro interno ao gerar link
 */

/* ------------------------------------------------------------------ */
/*                           Funções auxiliares                       */
/* ------------------------------------------------------------------ */

function parseItensValue(itensValue) {
  if (!itensValue) return [];
  if (Array.isArray(itensValue)) return itensValue;

  if (typeof itensValue === "object") {
    return [];
  }

  if (typeof itensValue === "string") {
    try {
      const parsed = JSON.parse(itensValue || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  return [];
}

function normalizePhoneBR(phone) {
  const digits = String(phone || "").replace(/\D+/g, "");
  if (!digits) return "";
  if (digits.startsWith("55")) return digits;
  return `55${digits}`;
}

function formatMoneyBR(value) {
  const n = Number(value || 0);
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function buildRecoveryLink({ carrinho_id }) {
  if (!PUBLIC_SITE_URL) return "";
  return `${PUBLIC_SITE_URL}/checkout?cartId=${encodeURIComponent(carrinho_id)}`;
}

function buildMessageText({ usuario_nome, carrinho_id, itens, total_estimado }) {
  const firstName = String(usuario_nome || "").trim().split(/\s+/)[0] || "Olá";
  const lines = [];

  lines.push(`Olá ${firstName}!`);
  lines.push("");
  lines.push("Percebemos que você deixou estes itens no carrinho:");

  if (!Array.isArray(itens) || itens.length === 0) {
    lines.push("- (sem itens no snapshot)");
  } else {
    for (const item of itens) {
      const qtd = Number(item.quantidade || 0);
      const nome = String(item.produto || "Produto");
      const preco = formatMoneyBR(item.preco_unitario || 0);
      lines.push(`- ${qtd}x ${nome} — ${preco}`);
    }
  }

  lines.push("");
  lines.push(`Total estimado: ${formatMoneyBR(total_estimado)}`);

  const link = buildRecoveryLink({ carrinho_id });
  if (link) {
    lines.push("");
    lines.push(`Finalizar em 1 clique: ${link}`);
  }

  lines.push("");
  lines.push("Se precisar de ajuda, responda esta mensagem.");

  return lines.join("\n");
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

        if (!itensRows || itensRows.length === 0) continue;

        const itens = itensRows.map((row) => {
          const preco =
            row.preco_unitario === 0 || row.preco_unitario
              ? Number(row.preco_unitario)
              : 0;

          return {
            produto_id: row.produto_id,
            produto: row.produto,
            quantidade: Number(row.quantidade || 0),
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

        // ✅ Com UNIQUE (carrinho_abandonado_id, tipo, scheduled_at), use INSERT IGNORE
        // para não dar erro em corrida/duplicidade.
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
            INSERT IGNORE INTO carrinhos_abandonados_notifications (
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

    const carrinhos = rows.map((row) => {
      const itens = parseItensValue(row.itens);

      return {
        id: row.id,
        carrinho_id: row.carrinho_id,
        usuario_id: row.usuario_id,
        usuario_nome: row.usuario_nome,
        usuario_email: row.usuario_email,
        usuario_telefone: row.usuario_telefone,
        itens,
        total_estimado: Number(row.total_estimado || 0),
        criado_em: row.criado_em,
        atualizado_em: row.atualizado_em,
        recuperado: !!row.recuperado,
      };
    });

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
      message:
        tipo === "email"
          ? "Notificação via email registrada e será enviada automaticamente pelo worker."
          : "Notificação via whatsapp registrada. Use /whatsapp-link para abrir a conversa com texto pronto.",
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

/* ------------------------------------------------------------------ */
/*     GET /api/admin/carrinhos/:id/whatsapp-link (MVP manual)         */
/* ------------------------------------------------------------------ */

router.get("/:id/whatsapp-link", verifyAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ message: "ID inválido." });

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
        ca.recuperado,
        u.nome     AS usuario_nome,
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
        message: "Este carrinho já foi marcado como recuperado.",
      });
    }

    if (!row.usuario_telefone) {
      return res.status(400).json({
        message: "Usuário não possui telefone cadastrado.",
      });
    }

    const phone = normalizePhoneBR(row.usuario_telefone);
    if (!phone) {
      return res.status(400).json({
        message: "Telefone do usuário inválido.",
      });
    }

    const itens = parseItensValue(row.itens);
    const messageText = buildMessageText({
      usuario_nome: row.usuario_nome,
      carrinho_id: row.carrinho_id,
      itens,
      total_estimado: Number(row.total_estimado || 0),
    });

    const waLink = `https://wa.me/${encodeURIComponent(
      phone
    )}?text=${encodeURIComponent(messageText)}`;

    return res.json({ wa_link: waLink, message_text: messageText });
  } catch (err) {
    console.error("Erro em GET /api/admin/carrinhos/:id/whatsapp-link:", err);
    return res.status(500).json({ message: "Erro ao gerar link de WhatsApp" });
  } finally {
    conn.release();
  }
});

module.exports = router;
