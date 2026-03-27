"use strict";
/**
 * lib/response.js
 *
 * Official API response helpers.
 * Use these in all new or refactored controllers and routes.
 *
 * Shape:
 *   Success  → { ok: true,  data?,    message?, meta? }
 *   Created  → { ok: true,  data,     message? }          (HTTP 201)
 *   No body  →                                            (HTTP 204)
 *   Error    → { ok: false, code,     message, details? } (via errorHandler)
 *
 * Quick reference:
 *   ok(res, data?, message?)                   → 200
 *   created(res, data, message?)               → 201
 *   noContent(res)                             → 204
 *   paginated(res, { items, total, page, limit }) → 200 + meta
 *   badRequest(res, message, details?)         → 400  (prefer next(new AppError(...)))
 */

// ---------------------------------------------------------------------------
// Internal builder
// ---------------------------------------------------------------------------

function _success(res, status, data, message) {
  const body = { ok: true };
  if (message !== undefined && message !== null && message !== "") {
    body.message = String(message);
  }
  if (data !== undefined && data !== null) {
    body.data = data;
  }
  return res.status(status).json(body);
}

// ---------------------------------------------------------------------------
// Public helpers
// ---------------------------------------------------------------------------

/**
 * 200 OK — general success, with optional data and message.
 *
 * @param {import("express").Response} res
 * @param {*}      [data]    — response payload; omit for status-only actions
 * @param {string} [message] — optional human-readable message
 */
function ok(res, data, message) {
  return _success(res, 200, data, message);
}

/**
 * 201 Created — resource created successfully.
 *
 * @param {import("express").Response} res
 * @param {object} data    — created resource (should include `id`)
 * @param {string} [message]
 */
function created(res, data, message) {
  return _success(res, 201, data, message);
}

/**
 * 204 No Content — action completed, no body to return.
 * Use for DELETE and PATCH/PUT that return nothing meaningful.
 *
 * @param {import("express").Response} res
 */
function noContent(res) {
  return res.status(204).end();
}

/**
 * 200 OK — paginated list with meta block.
 *
 * @param {import("express").Response} res
 * @param {{ items: *[], total: number, page: number, limit: number }} opts
 */
function paginated(res, { items, total, page, limit }) {
  return res.status(200).json({
    ok: true,
    data: items,
    meta: {
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    },
  });
}

/**
 * 400 Bad Request — inline validation error.
 *
 * Prefer `next(new AppError(message, ERROR_CODES.VALIDATION_ERROR, 400))`
 * in controllers that receive `next`. Use this helper only in routes or
 * middleware that do not have access to `next`.
 *
 * @param {import("express").Response} res
 * @param {string} message
 * @param {*}      [details] — additional context (e.g. array of field errors)
 */
function badRequest(res, message, details) {
  const body = { ok: false, code: "VALIDATION_ERROR", message: String(message) };
  if (details !== undefined && details !== null) body.details = details;
  return res.status(400).json(body);
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  ok,
  created,
  noContent,
  paginated,
  badRequest,
};
