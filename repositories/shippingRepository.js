"use strict";
// repositories/shippingRepository.js
//
// Acesso a dados para cálculo de frete.
// Tabelas: products (campos de frete), shipping_zones, shipping_zone_cities, shipping_rates.
// Consumido por: services/shippingQuoteService.js

const pool = require("../config/pool");

/**
 * Busca atributos de frete de produtos por lista de IDs.
 * @param {number[]} ids
 * @returns {Promise<Array<{ id, shipping_free, shipping_free_from_qty, shipping_prazo_dias }>>}
 */
async function getProductsForQuote(ids) {
  const [rows] = await pool.query(
    `
      SELECT id, shipping_free, shipping_free_from_qty, shipping_prazo_dias
      FROM products
      WHERE id IN (?)
    `,
    [ids]
  );
  return rows;
}

/**
 * Retorna zonas de frete ativas para um estado.
 * Ordenadas por all_cities ASC (específicas primeiro) e id DESC (mais recente primeiro).
 * @param {string} state  Sigla UF em maiúsculas (ex: "MG")
 * @returns {Promise<Array<{ id, name, state, all_cities, is_free, price, prazo_dias }>>}
 */
async function getZonesByState(state) {
  const [rows] = await pool.query(
    `
      SELECT z.id, z.name, z.state, z.all_cities, z.is_free, z.price, z.prazo_dias
      FROM shipping_zones z
      WHERE z.is_active = 1 AND z.state = ?
      ORDER BY z.all_cities ASC, z.id DESC
    `,
    [state]
  );
  return rows;
}

/**
 * Verifica se uma cidade pertence a uma zona específica.
 * Comparação case-insensitive feita pelo banco.
 * @param {number} zoneId
 * @param {string} cityLower  Nome da cidade em minúsculas
 * @returns {Promise<boolean>}
 */
async function getCityMatch(zoneId, cityLower) {
  const [rows] = await pool.query(
    "SELECT 1 FROM shipping_zone_cities WHERE zone_id = ? AND LOWER(city) = ? LIMIT 1",
    [zoneId, cityLower]
  );
  return rows.length > 0;
}

/**
 * Busca a taxa de frete aplicável por faixa de CEP (fallback).
 * Retorna a taxa mais recente dentro da faixa ou null se sem cobertura.
 * @param {string} cep  8 dígitos
 * @returns {Promise<{ id, faixa_cep_inicio, faixa_cep_fim, preco, prazo_dias } | null>}
 */
async function getRateByCep(cep) {
  const [rows] = await pool.query(
    `
      SELECT id, faixa_cep_inicio, faixa_cep_fim, preco, prazo_dias
      FROM shipping_rates
      WHERE ativo = 1
        AND ? BETWEEN faixa_cep_inicio AND faixa_cep_fim
      ORDER BY id DESC
      LIMIT 1
    `,
    [cep]
  );
  return rows.length ? rows[0] : null;
}

module.exports = {
  getProductsForQuote,
  getZonesByState,
  getCityMatch,
  getRateByCep,
};
