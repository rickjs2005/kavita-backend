// workers/abandonedCartNotificationsWorker.js

const pool = require("../config/pool");
const mailService = require("../services/mailService");
const logger = require("../lib/logger");

/* ======================================================
 * ENV
 * ====================================================== */

const INTERVAL_SECONDS =
  Number(process.env.ABANDON_NOTIF_WORKER_INTERVAL_SECONDS) || 120;

const PUBLIC_SITE_URL = (process.env.PUBLIC_SITE_URL || "").replace(/\/+$/, "");

/* ======================================================
 * Utils
 * ====================================================== */

function parseItens(itens) {
  if (!itens) return [];
  if (Array.isArray(itens)) return itens;

  if (typeof itens === "string") {
    try {
      const parsed = JSON.parse(itens);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  return [];
}

function money(value) {
  return Number(value || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function recoveryLink(cartId) {
  if (!PUBLIC_SITE_URL) return "";
  return `${PUBLIC_SITE_URL}/checkout?cartId=${encodeURIComponent(cartId)}`;
}

/* ======================================================
 * Email Template
 * ====================================================== */

function buildSubject(nome) {
  const first = String(nome || "").split(" ")[0] || "Olá";
  return `${first}, você deixou itens no carrinho`;
}

function buildText({ nome, cartId, itens, total }) {
  const first = String(nome || "").split(" ")[0] || "Olá";

  let msg = `Olá ${first},\n\n`;
  msg += "Percebemos que você deixou estes itens no carrinho:\n\n";

  if (!itens.length) {
    msg += "- (sem itens no snapshot)\n";
  } else {
    itens.forEach((i) => {
      msg += `- ${Number(i.quantidade || 0)}x ${i.produto} — ${money(
        i.preco_unitario
      )}\n`;
    });
  }

  msg += `\nTotal estimado: ${money(total)}\n`;

  const link = recoveryLink(cartId);
  if (link) msg += `\nFinalizar em 1 clique:\n${link}\n`;

  msg += "\n— Equipe Kavita";

  return msg;
}

function buildHtml({ nome, cartId, itens, total }) {
  const first = String(nome || "").split(" ")[0] || "Olá";
  const link = recoveryLink(cartId);

  const itemsHtml = itens.length
    ? `<ul>${itens
        .map(
          (i) =>
            `<li>${Number(i.quantidade || 0)}x ${i.produto} — ${money(
              i.preco_unitario
            )}</li>`
        )
        .join("")}</ul>`
    : "<p><em>(sem itens no snapshot)</em></p>";

  return `
    <div style="font-family: Arial, sans-serif">
      <p>Olá ${first},</p>
      <p>Percebemos que você deixou estes itens no carrinho:</p>
      ${itemsHtml}
      <p><strong>Total estimado:</strong> ${money(total)}</p>
      ${
        link
          ? `<p><a href="${link}">Finalizar compra em 1 clique</a></p>`
          : ""
      }
      <p>— Equipe Kavita</p>
    </div>
  `;
}

/* ======================================================
 * Worker Core
 * ====================================================== */

async function processEmails() {
  // Respeita flag global (dupla proteção, além do server.js)
  if (String(process.env.DISABLE_NOTIFICATIONS || "false") === "true") {
    return;
  }

  const conn = await pool.getConnection();

  try {
    // 🔒 Lock global (evita dois workers rodando juntos)
    const [[lock]] = await conn.query(
      "SELECT GET_LOCK('abandoned_cart_notif_worker', 0) AS locked"
    );
    if (!lock || Number(lock.locked) !== 1) return;

    // Pega pendentes de email
    const [rows] = await conn.query(`
      SELECT
        n.id               AS notification_id,
        ca.carrinho_id,
        ca.itens,
        ca.total_estimado,
        ca.recuperado,
        u.nome             AS usuario_nome,
        u.email            AS usuario_email
      FROM carrinhos_abandonados_notifications n
      JOIN carrinhos_abandonados ca ON ca.id = n.carrinho_abandonado_id
      JOIN usuarios u ON u.id = ca.usuario_id
      WHERE
        n.status = 'pending'
        AND n.tipo = 'email'
        AND n.scheduled_at <= NOW()
      ORDER BY n.scheduled_at ASC
      LIMIT 20
    `);

    if (!rows.length) return;

    for (const r of rows) {
      try {
        // Se o carrinho já foi recuperado, cancela/fecha esta notificação
        if (r.recuperado) {
          await conn.query(
            `
            UPDATE carrinhos_abandonados_notifications
            SET status='canceled', updated_at=NOW()
            WHERE id=?
            `,
            [r.notification_id]
          );
          continue;
        }

        if (!r.usuario_email) {
          throw new Error("Usuário sem e-mail cadastrado.");
        }

        const itens = parseItens(r.itens);
        const emailData = {
          nome: r.usuario_nome,
          cartId: r.carrinho_id,
          itens,
          total: Number(r.total_estimado || 0),
        };

        await mailService.sendTransactionalEmail(
          r.usuario_email,
          buildSubject(r.usuario_nome),
          buildHtml(emailData),
          buildText(emailData)
        );

        await conn.query(
          `
          UPDATE carrinhos_abandonados_notifications
          SET status='sent', sent_at=NOW(), error_message=NULL, updated_at=NOW()
          WHERE id=?
          `,
          [r.notification_id]
        );
      } catch (err) {
        const msg = String(err?.message || "Erro desconhecido").slice(0, 2000);

        // ✅ IMPORTANTE: seu ENUM usa 'error', não 'failed'
        await conn.query(
          `
          UPDATE carrinhos_abandonados_notifications
          SET status='error', error_message=?, updated_at=NOW()
          WHERE id=?
          `,
          [msg, r.notification_id]
        );

        logger.error({ err: msg }, "abandoned-cart-worker: email send error");
      }
    }
  } catch (err) {
    logger.error({ err }, "abandoned-cart-worker: tick error");
  } finally {
    try {
      await conn.query("SELECT RELEASE_LOCK('abandoned_cart_notif_worker')");
    } catch {}
    conn.release();
  }
}

/* ======================================================
 * Bootstrap
 * ====================================================== */

function startAbandonedCartNotificationsWorker() {
  const ms = Math.max(10, INTERVAL_SECONDS) * 1000;

  logger.info(
    { intervalSeconds: INTERVAL_SECONDS },
    "abandoned-cart-worker: started"
  );

  processEmails().catch(() => {});
  setInterval(() => {
    processEmails().catch(() => {});
  }, ms);
}

module.exports = {
  startAbandonedCartNotificationsWorker,
};
