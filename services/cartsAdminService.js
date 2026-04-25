"use strict";
// services/cartsAdminService.js
// Regras de negócio para carrinhos abandonados no painel admin.

const AppError = require("../errors/AppError");
const ERROR_CODES = require("../constants/ErrorCodes");
const repo = require("../repositories/abandonedCartsRepository");
const { logger } = require("../lib");

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

function buildRecoveryLink(carrinho_id, cupomCodigo = null) {
  const siteUrl = PUBLIC_SITE_URL();
  if (!siteUrl) return "";
  // C2 — quando há cupom de recuperação, anexa &cupom=... pra o
  // checkout poder pre-aplicar (frontend pode usar quando suportar).
  const base = `${siteUrl}/checkout?cartId=${encodeURIComponent(carrinho_id)}`;
  return cupomCodigo
    ? `${base}&cupom=${encodeURIComponent(cupomCodigo)}`
    : base;
}

/**
 * Renderiza o texto da mensagem WhatsApp/preview.
 *
 * Quando `coupon` é passado (3ª notificação WhatsApp, +24h), injeta um
 * bloco com o código + validade resumida. URL ganha &cupom=... pra
 * checkout futuro pre-aplicar.
 *
 * @param {object} params
 * @param {string} params.usuario_nome
 * @param {number} params.carrinho_id
 * @param {Array}  params.itens
 * @param {number} params.total_estimado
 * @param {object|null} [params.coupon]  { codigo, valor, expiracao }
 */
function buildMessageText({
  usuario_nome,
  carrinho_id,
  itens,
  total_estimado,
  coupon = null,
}) {
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

  // C2 — bloco de cupom de recuperação (só aparece na 3ª notif)
  if (coupon && coupon.codigo) {
    const desconto = `${Number(coupon.valor || 0)}%`;
    const exp = coupon.expiracao
      ? new Date(coupon.expiracao).toLocaleString("pt-BR", {
          day: "2-digit",
          month: "short",
          hour: "2-digit",
          minute: "2-digit",
        })
      : null;
    lines.push("");
    lines.push(
      exp
        ? `Use o cupom ${coupon.codigo} e ganhe ${desconto} de desconto (válido até ${exp}).`
        : `Use o cupom ${coupon.codigo} e ganhe ${desconto} de desconto.`,
    );
  }

  const link = buildRecoveryLink(carrinho_id, coupon?.codigo ?? null);
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
  const rows = await repo.findAbandonedCarts();
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
}

async function scanAbandonedCarts(horasParam) {
  const thresholdHours =
    Number.isFinite(Number(horasParam)) && Number(horasParam) > 0
      ? Number(horasParam)
      : DEFAULT_ABANDON_THRESHOLD_HOURS;

  const carts = await repo.findOpenCartsOlderThan(thresholdHours);
  const candidates = carts.length;
  let inserted = 0;
  let skippedEmpty = 0;
  let skippedError = 0;

  for (const cart of carts) {
    try {
      const itensRows = await repo.findCartItems(cart.id);
      if (!itensRows || itensRows.length === 0) {
        skippedEmpty += 1;
        continue;
      }

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

      const abandonedId = await repo.insertAbandonedCart({
        cartId: cart.id,
        usuarioId: cart.usuario_id,
        itens,
        totalEstimado,
        createdAt: cart.created_at,
      });

      inserted += 1;

      try {
        const now = new Date();
        const notifications = [
          [abandonedId, "whatsapp", new Date(now.getTime() + 1 * 60 * 60 * 1000),  "pending"],
          [abandonedId, "email",    new Date(now.getTime() + 4 * 60 * 60 * 1000),  "pending"],
          [abandonedId, "whatsapp", new Date(now.getTime() + 24 * 60 * 60 * 1000), "pending"],
        ];
        await repo.insertNotifications(notifications);
      } catch (errNotif) {
        logger.warn({ err: errNotif, abandonedId }, "[cartsAdminService] Erro ao agendar notificações");
      }
    } catch (errCart) {
      skippedError += 1;
      logger.warn({ err: errCart, cartId: cart.id }, "[cartsAdminService] Erro ao processar carrinho");
    }
  }

  return {
    candidates,
    inserted,
    skippedEmpty,
    skippedError,
    minHours: thresholdHours,
  };
}

