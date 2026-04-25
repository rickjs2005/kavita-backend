"use strict";
// controllers/comunicacaoController.js
//
// Extrai dados de req, delega ao service, responde com lib/response.js.
// Consumidor: routes/admin/adminComunicacao.js

const { response } = require("../lib");
const AppError = require("../errors/AppError");
const ERROR_CODES = require("../constants/ErrorCodes");
const service = require("../services/comunicacaoService");
const repo = require("../repositories/comunicacaoRepository");
const { buildWaMeLink, normalizePhoneBR } = require("../lib/waLink");

// Templates do ciclo de vida do pedido — usados também para o preview
// de link wa.me. Mantém em sincronia com EVENTO_TEMPLATE no service.
const PEDIDO_TEMPLATES = new Set([
  "confirmacao_pedido",
  "pagamento_aprovado",
  "pedido_em_separacao",
  "pedido_enviado",
  "pedido_entregue",
  "pedido_cancelado",
]);

/**
 * Templates disponíveis para o painel admin.
 * O ID é o contrato entre frontend e service.
 */
const TEMPLATE_DEFINITIONS = [
  {
    id: "confirmacao_pedido",
    nome: "Pedido recebido",
    descricao: "Confirmação enviada após o cliente finalizar o pedido.",
    canais: ["whatsapp", "email"],
    categoria: "pedido",
  },
  {
    id: "pagamento_aprovado",
    nome: "Pagamento aprovado",
    descricao: "Aviso quando o pagamento foi confirmado.",
    canais: ["whatsapp", "email"],
    categoria: "pedido",
  },
  {
    id: "pedido_em_separacao",
    nome: "Pedido em separação",
    descricao: "Aviso quando começamos a separar os produtos.",
    canais: ["whatsapp", "email"],
    categoria: "pedido",
  },
  {
    id: "pedido_enviado",
    nome: "Pedido enviado",
    descricao: "Aviso quando o pedido sai para entrega.",
    canais: ["whatsapp", "email"],
    categoria: "pedido",
  },
  {
    id: "pedido_entregue",
    nome: "Pedido entregue",
    descricao: "Confirmação de entrega na propriedade.",
    canais: ["whatsapp", "email"],
    categoria: "pedido",
  },
  {
    id: "pedido_cancelado",
    nome: "Pedido cancelado",
    descricao: "Aviso quando o pedido é cancelado.",
    canais: ["whatsapp", "email"],
    categoria: "pedido",
  },
  {
    id: "ocorrencia_confirmacao",
    nome: "Confirmar recebimento da solicitação",
    descricao: "Informa que a solicitação de correção de endereço foi recebida.",
    canais: ["email", "whatsapp"],
    categoria: "ocorrencia",
  },
  {
    id: "ocorrencia_solicitar_dados",
    nome: "Solicitar dados do endereço",
    descricao: "Pede ao cliente os dados corretos de entrega.",
    canais: ["email", "whatsapp"],
    categoria: "ocorrencia",
  },
  {
    id: "ocorrencia_taxa_extra",
    nome: "Informar possível taxa extra",
    descricao: "Avisa que a alteração pode gerar custo adicional.",
    canais: ["email", "whatsapp"],
    categoria: "ocorrencia",
  },
  {
    id: "ocorrencia_correcao_concluida",
    nome: "Correção de endereço concluída",
    descricao: "Confirma que o endereço foi corrigido com sucesso.",
    canais: ["email", "whatsapp"],
    categoria: "ocorrencia",
  },
  {
    id: "ocorrencia_resolvida",
    nome: "Ocorrência resolvida",
    descricao: "Notifica que a solicitação foi resolvida.",
    canais: ["email", "whatsapp"],
    categoria: "ocorrencia",
  },
];

// ---------------------------------------------------------------------------
// GET /api/admin/comunicacao/templates
// ---------------------------------------------------------------------------

/**
 * @openapi
 * /api/admin/comunicacao/templates:
 *   get:
 *     tags: [Admin - Comunicação]
 *     summary: Lista templates disponíveis para email e WhatsApp
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de templates
 *       401:
 *         description: Não autorizado
 */
const listTemplates = (_req, res) => {
  response.ok(res, TEMPLATE_DEFINITIONS);
};

// ---------------------------------------------------------------------------
// POST /api/admin/comunicacao/email
// ---------------------------------------------------------------------------

/**
 * @openapi
 * /api/admin/comunicacao/email:
 *   post:
 *     tags: [Admin - Comunicação]
 *     summary: Envia um e-mail transacional baseado em template
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [template, pedidoId]
 *             properties:
 *               template:
 *                 type: string
 *                 enum: [confirmacao_pedido, pagamento_aprovado, pedido_enviado]
 *               pedidoId:
 *                 type: integer
 *               emailOverride:
 *                 type: string
 *                 format: email
 *                 description: E-mail manual para sobrescrever o do cliente (opcional)
 *     responses:
 *       200:
 *         description: E-mail enviado ou registrado com falha
 *       400:
 *         description: Dados inválidos
 *       401:
 *         description: Não autorizado
 *       404:
 *         description: Pedido não encontrado
 *       500:
 *         description: Erro interno
 */
