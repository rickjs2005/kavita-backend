"use strict";
// services/comunicacaoService.js
//
// Regras de negócio para envio de comunicações transacionais.
//
// Após B1 da auditoria (2026-04-24), WhatsApp passou a ser o canal
// principal de notificação ao cliente — o público rural usa muito
// mais WhatsApp do que e-mail. E-mail continua como canal secundário
// e segue funcionando normalmente.
//
// Arquitetura:
//   - WhatsApp via services/whatsapp (adapter pattern manual|api).
//     Modo padrão "manual" gera link wa.me que o admin clica e envia
//     pelo próprio app. Quando WhatsApp Business Cloud for homologado,
//     basta setar WHATSAPP_PROVIDER=api.
//   - Anti-duplicação: dispararEventoComunicacao consulta jaEnviado()
//     antes de gerar log/mensagem. Webhook MP duplicado, admin que
//     muda status manualmente várias vezes, etc., não geram spam.
//   - Idempotência por (pedido_id, tipo_template, canal). Para reenviar
//     de propósito, use sendWhatsapp/sendEmail diretamente do admin —
//     essas funções pulam o guard.
//
// Consumidores:
//   - controllers/comunicacaoController.js  (admin: envio manual)
//   - services/checkoutNotificationService.js (evento pedido_criado)
//   - services/orderService.js              (vários eventos de status)
//   - services/paymentWebhookService.js     (pagamento aprovado por webhook)

const { sendTransactionalEmail } = require("./mailService");
const { sendWhatsapp: sendWhatsappRaw, getProvider } = require("./whatsapp");
const AppError = require("../errors/AppError");
const ERROR_CODES = require("../constants/ErrorCodes");
const repo = require("../repositories/comunicacaoRepository");
const logger = require("../lib/logger");

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

const emailTemplates = {
  confirmacao_pedido:            require("../templates/email/confirmacaoPedido"),
  pagamento_aprovado:            require("../templates/email/pagamentoAprovado"),
  pedido_em_separacao:           require("../templates/email/pedidoEmSeparacao"),
  pedido_enviado:                require("../templates/email/pedidoEnviado"),
  pedido_entregue:               require("../templates/email/pedidoEntregue"),
  pedido_cancelado:              require("../templates/email/pedidoCancelado"),
  ocorrencia_confirmacao:        require("../templates/email/ocorrenciaConfirmacao"),
  ocorrencia_solicitar_dados:    require("../templates/email/ocorrenciaSolicitarDados"),
  ocorrencia_taxa_extra:         require("../templates/email/ocorrenciaTaxaExtra"),
  ocorrencia_correcao_concluida: require("../templates/email/ocorrenciaCorrecaoConcluida"),
  ocorrencia_resolvida:          require("../templates/email/ocorrenciaResolvida"),
};

const whatsappTemplates = {
  confirmacao_pedido:            require("../templates/whatsapp/confirmacaoPedido"),
  pagamento_aprovado:            require("../templates/whatsapp/pagamentoAprovado"),
  pedido_em_separacao:           require("../templates/whatsapp/pedidoEmSeparacao"),
  pedido_enviado:                require("../templates/whatsapp/pedidoEnviado"),
  pedido_entregue:               require("../templates/whatsapp/pedidoEntregue"),
  pedido_cancelado:              require("../templates/whatsapp/pedidoCancelado"),
  ocorrencia_confirmacao:        require("../templates/whatsapp/ocorrenciaConfirmacao"),
  ocorrencia_solicitar_dados:    require("../templates/whatsapp/ocorrenciaSolicitarDados"),
  ocorrencia_taxa_extra:         require("../templates/whatsapp/ocorrenciaTaxaExtra"),
  ocorrencia_correcao_concluida: require("../templates/whatsapp/ocorrenciaCorrecaoConcluida"),
  ocorrencia_resolvida:          require("../templates/whatsapp/ocorrenciaResolvida"),
};

// Mapa de tipoEvento → templateId. Os 6 eventos do ciclo de vida do
// pedido são todos cobertos. Eventos de ocorrência seguem o mapa antigo.
const EVENTO_TEMPLATE = {
  // Ciclo de vida do pedido (B1)
  pedido_criado:        "confirmacao_pedido",
  pagamento_aprovado:   "pagamento_aprovado",
  pedido_em_separacao:  "pedido_em_separacao",
  pedido_enviado:       "pedido_enviado",
  pedido_entregue:      "pedido_entregue",
  pedido_cancelado:     "pedido_cancelado",
  // Ocorrências de endereço/correção
  ocorrencia_criada:             "ocorrencia_confirmacao",
  ocorrencia_aguardando_retorno: "ocorrencia_solicitar_dados",
  ocorrencia_resolvida:          "ocorrencia_resolvida",
};

// ---------------------------------------------------------------------------
// Helpers internos
// ---------------------------------------------------------------------------

