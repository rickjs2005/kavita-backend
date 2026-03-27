"use strict";
// services/cartsAdminService.js
// Regras de negócio para carrinhos abandonados no painel admin.

const pool = require("../config/pool");
const AppError = require("../errors/AppError");
const ERROR_CODES = require("../constants/ErrorCodes");
const repo = require("../repositories/cartsRepository");

const DEFAULT_ABANDON_THRESHOLD_HOURS =
  Number(process.env.ABANDON_CART_HOURS) || 24;

const PUBLIC_SITE_URL = () =>
  (process.env.PUBLIC_SITE_URL || "").replace(/\/+$/, "");

// ---------------------------------------------------------------------------
// Helpers internos
// ---------------------------------------------------------------------------

function parseItensValue(itensValue) {
  if (!itensValue) return [];
  if (Array.isArray(itensValue)) return itensValue;
  if (typeof itensValue === "object") return [];
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

function buildRecoveryLink(carrinho_id) {
  const siteUrl = PUBLIC_SITE_URL();
  if (!siteUrl) return "";
  return `${siteUrl}/checkout?cartId=${encodeURIComponent(carrinho_id)}`;
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

  const link = buildRecoveryLink(carrinho_id);
  if (link) {
    lines.push("");
    lines.push(`Finalizar em 1 clique: ${link}`);
  }

  lines.push("");
  lines.push("Se precisar de ajuda, responda esta mensagem.");

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Use cases
// ---------------------------------------------------------------------------

async function listAbandonedCarts() {
  const conn = await pool.getConnection();
  try {
    const rows = await repo.findAbandonedCarts(conn);
    return rows.map((row) => ({
      id: row.id,
      carrinho_id: row.carrinho_id,
      usuario_id: row.usuario_id,
      usuario_nome: row.usuario_nome,
      usuario_email: row.usuario_email,
      usuario_telefone: row.usuario_telefone,
      itens: parseItensValue(row.itens),
      total_estimado: Number(row.total_estimado || 0),
      criado_em: row.criado_em,
      atualizado_em: row.atualizado_em,
      recuperado: !!row.recuperado,
    }));
  } finally {
    conn.release();
  }
}

async function scanAbandonedCarts(horasParam) {
  const thresholdHours =
    Number.isFinite(Number(horasParam)) && Number(horasParam) > 0
      ? Number(horasParam)
      : DEFAULT_ABANDON_THRESHOLD_HOURS;

  const conn = await pool.getConnection();
  let scanned = 0;

  try {
    const carts = await repo.findOpenCartsOlderThan(conn, thresholdHours);

    for (const cart of carts) {
      try {
        const itensRows = await repo.findCartItems(conn, cart.id);
        if (!itensRows || itensRows.length === 0) continue;

        const itens = itensRows.map((row) => ({
          produto_id: row.produto_id,
          produto: row.produto,
          quantidade: Number(row.quantidade || 0),
          preco_unitario: row.preco_unitario === 0 || row.preco_unitario ? Number(row.preco_unitario) : 0,
        }));

        const totalEstimado = itens.reduce(
          (acc, item) => acc + item.quantidade * item.preco_unitario,
          0
        );

        const abandonedId = await repo.insertAbandonedCart(conn, {
          cartId: cart.id,
          usuarioId: cart.usuario_id,
          itens,
          totalEstimado,
          createdAt: cart.created_at,
        });

        scanned += 1;

        try {
          const now = new Date();
          const notifications = [
            [abandonedId, "whatsapp", new Date(now.getTime() + 1 * 60 * 60 * 1000), "pending"],
            [abandonedId, "email",    new Date(now.getTime() + 4 * 60 * 60 * 1000), "pending"],
            [abandonedId, "whatsapp", new Date(now.getTime() + 24 * 60 * 60 * 1000), "pending"],
          ];
          await repo.insertNotifications(conn, abandonedId, notifications);
        } catch (errNotif) {
          console.warn("[cartsAdminService] Erro ao agendar notificações para", abandonedId, errNotif);
        }
      } catch (errCart) {
        console.warn("[cartsAdminService] Erro ao processar carrinho", cart.id, errCart);
      }
    }

    return scanned;
  } finally {
    conn.release();
  }
}

async function notifyAbandonedCart(id, tipo) {
  if (!["whatsapp", "email"].includes(tipo)) {
    throw new AppError("tipo deve ser 'whatsapp' ou 'email'.", ERROR_CODES.VALIDATION_ERROR, 400);
  }

  const conn = await pool.getConnection();
  try {
    const row = await repo.findAbandonedCartWithUser(conn, id);

    if (!row) {
      throw new AppError("Carrinho abandonado não encontrado.", ERROR_CODES.NOT_FOUND, 404);
    }
    if (row.recuperado) {
      throw new AppError(
        "Este carrinho já foi marcado como recuperado. Não é necessário enviar nova notificação.",
        ERROR_CODES.VALIDATION_ERROR,
        400
      );
    }

    await repo.insertManualNotification(conn, row.id, tipo);

    console.log(
      `[Carrinho Abandonado] Notificação manual via ${tipo} registrada para usuário ${row.usuario_id} (${row.usuario_nome})`
    );

    return tipo;
  } finally {
    conn.release();
  }
}

async function getWhatsAppLink(id) {
  const conn = await pool.getConnection();
  try {
    const row = await repo.findAbandonedCartForWhatsApp(conn, id);

    if (!row) {
      throw new AppError("Carrinho abandonado não encontrado.", ERROR_CODES.NOT_FOUND, 404);
    }
    if (row.recuperado) {
      throw new AppError("Este carrinho já foi marcado como recuperado.", ERROR_CODES.VALIDATION_ERROR, 400);
    }
    if (!row.usuario_telefone) {
      throw new AppError("Usuário não possui telefone cadastrado.", ERROR_CODES.VALIDATION_ERROR, 400);
    }

    const phone = normalizePhoneBR(row.usuario_telefone);
    if (!phone) {
      throw new AppError("Telefone do usuário inválido.", ERROR_CODES.VALIDATION_ERROR, 400);
    }

    const itens = parseItensValue(row.itens);
    const messageText = buildMessageText({
      usuario_nome: row.usuario_nome,
      carrinho_id: row.carrinho_id,
      itens,
      total_estimado: Number(row.total_estimado || 0),
    });

    const waLink = `https://wa.me/${encodeURIComponent(phone)}?text=${encodeURIComponent(messageText)}`;
    return { wa_link: waLink, message_text: messageText };
  } finally {
    conn.release();
  }
}

module.exports = {
  listAbandonedCarts,
  scanAbandonedCarts,
  notifyAbandonedCart,
  getWhatsAppLink,
};