const enviarEmail = async (req, res, next) => {
  try {
    const { template, pedidoId, emailOverride } = req.body;
    const result = await service.sendEmail(template, pedidoId, emailOverride || null);
    response.ok(res, result, result.message);
  } catch (err) {
    next(err);
  }
};

// ---------------------------------------------------------------------------
// POST /api/admin/comunicacao/whatsapp
// ---------------------------------------------------------------------------

/**
 * @openapi
 * /api/admin/comunicacao/whatsapp:
 *   post:
 *     tags: [Admin - Comunicação]
 *     summary: Envia uma mensagem de WhatsApp baseada em template
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [template, pedidoId]
 *             properties:
 *               template:
 *                 type: string
 *                 enum: [confirmacao_pedido, pagamento_aprovado, pedido_enviado]
 *               pedidoId:
 *                 type: integer
 *               telefoneOverride:
 *                 type: string
 *                 description: Telefone manual com DDD (só dígitos, 10 ou 11 dígitos)
 *     responses:
 *       200:
 *         description: Mensagem enviada ou registrada com falha
 *       400:
 *         description: Dados inválidos
 *       401:
 *         description: Não autorizado
 *       404:
 *         description: Pedido não encontrado
 *       500:
 *         description: Erro interno
 */
const enviarWhatsapp = async (req, res, next) => {
  try {
    const { template, pedidoId, telefoneOverride } = req.body;
    const result = await service.sendWhatsapp(template, pedidoId, telefoneOverride || null);
    response.ok(res, result, result.message);
  } catch (err) {
    next(err);
  }
};

// ---------------------------------------------------------------------------
// GET /api/admin/comunicacao/whatsapp/preview?pedidoId=X&template=Y
// ---------------------------------------------------------------------------
// Retorna o link wa.me + mensagem renderizada para o admin clicar e
// enviar via app. Não envia nada — só prepara. Útil quando o operador
// quer revisar o texto antes de mandar.
const previewWhatsapp = async (req, res, next) => {
  try {
    const pedidoId = Number(req.query.pedidoId);
    const template = String(req.query.template || "");
    const telefoneOverride = req.query.telefoneOverride
      ? String(req.query.telefoneOverride)
      : null;

    if (!Number.isInteger(pedidoId) || pedidoId <= 0) {
      throw new AppError(
        "pedidoId deve ser um inteiro positivo.",
        ERROR_CODES.VALIDATION_ERROR,
        400,
      );
    }
    if (!PEDIDO_TEMPLATES.has(template)) {
      throw new AppError(
        "template do ciclo de vida do pedido é obrigatório.",
        ERROR_CODES.VALIDATION_ERROR,
        400,
      );
    }

    const pedido = await repo.getPedidoBasico(pedidoId);
    if (!pedido) {
      throw new AppError("Pedido não encontrado.", ERROR_CODES.NOT_FOUND, 404);
    }

    // Reusa o template do service via require dinâmico — o controller
    // não conhece o mapa de templates, mantém wiring leve.
    const buildWhatsapp = require(`../templates/whatsapp/${camelize(template)}`);
    const mensagem = buildWhatsapp(pedido);

    const telefoneRaw = telefoneOverride || pedido.usuario_telefone;
    const telefone = normalizePhoneBR(telefoneRaw);
    const url = telefone ? buildWaMeLink({ telefone, mensagem }) : null;

    const jaEnviado = await repo.jaEnviado({
      pedidoId,
      tipoTemplate: template,
      canal: "whatsapp",
    });

    return response.ok(res, {
      template,
      pedidoId,
      mensagem,
      telefone,
      url,
      jaEnviado,
      provider: service.getWhatsappProvider(),
    });
  } catch (err) {
    next(err);
  }
};

// Helper local: converte snake_case em camelCase para resolver o nome
// do arquivo de template. Ex: "pedido_em_separacao" → "pedidoEmSeparacao".
function camelize(snake) {
  return snake.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

// ---------------------------------------------------------------------------
// GET /api/admin/comunicacao/logs/:pedidoId
// ---------------------------------------------------------------------------
// Histórico das comunicações enviadas (ou link wa.me gerado) para um
// pedido. Painel admin lista isso para mostrar ao operador o que já
// foi disparado e o que ele ainda precisa enviar manualmente.
const listLogsPorPedido = async (req, res, next) => {
  try {
    const pedidoId = Number(req.params.pedidoId);
    if (!Number.isInteger(pedidoId) || pedidoId <= 0) {
      throw new AppError(
        "pedidoId deve ser um inteiro positivo.",
        ERROR_CODES.VALIDATION_ERROR,
        400,
      );
    }
    const logs = await repo.listarPorPedido(pedidoId);
    return response.ok(res, logs);
  } catch (err) {
    next(err);
  }
};

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  listTemplates,
  enviarEmail,
  enviarWhatsapp,
  previewWhatsapp,
  listLogsPorPedido,
};
