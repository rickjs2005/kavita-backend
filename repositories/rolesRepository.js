"use strict";
// repositories/rolesRepository.js
//
// Data layer for admin_roles, admin_role_permissions, admin_permissions.
// No business logic — only SQL.
//
// Transactional functions accept an open `conn` (mysql2 PoolConnection).
// Non-transactional functions use the shared pool directly.

const pool = require("../config/pool");

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Maps a raw DB row (GROUP_CONCAT permissions string) to the API shape.
 * Belongs here because it is pure data shaping, not business logic.
 */
function mapRole(r) {
  return {
    id: r.id,
    nome: r.nome,
    slug: r.slug,
    descricao: r.descricao,
    is_system: r.is_system,
    criado_em: r.criado_em,
    permissions: r.permissions ? r.permissions.split(",").filter(Boolean) : [],
  };
}

const ROLE_SELECT = `
  SELECT
    r.id, r.nome, r.slug, r.descricao, r.is_system, r.criado_em,
    GROUP_CONCAT(p.chave ORDER BY p.chave) AS permissions
  FROM admin_roles r
  LEFT JOIN admin_role_permissions rp ON rp.role_id = r.id
  LEFT JOIN admin_permissions p ON p.id = rp.permission_id
`;

// ---------------------------------------------------------------------------
// Read — no transaction needed
// ---------------------------------------------------------------------------

async function listRoles() {
  const [rows] = await pool.query(
    `${ROLE_SELECT}
     GROUP BY r.id
     ORDER BY r.is_system DESC, r.nome ASC`
  );
  return rows.map(mapRole);
}

async function findRoleById(id) {
  const [rows] = await pool.query(
    `${ROLE_SELECT}
     WHERE r.id = ?
     GROUP BY r.id`,
    [id]
  );
  return rows.length ? mapRole(rows[0]) : null;
}

async function findRoleBySlug(slug) {
  const [rows] = await pool.query(
    "SELECT id FROM admin_roles WHERE slug = ?",
    [slug]
  );
  return rows[0] || null;
}

// ---------------------------------------------------------------------------
// Write — non-transactional
// ---------------------------------------------------------------------------

async function createRole({ nome, slug, descricao }) {
  const [result] = await pool.query(
    "INSERT INTO admin_roles (nome, slug, descricao, is_system) VALUES (?, ?, ?, 0)",
    [nome, slug, descricao || null]
  );
  return result.insertId;
}

// ---------------------------------------------------------------------------
// Transactional — callers MUST pass an open conn inside a transaction
// ---------------------------------------------------------------------------

/**
 * Updates nome and/or descricao for a role.
 * Returns affectedRows.
 */
async function updateRoleFields(conn, id, { nome, descricao }) {
  const campos = [];
  const valores = [];

  if (nome !== undefined) {
    campos.push("nome = ?");
    valores.push(nome);
  }
  if (descricao !== undefined) {
    campos.push("descricao = ?");
    valores.push(descricao != null ? descricao : null);
  }

  if (!campos.length) return 0;

  valores.push(id);
  const [result] = await conn.query(
    `UPDATE admin_roles SET ${campos.join(", ")} WHERE id = ?`,
    valores
  );
  return result.affectedRows;
}

async function deleteRolePermissions(conn, roleId) {
  await conn.query(
    "DELETE FROM admin_role_permissions WHERE role_id = ?",
    [roleId]
  );
}

/**
 * Returns a Map<chave → permissionId> for the given chaves array.
 * Returns an empty Map when chaves is empty.
 */
async function resolvePermissionsByChave(conn, chaves) {
  if (!chaves.length) return new Map();
  const [rows] = await conn.query(
    "SELECT id, chave FROM admin_permissions WHERE chave IN (?)",
    [chaves]
  );
  return new Map(rows.map((p) => [p.chave, p.id]));
}

/**
 * Bulk-inserts (role_id, permission_id) pairs.
 * No-op when permIds is empty.
 */
async function insertRolePermissions(conn, roleId, permIds) {
  if (!permIds.length) return;
  const values = permIds.map((permId) => [roleId, permId]);
  await conn.query(
    "INSERT INTO admin_role_permissions (role_id, permission_id) VALUES ?",
    [values]
  );
}

/**
 * Returns { id, is_system } for the given role, or null if not found.
 * Used inside the DELETE transaction to check existence and system flag.
 */
async function findRoleForDelete(conn, id) {
  const [rows] = await conn.query(
    "SELECT id, is_system FROM admin_roles WHERE id = ?",
    [id]
  );
  return rows[0] || null;
}

async function deleteRole(conn, id) {
  const [result] = await conn.query(
    "DELETE FROM admin_roles WHERE id = ?",
    [id]
  );
  return result.affectedRows;
}

/**
 * Conta admins ativos que possuem `permissionKey` POR OUTROS roles que
 * não o `excludeRoleId`. Usado pela proteção anti-lockout (P1 da auditoria
 * 2026-05-09): antes de remover uma permissão crítica de um role, garantir
 * que pelo menos um admin ativo continuará tendo essa permissão por outro
 * caminho.
 *
 * Os admins têm `role` como slug (string) — daí o JOIN por `r.slug = a.role`.
 */
async function countActiveAdminsWithPermissionExcludingRole(permissionKey, excludeRoleId) {
  const [rows] = await pool.query(
    `SELECT COUNT(DISTINCT a.id) AS total
     FROM admins a
     INNER JOIN admin_roles r ON r.slug = a.role
     INNER JOIN admin_role_permissions rp ON rp.role_id = r.id
     INNER JOIN admin_permissions p ON p.id = rp.permission_id
     WHERE a.ativo = 1
       AND p.chave = ?
       AND r.id != ?`,
    [permissionKey, excludeRoleId],
  );
  return Number(rows?.[0]?.total ?? 0);
}

module.exports = {
  listRoles,
  findRoleById,
  findRoleBySlug,
  createRole,
  updateRoleFields,
  deleteRolePermissions,
  resolvePermissionsByChave,
  insertRolePermissions,
  findRoleForDelete,
  deleteRole,
  countActiveAdminsWithPermissionExcludingRole,
};
