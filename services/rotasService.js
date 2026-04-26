"use strict";
// services/rotasService.js
//
// Regras de negocio das rotas de entrega (Fase 1 backend).
//
// Regras criticas:
//   1. 1 pedido nao pode estar em 2 rotas ATIVAS simultaneas
//      (ativas = status NOT IN ('cancelada','finalizada'))
//   2. Rota 'em_rota' e' READ-ONLY pra admin (exceto cancelar/pausar)
//   3. FSM:
//        rascunho   -> pronta, cancelada
//        pronta     -> em_rota, rascunho (pausa), cancelada
//        em_rota    -> finalizada, pronta (pausa de volta), cancelada
//        finalizada -> (terminal)
//        cancelada  -> (terminal)
//   4. Adicionar pedido exige: status_pagamento='pago' AND nao em rota ativa
//   5. Recalcula totais (paradas, entregues) sempre que mexe em paradas
//   6. tempo_total_minutos preenchido auto na transicao -> finalizada

const AppError = require("../errors/AppError");
const ERROR_CODES = require("../constants/ErrorCodes");
const logger = require("../lib/logger");
const { withTransaction } = require("../lib/withTransaction");
const pool = require("../config/pool");

const rotasRepo = require("../repositories/rotasRepository");
const paradasRepo = require("../repositories/rotaParadasRepository");
const motoristasRepo = require("../repositories/motoristasRepository");

const ATIVA_STATUSES = ["rascunho", "pronta", "em_rota"];
const TERMINAL_STATUSES = ["finalizada", "cancelada"];
const ALL_STATUSES = [...ATIVA_STATUSES, ...TERMINAL_STATUSES];

const VALID_TRANSITIONS = {
  rascunho: new Set(["pronta", "cancelada"]),
  pronta: new Set(["em_rota", "rascunho", "cancelada"]),
  em_rota: new Set(["finalizada", "pronta", "cancelada"]),
  finalizada: new Set([]),
  cancelada: new Set([]),
};

function _assertExists(rota) {
  if (!rota) {
    throw new AppError("Rota nao encontrada.", ERROR_CODES.NOT_FOUND, 404);
  }
}

function _assertEditable(rota) {
  if (rota.status === "em_rota") {
    throw new AppError(
      "Rota em andamento — pause ou cancele antes de editar.",
      ERROR_CODES.CONFLICT,
      409,
    );
  }
  if (rota.status === "finalizada" || rota.status === "cancelada") {
    throw new AppError(
      `Rota ${rota.status} nao pode ser editada.`,
      ERROR_CODES.CONFLICT,
      409,
    );
  }
}

function _assertTransition(from, to) {
  if (!VALID_TRANSITIONS[from] || !VALID_TRANSITIONS[from].has(to)) {
    throw new AppError(
      `Transicao invalida: ${from} -> ${to}.`,
      ERROR_CODES.CONFLICT,
      409,
      { from, to },
    );
  }
}

async function _assertMotoristaAtivo(motoristaId) {
  if (motoristaId == null) return;
  const m = await motoristasRepo.findById(motoristaId);
  if (!m) {
    throw new AppError(
      "Motorista nao encontrado.",
      ERROR_CODES.NOT_FOUND,
      404,
    );
  }
  if (!m.ativo) {
    throw new AppError(
      "Motorista esta inativo.",
      ERROR_CODES.CONFLICT,
      409,
    );
  }
}

async function _assertPedidoElegivel(pedidoId, conn) {
  const [[ped]] = await conn.query(
    `SELECT id, status_pagamento FROM pedidos WHERE id = ? LIMIT 1`,
    [pedidoId],
  );
  if (!ped) {
    throw new AppError("Pedido nao encontrado.", ERROR_CODES.NOT_FOUND, 404);
  }
  if (ped.status_pagamento !== "pago") {
    throw new AppError(
      `Pedido #${pedidoId} nao esta pago (status_pagamento=${ped.status_pagamento}).`,
      ERROR_CODES.CONFLICT,
      409,
    );
  }
}

// ----------------------------------------------------------------------------
// Listagem / leitura
// ----------------------------------------------------------------------------

async function listarRotas(filtros) {
  return rotasRepo.list(filtros);
}

async function obterRotaCompleta(id) {
  const rota = await rotasRepo.findById(id);
  _assertExists(rota);
  const paradas = await paradasRepo.listByRotaId(id);
  // Anexar itens em cada parada
  for (const p of paradas) {
    p.itens = await paradasRepo.listItensDoPedido(p.pedido_id);
  }
  return { ...rota, paradas };
}