async function notifyAbandonedCart(id, tipo) {
  // `tipo` já é validado pelo NotifyBodySchema na rota ("whatsapp"|"email").
  const row = await repo.findAbandonedCartWithUser(id);

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

  await repo.insertManualNotification(row.id, tipo);

  logger.info(
    { abandonedId: row.id, usuarioId: row.usuario_id, usuario_nome: row.usuario_nome, tipo },
    "[Carrinho Abandonado] Notificação manual registrada"
  );

  return tipo;
}

/**
 * C2 — limiar em horas de idade do carrinho abandonado pra entrar
 * na fase de cupom de recuperação. 22h por default = corresponde
 * à 3ª notificação WhatsApp (+24h após o scan), com 2h de margem
 * pra evitar borda exata.
 */
const RECOVERY_COUPON_AFTER_HOURS = Number(
  process.env.RECOVERY_COUPON_AFTER_HOURS || 22,
);

async function getWhatsAppLink(id) {
  const row = await repo.findAbandonedCartForWhatsApp(id);

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

  // C2 — se o carrinho foi abandonado há tempo suficiente (>=22h),
  // gera/reusa cupom de recuperação. Operação idempotente; chamar
  // a mesma rota 5× só cria 1 cupom no banco.
  const coupon = await maybeGetRecoveryCoupon(row);

  const itens = parseItensValue(row.itens);
  const messageText = buildMessageText({
    usuario_nome: row.usuario_nome,
    carrinho_id: row.carrinho_id,
    itens,
    total_estimado: Number(row.total_estimado || 0),
    coupon,
  });

  const waLink = `https://wa.me/${encodeURIComponent(phone)}?text=${encodeURIComponent(messageText)}`;
  return {
    wa_link: waLink,
    message_text: messageText,
    coupon: coupon
      ? {
          codigo: coupon.codigo,
          valor: coupon.valor,
          expiracao: coupon.expiracao,
        }
      : null,
  };
}

/**
 * Decide se aplica cupom de recuperação e devolve a linha do cupom
 * (criando idempotentemente se necessário). Retorna null fora da
 * janela ou em caso de erro silencioso.
 */
async function maybeGetRecoveryCoupon(abandonedRow) {
  try {
    const ageHours =
      (Date.now() - new Date(abandonedRow.criado_em).getTime()) /
      (1000 * 60 * 60);
    if (ageHours < RECOVERY_COUPON_AFTER_HOURS) return null;

    const {
      buildRecoveryCode,
      buildExpirationDate,
      RECOVERY_DEFAULTS,
    } = require("../lib/recoveryCoupon");
    const cuponsRepo = require("../repositories/cuponsRepository");

    const codigo = buildRecoveryCode(abandonedRow.carrinho_id);
    const { row, created } = await cuponsRepo.findOrCreateByCodigo({
      codigo,
      tipo: RECOVERY_DEFAULTS.tipo,
      valor: RECOVERY_DEFAULTS.valor,
      minimo: RECOVERY_DEFAULTS.minimo,
      expiracao: buildExpirationDate(RECOVERY_DEFAULTS.expiracaoHours),
      max_usos: RECOVERY_DEFAULTS.max_usos,
      max_usos_por_usuario: RECOVERY_DEFAULTS.max_usos_por_usuario,
    });
    if (created) {
      logger.info(
        { abandonedId: abandonedRow.id, codigo },
        "[Carrinho Abandonado] Cupom de recuperacao criado",
      );
    }
    return row;
  } catch (err) {
    // Falha de cupom NUNCA bloqueia o link WhatsApp — é melhor mandar
    // mensagem sem desconto do que travar o admin.
    logger.warn(
      { err, abandonedId: abandonedRow?.id },
      "[Carrinho Abandonado] Falha ao gerar cupom de recuperacao",
    );
    return null;
  }
}

module.exports = {
  listAbandonedCarts,
  scanAbandonedCarts,
  notifyAbandonedCart,
  getWhatsAppLink,
};
