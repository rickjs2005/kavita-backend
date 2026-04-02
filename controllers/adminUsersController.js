"use strict";
// controllers/adminUsersController.js
//
// Admin: gestão de usuários (listar, bloquear, excluir).
// verifyAdmin + validateCSRF + requirePermission("usuarios.ver") pelo mount().

const { response } = require("../lib");
const AppError = require("../errors/AppError");
const ERROR_CODES = require("../constants/ErrorCodes");
const repo = require("../repositories/adminUsersRepository");

const listUsers = async (_req, res, next) => {
  try {
    const users = await repo.findAll();
    return response.ok(res, users);
  } catch (err) {
    return next(
      err instanceof AppError ? err
        : new AppError("Erro ao listar usuários.", ERROR_CODES.SERVER_ERROR, 500)
    );
  }
};

const blockUser = async (req, res, next) => {
  try {
    const id = req.params.id; // coerced by Zod
    const { status_conta } = req.body; // validated by Zod

    const affected = await repo.updateStatusConta(id, status_conta);
    if (affected === 0) {
      return next(new AppError("Usuário não encontrado.", ERROR_CODES.NOT_FOUND, 404));
    }

    return response.ok(res, { status_conta }, "Status da conta atualizado com sucesso.");
  } catch (err) {
    return next(
      err instanceof AppError ? err
        : new AppError("Erro ao atualizar status do usuário.", ERROR_CODES.SERVER_ERROR, 500)
    );
  }
};

const deleteUser = async (req, res, next) => {
  try {
    const id = req.params.id; // coerced by Zod

    const affected = await repo.deleteById(id);
    if (affected === 0) {
      return next(new AppError("Usuário não encontrado.", ERROR_CODES.NOT_FOUND, 404));
    }

    return response.noContent(res);
  } catch (err) {
    return next(
      err instanceof AppError ? err
        : new AppError("Erro ao excluir usuário.", ERROR_CODES.SERVER_ERROR, 500)
    );
  }
};

module.exports = { listUsers, blockUser, deleteUser };