/**
 * Pedidos elegiveis para entrar numa rota:
 *   - status_pagamento='pago'
 *   - sem parada em rota ATIVA
 *   - status_entrega NOT IN ('entregue','cancelado')   ← Bug 2 fix
 *
 * Sem o filtro de status_entrega, pedidos JA ENTREGUES voltavam ao
 * pool de disponiveis quando a rota deles era finalizada — admin
 * podia adicionar de novo numa rota nova e o motorista entregava 2x.
 *
 * "enviado" e "em_separacao" continuam elegiveis (estados pre-entrega
 * legacy do fluxo antigo). "cancelado" e' raro mas cobre cancelamento
 * pos-pagamento.
 *
 * Filtros opcionais: cidade, bairro, ate' data X.
 */
async function listarPedidosDisponiveis({ cidade, bairro, ate } = {}) {
  const where = [
    "p.status_pagamento = 'pago'",
    "p.status_entrega NOT IN ('entregue','cancelado')",
  ];
  const params = [];
  if (ate) {
    where.push("p.data_pedido <= ?");
    params.push(ate);
  }
  // cidade/bairro vem do JSON do endereco — usamos JSON_EXTRACT
  if (cidade) {
    where.push("JSON_UNQUOTE(JSON_EXTRACT(p.endereco, '$.cidade')) = ?");
    params.push(cidade);
  }
  if (bairro) {
    where.push("JSON_UNQUOTE(JSON_EXTRACT(p.endereco, '$.bairro')) = ?");
    params.push(bairro);
  }

  const [rows] = await pool.query(
    `SELECT p.id, p.usuario_id, p.endereco, p.tipo_endereco,
            p.endereco_latitude, p.endereco_longitude, p.observacao_entrega,
            p.total, p.shipping_price, p.data_pedido,
            u.nome AS usuario_nome, u.telefone AS usuario_telefone,
            (
              SELECT COUNT(*) FROM rota_paradas rp
              JOIN rotas r2 ON r2.id = rp.rota_id
              WHERE rp.pedido_id = p.id
                AND r2.status NOT IN ('cancelada','finalizada')
            ) AS em_rota_ativa
       FROM pedidos p
       LEFT JOIN usuarios u ON u.id = p.usuario_id
      WHERE ${where.join(" AND ")}
      HAVING em_rota_ativa = 0
      ORDER BY p.data_pedido ASC`,
    params,
  );
  return rows;
}

// ----------------------------------------------------------------------------
// CRUD basico
// ----------------------------------------------------------------------------

async function criarRota({
  data_programada,
  motorista_id,
  veiculo,
  regiao_label,
  observacoes,
  km_estimado,
  created_by_admin_id,
}) {
  if (!data_programada) {
    throw new AppError(
      "data_programada e' obrigatorio.",
      ERROR_CODES.VALIDATION_ERROR,
      400,
    );
  }
  await _assertMotoristaAtivo(motorista_id);
  const id = await rotasRepo.create({
    data_programada,
    motorista_id,
    veiculo,
    regiao_label,
    observacoes,
    km_estimado,
    created_by_admin_id,
  });
  logger.info({ rotaId: id, motoristaId: motorista_id }, "rotas.criada");
  return obterRotaCompleta(id);
}

async function atualizarRota(id, patch) {
  const rota = await rotasRepo.findById(id);
  _assertExists(rota);
  _assertEditable(rota);
  if (patch.motorista_id !== undefined && patch.motorista_id !== null) {
    await _assertMotoristaAtivo(patch.motorista_id);
  }
  await rotasRepo.update(id, patch);
  return obterRotaCompleta(id);
}

async function deletarRota(id) {
  const rota = await rotasRepo.findById(id);
  _assertExists(rota);
  if (rota.status !== "rascunho") {
    throw new AppError(
      "So rotas em rascunho podem ser deletadas. Use cancelar nas demais.",
      ERROR_CODES.CONFLICT,
      409,
    );
  }
  await rotasRepo.deleteById(id);
}

// ----------------------------------------------------------------------------
// Paradas
// ----------------------------------------------------------------------------

async function adicionarPedido(rotaId, pedidoId) {
  return withTransaction(async (conn) => {
    const rota = await rotasRepo.findById(rotaId, conn);
    _assertExists(rota);
    _assertEditable(rota);
    await _assertPedidoElegivel(pedidoId, conn);

    // Anti-dup cross-rotas
    const existente = await paradasRepo.findActiveStopByPedidoId(pedidoId, conn);
    if (existente && existente.rota_id !== rotaId) {
      throw new AppError(
        `Pedido #${pedidoId} ja' esta na rota #${existente.rota_id} (status=${existente.rota_status}).`,
        ERROR_CODES.CONFLICT,
        409,
      );
    }

    // Idempotente: se ja' esta nesta rota, devolve o existente
    const naMesma = await paradasRepo.findByRotaAndPedido(rotaId, pedidoId, conn);
    if (naMesma) return naMesma;

    const ordem = await paradasRepo.nextOrdem(rotaId, conn);
    const id = await paradasRepo.create({ rota_id: rotaId, pedido_id: pedidoId, ordem }, conn);
    await rotasRepo.recalcTotals(rotaId, conn);
    return paradasRepo.findById(id, conn);
  });
}

