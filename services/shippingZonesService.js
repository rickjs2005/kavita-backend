"use strict";
// services/shippingZonesService.js
//
// Regras de negócio para o CRUD admin de zonas de frete.
// Consumidor: controllers/shippingZonesController.js
//
// Tabelas: shipping_zones, shipping_zone_cities

const pool = require("../config/pool");
const AppError = require("../errors/AppError");
const ERROR_CODES = require("../constants/ErrorCodes");
const repo = require("../repositories/shippingZonesRepository");

// ---------------------------------------------------------------------------
// Helpers internos
// ---------------------------------------------------------------------------

/**
 * Normaliza uma linha de zona para o contrato de resposta:
 * booleans reais, price como número, prazo_dias como número|null.
 */
function normalizeZone(z) {
  return {
    ...z,
    all_cities: Boolean(z.all_cities),
    is_free: Boolean(z.is_free),
    is_active: Boolean(z.is_active),
    price: Number(z.price || 0),
    prazo_dias: z.prazo_dias === null ? null : Number(z.prazo_dias),
  };
}

// ---------------------------------------------------------------------------
// Leitura
// ---------------------------------------------------------------------------

/**
 * Lista todas as zonas com lista de cidades anexada.
 * @returns {object[]}
 */
async function listZones() {
  const rows = await repo.findAll();
  if (!rows.length) return rows;

  const ids = rows.map((r) => r.id);
  const citiesRows = await repo.findCitiesBatch(ids);

  const bucket = citiesRows.reduce((acc, r) => {
    const k = Number(r.zone_id);
    (acc[k] ||= []).push(r.city);
    return acc;
  }, {});

  return rows.map((z) => {
    const norm = normalizeZone(z);
    return {
      ...norm,
      cities: norm.all_cities ? [] : bucket[z.id] || [],
    };
  });
}

// ---------------------------------------------------------------------------
// Criação
// ---------------------------------------------------------------------------

/**
 * Cria nova zona de frete com cidades opcionais.
 * Corpo já validado e normalizado pelo schema Zod.
 *
 * @param {{ name, state, all_cities, is_free, price, prazo_dias, is_active, cities }} body
 * @returns {{ id: number }}
 */
async function createZone(body) {
  const { cities, ...zoneData } = body;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const zoneId = await repo.insertZone(conn, zoneData);

    if (!zoneData.all_cities && cities.length) {
      await repo.insertCities(conn, zoneId, cities);
    }

    await conn.commit();
    return { id: zoneId };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

// ---------------------------------------------------------------------------
// Atualização
// ---------------------------------------------------------------------------

/**
 * Atualiza zona de frete e substitui a lista de cidades.
 * Corpo já validado e normalizado pelo schema Zod.
 *
 * @param {number} id
 * @param {{ name, state, all_cities, is_free, price, prazo_dias, is_active, cities }} body
 */
async function updateZone(id, body) {
  const { cities, ...zoneData } = body;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const exists = await repo.existsById(conn, id);
    if (!exists) {
      await conn.rollback();
      throw new AppError("Zona não encontrada.", ERROR_CODES.NOT_FOUND, 404);
    }

    await repo.updateZone(conn, id, zoneData);

    // Substituição total: remove antigas, insere novas (ou limpa se all_cities)
    await repo.replaceCities(conn, id, zoneData.all_cities ? [] : cities);

    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

// ---------------------------------------------------------------------------
// Remoção
// ---------------------------------------------------------------------------

/**
 * Remove zona de frete (sem verificação de existência — 204 mesmo se inexistente,
 * comportamento idêntico ao legado).
 * @param {number} id
 */
async function deleteZone(id) {
  await repo.deleteZone(id);
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  listZones,
  createZone,
  updateZone,
  deleteZone,
};
