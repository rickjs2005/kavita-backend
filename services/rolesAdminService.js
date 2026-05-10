"use strict";
// services/rolesAdminService.js
//
// Business logic for admin roles management.
// Owns the transaction lifecycle for update and remove.

const { withTransaction } = require("../lib/withTransaction");
const repo = require("../repositories/rolesRepository");
const { logAdminAction } = require("./adminLogs");
const AppError = require("../errors/AppError");
const ERROR_CODES = require("../constants/ErrorCodes");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normalizeSlug(slug) {
  return String(slug).trim().toLowerCase();
}

/**
 * Permissões cuja remoção pode causar lockout total do sistema.
 * Quando o admin atualiza um role removendo uma destas, validamos que
 * pelo menos um admin ativo continuará tendo a permissão por outro role
 * (P1 da auditoria 2026-05-09).
 */
const CRITICAL_PERMISSIONS = ["roles_manage", "permissions_manage"];

/**
 * Verifica se a nova lista de permissões deixaria o sistema sem cobertura
 * em alguma permissão crítica. Lança AppError 400 com mensagem amigável
 * quando o cenário de lockout é detectado.
 *
 * Critério: para cada permissão crítica que o role atual TEM e a nova
 * lista NÃO TEM, contar admins ativos que ainda teriam essa permissão por
 * OUTROS roles. Se zero, bloquear.
 */
async function assertNoCriticalLockout(roleId, currentPermissions, nextPermissions) {
  const currentSet = new Set(currentPermissions || []);
  const nextSet = new Set(nextPermissions || []);

  for (const critical of CRITICAL_PERMISSIONS) {
    const hadIt = currentSet.has(critical);
    const stillHas = nextSet.has(critical);
    if (!hadIt || stillHas) continue; // não está sendo removida deste role

    const stillCovered = await repo.countActiveAdminsWithPermissionExcludingRole(
      critical,
      roleId,
    );
    if (stillCovered === 0) {
      throw new AppError(
        `Não é possível remover a permissão '${critical}' deste papel: nenhum outro admin ativo manteria essa permissão. Atribua-a a outro papel antes de remover daqui.`,
        ERROR_CODES.VALIDATION_ERROR,
        400,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// list
// ---------------------------------------------------------------------------

async function list() {
  return repo.listRoles();
}

// ---------------------------------------------------------------------------
// getById
// ---------------------------------------------------------------------------

async function getById(id) {
  const role = await repo.findRoleById(id);
  if (!role) {
    throw new AppError("Role não encontrado.", ERROR_CODES.NOT_FOUND, 404);
  }
  return role;
}

// ---------------------------------------------------------------------------
// create
// ---------------------------------------------------------------------------

async function create({ nome, slug, descricao }, adminId) {
  const slugNorm = normalizeSlug(slug);

  const existing = await repo.findRoleBySlug(slugNorm);
  if (existing) {
    throw new AppError(
      "Já existe um role com esse slug.",
      ERROR_CODES.CONFLICT,
      409
    );
  }

  const id = await repo.createRole({ nome, slug: slugNorm, descricao });

  // Fire-and-forget — audit log failure must not affect the response
  logAdminAction({
    adminId,
    acao: "criar_role",
    entidade: "admin_role",
    entidadeId: id,
  });

  return {
    id,
    nome,
    slug: slugNorm,
    descricao: descricao || null,
    is_system: 0,
    permissions: [],
  };
}

// ---------------------------------------------------------------------------
// update (transactional)
// ---------------------------------------------------------------------------

async function update(id, { nome, descricao, permissions }, adminId) {
  // Verify existence before opening a connection
  const existing = await repo.findRoleById(id);
  if (!existing) {
    throw new AppError("Role não encontrado.", ERROR_CODES.NOT_FOUND, 404);
  }

  // P1 — Lockout: se o caller mandou nova lista de permissions, validar
  // que nenhuma permissão crítica está perdendo cobertura. Verificamos ANTES
  // de abrir a transação para falhar barato.
  if (Array.isArray(permissions)) {
    await assertNoCriticalLockout(id, existing.permissions, permissions);
  }

  await withTransaction(async (conn) => {
    // Update scalar fields if any were provided
    if (nome !== undefined || descricao !== undefined) {
      await repo.updateRoleFields(conn, id, { nome, descricao });
    }

    // Sync permissions if an array was provided (replace, not merge)
    if (Array.isArray(permissions)) {
      await repo.deleteRolePermissions(conn, id);

      if (permissions.length > 0) {
        const permMap = await repo.resolvePermissionsByChave(conn, permissions);
        const permIds = permissions.map((key) => permMap.get(key)).filter(Boolean);
        await repo.insertRolePermissions(conn, id, permIds);
      }
    }
  });

  logAdminAction({
    adminId,
    acao: "atualizar_role",
    entidade: "admin_role",
    entidadeId: id,
  });
}

// ---------------------------------------------------------------------------
// remove (transactional)
// ---------------------------------------------------------------------------

async function remove(id, adminId) {
  await withTransaction(async (conn) => {
    const role = await repo.findRoleForDelete(conn, id);
    if (!role) {
      throw new AppError("Role não encontrado.", ERROR_CODES.NOT_FOUND, 404);
    }
    if (role.is_system) {
      throw new AppError(
        "Este role é de sistema e não pode ser removido.",
        ERROR_CODES.VALIDATION_ERROR,
        400
      );
    }

    await repo.deleteRolePermissions(conn, id);
    await repo.deleteRole(conn, id);
  });

  logAdminAction({
    adminId,
    acao: "remover_role",
    entidade: "admin_role",
    entidadeId: id,
  });
}

module.exports = { list, getById, create, update, remove };