function buildEmail(templateId, pedido) {
  const fn = emailTemplates[templateId];
  if (!fn) {
    throw new AppError(
      "Template de e-mail não suportado.",
      ERROR_CODES.VALIDATION_ERROR,
      400,
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
      400,
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
    logger.warn({ err, params }, "comunicacao.log.persist_failed");
  }
}

// ---------------------------------------------------------------------------
// Admin: envio manual com suporte a override de destino
// (sem anti-duplicação — admin sabe o que está fazendo ao reenviar)
// ---------------------------------------------------------------------------

/**
 * Envia e-mail transacional para um pedido via painel admin.
 * Retorna { statusEnvio, message } — nunca lança erro de envio.
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
      400,
    );
  }

  const { subject, html } = buildEmail(templateId, pedido);

  let statusEnvio = "sucesso";
  let erro = null;

  try {
    await sendTransactionalEmail(to, subject, html);
  } catch (e) {
    logger.error({ err: e, pedidoId, to }, "comunicacao.email.send_failed");
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
 * Em modo manual, retorna o link wa.me no campo `url` do resultado para
 * o admin abrir no app. Em modo api (futuro), envia diretamente.
 */
async function sendWhatsapp(templateId, pedidoId, telefoneOverride) {
  const pedido = await repo.getPedidoBasico(pedidoId);
  if (!pedido) {
    throw new AppError("Pedido não encontrado.", ERROR_CODES.NOT_FOUND, 404);
  }

  const telefone = telefoneOverride || pedido.usuario_telefone;
  const mensagem = buildWhatsapp(templateId, pedido);

  const result = await sendWhatsappRaw({ telefone, mensagem });

  if (result.status === "error" && !result.destino) {
    // Telefone realmente inválido — propaga 400 pro admin saber.
    throw new AppError(
      "Cliente não possui telefone válido cadastrado.",
      ERROR_CODES.VALIDATION_ERROR,
      400,
    );
  }

  // Mapa do status do adapter pro enum da tabela
  const statusEnvio =
    result.status === "sent" ? "sucesso"
    : result.status === "manual_pending" ? "manual_pending"
    : "erro";

  await log({
    usuarioId: pedido.usuario_id,
    pedidoId: pedido.id,
    canal: "whatsapp",
    tipoTemplate: templateId,
    destino: result.destino,
    assunto: null,
    mensagem,
    statusEnvio,
    erro: result.erro,
  });

  return {
    statusEnvio,
    provider: result.provider,
    url: result.url,           // link wa.me (modo manual) ou null
    message:
      statusEnvio === "sucesso" ? "WhatsApp enviado com sucesso."
      : statusEnvio === "manual_pending" ? "Link de WhatsApp gerado — abra no painel para enviar."
      : "WhatsApp registrado, mas houve erro no envio.",
  };
}

// ---------------------------------------------------------------------------
// Interno: disparado por eventos de sistema com anti-duplicação
// ---------------------------------------------------------------------------

/**
 * Dispara comunicação automática por evento de negócio. Nunca lança.
 *
 * WhatsApp é o canal principal — sempre tentado primeiro se o cliente
 * tem telefone. E-mail vai como complemento se houver endereço.
 *
 * Anti-duplicação: se já existe log de envio (sucesso ou manual_pending)
 * para o mesmo (pedido, template, canal), o reenvio é silenciosamente
 * pulado. Webhook MP que chega 2x não gera duas mensagens; admin que
 * marca status "enviado" e depois "entregue" e volta pra "enviado"
 * também não duplica.
 *
 * Eventos suportados (ciclo de vida do pedido):
 *   pedido_criado, pagamento_aprovado, pedido_em_separacao,
 *   pedido_enviado, pedido_entregue, pedido_cancelado.
 *
 * @param {string} tipoEvento
 * @param {number} pedidoId
 */
async function dispararEventoComunicacao(tipoEvento, pedidoId) {
  try {
    const pedido = await repo.getPedidoBasico(pedidoId);
    if (!pedido) {
      logger.warn({ pedidoId, tipoEvento }, "comunicacao.evento.pedido_not_found");
      return;
    }

    const templateId = EVENTO_TEMPLATE[tipoEvento];
    if (!templateId) {
      logger.warn({ tipoEvento }, "comunicacao.evento.unsupported");
      return;
    }

    // ── WhatsApp (canal principal) ─────────────────────────────────
    if (pedido.usuario_telefone) {
      const dup = await repo.jaEnviado({
        pedidoId: pedido.id,
        tipoTemplate: templateId,
        canal: "whatsapp",
      });
      if (dup) {
        logger.info(
          { pedidoId, templateId, canal: "whatsapp" },
          "comunicacao.evento.skip_duplicate",
        );
      } else {
        const mensagem = buildWhatsapp(templateId, pedido);
        const result = await sendWhatsappRaw({
          telefone: pedido.usuario_telefone,
          mensagem,
        });
        const statusEnvio =
          result.status === "sent" ? "sucesso"
          : result.status === "manual_pending" ? "manual_pending"
          : "erro";
        await log({
          usuarioId: pedido.usuario_id,
          pedidoId: pedido.id,
          canal: "whatsapp",
          tipoTemplate: templateId,
          destino: result.destino || "",
          assunto: null,
          mensagem,
          statusEnvio,
          erro: result.erro,
        });
      }
    }

    // ── E-mail (complementar) ──────────────────────────────────────
    if (pedido.usuario_email) {
      const dup = await repo.jaEnviado({
        pedidoId: pedido.id,
        tipoTemplate: templateId,
        canal: "email",
      });
      if (dup) {
        logger.info(
          { pedidoId, templateId, canal: "email" },
          "comunicacao.evento.skip_duplicate",
        );
      } else {
        const { subject, html } = buildEmail(templateId, pedido);
        let statusEnvio = "sucesso";
        let erro = null;

        try {
          await sendTransactionalEmail(pedido.usuario_email, subject, html);
        } catch (e) {
          logger.error({ err: e, pedidoId }, "comunicacao.email.send_failed");
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
    }
  } catch (err) {
    // Nunca propaga — comunicação não pode quebrar o fluxo de pedido.
    logger.error(
      { err, pedidoId, tipoEvento },
      "comunicacao.evento.unexpected_error",
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
  // expostos pra testes/admin checar configuração atual
  getWhatsappProvider: getProvider,
  EVENTO_TEMPLATE,
};
