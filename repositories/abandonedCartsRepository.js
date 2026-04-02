"use strict";
// repositories/abandonedCartsRepository.js
//
// Escopo: domínio ADMIN de carrinhos — carrinhos ABANDONADOS e recuperação.
// Responsabilidades: scan de carrinhos abertos sem registro, listagem de
//                    abandonados, inserção de notificações (email/whatsapp),
//                    consulta para geração de link WhatsApp.
//
// Par usuário: repositories/cartRepository.js (carrinho ativo do usuário)
//
// Consumidor: services/cartsAdminService.js
//
// Convenção de conexão:
//   Todas as funções usam o pool interno (pool.query) — sem suporte a transação.
//   Não há BEGIN/COMMIT aqui; a orquestração entre chamadas é do service.

const pool = require("../config/pool");

async function findAbandonedCarts() {
  const [rows] = await pool.query(
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
  return rows;
}

async function findOpenCartsOlderThan(thresholdHours) {
  const [rows] = await pool.query(
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
  return rows;
}

async function findCartItems(cartId) {
  const [rows] = await pool.query(
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
    [cartId]
  );
  return rows;
}

async function insertAbandonedCart({ cartId, usuarioId, itens, totalEstimado, createdAt }) {
  const [result] = await pool.query(
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
    [cartId, usuarioId, JSON.stringify(itens), totalEstimado, createdAt]
  );
  return result.insertId;
}

/**
 * Insere notificações agendadas em lote.
 * @param {Array<[number, string, Date, string]>} notifications
 *   Cada tupla: [carrinho_abandonado_id, tipo, scheduled_at, status]
 */
async function insertNotifications(notifications) {
  await pool.query(
    `
    INSERT IGNORE INTO carrinhos_abandonados_notifications (
      carrinho_abandonado_id,
      tipo,
      scheduled_at,
      status
    )
    VALUES ?
    `,
    [notifications]
  );
}

async function findAbandonedCartWithUser(id) {
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
  return row || null;
}

async function findAbandonedCartForWhatsApp(id) {
  const [[row]] = await pool.query(
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
  return row || null;
}

async function insertManualNotification(abandonedId, tipo) {
  await pool.query(
    `
    INSERT INTO carrinhos_abandonados_notifications (
      carrinho_abandonado_id,
      tipo,
      scheduled_at,
      status
    )
    VALUES (?, ?, NOW(), 'pending')
    `,
    [abandonedId, tipo]
  );
}

module.exports = {
  findAbandonedCarts,
  findOpenCartsOlderThan,
  findCartItems,
  insertAbandonedCart,
  insertNotifications,
  findAbandonedCartWithUser,
  findAbandonedCartForWhatsApp,
  insertManualNotification,
};
