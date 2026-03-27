"use strict";
// services/produtosAdminService.js
// Regras de negócio para gestão de produtos no painel admin.

const pool = require("../config/pool");
const mediaService = require("./mediaService");
const AppError = require("../errors/AppError");
const ERROR_CODES = require("../constants/ErrorCodes");
const repo = require("../repositories/produtosRepository");

// ---------------------------------------------------------------------------
// Conversores de tipo (inputs chegam como string via multipart/form-data)
// ---------------------------------------------------------------------------

function parseMoneyBR(v) {
  if (v === undefined || v === null) return NaN;
  let s = String(v).trim().replace(/[R$\s]/g, "");
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma > -1 && lastDot > -1) {
    const decSep = lastComma > lastDot ? "," : ".";
    const thouSep = decSep === "," ? "." : ",";
    s = s.replace(new RegExp("\\" + thouSep, "g"), "");
    if (decSep === ",") s = s.replace(",", ".");
  } else if (lastComma > -1) {
    s = s.replace(/\./g, "").replace(",", ".");
  }
  const n = Number(s);
  return Number.isFinite(n) ? Number(n.toFixed(2)) : NaN;
}

function toInt(v, def = 0) {
  const n = Number(v);
  return Number.isInteger(n) ? n : def;
}

function parseBoolLike(v) {
  if (typeof v === "boolean") return v;
  const s = String(v ?? "").trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes" || s === "on";
}

function parseNullablePositiveInt(v) {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  if (!s) return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  const i = Math.floor(n);
  return i > 0 ? i : null;
}

/** Helper: extrai targets de limpeza a partir de req.files (antes de persistir). */
function rawFileTargets(files = []) {
  return (files || [])
    .filter((f) => f && f.filename)
    .map((f) => ({ path: mediaService.toPublicPath(f.filename) }));
}

/** Valida e converte os campos numéricos comuns a create/update. */
function parseAndValidateProductFields(data) {
  const { name, description, price, quantity, category_id, shippingFree, shippingFreeFromQtyStr } = data;

  const priceNum = parseMoneyBR(price);
  const qtyNum = toInt(quantity, -1);
  const catIdNum = toInt(category_id, -1);
  const shippingFreeBool = parseBoolLike(shippingFree);
  const shippingFreeFromQty = shippingFreeBool
    ? parseNullablePositiveInt(shippingFreeFromQtyStr)
    : null;

  if (!name.trim())
    throw new AppError("Nome é obrigatório.", ERROR_CODES.VALIDATION_ERROR, 400);
  if (!Number.isFinite(priceNum) || priceNum <= 0)
    throw new AppError("Preço inválido.", ERROR_CODES.VALIDATION_ERROR, 400);
  if (qtyNum < 0)
    throw new AppError("Quantidade inválida.", ERROR_CODES.VALIDATION_ERROR, 400);
  if (catIdNum <= 0)
    throw new AppError("Categoria inválida.", ERROR_CODES.VALIDATION_ERROR, 400);

  return {
    name: name.trim(),
    description: description?.trim() || null,
    priceNum,
    qtyNum,
    catIdNum,
    shippingFreeBool,
    shippingFreeFromQty,
  };
}

// ---------------------------------------------------------------------------
// Use cases
// ---------------------------------------------------------------------------

async function listProducts() {
  const rows = await repo.findAll(pool);
  return repo.attachImages(pool, rows);
}

async function getProduct(id) {
  const row = await repo.findById(pool, id);
  if (!row) throw new AppError("Produto não encontrado.", ERROR_CODES.NOT_FOUND, 404);
  const [withImages] = await repo.attachImages(pool, [row]);
  return withImages;
}

async function createProduct(body, files) {
  const fields = parseAndValidateProductFields(body);
  const conn = await pool.getConnection();
  let uploadedMedia = [];

  try {
    await conn.beginTransaction();

    const productId = await repo.insert(conn, fields);

    if (files.length) {
      uploadedMedia = await mediaService.persistMedia(files, { folder: "products" });
      if (uploadedMedia.length) {
        const paths = uploadedMedia.map((m) => m.path);
        await repo.insertImages(conn, productId, paths);
        await repo.setMainImage(conn, productId, paths[0]);
      }
    }

    await conn.commit();
    return productId;
  } catch (err) {
    await conn.rollback();
    await mediaService.enqueueOrphanCleanup([...uploadedMedia, ...rawFileTargets(files)]);
    throw err;
  } finally {
    conn.release();
  }
}

async function updateProduct(id, body, files) {
  const fields = parseAndValidateProductFields(body);

  let keep = [];
  try {
    keep = JSON.parse(body.keepImages || "[]");
    if (!Array.isArray(keep)) keep = [];
  } catch (_) {
    keep = [];
  }

  const conn = await pool.getConnection();
  let uploadedMedia = [];
  let removedDuringUpdate = [];

  try {
    await conn.beginTransaction();

    const affectedRows = await repo.update(conn, id, fields);
    if (affectedRows === 0) {
      await conn.rollback();
      await mediaService.enqueueOrphanCleanup(rawFileTargets(files));
      throw new AppError("Produto não encontrado.", ERROR_CODES.NOT_FOUND, 404);
    }

    const curImgs = await repo.findImagesByProductId(conn, id);
    const currentPaths = curImgs.map((r) => r.path);
    const toRemove = currentPaths.filter((p) => !keep.includes(p));

    if (toRemove.length) {
      await repo.deleteImages(conn, id, toRemove);
      removedDuringUpdate = toRemove;
    }

    if (files.length) {
      uploadedMedia = await mediaService.persistMedia(files, { folder: "products" });
      if (uploadedMedia.length) {
        const uploadedPaths = uploadedMedia.map((m) => m.path);
        await repo.insertImages(conn, id, uploadedPaths);
        keep = [...keep, ...uploadedPaths];
      }
    }

    await repo.setMainImage(conn, id, keep[0] || null);
    await conn.commit();

    if (removedDuringUpdate.length) {
      mediaService.removeMedia(removedDuringUpdate).catch((e) => {
        console.error("Falha ao remover mídias antigas de produto:", e);
      });
    }
  } catch (err) {
    await conn.rollback();
    await mediaService.enqueueOrphanCleanup([...uploadedMedia, ...rawFileTargets(files)]);
    throw err;
  } finally {
    conn.release();
  }
}

async function deleteProduct(id) {
  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    const imgs = await repo.findImagesByProductId(conn, id);
    const affectedRows = await repo.remove(conn, id);

    if (affectedRows === 0) {
      await conn.rollback();
      throw new AppError("Produto não encontrado.", ERROR_CODES.NOT_FOUND, 404);
    }

    await conn.commit();

    if (imgs.length) {
      mediaService.removeMedia(imgs.map((r) => r.path)).catch((e) => {
        console.error("Falha ao remover mídias de produto excluído:", e);
      });
    }
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

module.exports = { listProducts, getProduct, createProduct, updateProduct, deleteProduct };
