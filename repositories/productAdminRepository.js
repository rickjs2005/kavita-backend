"use strict";
// repositories/productAdminRepository.js
//
// Escopo: domínio ADMIN de produtos.
// Responsabilidades: CRUD completo (insert, update, delete), gerenciamento de
//                    imagens (insertImages, deleteImages, setMainImage),
//                    leitura para edição no painel.
//
// NÃO contém queries de busca pública nem cálculo de promoções.
// Par público: repositories/productPublicRepository.js
//
// Consumidor: services/produtosAdminService.js
//
// Convenção de conexão:
//   Funções de leitura (findAll, findById, findImagesByProductIds, attachImages)
//   usam o pool interno — sem parâmetro extra.
//   Funções de escrita (insert, update, remove, insertImages, deleteImages,
//   setMainImage) e findImagesByProductId recebem `conn` para participar de
//   transações gerenciadas pelo service (BEGIN/COMMIT/ROLLBACK).

const pool = require("../config/pool");

const PRODUCTS_TABLE = "products";
const PRODUCT_IMAGES_TABLE = "product_images";
const IMAGE_COL = "image";
const CATEGORY_COL = "category_id";
const SHIPPING_FREE_COL = "shipping_free";
const SHIPPING_FREE_FROM_QTY_COL = "shipping_free_from_qty";

// ---------------------------------------------------------------------------
// Helpers internos
// ---------------------------------------------------------------------------

function normalizeShippingFields(row) {
  if (!row) return row;
  const sf = row[SHIPPING_FREE_COL];
  const sfq = row[SHIPPING_FREE_FROM_QTY_COL];
  return {
    ...row,
    [SHIPPING_FREE_COL]: sf === null || sf === undefined ? 0 : Number(sf) ? 1 : 0,
    [SHIPPING_FREE_FROM_QTY_COL]:
      sfq === null || sfq === undefined || sfq === "" ? null : Number(sfq),
  };
}

// ---------------------------------------------------------------------------
// Queries de leitura
// ---------------------------------------------------------------------------

async function findAll() {
  const [rows] = await pool.query(
    `SELECT * FROM ${PRODUCTS_TABLE} ORDER BY id DESC`
  );
  return (rows || []).map(normalizeShippingFields);
}

/**
 * Flips the is_active flag for a single product.
 *
 * @param {object} conn - Transaction connection
 * @param {number} id
 * @param {boolean} isActive
 * @returns {number} affectedRows — 0 means product does not exist
 */
async function updateStatus(conn, id, isActive) {
  const [result] = await conn.query(
    `UPDATE ${PRODUCTS_TABLE} SET is_active = ? WHERE id = ?`,
    [isActive ? 1 : 0, id]
  );
  return result.affectedRows;
}

async function findById(id) {
  const [rows] = await pool.query(
    `SELECT * FROM ${PRODUCTS_TABLE} WHERE id = ? LIMIT 1`,
    [id]
  );
  if (!rows || rows.length === 0) return null;
  return normalizeShippingFields(rows[0]);
}

/** Busca todas as imagens de uma lista de product IDs (batch — leitura via pool interno). */
async function findImagesByProductIds(ids) {
  if (!ids.length) return [];
  const [imgs] = await pool.query(
    `SELECT product_id, path FROM ${PRODUCT_IMAGES_TABLE} WHERE product_id IN (?)`,
    [ids]
  );
  return imgs;
}

/** Busca imagens de um único produto (usa conn ou pool indistintamente). */
async function findImagesByProductId(db, productId) {
  const [rows] = await db.query(
    `SELECT path FROM ${PRODUCT_IMAGES_TABLE} WHERE product_id = ?`,
    [productId]
  );
  return rows;
}

// ---------------------------------------------------------------------------
// Mutations (usam connection para rodar dentro de transações)
// ---------------------------------------------------------------------------

