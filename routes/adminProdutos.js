const express = require("express");
const router = express.Router();
const pool = require("../config/pool");
const verifyAdmin = require("../middleware/verifyAdmin");
const mediaService = require("../services/mediaService");

/* ==============================
   Config por ENV (flexibiliza BD)
============================== */
const PRODUCTS_TABLE = "products";
const PRODUCT_IMAGES_TABLE = "product_images";
const CATEGORY_COL = "category_id";
const IMAGE_COL = "image";

// Novas colunas (frete por produto)
const SHIPPING_FREE_COL = "shipping_free";
const SHIPPING_FREE_FROM_QTY_COL = "shipping_free_from_qty";

const IS_DEV = process.env.NODE_ENV !== "production";

/* ============ Upload Helpers ============ */
const upload = mediaService.upload;

const rawFileTargets = (files = []) =>
  (files || [])
    .filter((file) => file && file.filename)
    .map((file) => ({ path: mediaService.toPublicPath(file.filename) }));

/* ============ Helpers ============ */
const parseMoneyBR = (v) => {
  if (v === undefined || v === null) return NaN;
  // aceita "1.234,56", "200,00", "200.50", "R$ 20,00"
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
};

const toInt = (v, def = 0) => {
  const n = Number(v);
  return Number.isInteger(n) ? n : def;
};

const parseBoolLike = (v) => {
  if (typeof v === "boolean") return v;
  const s = String(v ?? "").trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes" || s === "on";
};

const parseNullablePositiveInt = (v) => {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  if (!s) return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  const i = Math.floor(n);
  return i > 0 ? i : null;
};

async function attachImages(rows) {
  if (!rows.length) return rows;

  const ids = rows.map((r) => r.id);
  const [imgs] = await pool.query(
    `SELECT product_id, path FROM ${PRODUCT_IMAGES_TABLE} WHERE product_id IN (?)`,
    [ids]
  );

  const bucket = imgs.reduce((acc, r) => {
    (acc[r.product_id] ||= []).push(r.path);
    return acc;
  }, {});

  return rows.map((r) => ({
    ...r,
    images: bucket[r.id] || [],
  }));
}

function normalizeShippingFields(row) {
  if (!row) return row;
  // Garantir consistência para o frontend:
  // shipping_free => 0/1
  // shipping_free_from_qty => int ou null
  const sf = row[SHIPPING_FREE_COL];
  const sfq = row[SHIPPING_FREE_FROM_QTY_COL];

  return {
    ...row,
    [SHIPPING_FREE_COL]: sf === null || sf === undefined ? 0 : Number(sf) ? 1 : 0,
    [SHIPPING_FREE_FROM_QTY_COL]:
      sfq === null || sfq === undefined || sfq === "" ? null : Number(sfq),
  };
}

/* ------------------------------------------------------------------ */
/*                               Swagger                              */
/* ------------------------------------------------------------------ */
/**
 * @openapi
 * tags:
 *   - name: Admin Produtos
 *     description: Gestão de produtos no painel admin
 */

/**
 * @openapi
 * components:
 *   schemas:
 *     Product:
 *       type: object
 *       properties:
 *         id: { type: integer, example: 10 }
 *         name: { type: string, example: "Ração Premium 10kg" }
 *         description: { type: string, nullable: true, example: "Detalhes do produto..." }
 *         price: { type: number, example: 199.9 }
 *         quantity: { type: integer, example: 10 }
 *         category_id: { type: integer, example: 3 }
 *         image: { type: string, nullable: true, example: "/uploads/products/abc.jpg" }
 *         images:
 *           type: array
 *           items: { type: string }
 *           example: ["/uploads/products/abc.jpg", "/uploads/products/def.jpg"]
 *         shipping_free: { type: integer, example: 1, description: "1 = frete grátis por produto" }
 *         shipping_free_from_qty:
 *           type: integer
 *           nullable: true
 *           example: 3
 *           description: "Quantidade mínima para frete grátis (se shipping_free=1)."
 */

/**
 * @openapi
 * /api/admin/produtos:
 *   get:
 *     tags: [Admin Produtos]
 *     summary: Lista todos os produtos cadastrados
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de produtos retornada
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items: { $ref: '#/components/schemas/Product' }
 *       401:
 *         description: Não autorizado
 *       500:
 *         description: Erro interno
 */

