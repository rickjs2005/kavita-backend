"use strict";
// controllers/pedidosUserController.js
//
// Pedidos do usuário autenticado (leitura).
// Todos os valores DECIMAL são convertidos com Number() antes de enviar,
// porque mysql2 retorna DECIMAL como string e o frontend pode interpretar
// incorretamente (ex.: "13000.00" com toNumber que assume formato BR).

const { response } = require("../lib");
const AppError = require("../errors/AppError");
const ERROR_CODES = require("../constants/ErrorCodes");
const repo = require("../repositories/pedidosUserRepository");
const ocorrenciasRepo = require("../repositories/pedidoOcorrenciasRepository");
const { dispararEventoComunicacao } = require("../services/comunicacaoService");
const logger = require("../lib/logger");

/** Converte valor DECIMAL (string do mysql2) para number JS. */
const n = (v) => Number(v ?? 0);

const listPedidos = async (req, res, next) => {
  try {
    const usuarioId = req.user?.id;
    if (!usuarioId) {
      return next(new AppError("Usuário não autenticado.", ERROR_CODES.AUTH_ERROR, 401));
    }

    const rows = await repo.findByUserId(usuarioId);

    // Normaliza DECIMAL→number para evitar que o frontend receba strings.
    const pedidos = rows.map((r) => ({
      id: r.id,
      usuario_id: r.usuario_id,
      forma_pagamento: r.forma_pagamento,
      status_pagamento: r.status_pagamento,
      status_entrega: r.status_entrega,
      data_pedido: r.data_pedido,
      cupom_codigo: r.cupom_codigo ?? null,
      shipping_price: n(r.shipping_price),
      total: n(r.total),
      qtd_itens: n(r.qtd_itens),
    }));

    return response.ok(res, pedidos);
  } catch (err) {
    return next(
      err instanceof AppError ? err
        : new AppError("Erro ao listar pedidos.", ERROR_CODES.SERVER_ERROR, 500)
    );
  }
};

const getPedidoById = async (req, res, next) => {
  try {
    const usuarioId = req.user?.id;
    if (!usuarioId) {
      return next(new AppError("Usuário não autenticado.", ERROR_CODES.AUTH_ERROR, 401));
    }

    const pedidoId = Number(String(req.params.id).replace(/\D/g, ""));
    if (!pedidoId) {
      return next(new AppError("ID do pedido inválido.", ERROR_CODES.VALIDATION_ERROR, 400));
    }

    const pedido = await repo.findByIdAndUserId(pedidoId, usuarioId);
    if (!pedido) {
      return next(new AppError("Pedido não encontrado.", ERROR_CODES.NOT_FOUND, 404));
    }

    const [itens, ocorrencias] = await Promise.all([
      repo.findItemsByPedidoId(pedidoId),
      ocorrenciasRepo.findByPedidoId(pedidoId),
    ]);

    const subtotalItens = n(pedido.subtotal_itens);
    const totalComDesc  = n(pedido.total_com_desconto);
    const shippingPrice = n(pedido.shipping_price);
    const desconto      = +(Math.max(subtotalItens - totalComDesc, 0)).toFixed(2);

    return response.ok(res, {
      id: pedido.id,
      usuario_id: pedido.usuario_id,
      forma_pagamento: pedido.forma_pagamento,
      status_pagamento: pedido.status_pagamento ?? null,
      status_entrega: pedido.status_entrega ?? null,
      data_pedido: pedido.data_pedido,
      endereco: pedido.endereco ?? null,
      cupom_codigo: pedido.cupom_codigo ?? null,
      subtotal: subtotalItens,
      desconto,
      shipping_price: shippingPrice,
      shipping_prazo_dias: pedido.shipping_prazo_dias ?? null,
      total: totalComDesc + shippingPrice,
      itens: itens.map((i) => ({
        id: i.id,
        produto_id: i.produto_id,
        nome: i.nome,
        preco: n(i.preco),
        quantidade: n(i.quantidade),
        imagem: i.imagem,
      })),
      ocorrencias: ocorrencias.map((o) => ({
        id: o.id,
        motivo: o.motivo,
        observacao: o.observacao ?? null,
        status: o.status,
        resposta_admin: o.resposta_admin ?? null,
        taxa_extra: n(o.taxa_extra),
        created_at: o.created_at,
        updated_at: o.updated_at,
      })),
    });
  } catch (err) {
    return next(
      err instanceof AppError ? err
        : new AppError("Erro ao buscar pedido.", ERROR_CODES.SERVER_ERROR, 500)
    );
  }
};

const createOcorrencia = async (req, res, next) => {
  try {
    const usuarioId = req.user?.id;
    if (!usuarioId) {
      return next(new AppError("Usuário não autenticado.", ERROR_CODES.AUTH_ERROR, 401));
    }

    const pedidoId = Number(String(req.params.id).replace(/\D/g, ""));
    if (!pedidoId) {
      return next(new AppError("ID do pedido inválido.", ERROR_CODES.VALIDATION_ERROR, 400));
    }

    // Rate limit: max 5 ocorrências por usuário a cada 15 minutos.
    const recentes = await ocorrenciasRepo.countRecentByUserId(usuarioId, 15);
    if (recentes >= 5) {
      return next(
        new AppError(
          "Limite de solicitações atingido. Tente novamente em 15 minutos.",
          ERROR_CODES.RATE_LIMIT,
          429
        )
      );
    }

    // Garante que o pedido pertence ao usuário.
    const pedido = await repo.findByIdAndUserId(pedidoId, usuarioId);
    if (!pedido) {
      return next(new AppError("Pedido não encontrado.", ERROR_CODES.NOT_FOUND, 404));
    }

    // Impede duplicata de ocorrência aberta do mesmo tipo.
    const existente = await ocorrenciasRepo.findOpenByPedidoAndTipo(pedidoId, "endereco_incorreto");
    if (existente) {
      return next(
        new AppError(
          "Já existe uma solicitação em aberto para este pedido.",
          ERROR_CODES.CONFLICT,
          409
        )
      );
    }

    const { motivo, observacao } = req.body;

    // Se houver ocorrência anterior resolvida/rejeitada do mesmo tipo,
    // enriquece a observação com referência para rastreabilidade.
    let observacaoFinal = observacao;
    const todas = await ocorrenciasRepo.findByPedidoId(pedidoId);
    const anterior = todas.find(
      (o) => ["resolvida", "rejeitada"].includes(o.status)
    );
    if (anterior) {
      observacaoFinal = `[Reabertura - ocorrência anterior #${anterior.id}] ${observacao ?? ""}`;
    }

    const id = await ocorrenciasRepo.create({
      pedidoId,
      usuarioId,
      tipo: "endereco_incorreto",
      motivo,
      observacao: observacaoFinal,
    });

    // Auto-notificar cliente com confirmação (fire-and-forget).
    try {
      await dispararEventoComunicacao("ocorrencia_criada", pedidoId);
    } catch (err) {
      logger.warn({ err, pedidoId }, "ocorrencia: confirmacao notification failed");
    }

    return response.created(res, { id }, "Solicitação registrada com sucesso.");
  } catch (err) {
    return next(
      err instanceof AppError ? err
        : new AppError("Erro ao registrar ocorrência.", ERROR_CODES.SERVER_ERROR, 500)
    );
  }
};

module.exports = { listPedidos, getPedidoById, createOcorrencia };
