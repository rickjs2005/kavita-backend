// jobs/abandonedCartsWorker.js
require("dotenv").config();
const pool = require("../config/pool");
const {
  sendAbandonedCartWhatsApp,
  sendAbandonedCartEmail,
} = require("../services/notificationService");

/**
 * Worker responsável por:
 * - Ler a tabela carrinhos_abandonados_notifications
 * - Para cada linha PENDING e com scheduled_at <= NOW():
 *   - Ver se o carrinho já foi recuperado
 *   - Se NÃO: chamar notificationService (WhatsApp/E-mail)
 *   - Atualizar status para SENT ou ERROR
 */

const POLL_INTERVAL_MS = Number(
  process.env.ABANDON_CART_WORKER_INTERVAL_MS || 60000 // 60s
);
const BATCH_LIMIT = Number(
  process.env.ABANDON_CART_WORKER_BATCH_LIMIT || 50
);

// Flag simples para evitar rodar 2 loops ao mesmo tempo
let isRunning = false;

console.log("🛠️  AbandonedCartsWorker iniciado.");
console.log("⏱️  Intervalo de varredura:", POLL_INTERVAL_MS, "ms");

function safeParseItens(raw) {
  try {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

async function processarPendentes() {
  if (isRunning) {
    // Evita sobreposição se o loop anterior ainda estiver rodando
    return;
  }
  isRunning = true;

  const conn = await pool.getConnection();

  try {
    // 1) Buscar notificações pendentes e vencidas
    const [notifs] = await conn.query(
      `
      SELECT
        n.id,
        n.carrinho_abandonado_id,
        n.tipo,
        n.scheduled_at,
        n.status,
        ca.id               AS ca_id,
        ca.carrinho_id,
        ca.usuario_id,
        ca.itens,
        ca.total_estimado,
        ca.recuperado,
        u.nome              AS usuario_nome,
        u.email             AS usuario_email,
        u.telefone          AS usuario_telefone
      FROM carrinhos_abandonados_notifications n
      JOIN carrinhos_abandonados ca
        ON ca.id = n.carrinho_abandonado_id
      JOIN usuarios u
        ON u.id = ca.usuario_id
      WHERE n.status = 'pending'
        AND n.scheduled_at <= NOW()
      ORDER BY n.scheduled_at ASC
      LIMIT ?
      `,
      [BATCH_LIMIT]
    );

    if (!notifs.length) {
      isRunning = false;
      conn.release();
      return;
    }

    console.log(`🔔 Encontradas ${notifs.length} notificações pendentes.`);

    for (const n of notifs) {
      // 2) Se o carrinho já foi recuperado, cancelar essa notificação
      if (n.recuperado) {
        await conn.query(
          `
          UPDATE carrinhos_abandonados_notifications
          SET status = 'canceled',
              updated_at = NOW()
          WHERE id = ?
          `,
          [n.id]
        );
        console.log(
          `🟢 Notificação ${n.id} cancelada (carrinho já recuperado).`
        );
        continue;
      }

      // 3) Montar payload para o serviço
      const itens = safeParseItens(n.itens);

      const usuario = {
        id: n.usuario_id,
        nome: n.usuario_nome,
        email: n.usuario_email,
        telefone: n.usuario_telefone,
      };

      const carrinho = {
        id: n.carrinho_id,
        total_estimado: Number(n.total_estimado || 0),
      };

      try {
        // 4) Chamar serviço de envio correto
        if (n.tipo === "whatsapp") {
          await sendAbandonedCartWhatsApp({ usuario, carrinho, itens });
        } else if (n.tipo === "email") {
          await sendAbandonedCartEmail({ usuario, carrinho, itens });
        } else {
          throw new Error(`Tipo de notificação inválido: ${n.tipo}`);
        }

        // 5) Marcar como enviada
        await conn.query(
          `
          UPDATE carrinhos_abandonados_notifications
          SET status = 'sent',
              sent_at = NOW(),
              updated_at = NOW()
          WHERE id = ?
          `,
          [n.id]
        );
        console.log(`✅ Notificação ${n.id} (${n.tipo}) marcada como enviada.`);
      } catch (errSend) {
        console.error(
          `💥 Erro ao enviar notificação ${n.id} (${n.tipo}):`,
          errSend
        );
        await conn.query(
          `
          UPDATE carrinhos_abandonados_notifications
          SET status = 'error',
              error_message = ?,
              updated_at = NOW()
          WHERE id = ?
          `,
          [String(errSend.message || errSend), n.id]
        );
      }
    }
  } catch (err) {
    console.error("💥 Erro geral no AbandonedCartsWorker:", err);
  } finally {
    isRunning = false;
    conn.release();
  }
}

// Loop simples que roda para sempre enquanto o processo estiver vivo
setInterval(() => {
  processarPendentes().catch((err) =>
    console.error("Erro inesperado no loop do worker:", err)
  );
}, POLL_INTERVAL_MS);