async function insert(conn, { name, description, priceNum, qtyNum, catIdNum, shippingFreeBool, shippingFreeFromQty }) {
  const [result] = await conn.query(
    `INSERT INTO ${PRODUCTS_TABLE} (
      name, description, price, quantity, ${CATEGORY_COL}, ${IMAGE_COL},
      ${SHIPPING_FREE_COL}, ${SHIPPING_FREE_FROM_QTY_COL}
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [name, description || null, priceNum, qtyNum, catIdNum, null, shippingFreeBool ? 1 : 0, shippingFreeFromQty]
  );
  return result.insertId;
}

async function update(conn, id, { name, description, priceNum, qtyNum, catIdNum, shippingFreeBool, shippingFreeFromQty }) {
  const [result] = await conn.query(
    `UPDATE ${PRODUCTS_TABLE}
     SET
       name = ?,
       description = ?,
       price = ?,
       quantity = ?,
       ${CATEGORY_COL} = ?,
       ${SHIPPING_FREE_COL} = ?,
       ${SHIPPING_FREE_FROM_QTY_COL} = ?
     WHERE id = ?`,
    [name, description || null, priceNum, qtyNum, catIdNum, shippingFreeBool ? 1 : 0, shippingFreeFromQty, id]
  );
  return result.affectedRows;
}

/**
 * Checks whether a product has references in carrinho_itens (any cart status).
 * Used before hard-delete to prevent FK violation (carrinho_itens has ON DELETE RESTRICT).
 *
 * @param {object} conn - Transaction connection
 * @param {number} productId
 * @returns {{ activeCount: number, closedCount: number }}
 */
async function countCartReferences(conn, productId) {
  const [rows] = await conn.query(
    `SELECT
       SUM(CASE WHEN c.status = 'aberto' THEN 1 ELSE 0 END) AS activeCount,
       SUM(CASE WHEN c.status != 'aberto' THEN 1 ELSE 0 END) AS closedCount
     FROM carrinho_itens ci
     JOIN carrinhos c ON c.id = ci.carrinho_id
     WHERE ci.produto_id = ?`,
    [productId]
  );
  return {
    activeCount: Number(rows[0]?.activeCount ?? 0),
    closedCount: Number(rows[0]?.closedCount ?? 0),
  };
}

/**
 * Removes cart item references from non-active carts (convertido, cancelado, fechado).
 * This allows hard-delete to proceed without FK violation.
 *
 * @param {object} conn - Transaction connection
 * @param {number} productId
 */
async function removeClosedCartItems(conn, productId) {
  await conn.query(
    `DELETE ci FROM carrinho_itens ci
     JOIN carrinhos c ON c.id = ci.carrinho_id
     WHERE ci.produto_id = ? AND c.status != 'aberto'`,
    [productId]
  );
}

async function remove(conn, id) {
  const [result] = await conn.query(
    `DELETE FROM ${PRODUCTS_TABLE} WHERE id = ?`,
    [id]
  );
  return result.affectedRows;
}

async function insertImages(conn, productId, paths) {
  if (!paths.length) return;
  const values = paths.map((p) => [productId, p]);
  await conn.query(
    `INSERT INTO ${PRODUCT_IMAGES_TABLE} (product_id, path) VALUES ?`,
    [values]
  );
}

async function deleteImages(conn, productId, pathsToRemove) {
  if (!pathsToRemove.length) return;
  await conn.query(
    `DELETE FROM ${PRODUCT_IMAGES_TABLE} WHERE product_id = ? AND path IN (?)`,
    [productId, pathsToRemove]
  );
}

async function setMainImage(conn, productId, imagePath) {
  await conn.query(
    `UPDATE ${PRODUCTS_TABLE} SET ${IMAGE_COL} = ? WHERE id = ?`,
    [imagePath, productId]
  );
}

// ---------------------------------------------------------------------------
// Utilitário: anexa imagens a uma lista de produtos (leitura via pool interno)
// ---------------------------------------------------------------------------

async function attachImages(rows) {
  if (!rows.length) return rows;
  const ids = rows.map((r) => r.id);
  const imgs = await findImagesByProductIds(ids);
  const bucket = imgs.reduce((acc, r) => {
    (acc[r.product_id] ||= []).push(r.path);
    return acc;
  }, {});
  return rows.map((r) => ({ ...r, images: bucket[r.id] || [] }));
}

module.exports = {
  findAll,
  findById,
  findImagesByProductIds,
  findImagesByProductId,
  attachImages,
  insert,
  update,
  updateStatus,
  countCartReferences,
  removeClosedCartItems,
  remove,
  insertImages,
  deleteImages,
  setMainImage,
};
