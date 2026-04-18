// controllers/admin/adminAuditController.js
"use strict";

const { response } = require("../../lib");
const auditRepo = require("../../repositories/adminAuditLogsRepository");

const VALID_SCOPES = Object.keys(auditRepo.SCOPE_PREFIXES);

async function listAudit(req, res, next) {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.max(1, Math.min(200, Number(req.query.limit) || 50));
    const scope =
      typeof req.query.scope === "string" && VALID_SCOPES.includes(req.query.scope)
        ? req.query.scope
        : undefined;
    const result = await auditRepo.list({
      action: req.query.action || undefined,
      scope,
      target_type: req.query.target_type || undefined,
      target_id: req.query.target_id ? Number(req.query.target_id) : undefined,
      admin_id: req.query.admin_id ? Number(req.query.admin_id) : undefined,
      page,
      limit,
    });
    response.ok(res, result.items, null, {
      total: result.total,
      page: result.page,
      limit: result.limit,
      pages: result.pages,
      available_scopes: VALID_SCOPES,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { listAudit };
