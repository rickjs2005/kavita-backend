"use strict";
// repositories/produtosRepository.js
//
// Escopo: domínio ADMIN de produtos.
// Responsabilidades: CRUD completo (insert, update, delete), gerenciamento de
//                    imagens (insertImages, deleteImages, setMainImage),
//                    leitura para edição no painel.
//
// NÃO contém queries de busca pública nem cálculo de promoções.
// Para listagem/busca pública, use: repositories/productRepository.js
//
// Consumidor: services/produtosAdminService.js
// Pool/conn: recebidos como parâmetro para suporte a transações (BEGIN/COMMIT/ROLLBACK).

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

async function findAll(pool) {
  const [rows] = await pool.query(
    `SELECT * FROM ${PRODUCTS_TABLE} ORDER BY id DESC`
  );
  return (rows || []).map(normalizeShippingFields);
}

async function findById(pool, id) {
  const [rows] = await pool.query(
    `SELECT * FROM ${PRODUCTS_TABLE} WHERE id = ? LIMIT 1`,
    [id]
  );
  if (!rows || rows.length === 0) return null;
  return normalizeShippingFields(rows[0]);
}

/** Busca todas as imagens de uma lista de product IDs (batch). */
async function findImagesByProductIds(pool, ids) {
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
// Utilitário: anexa imagens a uma lista de produtos
// ---------------------------------------------------------------------------

async function attachImages(pool, rows) {
  if (!rows.length) return rows;
  const ids = rows.map((r) => r.id);
  const imgs = await findImagesByProductIds(pool, ids);
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
  remove,
  insertImages,
  deleteImages,
  setMainImage,
};
