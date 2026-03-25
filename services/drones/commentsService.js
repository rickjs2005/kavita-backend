"use strict";

const pool = require("../../config/pool");
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

  const [[countRow]] = await pool.query(
    `SELECT COUNT(*) AS total FROM drone_comments ${where}`,
    params
  );

  const total = Number(countRow?.total || 0);
  const totalPages = Math.max(1, Math.ceil(total / l));

  const [rows] = await pool.query(
    `SELECT id, model_key, display_name, comment_text, status, created_at
     FROM drone_comments ${where}
     ORDER BY created_at DESC, id DESC
     LIMIT ? OFFSET ?`,
    [...params, l, offset]
  );

  const ids = rows.map((r) => r.id).filter(Boolean);
  let mediaByComment = {};

  if (ids.length) {
    const [mediaRows] = await pool.query(
      `SELECT comment_id, media_type, media_path, created_at
       FROM drone_comment_media
       WHERE comment_id IN (?) ORDER BY id ASC`,
      [ids]
    );
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

  const [[countRow]] = await pool.query(
    `SELECT COUNT(*) AS total FROM drone_comments ${where}`,
    params
  );

  const total = Number(countRow?.total || 0);
  const totalPages = Math.max(1, Math.ceil(total / l));

  const [rows] = await pool.query(
    `SELECT id, model_key, display_name, comment_text, status, ip_hash, user_agent, created_at, updated_at
     FROM drone_comments ${where}
     ORDER BY created_at DESC, id DESC
     LIMIT ? OFFSET ?`,
    [...params, l, offset]
  );

  const ids = rows.map((r) => r.id).filter(Boolean);
  let mediaCounts = {};

  if (ids.length) {
    const [mrows] = await pool.query(
      `SELECT comment_id, COUNT(*) AS total FROM drone_comment_media
       WHERE comment_id IN (?) GROUP BY comment_id`,
      [ids]
    );
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

  const [rows] = await pool.query(
    `SELECT id, model_key, display_name, comment_text, status, ip_hash, user_agent, created_at, updated_at
     FROM drone_comments WHERE id=? LIMIT 1`,
    [commentId]
  );

  const row = rows[0];
  if (!row) return null;

  const [media] = await pool.query(
    `SELECT id, media_type, media_path, created_at FROM drone_comment_media
     WHERE comment_id=? ORDER BY id ASC`,
    [commentId]
  );

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

  const placeholders = cols.map(() => "?").join(", ");

  const [result] = await pool.query(
    `INSERT INTO drone_comments (${cols.join(", ")}) VALUES (${placeholders})`,
    vals
  );

  const commentId = result.insertId;

  if (Array.isArray(mediaItems) && mediaItems.length) {
    const clean = mediaItems
      .map((m) => ({
        media_type: m?.media_type === "VIDEO" ? "VIDEO" : "IMAGE",
        media_path: m?.media_path ? String(m.media_path) : null,
      }))
      .filter((m) => m.media_path);

    if (clean.length) {
      const values = clean.map((m) => [commentId, m.media_type, m.media_path]);
      await pool.query(
        "INSERT INTO drone_comment_media (comment_id, media_type, media_path) VALUES ?",
        [values]
      );
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

  const [result] = await pool.query("DELETE FROM drone_comments WHERE id=?", [commentId]);
  return result.affectedRows || 0;
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

  const [result] = await pool.query("UPDATE drone_comments SET status=? WHERE id=?", [st, commentId]);
  return result.affectedRows || 0;
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
