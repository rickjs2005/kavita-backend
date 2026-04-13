"use strict";
// services/comunicacaoService.js
//
// Regras de negócio para envio de comunicações transacionais.
// Consumidores:
//   - controllers/comunicacaoController.js   (admin: envio manual com override)
//   - services/checkoutNotificationService.js (evento pedido_criado)
//   - services/orderService.js               (eventos pagamento_aprovado, pedido_enviado)

const { sendTransactionalEmail } = require("./mailService");
const AppError = require("../errors/AppError");
const ERROR_CODES = require("../constants/ErrorCodes");
const repo = require("../repositories/comunicacaoRepository");
const logger = require("../lib/logger");

// ---------------------------------------------------------------------------
// Templates (extraídos para templates/email/ e templates/whatsapp/)
// ---------------------------------------------------------------------------

const emailTemplates = {
  confirmacao_pedido:            require("../templates/email/confirmacaoPedido"),
  pagamento_aprovado:            require("../templates/email/pagamentoAprovado"),
  pedido_enviado:                require("../templates/email/pedidoEnviado"),
  ocorrencia_confirmacao:        require("../templates/email/ocorrenciaConfirmacao"),
  ocorrencia_solicitar_dados:    require("../templates/email/ocorrenciaSolicitarDados"),
  ocorrencia_taxa_extra:         require("../templates/email/ocorrenciaTaxaExtra"),
  ocorrencia_correcao_concluida: require("../templates/email/ocorrenciaCorrecaoConcluida"),
  ocorrencia_resolvida:          require("../templates/email/ocorrenciaResolvida"),
};

const whatsappTemplates = {
  confirmacao_pedido:            require("../templates/whatsapp/confirmacaoPedido"),
  pagamento_aprovado:            require("../templates/whatsapp/pagamentoAprovado"),
  pedido_enviado:                require("../templates/whatsapp/pedidoEnviado"),
  ocorrencia_confirmacao:        require("../templates/whatsapp/ocorrenciaConfirmacao"),
  ocorrencia_solicitar_dados:    require("../templates/whatsapp/ocorrenciaSolicitarDados"),
  ocorrencia_taxa_extra:         require("../templates/whatsapp/ocorrenciaTaxaExtra"),
  ocorrencia_correcao_concluida: require("../templates/whatsapp/ocorrenciaCorrecaoConcluida"),
  ocorrencia_resolvida:          require("../templates/whatsapp/ocorrenciaResolvida"),
};

// Mapa de tipoEvento → templateId (usado por dispararEventoComunicacao)
const EVENTO_TEMPLATE = {
  pedido_criado:      "confirmacao_pedido",
  pagamento_aprovado: "pagamento_aprovado",
  pedido_enviado:     "pedido_enviado",
};

// ---------------------------------------------------------------------------
// Helpers internos
// ---------------------------------------------------------------------------

function normalizarTelefone(valor) {
  if (!valor) return "";
  return String(valor).replace(/\D/g, "");
}

function buildEmail(templateId, pedido) {
  const fn = emailTemplates[templateId];
  if (!fn) {
    throw new AppError(
      "Template de e-mail não suportado.",
      ERROR_CODES.VALIDATION_ERROR,
      400
    );
  }
  return fn(pedido);
}

function buildWhatsapp(templateId, pedido) {
  const fn = whatsappTemplates[templateId];
  if (!fn) {
    throw new AppError(
      "Template de WhatsApp não suportado.",
      ERROR_CODES.VALIDATION_ERROR,
      400
    );
  }
  return fn(pedido);
}

/**
 * Persiste log de comunicação. Erros são silenciados para não interromper
 * o fluxo principal de envio.
 */
async function log(params) {
  try {
    await repo.insertLogComunicacao(params);
  } catch (err) {
    console.error("[comunicacao] Erro ao logar comunicação:", err);
  }
}

// ---------------------------------------------------------------------------
// Admin: envio manual com suporte a override de destino
// ---------------------------------------------------------------------------

/**
 * Envia e-mail transacional para um pedido via painel admin.
 * Retorna { statusEnvio, message } — nunca lança erro de envio (falhas são logadas).
 * Lança AppError para pedido não encontrado ou e-mail ausente.
 *
 * @param {string}      templateId    ID do template (ex: "confirmacao_pedido")
 * @param {number}      pedidoId
 * @param {string|null} emailOverride Endereço manual (sobrescreve o do cliente)
 * @returns {{ statusEnvio: string, message: string }}
 */
async function sendEmail(templateId, pedidoId, emailOverride) {
  const pedido = await repo.getPedidoBasico(pedidoId);
  if (!pedido) {
    throw new AppError("Pedido não encontrado.", ERROR_CODES.NOT_FOUND, 404);
  }

  const to = emailOverride || pedido.usuario_email;
  if (!to) {
    throw new AppError(
      "Cliente não possui e-mail cadastrado.",
      ERROR_CODES.VALIDATION_ERROR,
      400
    );
  }

  const { subject, html } = buildEmail(templateId, pedido);

  let statusEnvio = "sucesso";
  let erro = null;

  try {
    await sendTransactionalEmail(to, subject, html);
  } catch (e) {
    console.error("[comunicacao] Erro ao enviar e-mail:", e);
    statusEnvio = "erro";
    erro = String(e?.message || e);
  }

  await log({
    usuarioId: pedido.usuario_id,
    pedidoId: pedido.id,
    canal: "email",
    tipoTemplate: templateId,
    destino: to,
    assunto: subject,
    mensagem: html,
    statusEnvio,
    erro,
  });

  return {
    statusEnvio,
    message:
      statusEnvio === "sucesso"
        ? "E-mail enviado com sucesso."
        : "E-mail registrado, mas houve erro no envio.",
  };
}

