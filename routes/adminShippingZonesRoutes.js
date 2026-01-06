// routes/adminShippingZonesRoutes.js
const express = require("express");
const router = express.Router();
const pool = require("../config/pool");
const AppError = require("../errors/AppError");
const ERROR_CODES = require("../constants/ErrorCodes");

/**
 * @openapi
 * tags:
 *   - name: Admin Shipping
 *     description: Regras de frete por regiões (UF + cidades)
 */

/**
 * @openapi
 * /api/admin/shipping/zones:
 *   get:
 *     summary: Lista zonas de frete
 *     tags: [Admin Shipping]
 *     responses:
 *       200: { description: OK }
 */
router.get("/zones", async (req, res, next) => {
  try {
    const [zones] = await pool.query(
      `
      SELECT id, name, state, all_cities, is_free, price, prazo_dias, is_active, created_at, updated_at
      FROM shipping_zones
      ORDER BY id DESC
      `
    );

    if (!zones.length) return res.json([]);

    const ids = zones.map((z) => z.id);
    const [citiesRows] = await pool.query(
      `SELECT zone_id, city FROM shipping_zone_cities WHERE zone_id IN (${ids.map(() => "?").join(",")})`,
      ids
    );

    const map = new Map();
    for (const r of citiesRows) {
      const k = Number(r.zone_id);
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(r.city);
    }

    const out = zones.map((z) => ({
      ...z,
      all_cities: Boolean(z.all_cities),
      is_free: Boolean(z.is_free),
      is_active: Boolean(z.is_active),
      price: Number(z.price || 0),
      cities: z.all_cities ? [] : (map.get(Number(z.id)) || []),
      prazo_dias: z.prazo_dias === null ? null : Number(z.prazo_dias),
    }));

    res.json(out);
  } catch (err) {
    return next(
      err instanceof AppError
        ? err
        : new AppError("Erro ao listar zonas de frete.", ERROR_CODES.SERVER_ERROR, 500)
    );
  }
});

/**
 * @openapi
 * /api/admin/shipping/zones:
 *   post:
 *     summary: Cria zona de frete
 *     tags: [Admin Shipping]
 *     requestBody:
 *       required: true
 *     responses:
 *       201: { description: Criado }
 */
