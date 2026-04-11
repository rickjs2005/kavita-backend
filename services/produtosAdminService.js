"use strict";
// services/produtosAdminService.js
// Regras de negócio para gestão de produtos no painel admin.

const { withTransaction } = require("../lib/withTransaction");
const mediaService = require("./mediaService");
const AppError = require("../errors/AppError");
const ERROR_CODES = require("../constants/ErrorCodes");
const repo = require("../repositories/productAdminRepository");
const { logger } = require("../lib");

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
  const {
    name,
    description,
    price,
    quantity,
    category_id,
    shippingFree,
    shippingFreeFromQtyStr,
    shippingPrazoDiasStr,
  } = data;

  const priceNum = parseMoneyBR(price);
  const qtyNum = toInt(quantity, -1);
  const catIdNum = toInt(category_id, -1);
  const shippingFreeBool = parseBoolLike(shippingFree);
  const shippingFreeFromQty = shippingFreeBool
    ? parseNullablePositiveInt(shippingFreeFromQtyStr)
    : null;
  // Prazo próprio do produto — NULL quando não informado (cai no prazo da região).
  const shippingPrazoDias = parseNullablePositiveInt(shippingPrazoDiasStr);

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
    shippingPrazoDias,
  };
}

// ---------------------------------------------------------------------------
// Use cases
// ---------------------------------------------------------------------------

async function listProducts() {
  const rows = await repo.findAll();
  return repo.attachImages(rows);
}

async function getProduct(id) {
  const row = await repo.findById(id);
  if (!row) throw new AppError("Produto não encontrado.", ERROR_CODES.NOT_FOUND, 404);
  const [withImages] = await repo.attachImages([row]);
  return withImages;
}

async function createProduct(body, files) {
  const fields = parseAndValidateProductFields(body);
  let uploadedMedia = [];

  try {
    return await withTransaction(async (conn) => {
      const productId = await repo.insert(conn, fields);

      if (files.length) {
        uploadedMedia = await mediaService.persistMedia(files, { folder: "products" });
        if (uploadedMedia.length) {
          const paths = uploadedMedia.map((m) => m.path);
          await repo.insertImages(conn, productId, paths);
          await repo.setMainImage(conn, productId, paths[0]);
        }
      }

      return productId;
    });
  } catch (err) {
    await mediaService.enqueueOrphanCleanup([...uploadedMedia, ...rawFileTargets(files)]);
    throw err;
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

  let uploadedMedia = [];

  try {
    const removedDuringUpdate = await withTransaction(async (conn) => {
      const affectedRows = await repo.update(conn, id, fields);
      if (affectedRows === 0) {
        throw new AppError("Produto não encontrado.", ERROR_CODES.NOT_FOUND, 404);
      }

      const curImgs = await repo.findImagesByProductId(conn, id);
      const currentPaths = curImgs.map((r) => r.path);
      const toRemove = currentPaths.filter((p) => !keep.includes(p));

      if (toRemove.length) {
        await repo.deleteImages(conn, id, toRemove);
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

      return toRemove;
    });

    if (removedDuringUpdate.length) {
      mediaService.removeMedia(removedDuringUpdate).catch((e) => {
        logger.error({ err: e, productId: id }, "Falha ao remover mídias antigas de produto");
      });
    }
  } catch (err) {
    await mediaService.enqueueOrphanCleanup([...uploadedMedia, ...rawFileTargets(files)]);
    throw err;
  }
}

async function updateProductStatus(id, isActive) {
  const affectedRows = await withTransaction(async (conn) => {
    return repo.updateStatus(conn, id, isActive);
  });

  if (affectedRows === 0) {
    throw new AppError("Produto não encontrado.", ERROR_CODES.NOT_FOUND, 404);
  }
}

async function deleteProduct(id) {
  const imgs = await withTransaction(async (conn) => {
    // 1. Verificar se produto existe
    const product = await repo.findById(id);
    if (!product) {
      throw new AppError("Produto não encontrado.", ERROR_CODES.NOT_FOUND, 404);
    }

    // 2. Verificar vínculos em carrinho (carrinho_itens tem ON DELETE RESTRICT)
    const { activeCount, closedCount } = await repo.countCartReferences(conn, id);

    if (activeCount > 0) {
      throw new AppError(
        "Este produto está em carrinhos ativos de clientes. Desative-o em vez de excluir, ou aguarde os carrinhos serem convertidos/cancelados.",
        ERROR_CODES.CONFLICT,
        409,
        { activeCartItems: activeCount },
      );
    }

    // 3. Limpar referências em carrinhos já fechados/convertidos/cancelados
    if (closedCount > 0) {
      await repo.removeClosedCartItems(conn, id);
    }

    // 4. Buscar imagens antes do delete (CASCADE apaga product_images)
    const images = await repo.findImagesByProductId(conn, id);

    // 5. Executar o hard delete
    const affectedRows = await repo.remove(conn, id);

    if (affectedRows === 0) {
      throw new AppError("Produto não encontrado.", ERROR_CODES.NOT_FOUND, 404);
    }

    return images;
  });

  // 6. Cleanup de arquivos no disco (fire-and-forget, não bloqueia resposta)
  if (imgs.length) {
    mediaService.removeMedia(imgs.map((r) => r.path)).catch((e) => {
      logger.error({ err: e, productId: id }, "Falha ao remover mídias de produto excluído");
    });
  }
}

module.exports = { listProducts, getProduct, createProduct, updateProduct, updateProductStatus, deleteProduct };
