"use strict";
// services/shippingZonesService.js
//
// Regras de negócio para o CRUD admin de zonas de frete.
// Consumidor: controllers/shippingZonesController.js
//
// Tabelas: shipping_zones, shipping_zone_cities

const { withTransaction } = require("../lib/withTransaction");
const AppError = require("../errors/AppError");
const ERROR_CODES = require("../constants/ErrorCodes");
const repo = require("../repositories/shippingZonesRepository");

// ---------------------------------------------------------------------------
// Helpers internos
// ---------------------------------------------------------------------------

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
    return { ...norm, cities: norm.all_cities ? [] : bucket[z.id] || [] };
  });
}

// ---------------------------------------------------------------------------
// Criação
// ---------------------------------------------------------------------------

async function createZone(body) {
  const { cities, ...zoneData } = body;

  return withTransaction(async (conn) => {
    const zoneId = await repo.insertZone(conn, zoneData);

    if (!zoneData.all_cities && cities.length) {
      await repo.insertCities(conn, zoneId, cities);
    }

    return { id: zoneId };
  });
}

// ---------------------------------------------------------------------------
// Atualização
// ---------------------------------------------------------------------------

async function updateZone(id, body) {
  const { cities, ...zoneData } = body;

  await withTransaction(async (conn) => {
    const exists = await repo.existsById(conn, id);
    if (!exists) {
      throw new AppError("Zona não encontrada.", ERROR_CODES.NOT_FOUND, 404);
    }

    await repo.updateZone(conn, id, zoneData);
    await repo.replaceCities(conn, id, zoneData.all_cities ? [] : cities);
  });
}

// ---------------------------------------------------------------------------
// Remoção
// ---------------------------------------------------------------------------

async function deleteZone(id) {
  await repo.deleteZone(id);
}

module.exports = { listZones, createZone, updateZone, deleteZone };
