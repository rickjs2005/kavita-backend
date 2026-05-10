"use strict";
// controllers/permissionsController.js

const { response } = require("../lib");
const AppError = require("../errors/AppError");
const ERROR_CODES = require("../constants/ErrorCodes");
const repo = require("../repositories/permissionsRepository");
const { logAdminAction } = require("../services/adminLogs");

/**
 * Permissões críticas — não podem ser apagadas, do contrário ninguém mais
 * conseguiria mexer em roles/permissões e o sistema ficaria em lockout.
 * (P1 da auditoria 2026-05-09.)
 */
const PROTECTED_PERMISSION_KEYS = new Set(["roles_manage", "permissions_manage"]);

const listPermissions = async (_req, res, next) => {
  try {
    return response.ok(res, await repo.findAll());
  } catch (err) {
    return next(err instanceof AppError ? err : new AppError("Erro ao listar permissões.", ERROR_CODES.SERVER_ERROR, 500));
  }
};

const createPermission = async (req, res, next) => {
  try {
    const { chave, grupo, descricao } = req.body;

    if (await repo.findByChave(chave)) {
      return next(new AppError("Já existe uma permissão com essa chave.", ERROR_CODES.CONFLICT, 409));
    }

    const id = await repo.insert(chave, grupo, descricao);
    await logAdminAction({ adminId: req.admin?.id, acao: "criar_permissao", entidade: "admin_permission", entidadeId: id });

    return response.created(res, { id, chave, grupo, descricao });
  } catch (err) {
    return next(err instanceof AppError ? err : new AppError("Erro ao criar permissão.", ERROR_CODES.SERVER_ERROR, 500));
  }
};

const updatePermission = async (req, res, next) => {
  try {
    const id = req.params.id;
    const { chave, grupo, descricao } = req.body;

    const fields = [];
    const values = [];
    if (chave) { fields.push("chave = ?"); values.push(chave); }
    if (grupo) { fields.push("grupo = ?"); values.push(grupo); }
    if (descricao !== undefined) { fields.push("descricao = ?"); values.push(descricao); }

    const affected = await repo.update(id, fields, values);
    if (!affected) return next(new AppError("Permissão não encontrada.", ERROR_CODES.NOT_FOUND, 404));

    await logAdminAction({ adminId: req.admin?.id, acao: "atualizar_permissao", entidade: "admin_permission", entidadeId: id });
    return response.ok(res, null, "Permissão atualizada com sucesso.");
  } catch (err) {
    return next(err instanceof AppError ? err : new AppError("Erro ao atualizar permissão.", ERROR_CODES.SERVER_ERROR, 500));
  }
};

const deletePermission = async (req, res, next) => {
  try {
    const id = req.params.id;

    // P1 — Lockout: precisamos saber a chave antes de deletar para bloquear
    // remoção de permissões críticas.
    const perm = await repo.findById(id);
    if (!perm) return next(new AppError("Permissão não encontrada.", ERROR_CODES.NOT_FOUND, 404));

    if (PROTECTED_PERMISSION_KEYS.has(perm.chave)) {
      return next(new AppError(
        `A permissão '${perm.chave}' é crítica para o sistema e não pode ser removida.`,
        ERROR_CODES.VALIDATION_ERROR,
        400,
      ));
    }

    const affected = await repo.deleteById(id);
    if (!affected) return next(new AppError("Permissão não encontrada.", ERROR_CODES.NOT_FOUND, 404));

    await logAdminAction({ adminId: req.admin?.id, acao: "remover_permissao", entidade: "admin_permission", entidadeId: id });
    return response.noContent(res);
  } catch (err) {
    return next(err instanceof AppError ? err : new AppError("Erro ao remover permissão.", ERROR_CODES.SERVER_ERROR, 500));
  }
};

module.exports = { listPermissions, createPermission, updatePermission, deletePermission };
