"use strict";
// controllers/admin/motoristasAdminController.js
//
// CRUD admin de motoristas + envio de magic-link.
// verifyAdmin + validateCSRF aplicados no mount em adminRoutes.js.

const { response } = require("../../lib");
const AppError = require("../../errors/AppError");
const ERROR_CODES = require("../../constants/ErrorCodes");
const motoristasRepo = require("../../repositories/motoristasRepository");
const authService = require("../../services/motoristaAuthService");
const { normalizePhoneBR } = require("../../lib/waLink");

function _parseId(raw) {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) {
    throw new AppError("ID invalido.", ERROR_CODES.VALIDATION_ERROR, 400);
  }
  return id;
}

async function listar(req, res, next) {
  try {
    const ativo =
      req.query.ativo === "true" ? true :
      req.query.ativo === "false" ? false :
      undefined;
    const search = req.query.search ? String(req.query.search).trim() : undefined;
    const items = await motoristasRepo.list({ ativo, search });
    return response.ok(res, items);
  } catch (err) {
    return next(err);
  }
}

async function criar(req, res, next) {
  try {
    const { nome, telefone, email, veiculo_padrao } = req.body;
    const tel = normalizePhoneBR(telefone);
    if (!tel) {
      throw new AppError(
        "Telefone invalido. Use formato com DDD.",
        ERROR_CODES.VALIDATION_ERROR,
        400,
      );
    }
    const ja = await motoristasRepo.findByTelefone(tel);
    if (ja) {
      throw new AppError(
        "Ja existe motorista com este telefone.",
        ERROR_CODES.CONFLICT,
        409,
        { motorista_id: ja.id },
      );
    }
    const id = await motoristasRepo.create({
      nome,
      telefone: tel,
      email,
      veiculo_padrao,
    });
    const created = await motoristasRepo.findById(id);
    return response.created(res, created, "Motorista cadastrado.");
  } catch (err) {
    return next(err);
  }
}

async function atualizar(req, res, next) {
  try {
    const id = _parseId(req.params.id);
    const motorista = await motoristasRepo.findById(id);
    if (!motorista) {
      throw new AppError("Motorista nao encontrado.", ERROR_CODES.NOT_FOUND, 404);
    }
    const patch = { ...req.body };
    if (patch.telefone !== undefined) {
      const tel = normalizePhoneBR(patch.telefone);
      if (!tel) {
        throw new AppError(
          "Telefone invalido.",
          ERROR_CODES.VALIDATION_ERROR,
          400,
        );
      }
      // Checa colisao com OUTRO motorista
      const outro = await motoristasRepo.findByTelefone(tel);
      if (outro && outro.id !== id) {
        throw new AppError(
          "Telefone ja esta em uso por outro motorista.",
          ERROR_CODES.CONFLICT,
          409,
        );
      }
      patch.telefone = tel;
    }
    await motoristasRepo.update(id, patch);
    const fresh = await motoristasRepo.findById(id);
    return response.ok(res, fresh, "Motorista atualizado.");
  } catch (err) {
    return next(err);
  }
}

async function setAtivo(req, res, next) {
  try {
    const id = _parseId(req.params.id);
    const motorista = await motoristasRepo.findById(id);
    if (!motorista) {
      throw new AppError("Motorista nao encontrado.", ERROR_CODES.NOT_FOUND, 404);
    }
    await motoristasRepo.setAtivo(id, !!req.body.ativo);
    // Bumpa token_version pra invalidar sessoes ativas se desativando
    if (!req.body.ativo) {
      await motoristasRepo.bumpTokenVersion(id);
    }
    const fresh = await motoristasRepo.findById(id);
    return response.ok(res, fresh);
  } catch (err) {
    return next(err);
  }
}

async function enviarLink(req, res, next) {
  try {
    const id = _parseId(req.params.id);
    const result = await authService.requestMagicLink({ motoristaId: id });
    return response.ok(res, result, "Link gerado.");
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  listar,
  criar,
  atualizar,
  setAtivo,
  enviarLink,
};
