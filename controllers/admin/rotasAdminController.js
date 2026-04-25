"use strict";
// controllers/admin/rotasAdminController.js
//
// Endpoints admin do modulo de Rotas. Toda regra de negocio fica em
// services/rotasService.js — controller so' valida + delega.

const { response } = require("../../lib");
const AppError = require("../../errors/AppError");
const ERROR_CODES = require("../../constants/ErrorCodes");
const rotasService = require("../../services/rotasService");

function _parseId(raw) {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) {
    throw new AppError("ID invalido.", ERROR_CODES.VALIDATION_ERROR, 400);
  }
  return id;
}

async function listar(req, res, next) {
  try {
    const filtros = {
      data: req.query.data || undefined,
      status: req.query.status || undefined,
      motoristaId: req.query.motorista_id ? Number(req.query.motorista_id) : undefined,
    };
    const items = await rotasService.listarRotas(filtros);
    return response.ok(res, items);
  } catch (err) {
    return next(err);
  }
}

async function detalhe(req, res, next) {
  try {
    const id = _parseId(req.params.id);
    const data = await rotasService.obterRotaCompleta(id);
    return response.ok(res, data);
  } catch (err) {
    return next(err);
  }
}

async function criar(req, res, next) {
  try {
    const body = req.body;
    const data = await rotasService.criarRota({
      ...body,
      created_by_admin_id: req.admin?.id ?? null,
    });
    return response.created(res, data, "Rota criada.");
  } catch (err) {
    return next(err);
  }
}

async function atualizar(req, res, next) {
  try {
    const id = _parseId(req.params.id);
    const data = await rotasService.atualizarRota(id, req.body);
    return response.ok(res, data, "Rota atualizada.");
  } catch (err) {
    return next(err);
  }
}

async function deletar(req, res, next) {
  try {
    const id = _parseId(req.params.id);
    await rotasService.deletarRota(id);
    return response.noContent(res);
  } catch (err) {
    return next(err);
  }
}

async function alterarStatus(req, res, next) {
  try {
    const id = _parseId(req.params.id);
    const { status, km_real } = req.body;
    const data = await rotasService.alterarStatus(id, status, { km_real });
    return response.ok(res, data, `Rota -> ${status}.`);
  } catch (err) {
    return next(err);
  }
}

async function adicionarParada(req, res, next) {
  try {
    const id = _parseId(req.params.id);
    const { pedido_id } = req.body;
    const data = await rotasService.adicionarPedido(id, Number(pedido_id));
    return response.created(res, data, "Pedido adicionado a rota.");
  } catch (err) {
    return next(err);
  }
}

async function removerParada(req, res, next) {
  try {
    const id = _parseId(req.params.id);
    const pedidoId = _parseId(req.params.pedidoId);
    await rotasService.removerPedido(id, pedidoId);
    return response.noContent(res);
  } catch (err) {
    return next(err);
  }
}

async function reordenarParadas(req, res, next) {
  try {
    const id = _parseId(req.params.id);
    const { ordens } = req.body;
    const data = await rotasService.reordenarParadas(id, ordens);
    return response.ok(res, data, "Ordem atualizada.");
  } catch (err) {
    return next(err);
  }
}

async function listarPedidosDisponiveis(req, res, next) {
  try {
    const items = await rotasService.listarPedidosDisponiveis({
      cidade: req.query.cidade || undefined,
      bairro: req.query.bairro || undefined,
      ate: req.query.ate || undefined,
    });
    return response.ok(res, items);
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  listar,
  detalhe,
  criar,
  atualizar,
  deletar,
  alterarStatus,
  adicionarParada,
  removerParada,
  reordenarParadas,
  listarPedidosDisponiveis,
};
