"use strict";
// lib/response.js
// Helpers de resposta padronizada para toda a API.
//
// PADRÃO:
//   Sucesso  → { ok: true, data?: ... }
//   Criação  → status 201 + { ok: true, data: { id, ... } }
//   Erro     → { ok: false, code: "...", message: "..." }  ← via errorHandler
//
// USO:
//   const { sendSuccess, sendCreated, sendPaginated } = require("../lib/response");
//
//   sendSuccess(res, rows)           // 200 com data
//   sendSuccess(res)                 // 200 sem data (delete, patch de status)
//   sendCreated(res, { id })         // 201 com data
//   sendPaginated(res, { items, total, page, limit })

/**
 * Resposta de sucesso (200).
 * @param {import('express').Response} res
 * @param {*} [data]  - payload. Omita para ações sem retorno (delete, patch de flag).
 * @param {number} [status=200]
 */
function sendSuccess(res, data, status = 200) {
  const body = { ok: true };
  if (data !== undefined && data !== null) body.data = data;
  return res.status(status).json(body);
}

/**
 * Resposta de criação (201).
 * @param {import('express').Response} res
 * @param {{ id: number|string } & Record<string, *>} data
 */
function sendCreated(res, data) {
  return sendSuccess(res, data, 201);
}

/**
 * Resposta de lista paginada.
 * @param {import('express').Response} res
 * @param {{ items: *[], total: number, page: number, limit: number }} opts
 */
function sendPaginated(res, { items, total, page, limit }) {
  return res.json({
    ok:   true,
    data: items,
    meta: { total, page, limit, pages: Math.ceil(total / limit) },
  });
}

module.exports = { sendSuccess, sendCreated, sendPaginated };