router.post("/zones", async (req, res, next) => {
  try {
    const {
      name,
      state,
      all_cities,
      cities,
      is_free,
      price,
      prazo_dias,
      is_active,
    } = req.body || {};

    const uf = String(state || "").trim().toUpperCase();
    const nm = String(name || "").trim();

    if (!nm) {
      return next(new AppError("Informe um nome para a regra.", ERROR_CODES.VALIDATION_ERROR, 400));
    }
    if (!uf || uf.length !== 2) {
      return next(new AppError("Informe o estado (UF) com 2 letras.", ERROR_CODES.VALIDATION_ERROR, 400));
    }

    const all = Boolean(all_cities);
    const free = Boolean(is_free);
    const active = is_active === undefined ? true : Boolean(is_active);

    const priceNum = free ? 0 : Number(price || 0);
    if (!free && (!Number.isFinite(priceNum) || priceNum <= 0)) {
      return next(new AppError("Informe um preço válido (ou marque frete grátis).", ERROR_CODES.VALIDATION_ERROR, 400));
    }

    let prazo = null;
    if (prazo_dias !== null && prazo_dias !== undefined && String(prazo_dias).trim() !== "") {
      prazo = Math.floor(Number(prazo_dias));
      if (!Number.isFinite(prazo) || prazo <= 0) {
        return next(new AppError("Prazo deve ser um número >= 1 ou vazio.", ERROR_CODES.VALIDATION_ERROR, 400));
      }
    }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const [ins] = await conn.query(
        `
        INSERT INTO shipping_zones (name, state, all_cities, is_free, price, prazo_dias, is_active)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
        [nm, uf, all ? 1 : 0, free ? 1 : 0, priceNum, prazo, active ? 1 : 0]
      );

      const zoneId = ins.insertId;

      if (!all) {
        const list = Array.isArray(cities) ? cities : [];
        const cleaned = Array.from(new Set(list.map((c) => String(c || "").trim()).filter(Boolean)));
        for (const city of cleaned) {
          await conn.query(
            `INSERT IGNORE INTO shipping_zone_cities (zone_id, city) VALUES (?, ?)`,
            [zoneId, city]
          );
        }
      }

      await conn.commit();
      return res.status(201).json({ success: true, id: zoneId });
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  } catch (err) {
    return next(
      err instanceof AppError
        ? err
        : new AppError("Erro ao criar zona de frete.", ERROR_CODES.SERVER_ERROR, 500)
    );
  }
});

/**
 * @openapi
 * /api/admin/shipping/zones/{id}:
 *   put:
 *     summary: Atualiza zona de frete
 *     tags: [Admin Shipping]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *     responses:
 *       200: { description: OK }
 */
router.put("/zones/:id", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      return next(new AppError("ID inválido.", ERROR_CODES.VALIDATION_ERROR, 400));
    }

    const {
      name,
      state,
      all_cities,
      cities,
      is_free,
      price,
      prazo_dias,
      is_active,
    } = req.body || {};

    const uf = String(state || "").trim().toUpperCase();
    const nm = String(name || "").trim();

    if (!nm) {
      return next(new AppError("Informe um nome para a regra.", ERROR_CODES.VALIDATION_ERROR, 400));
    }
    if (!uf || uf.length !== 2) {
      return next(new AppError("Informe o estado (UF) com 2 letras.", ERROR_CODES.VALIDATION_ERROR, 400));
    }

    const all = Boolean(all_cities);
    const free = Boolean(is_free);
    const active = is_active === undefined ? true : Boolean(is_active);

    const priceNum = free ? 0 : Number(price || 0);
    if (!free && (!Number.isFinite(priceNum) || priceNum <= 0)) {
      return next(new AppError("Informe um preço válido (ou marque frete grátis).", ERROR_CODES.VALIDATION_ERROR, 400));
    }

    let prazo = null;
    if (prazo_dias !== null && prazo_dias !== undefined && String(prazo_dias).trim() !== "") {
      prazo = Math.floor(Number(prazo_dias));
      if (!Number.isFinite(prazo) || prazo <= 0) {
        return next(new AppError("Prazo deve ser um número >= 1 ou vazio.", ERROR_CODES.VALIDATION_ERROR, 400));
      }
    }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const [exists] = await conn.query(`SELECT id FROM shipping_zones WHERE id = ? LIMIT 1`, [id]);
      if (!exists.length) {
        await conn.rollback();
        return next(new AppError("Zona não encontrada.", ERROR_CODES.NOT_FOUND, 404));
      }

      await conn.query(
        `
        UPDATE shipping_zones
        SET name=?, state=?, all_cities=?, is_free=?, price=?, prazo_dias=?, is_active=?
        WHERE id=?
        `,
        [nm, uf, all ? 1 : 0, free ? 1 : 0, priceNum, prazo, active ? 1 : 0, id]
      );

      // atualiza cidades
      await conn.query(`DELETE FROM shipping_zone_cities WHERE zone_id=?`, [id]);

      if (!all) {
        const list = Array.isArray(cities) ? cities : [];
        const cleaned = Array.from(new Set(list.map((c) => String(c || "").trim()).filter(Boolean)));
        for (const city of cleaned) {
          await conn.query(
            `INSERT IGNORE INTO shipping_zone_cities (zone_id, city) VALUES (?, ?)`,
            [id, city]
          );
        }
      }

      await conn.commit();
      return res.json({ success: true });
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  } catch (err) {
    return next(
      err instanceof AppError
        ? err
        : new AppError("Erro ao atualizar zona.", ERROR_CODES.SERVER_ERROR, 500)
    );
  }
});

/**
 * @openapi
 * /api/admin/shipping/zones/{id}:
 *   delete:
 *     summary: Exclui zona de frete
 *     tags: [Admin Shipping]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *     responses:
 *       204: { description: Sem conteúdo }
 */
router.delete("/zones/:id", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      return next(new AppError("ID inválido.", ERROR_CODES.VALIDATION_ERROR, 400));
    }

    await pool.query(`DELETE FROM shipping_zones WHERE id=?`, [id]);
    return res.status(204).send();
  } catch (err) {
    return next(
      err instanceof AppError
        ? err
        : new AppError("Erro ao excluir zona.", ERROR_CODES.SERVER_ERROR, 500)
    );
  }
});

module.exports = router;