/**
 * Envia mensagem de WhatsApp para um pedido via painel admin.
 * Retorna { statusEnvio, message } — nunca lança erro de envio (falhas são logadas).
 * Lança AppError para pedido não encontrado ou telefone ausente.
 *
 * @param {string}      templateId        ID do template
 * @param {number}      pedidoId
 * @param {string|null} telefoneOverride  Número manual (só dígitos, com DDD)
 * @returns {{ statusEnvio: string, message: string }}
 */
async function sendWhatsapp(templateId, pedidoId, telefoneOverride) {
  const pedido = await repo.getPedidoBasico(pedidoId);
  if (!pedido) {
    throw new AppError("Pedido não encontrado.", ERROR_CODES.NOT_FOUND, 404);
  }

  const destino = normalizarTelefone(telefoneOverride || pedido.usuario_telefone);
  if (!destino) {
    throw new AppError(
      "Cliente não possui telefone válido cadastrado.",
      ERROR_CODES.VALIDATION_ERROR,
      400
    );
  }

  const mensagem = buildWhatsapp(templateId, pedido);

  let statusEnvio = "sucesso";
  let erro = null;

  try {
    // Integração real com API de WhatsApp entraria aqui.
    logger.info({ destino, templateId }, "FAKE WHATSAPP — integração real não implementada");
  } catch (e) {
    console.error("[comunicacao] Erro ao enviar WhatsApp:", e);
    statusEnvio = "erro";
    erro = String(e?.message || e);
  }

  await log({
    usuarioId: pedido.usuario_id,
    pedidoId: pedido.id,
    canal: "whatsapp",
    tipoTemplate: templateId,
    destino,
    assunto: null,
    mensagem,
    statusEnvio,
    erro,
  });

  return {
    statusEnvio,
    message:
      statusEnvio === "sucesso"
        ? "WhatsApp enviado (ou simulado) com sucesso."
        : "WhatsApp registrado, mas houve erro no envio real.",
  };
}

// ---------------------------------------------------------------------------
// Interno: disparado por eventos de sistema (checkout, pagamento, entrega)
// ---------------------------------------------------------------------------

/**
 * Dispara comunicação automática por evento de negócio.
 * Nunca lança — falhas são logadas para não interromper o fluxo do chamador.
 *
 * @param {"pedido_criado"|"pagamento_aprovado"|"pedido_enviado"} tipoEvento
 * @param {number} pedidoId
 */
async function dispararEventoComunicacao(tipoEvento, pedidoId) {
  try {
    const pedido = await repo.getPedidoBasico(pedidoId);
    if (!pedido) {
      console.warn(
        `[comunicacao] Pedido ${pedidoId} não encontrado para evento ${tipoEvento}`
      );
      return;
    }

    const templateId = EVENTO_TEMPLATE[tipoEvento];
    if (!templateId) {
      console.warn("[comunicacao] tipoEvento não suportado:", tipoEvento);
      return;
    }

    // WhatsApp
    const destino = normalizarTelefone(pedido.usuario_telefone);
    if (destino) {
      const mensagem = buildWhatsapp(templateId, pedido);
      let statusEnvio = "sucesso";
      let erro = null;

      try {
        logger.info({ destino, templateId }, "FAKE WHATSAPP — integração real não implementada");
      } catch (e) {
        console.error("[comunicacao] Erro ao enviar WhatsApp:", e);
        statusEnvio = "erro";
        erro = String(e?.message || e);
      }

      await log({
        usuarioId: pedido.usuario_id,
        pedidoId: pedido.id,
        canal: "whatsapp",
        tipoTemplate: templateId,
        destino,
        assunto: null,
        mensagem,
        statusEnvio,
        erro,
      });
    }

    // E-mail
    if (pedido.usuario_email) {
      const { subject, html } = buildEmail(templateId, pedido);
      let statusEnvio = "sucesso";
      let erro = null;

      try {
        await sendTransactionalEmail(pedido.usuario_email, subject, html);
      } catch (e) {
        console.error("[comunicacao] Erro ao enviar e-mail:", e);
        statusEnvio = "erro";
        erro = String(e?.message || e);
      }

      await log({
        usuarioId: pedido.usuario_id,
        pedidoId: pedido.id,
        canal: "email",
        tipoTemplate: templateId,
        destino: pedido.usuario_email,
        assunto: subject,
        mensagem: html,
        statusEnvio,
        erro,
      });
    }
  } catch (err) {
    console.error(
      "[comunicacao] Erro geral ao disparar evento de comunicação:",
      err
    );
  }
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  sendEmail,
  sendWhatsapp,
  dispararEventoComunicacao,
};
