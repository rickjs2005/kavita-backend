"use strict";
// repositories/cartsRepository.js
// Acesso a dados para carrinhos abandonados.

async function findAbandonedCarts(conn) {
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
  return rows;
}

async function findOpenCartsOlderThan(conn, thresholdHours) {
  const [rows] = await conn.query(
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

async function findCartItems(conn, cartId) {
  const [rows] = await conn.query(
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

async function insertAbandonedCart(conn, { cartId, usuarioId, itens, totalEstimado, createdAt }) {
  const [result] = await conn.query(
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

async function insertNotifications(conn, abandonedId, notifications) {
  // notifications: array de [abandonedId, tipo, scheduledAt, status]
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
    [notifications]
  );
}

async function findAbandonedCartWithUser(conn, id) {
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
  return row || null;
}

async function findAbandonedCartForWhatsApp(conn, id) {
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
  return row || null;
}

async function insertManualNotification(conn, abandonedId, tipo) {
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