/**
 * @openapi
 * /api/admin/produtos/{id}:
 *   get:
 *     tags: [Admin Produtos]
 *     summary: Busca um produto por id (para edição no admin)
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Produto retornado
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Product' }
 *       404:
 *         description: Produto não encontrado
 *       401:
 *         description: Não autorizado
 *       500:
 *         description: Erro interno
 */

/**
 * @openapi
 * /api/admin/produtos:
 *   post:
 *     tags: [Admin Produtos]
 *     summary: Cadastra um novo produto com imagens (opcional) e frete por produto
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [name, price, quantity, category_id]
 *             properties:
 *               name: { type: string }
 *               description: { type: string, nullable: true }
 *               price: { type: string, example: "199,90" }
 *               quantity: { type: integer }
 *               category_id: { type: integer }
 *               shippingFree:
 *                 type: string
 *                 example: "1"
 *                 description: 'Aceita "1"/"0", "true"/"false", "on"/"off".'
 *               shippingFreeFromQtyStr:
 *                 type: string
 *                 example: "3"
 *                 description: "Quantidade mínima para frete grátis (opcional)."
 *               images:
 *                 type: array
 *                 items: { type: string, format: binary }
 *     responses:
 *       201:
 *         description: Produto criado com sucesso
 *       400:
 *         description: Campos inválidos
 *       401:
 *         description: Não autorizado
 *       500:
 *         description: Erro interno
 */

/**
 * @openapi
 * /api/admin/produtos/{id}:
 *   put:
 *     tags: [Admin Produtos]
 *     summary: Atualiza um produto existente (imagens + keepImages + frete por produto)
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               name: { type: string }
 *               description: { type: string }
 *               price: { type: string, example: "199,90" }
 *               quantity: { type: integer }
 *               category_id: { type: integer }
 *               keepImages: { type: string, example: '["/uploads/products/abc.jpg"]' }
 *               shippingFree:
 *                 type: string
 *                 example: "0"
 *                 description: 'Aceita "1"/"0", "true"/"false", "on"/"off".'
 *               shippingFreeFromQtyStr:
 *                 type: string
 *                 example: "10"
 *                 description: "Quantidade mínima para frete grátis (opcional)."
 *               images:
 *                 type: array
 *                 items: { type: string, format: binary }
 *     responses:
 *       200:
 *         description: Produto atualizado
 *       404:
 *         description: Produto não encontrado
 *       401:
 *         description: Não autorizado
 *       500:
 *         description: Erro interno
 */

/**
 * @openapi
 * /api/admin/produtos/{id}:
 *   delete:
 *     tags: [Admin Produtos]
 *     summary: Remove um produto e suas imagens
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Produto removido
 *       404:
 *         description: Produto não encontrado
 *       401:
 *         description: Não autorizado
 *       500:
 *         description: Erro interno
 */

/* ============ Rotas ============ */

