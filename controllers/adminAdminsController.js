"use strict";
// controllers/adminAdminsController.js

const bcrypt = require("bcrypt");
const { response } = require("../lib");
const AppError = require("../errors/AppError");
const ERROR_CODES = require("../constants/ErrorCodes");
const repo = require("../repositories/adminAdminsRepository");
const { logAdminAction } = require("../services/adminLogs");

const listAdmins = async (_req, res, next) => {
  try {
    return response.ok(res, await repo.findAll());
  } catch (err) {
    return next(err instanceof AppError ? err : new AppError("Erro ao listar admins.", ERROR_CODES.SERVER_ERROR, 500));
  }
};

const createAdmin = async (req, res, next) => {
  try {
    const { nome, email, senha, role } = req.body;

    if (!(await repo.findRoleBySlug(role))) {
      return next(new AppError("Role inválido. Crie o perfil primeiro.", ERROR_CODES.VALIDATION_ERROR, 400));
    }
    if (await repo.findByEmail(email)) {
      return next(new AppError("Já existe um admin com esse email.", ERROR_CODES.CONFLICT, 409));
    }

    const hash = await bcrypt.hash(String(senha), 10);
    const id = await repo.insert(nome, email, hash, role);

    await logAdminAction({ adminId: req.admin?.id, acao: "criar_admin", entidade: "admin", entidadeId: id });
    return response.created(res, { id, nome, email, role, ativo: 1 });
  } catch (err) {
    return next(err instanceof AppError ? err : new AppError("Erro ao criar admin.", ERROR_CODES.SERVER_ERROR, 500));
  }
};

const updateAdmin = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const currentAdminId = req.admin?.id;
    const { role, ativo } = req.body;

    // Carrega o alvo antes pra ter `role` atual e `ativo` atual — necessario
    // para checar auto-rebaixamento (P4) e ultimo-admin (P2).
    const target = await repo.findById(id);
    if (!target) return next(new AppError("Admin não encontrado.", ERROR_CODES.NOT_FOUND, 404));

    const isSelf = currentAdminId === target.id;
    const desativando = ativo !== undefined && !ativo && Boolean(target.ativo);
    const trocandoRole = role !== undefined && role !== target.role;

    // P4 — Auto-rebaixamento: admin nao pode mudar o proprio role nem se desativar.
    // Outras alteracoes do proprio cadastro continuam sendo feitas em outras telas
    // (ex.: troca de senha). Aqui bloqueamos especificamente as duas mudancas
    // que poderiam derrubar o acesso do proprio admin.
    if (isSelf && trocandoRole) {
      return next(new AppError(
        "Você não pode alterar o próprio papel. Peça a outro admin para fazer essa mudança.",
        ERROR_CODES.VALIDATION_ERROR,
        400,
      ));
    }
    if (isSelf && desativando) {
      return next(new AppError(
        "Você não pode desativar a si mesmo.",
        ERROR_CODES.VALIDATION_ERROR,
        400,
      ));
    }

    // P2 — Ultimo admin ativo: desativar o ultimo admin ativo deixa o sistema sem ninguem.
    if (desativando) {
      const ativos = await repo.countActive();
      if (ativos <= 1) {
        return next(new AppError(
          "Não é possível desativar o último admin ativo do sistema.",
          ERROR_CODES.VALIDATION_ERROR,
          400,
        ));
      }
    }

    const fields = [];
    const values = [];

    if (role) {
      if (!(await repo.findRoleBySlug(role))) {
        return next(new AppError("Role inválido.", ERROR_CODES.VALIDATION_ERROR, 400));
      }
      fields.push("role = ?"); values.push(role);
    }
    if (ativo !== undefined) {
      fields.push("ativo = ?"); values.push(ativo ? 1 : 0);
    }

    const affected = await repo.update(id, fields, values);
    if (!affected) return next(new AppError("Admin não encontrado.", ERROR_CODES.NOT_FOUND, 404));

    await logAdminAction({ adminId: currentAdminId, acao: "atualizar_admin", entidade: "admin", entidadeId: id });
    return response.ok(res, null, "Admin atualizado com sucesso.");
  } catch (err) {
    return next(err instanceof AppError ? err : new AppError("Erro ao atualizar admin.", ERROR_CODES.SERVER_ERROR, 500));
  }
};

const deleteAdmin = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const admin = await repo.findById(id);

    if (!admin) return next(new AppError("Admin não encontrado.", ERROR_CODES.NOT_FOUND, 404));
    if (admin.id === req.admin?.id) return next(new AppError("Você não pode remover a si mesmo.", ERROR_CODES.VALIDATION_ERROR, 400));
    if (admin.role === "master") return next(new AppError("O admin master não pode ser removido.", ERROR_CODES.VALIDATION_ERROR, 400));

    // P2 — Ultimo admin ativo: bloquear remocao se o alvo for o ultimo ativo.
    // (As checagens self/master acima ja cobrem casos comuns; este e' o catch-all
    // para evitar lockout em cenarios com poucos admins.)
    if (admin.ativo) {
      const ativos = await repo.countActive();
      if (ativos <= 1) {
        return next(new AppError(
          "Não é possível remover o último admin ativo do sistema.",
          ERROR_CODES.VALIDATION_ERROR,
          400,
        ));
      }
    }

    await repo.deleteById(id);
    await logAdminAction({ adminId: req.admin?.id, acao: "remover_admin", entidade: "admin", entidadeId: id });
    return response.noContent(res);
  } catch (err) {
    return next(err instanceof AppError ? err : new AppError("Erro ao remover admin.", ERROR_CODES.SERVER_ERROR, 500));
  }
};

module.exports = { listAdmins, createAdmin, updateAdmin, deleteAdmin };
