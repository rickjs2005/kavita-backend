"use strict";

const pool = require("../../config/pool");
const { clampInt, sanitizeText } = require("./helpers");

async function listRepresentativesPublic({ page, limit, busca, orderBy, orderDir } = {}) {
  const p = clampInt(page, 1, 1, 999999);
  const l = clampInt(limit, 12, 1, 50);
  const offset = (p - 1) * l;

  const q = sanitizeText(busca, 120);

  const allowedOrderBy = new Set(["sort_order", "name", "address_city", "created_at"]);
  const ob = allowedOrderBy.has(orderBy) ? orderBy : "sort_order";
  const od = String(orderDir || "ASC").toUpperCase() === "DESC" ? "DESC" : "ASC";

  let where = "WHERE is_active=1";
  const params = [];

  if (q) {
    where += " AND (name LIKE ? OR address_city LIKE ? OR address_uf LIKE ?)";
    params.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }

  const [[countRow]] = await pool.query(
    `SELECT COUNT(*) AS total FROM drone_representatives ${where}`,
    params
  );

  const total = Number(countRow?.total || 0);
  const totalPages = Math.max(1, Math.ceil(total / l));

  const [rows] = await pool.query(
    `SELECT * FROM drone_representatives ${where}
     ORDER BY ${ob} ${od}, id DESC
     LIMIT ? OFFSET ?`,
    [...params, l, offset]
  );

  return { items: rows, page: p, limit: l, total, totalPages };
}

async function listRepresentativesAdmin({ page, limit, busca, includeInactive } = {}) {
  const p = clampInt(page, 1, 1, 999999);
  const l = clampInt(limit, 20, 1, 100);
  const offset = (p - 1) * l;

  const q = sanitizeText(busca, 120);
  const inc = Number(includeInactive) ? 1 : 0;

  let where = "WHERE 1=1";
  const params = [];

  if (!inc) where += " AND is_active=1";

  if (q) {
    where += " AND (name LIKE ? OR address_city LIKE ? OR address_uf LIKE ?)";
    params.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }

  const [[countRow]] = await pool.query(
    `SELECT COUNT(*) AS total FROM drone_representatives ${where}`,
    params
  );

  const total = Number(countRow?.total || 0);
  const totalPages = Math.max(1, Math.ceil(total / l));

  const [rows] = await pool.query(
    `SELECT * FROM drone_representatives ${where}
     ORDER BY sort_order ASC, id DESC
     LIMIT ? OFFSET ?`,
    [...params, l, offset]
  );

  return { items: rows, page: p, limit: l, total, totalPages };
}

async function createRepresentative(payload = {}) {
  const name = sanitizeText(payload.name, 120);
  const whatsapp = sanitizeText(payload.whatsapp, 30);
  const cnpj = sanitizeText(payload.cnpj, 20);

  if (!name || !whatsapp || !cnpj) {
    const err = new Error("name, whatsapp e cnpj são obrigatórios");
    err.code = "VALIDATION_ERROR";
    throw err;
  }

  const instagram_url = sanitizeText(payload.instagram_url, 255);
  const address_street = sanitizeText(payload.address_street, 120);
  const address_number = sanitizeText(payload.address_number, 30);
  const address_complement = sanitizeText(payload.address_complement, 80);
  const address_neighborhood = sanitizeText(payload.address_neighborhood, 80);
  const address_city = sanitizeText(payload.address_city, 80);
  const address_uf = sanitizeText(payload.address_uf, 2);
  const address_cep = sanitizeText(payload.address_cep, 15);
  const notes = sanitizeText(payload.notes, 255);
  const sort_order = clampInt(payload.sort_order, 0, 0, 999999);
  const is_active = payload.is_active == null ? 1 : Number(payload.is_active) ? 1 : 0;

  const [result] = await pool.query(
    `INSERT INTO drone_representatives
     (name, whatsapp, cnpj, instagram_url,
      address_street, address_number, address_complement,
      address_neighborhood, address_city, address_uf, address_cep,
      notes, sort_order, is_active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      name, whatsapp, cnpj, instagram_url,
      address_street || "", address_number || "", address_complement,
      address_neighborhood, address_city, address_uf, address_cep,
      notes, sort_order, is_active,
    ]
  );

  return result.insertId;
}

async function updateRepresentative(id, payload = {}) {
  const repId = clampInt(id, null, 1, 999999999);
  if (!repId) {
    const err = new Error("id inválido");
    err.code = "VALIDATION_ERROR";
    throw err;
  }

  const sets = [];
  const params = [];

  const map = [
    ["name", 120], ["whatsapp", 30], ["cnpj", 20], ["instagram_url", 255],
    ["address_street", 120], ["address_number", 30], ["address_complement", 80],
    ["address_neighborhood", 80], ["address_city", 80], ["address_uf", 2],
    ["address_cep", 15], ["notes", 255],
  ];

  for (const [k, maxLen] of map) {
    if (Object.prototype.hasOwnProperty.call(payload, k)) {
      sets.push(`${k}=?`);
      params.push(sanitizeText(payload[k], maxLen));
    }
  }

  if (Object.prototype.hasOwnProperty.call(payload, "sort_order")) {
    sets.push("sort_order=?");
    params.push(clampInt(payload.sort_order, 0, 0, 999999));
  }
  if (Object.prototype.hasOwnProperty.call(payload, "is_active")) {
    sets.push("is_active=?");
    params.push(Number(payload.is_active) ? 1 : 0);
  }

  if (!sets.length) return 0;

  params.push(repId);

  const [result] = await pool.query(
    `UPDATE drone_representatives SET ${sets.join(", ")} WHERE id=?`,
    params
  );

  return result.affectedRows || 0;
}

async function deleteRepresentative(id) {
  const repId = clampInt(id, null, 1, 999999999);
  if (!repId) {
    const err = new Error("id inválido");
    err.code = "VALIDATION_ERROR";
    throw err;
  }

  const [result] = await pool.query("DELETE FROM drone_representatives WHERE id=?", [repId]);
  return result.affectedRows || 0;
}

module.exports = {
  listRepresentativesPublic,
  listRepresentativesAdmin,
  createRepresentative,
  updateRepresentative,
  deleteRepresentative,
};
