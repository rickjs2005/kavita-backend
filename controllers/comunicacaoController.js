"use strict";
// controllers/comunicacaoController.js
//
// Extrai dados de req, delega ao service, responde com lib/response.js.
// Consumidor: routes/admin/adminComunicacao.js

const { response } = require("../lib");
const service = require("../services/comunicacaoService");

/**
 * Templates disponíveis para o painel admin.
 * O ID é o contrato entre frontend e service.
 */
const TEMPLATE_DEFINITIONS = [
  {
    id: "confirmacao_pedido",
    nome: "Confirmação de pedido",
    descricao: "Enviado após o cliente finalizar o pedido.",
    canais: ["email", "whatsapp"],
  },
  {
    id: "pagamento_aprovado",
    nome: "Pagamento aprovado",
    descricao: "Confirmação de pagamento após aprovação.",
    canais: ["email", "whatsapp"],
  },
  {
    id: "pedido_enviado",
    nome: "Pedido enviado",
    descricao: "Atualização quando o pedido sai para entrega.",
    canais: ["email", "whatsapp"],
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
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  listTemplates,
  enviarEmail,
  enviarWhatsapp,
};
