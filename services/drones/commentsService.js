"use strict";

const dronesRepo = require("../../repositories/dronesRepository");
const { clampInt, sanitizeText, hasColumn } = require("./helpers");

function sha256Hex(v) {
  try {
    return require("crypto").createHash("sha256").update(String(v || "")).digest("hex");
  } catch {
    return null;
  }
}

async function listApprovedComments({ page, limit, model_key } = {}) {
  const p = clampInt(page, 1, 1, 999999);
  const l = clampInt(limit, 10, 1, 50);
  const offset = (p - 1) * l;

  const supportsModelKey = await hasColumn("drone_comments", "model_key");

  let where = "WHERE status='APROVADO'";
  const params = [];

  if (supportsModelKey && model_key) {
    where += " AND model_key=?";
    params.push(String(model_key));
  }

  const total = await dronesRepo.countComments(where, params);
  const totalPages = Math.max(1, Math.ceil(total / l));

  const cols = "id, model_key, display_name, comment_text, status, created_at";
  const rows = await dronesRepo.listCommentRows(where, params, cols, l, offset);

  const ids = rows.map((r) => r.id).filter(Boolean);
  let mediaByComment = {};

  if (ids.length) {
    const mediaRows = await dronesRepo.findCommentMediaByCommentIds(ids);
    mediaByComment = mediaRows.reduce((acc, m) => {
      const k = String(m.comment_id);
      if (!acc[k]) acc[k] = [];
      acc[k].push({ media_type: m.media_type, media_path: m.media_path, created_at: m.created_at });
      return acc;
    }, {});
  }

  const items = rows.map((r) => ({
    id: r.id,
    model_key: r.model_key ?? null,
    display_name: r.display_name ?? null,
    comment_text: r.comment_text,
    status: r.status,
    created_at: r.created_at,
    media: mediaByComment[String(r.id)] || [],
  }));

  return { items, page: p, limit: l, total, totalPages };
}

async function listCommentsAdmin({ page, limit, status, model_key } = {}) {
  const p = clampInt(page, 1, 1, 999999);
  const l = clampInt(limit, 20, 1, 100);
  const offset = (p - 1) * l;

  const supportsModelKey = await hasColumn("drone_comments", "model_key");
  const supportsStatus = await hasColumn("drone_comments", "status");

  let where = "WHERE 1=1";
  const params = [];

  if (supportsStatus && status) {
    where += " AND status=?";
    params.push(String(status));
  }
  if (supportsModelKey && model_key) {
    where += " AND model_key=?";
    params.push(String(model_key));
  }

  const total = await dronesRepo.countComments(where, params);
  const totalPages = Math.max(1, Math.ceil(total / l));

  const cols = "id, model_key, display_name, comment_text, status, ip_hash, user_agent, created_at, updated_at";
  const rows = await dronesRepo.listCommentRows(where, params, cols, l, offset);

  const ids = rows.map((r) => r.id).filter(Boolean);
  let mediaCounts = {};

  if (ids.length) {
    const mrows = await dronesRepo.countMediaByCommentIds(ids);
    mediaCounts = mrows.reduce((acc, r) => {
      acc[String(r.comment_id)] = Number(r.total || 0);
      return acc;
    }, {});
  }

  const items = rows.map((r) => ({ ...r, media_count: mediaCounts[String(r.id)] || 0 }));

  return { items, page: p, limit: l, total, totalPages };
}

async function getCommentById(id) {
  const commentId = clampInt(id, null, 1, 999999999);
  if (!commentId) return null;

  const row = await dronesRepo.findCommentById(commentId);
  if (!row) return null;

  const media = await dronesRepo.findCommentMedia(commentId);

  return { ...row, media };
}

async function createComment({ model_key = null, display_name, comment_text, status, ip, user_agent, mediaItems } = {}) {
  const textSan = sanitizeText(comment_text, 1000);
  if (!textSan) {
    const err = new Error("comment_text obrigatório");
    err.code = "VALIDATION_ERROR";
    throw err;
  }

  const nameSan = display_name ? sanitizeText(display_name, 80) : null;
  const supportsModelKey = await hasColumn("drone_comments", "model_key");
  const supportsStatus = await hasColumn("drone_comments", "status");

  const st = supportsStatus ? String(status || "APROVADO") : null;
  const ipHash = ip ? sha256Hex(ip) : null;
  const ua = user_agent ? sanitizeText(user_agent, 255) : null;

  const cols = [];
  const vals = [];

  if (supportsModelKey) {
    cols.push("model_key");
    vals.push(model_key ? String(model_key) : null);
  }

  cols.push("display_name");
  vals.push(nameSan);
  cols.push("comment_text");
  vals.push(textSan);

  if (supportsStatus) {
    cols.push("status");
    vals.push(st);
  }

  cols.push("ip_hash");
  vals.push(ipHash);
  cols.push("user_agent");
  vals.push(ua);

  const commentId = await dronesRepo.insertComment(cols, vals);

  if (Array.isArray(mediaItems) && mediaItems.length) {
    const clean = mediaItems
      .map((m) => ({
        media_type: m?.media_type === "VIDEO" ? "VIDEO" : "IMAGE",
        media_path: m?.media_path ? String(m.media_path) : null,
      }))
      .filter((m) => m.media_path);

    if (clean.length) {
      const values = clean.map((m) => [commentId, m.media_type, m.media_path]);
      await dronesRepo.insertCommentMedia(values);
    }
  }

  return commentId;
}

async function deleteComment(id) {
  const commentId = clampInt(id, null, 1, 999999999);
  if (!commentId) {
    const err = new Error("id inválido");
    err.code = "VALIDATION_ERROR";
    throw err;
  }
  return dronesRepo.deleteComment(commentId);
}

async function setCommentStatus(id, status) {
  const commentId = clampInt(id, null, 1, 999999999);
  if (!commentId) {
    const err = new Error("id inválido");
    err.code = "VALIDATION_ERROR";
    throw err;
  }

  const st = String(status || "").toUpperCase();
  const allowed = new Set(["PENDENTE", "APROVADO", "REPROVADO"]);
  if (!allowed.has(st)) {
    const err = new Error("status inválido");
    err.code = "VALIDATION_ERROR";
    throw err;
  }

  const supportsStatus = await hasColumn("drone_comments", "status");
  if (!supportsStatus) {
    const err = new Error("STATUS_UNSUPPORTED");
    err.code = "STATUS_UNSUPPORTED";
    throw err;
  }

  return dronesRepo.setCommentStatus(commentId, st);
}

async function setCommentApproval(id, isApproved) {
  return setCommentStatus(id, isApproved ? "APROVADO" : "REPROVADO");
}

module.exports = {
  listApprovedComments,
  listCommentsAdmin,
  getCommentById,
  createComment,
  deleteComment,
  setCommentStatus,
  setCommentApproval,
};