async function removerPedido(rotaId, pedidoId) {
  return withTransaction(async (conn) => {
    const rota = await rotasRepo.findById(rotaId, conn);
    _assertExists(rota);
    _assertEditable(rota);
    const removed = await paradasRepo.deleteByRotaAndPedido(rotaId, pedidoId, conn);
    if (!removed) {
      throw new AppError(
        "Pedido nao esta nesta rota.",
        ERROR_CODES.NOT_FOUND,
        404,
      );
    }
    await rotasRepo.recalcTotals(rotaId, conn);
    return { removed: true };
  });
}

/**
 * ordens = [{ pedido_id, ordem }, ...]
 * Aceita reordenamento parcial; falta rejeitar duplicatas no input.
 */
async function reordenarParadas(rotaId, ordens) {
  if (!Array.isArray(ordens) || ordens.length === 0) {
    throw new AppError(
      "Lista de ordens vazia.",
      ERROR_CODES.VALIDATION_ERROR,
      400,
    );
  }
  const seen = new Set();
  for (const o of ordens) {
    if (typeof o.pedido_id !== "number" || typeof o.ordem !== "number") {
      throw new AppError(
        "Cada item precisa de pedido_id (number) + ordem (number).",
        ERROR_CODES.VALIDATION_ERROR,
        400,
      );
    }
    if (seen.has(o.ordem)) {
      throw new AppError(
        `Ordem duplicada: ${o.ordem}.`,
        ERROR_CODES.VALIDATION_ERROR,
        400,
      );
    }
    seen.add(o.ordem);
  }
  return withTransaction(async (conn) => {
    const rota = await rotasRepo.findById(rotaId, conn);
    _assertExists(rota);
    _assertEditable(rota);
    await paradasRepo.updateOrdensBulk(rotaId, ordens, conn);
    return paradasRepo.listByRotaId(rotaId, conn);
  });
}

// ----------------------------------------------------------------------------
// Transicoes de status
// ----------------------------------------------------------------------------

async function alterarStatus(rotaId, novoStatus, opts = {}) {
  if (!ALL_STATUSES.includes(novoStatus)) {
    throw new AppError(
      `Status invalido: ${novoStatus}.`,
      ERROR_CODES.VALIDATION_ERROR,
      400,
    );
  }
  const rota = await rotasRepo.findById(rotaId);
  _assertExists(rota);
  _assertTransition(rota.status, novoStatus);

  const extras = {};
  if (novoStatus === "em_rota" && !rota.iniciada_em) {
    extras.iniciada_em = new Date();
  }
  if (novoStatus === "finalizada") {
    const fim = new Date();
    extras.finalizada_em = fim;
    if (rota.iniciada_em) {
      const minutos = Math.max(
        0,
        Math.round((fim.getTime() - new Date(rota.iniciada_em).getTime()) / 60000),
      );
      extras.tempo_total_minutos = minutos;
    }
    if (opts.km_real !== undefined && opts.km_real !== null) {
      extras.km_real = opts.km_real;
    }
  }

  // Pra ir pra em_rota tem que ter motorista E pelo menos 1 parada.
  if (novoStatus === "em_rota") {
    if (!rota.motorista_id) {
      throw new AppError(
        "Atribua um motorista antes de iniciar a rota.",
        ERROR_CODES.CONFLICT,
        409,
      );
    }
    if (Number(rota.total_paradas) === 0) {
      throw new AppError(
        "Adicione pelo menos 1 parada antes de iniciar a rota.",
        ERROR_CODES.CONFLICT,
        409,
      );
    }
  }

  await rotasRepo.updateStatus(rotaId, novoStatus, extras);
  logger.info(
    { rotaId, from: rota.status, to: novoStatus, extras },
    "rotas.status_changed",
  );
  return obterRotaCompleta(rotaId);
}

module.exports = {
  // leitura
  listarRotas,
  obterRotaCompleta,
  listarPedidosDisponiveis,
  // crud
  criarRota,
  atualizarRota,
  deletarRota,
  // paradas
  adicionarPedido,
  removerPedido,
  reordenarParadas,
  // status
  alterarStatus,
  // constantes
  ATIVA_STATUSES,
  TERMINAL_STATUSES,
  ALL_STATUSES,
  VALID_TRANSITIONS,
};