// GET /api/admin/produtos
router.get("/", verifyAdmin, async (_req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT * FROM ${PRODUCTS_TABLE} ORDER BY id DESC`
    );

    const normalized = (rows || []).map(normalizeShippingFields);
    const withImages = await attachImages(normalized);

    res.json(withImages);
  } catch (err) {
    console.error("Erro ao buscar produtos:", err);
    res.status(500).json({
      message: "Erro ao buscar produtos",
      ...(IS_DEV && { error: err.message, code: err.code }),
    });
  }
});

// GET /api/admin/produtos/:id  (necessário para edição consistente no admin)
router.get("/:id", verifyAdmin, async (req, res) => {
  try {
    const id = toInt(req.params.id, -1);
    if (id <= 0) {
      return res.status(400).json({ message: "ID inválido." });
    }

    const [rows] = await pool.query(
      `SELECT * FROM ${PRODUCTS_TABLE} WHERE id = ? LIMIT 1`,
      [id]
    );

    if (!rows || rows.length === 0) {
      return res.status(404).json({ message: "Produto não encontrado." });
    }

    const normalized = normalizeShippingFields(rows[0]);
    const [withImagesArr] = await attachImages([normalized]);

    return res.json(withImagesArr);
  } catch (err) {
    console.error("Erro ao buscar produto:", err);
    res.status(500).json({
      message: "Erro ao buscar produto",
      ...(IS_DEV && { error: err.message, code: err.code }),
    });
  }
});

// POST /api/admin/produtos (múltiplas imagens OPCIONAIS + frete por produto)
router.post("/", verifyAdmin, upload.array("images"), async (req, res) => {
  const {
    name = "",
    description = "",
    price = "",
    quantity = "",
    category_id = "",
    shippingFree = "0",
    shippingFreeFromQtyStr = "",
  } = req.body;

  const priceNum = parseMoneyBR(price);
  const qtyNum = toInt(quantity, -1);
  const catIdNum = toInt(category_id, -1);

  // shippingFree aceita "1"/"0", "true"/"false" etc. (false cai como false aqui)
  const shippingFreeBool = parseBoolLike(shippingFree);

  // shippingFreeFromQtyStr normaliza para INT (>0) ou NULL.
  // Só faz sentido se shippingFree=1; caso contrário, força NULL.
  const shippingFreeFromQty = shippingFreeBool
    ? parseNullablePositiveInt(shippingFreeFromQtyStr)
    : null;

  if (!name.trim())
    return res.status(400).json({ message: "Nome é obrigatório." });
  if (!Number.isFinite(priceNum) || priceNum <= 0)
    return res.status(400).json({ message: "Preço inválido." });
  if (qtyNum < 0)
    return res.status(400).json({ message: "Quantidade inválida." });
  if (catIdNum <= 0)
    return res.status(400).json({ message: "Categoria inválida." });

  const files = req.files || [];
  const conn = await pool.getConnection();
  let uploadedMedia = [];

  try {
    await conn.beginTransaction();

    const [ins] = await conn.query(
      `INSERT INTO ${PRODUCTS_TABLE} (
        name, description, price, quantity, ${CATEGORY_COL}, ${IMAGE_COL},
        ${SHIPPING_FREE_COL}, ${SHIPPING_FREE_FROM_QTY_COL}
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        name.trim(),
        description?.trim() || null,
        priceNum,
        qtyNum,
        catIdNum,
        null,
        shippingFreeBool ? 1 : 0,
        shippingFreeFromQty,
      ]
    );

    const productId = ins.insertId;

    if (files.length) {
      uploadedMedia = await mediaService.persistMedia(files, {
        folder: "products",
      });

      if (uploadedMedia.length) {
        const values = uploadedMedia.map((media) => [productId, media.path]);
        await conn.query(
          `INSERT INTO ${PRODUCT_IMAGES_TABLE} (product_id, path) VALUES ?`,
          [values]
        );

        // define a primeira imagem como “capa”
        await conn.query(
          `UPDATE ${PRODUCTS_TABLE} SET ${IMAGE_COL} = ? WHERE id = ?`,
          [uploadedMedia[0].path, productId]
        );
      }
    }

    await conn.commit();
    res
      .status(201)
      .json({ message: "Produto adicionado com sucesso.", id: productId });
  } catch (err) {
    await conn.rollback();
    const cleanupTargets = [...uploadedMedia, ...rawFileTargets(files)];
    await mediaService.enqueueOrphanCleanup(cleanupTargets);
    console.error("POST /produtos erro:", err);
    res.status(500).json({
      message: "Erro ao adicionar produto.",
      ...(IS_DEV && { error: err.message, code: err.code }),
    });
  } finally {
    conn.release();
  }
});

// PUT /api/admin/produtos/:id (múltiplas imagens + keepImages[] + frete por produto)
router.put("/:id", verifyAdmin, upload.array("images"), async (req, res) => {
  const { id } = req.params;
  const {
    name = "",
    description = "",
    price = "",
    quantity = "",
    category_id = "",
    keepImages = "[]",
    shippingFree = "0",
    shippingFreeFromQtyStr = "",
  } = req.body;

  const priceNum = parseMoneyBR(price);
  const qtyNum = toInt(quantity, -1);
  const catIdNum = toInt(category_id, -1);

  const shippingFreeBool = parseBoolLike(shippingFree);
  const shippingFreeFromQty = shippingFreeBool
    ? parseNullablePositiveInt(shippingFreeFromQtyStr)
    : null;

  if (!name.trim())
    return res.status(400).json({ message: "Nome é obrigatório." });
  if (!Number.isFinite(priceNum) || priceNum <= 0)
    return res.status(400).json({ message: "Preço inválido." });
  if (qtyNum < 0)
    return res.status(400).json({ message: "Quantidade inválida." });
  if (catIdNum <= 0)
    return res.status(400).json({ message: "Categoria inválida." });

  let keep = [];
  try {
    keep = JSON.parse(keepImages || "[]");
    if (!Array.isArray(keep)) keep = [];
  } catch (_) {
    keep = [];
  }

  const newFiles = req.files || [];
  const conn = await pool.getConnection();
  let uploadedMedia = [];
  let removedDuringUpdate = [];

  try {
    await conn.beginTransaction();

    const [exists] = await conn.query(
      `SELECT id FROM ${PRODUCTS_TABLE} WHERE id = ?`,
      [id]
    );
    if (!exists.length) {
      await conn.rollback();
      await mediaService.enqueueOrphanCleanup([...rawFileTargets(newFiles)]);
      return res.status(404).json({ message: "Produto não encontrado." });
    }

    await conn.query(
      `UPDATE ${PRODUCTS_TABLE}
       SET
         name=?,
         description=?,
         price=?,
         quantity=?,
         ${CATEGORY_COL}=?,
         ${SHIPPING_FREE_COL}=?,
         ${SHIPPING_FREE_FROM_QTY_COL}=?
       WHERE id=?`,
      [
        name.trim(),
        description?.trim() || null,
        priceNum,
        qtyNum,
        catIdNum,
        shippingFreeBool ? 1 : 0,
        shippingFreeFromQty,
        id,
      ]
    );

    const [curImgs] = await conn.query(
      `SELECT path FROM ${PRODUCT_IMAGES_TABLE} WHERE product_id = ?`,
      [id]
    );
    const currentPaths = curImgs.map((r) => r.path);

    const toRemove = currentPaths.filter((p) => !keep.includes(p));
    if (toRemove.length) {
      await conn.query(
        `DELETE FROM ${PRODUCT_IMAGES_TABLE} WHERE product_id = ? AND path IN (?)`,
        [id, toRemove]
      );
      removedDuringUpdate = toRemove;
    }

    if (newFiles.length) {
      uploadedMedia = await mediaService.persistMedia(newFiles, {
        folder: "products",
      });

      if (uploadedMedia.length) {
        const values = uploadedMedia.map((media) => [id, media.path]);
        await conn.query(
          `INSERT INTO ${PRODUCT_IMAGES_TABLE} (product_id, path) VALUES ?`,
          [values]
        );

        const uploadedPaths = uploadedMedia.map((item) => item.path);
        keep = [...keep, ...uploadedPaths];
      }
    }

    const firstImage = keep[0] || null;
    await conn.query(
      `UPDATE ${PRODUCTS_TABLE} SET ${IMAGE_COL} = ? WHERE id = ?`,
      [firstImage, id]
    );

    await conn.commit();

    if (removedDuringUpdate.length) {
      mediaService.removeMedia(removedDuringUpdate).catch((error) => {
        console.error("Falha ao remover mídias antigas de produto:", error);
      });
    }

    res.json({ message: "Produto atualizado com sucesso." });
  } catch (err) {
    await conn.rollback();
    const cleanupTargets = [...uploadedMedia, ...rawFileTargets(newFiles)];
    await mediaService.enqueueOrphanCleanup(cleanupTargets);
    console.error("PUT /produtos erro:", err);
    res.status(500).json({
      message: "Erro ao atualizar produto.",
      ...(IS_DEV && { error: err.message, code: err.code }),
    });
  } finally {
    conn.release();
  }
});

// DELETE /api/admin/produtos/:id
router.delete("/:id", verifyAdmin, async (req, res) => {
  const { id } = req.params;
  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    const [imgs] = await conn.query(
      `SELECT path FROM ${PRODUCT_IMAGES_TABLE} WHERE product_id = ?`,
      [id]
    );

    const [result] = await conn.query(
      `DELETE FROM ${PRODUCTS_TABLE} WHERE id = ?`,
      [id]
    );

    if (result.affectedRows === 0) {
      await conn.rollback();
      return res.status(404).json({ message: "Produto não encontrado." });
    }

    await conn.commit();

    if (imgs.length) {
      mediaService.removeMedia(imgs.map((r) => r.path)).catch((error) => {
        console.error("Falha ao remover mídias de produto excluído:", error);
      });
    }

    res.json({ message: "Produto removido com sucesso." });
  } catch (err) {
    await conn.rollback();
    console.error("Erro ao remover produto:", err);
    res.status(500).json({
      message: "Erro ao remover produto.",
      ...(IS_DEV && { error: err.message, code: err.code }),
    });
  } finally {
    conn.release();
  }
});

module.exports = router;
