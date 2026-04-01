// =============================================================================
// ARQUIVO LEGADO — NÃO USE COMO REFERÊNCIA DE IMPLEMENTAÇÃO
// =============================================================================
// Este arquivo usa o padrão antigo: SQL inline na rota, validação manual
// e res.json() direto, sem controller/service/repository separados.
//
// Padrão canônico atual:
//   rota magra → controller → service → repository  (+  Zod em schemas/)
//   Referência: routes/admin/adminDrones.js
//
// Ao modificar este arquivo:
//   - prefira migrar para o padrão canônico na mesma PR
//   - se a mudança for pontual, adicione ou atualize o teste correspondente
//   - nunca amplie o padrão legado com novas rotas neste arquivo
// =============================================================================

// routes/adminComunicacao.js
const express = require("express");
const router = express.Router();
const pool = require("../../../config/pool");
const verifyAdmin = require("../../../middleware/verifyAdmin");
const { sendTransactionalEmail } = require("../../../services/mailService");

/**
 * Templates disponíveis para o painel admin.
 * IMPORTANTE: o ID do template é o que o front e outros serviços usam.
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
];

/**
 * @openapi
 * tags:
 *   - name: Admin - Comunicação
 *     description: Envio de e-mails e WhatsApp pelo painel admin
 */

/**
 * @openapi
 * components:
 *   schemas:
 *     ComunicacaoTemplate:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           example: "confirmacao_pedido"
 *         nome:
 *           type: string
 *           example: "Confirmação de pedido"
 *         descricao:
 *           type: string
 *           example: "Enviado após o cliente finalizar o pedido."
 *         canais:
 *           type: array
 *           items:
 *             type: string
 *             enum: [email, whatsapp]
 */

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
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/ComunicacaoTemplate'
 */
router.get("/templates", verifyAdmin, (req, res) => {
  res.json(TEMPLATE_DEFINITIONS);
});

// -----------------------------------------------------------------------------
// Funções auxiliares
// -----------------------------------------------------------------------------

async function carregarPedidoBasico(pedidoId) {
  const [[pedido]] = await pool.query(
    `
    SELECT
      p.id,
      p.usuario_id,
      p.total,
      p.status_pagamento,
      p.status_entrega,
      p.forma_pagamento,
      p.data_pedido,
      u.nome      AS usuario_nome,
      u.email     AS usuario_email,
      u.telefone  AS usuario_telefone
    FROM pedidos p
    JOIN usuarios u ON u.id = p.usuario_id
    WHERE p.id = ?
  `,
    [pedidoId]
  );

  return pedido || null;
}

async function logComunicacao({
  usuarioId,
  pedidoId,
  canal,
  tipoTemplate,
  destino,
  assunto,
  mensagem,
  statusEnvio,
  erro,
}) {
  try {
    await pool.query(
      `
      INSERT INTO comunicacoes_enviadas
        (usuario_id, pedido_id, canal, tipo_template, destino, assunto, mensagem, status_envio, erro)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
      [
        usuarioId || null,
        pedidoId || null,
        canal,
        tipoTemplate,
        destino,
        assunto || null,
        mensagem,
        statusEnvio,
        erro || null,
      ]
    );
  } catch (err) {
    console.error("[adminComunicacao] Erro ao logar comunicação:", err);
  }
}

function normalizarTelefone(valor) {
  if (!valor) return "";
  return String(valor).replace(/\D/g, "");
}

// -----------------------------------------------------------------------------
// Templates de E-MAIL — extraídos para templates/email/
// -----------------------------------------------------------------------------

const emailTemplates = {
  confirmacao_pedido: require("../../../templates/email/confirmacaoPedido"),
  pagamento_aprovado: require("../../../templates/email/pagamentoAprovado"),
  pedido_enviado:     require("../../../templates/email/pedidoEnviado"),
};

function buildEmailFromTemplate(templateId, pedido) {
  const builder = emailTemplates[templateId];
  if (!builder) throw new Error("Template de e-mail não suportado.");
  return builder(pedido);
}

// -----------------------------------------------------------------------------
// Templates de WHATSAPP — extraídos para templates/whatsapp/
// -----------------------------------------------------------------------------

const whatsappTemplates = {
  confirmacao_pedido: require("../../../templates/whatsapp/confirmacaoPedido"),
  pagamento_aprovado: require("../../../templates/whatsapp/pagamentoAprovado"),
  pedido_enviado:     require("../../../templates/whatsapp/pedidoEnviado"),
};

function buildWhatsappFromTemplate(templateId, pedido) {
  const builder = whatsappTemplates[templateId];
  if (!builder) throw new Error("Template de WhatsApp não suportado.");
  return builder(pedido);
}

// -----------------------------------------------------------------------------
// Rotas
// -----------------------------------------------------------------------------

/**
 * @openapi
 * /api/admin/comunicacao/email:
 *   post:
 *     tags: [Admin - Comunicação]
 *     summary: Envia um email transacional baseado em template
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               template:
 *                 type: string
 *                 enum: [confirmacao_pedido, pagamento_aprovado, pedido_enviado]
 *               pedidoId:
 *                 type: integer
 *               emailOverride:
 *                 type: string
 *                 description: E-mail manual para sobrescrever o do cliente (opcional)
 *     responses:
 *       200:
 *         description: Email enviado ou registrado
 *       400:
 *         description: Dados inválidos
 *       404:
 *         description: Pedido não encontrado
 *       500:
 *         description: Erro interno
 */
router.post("/email", verifyAdmin, async (req, res) => {
  const { template, pedidoId, emailOverride } = req.body || {};

  if (!template || !pedidoId) {
    return res
      .status(400)
      .json({ message: "template e pedidoId são obrigatórios." });
  }

  try {
    const pedido = await carregarPedidoBasico(pedidoId);

    if (!pedido) {
      return res.status(404).json({ message: "Pedido não encontrado." });
    }

    const to = emailOverride || pedido.usuario_email;
    if (!to) {
      return res
        .status(400)
        .json({ message: "Cliente não possui e-mail cadastrado." });
    }

    const { subject, html } = buildEmailFromTemplate(template, pedido);

    let statusEnvio = "sucesso";
    let erro = null;

    try {
      await sendTransactionalEmail(to, subject, html);
    } catch (e) {
      console.error("[adminComunicacao] Erro ao enviar e-mail:", e);
      statusEnvio = "erro";
      erro = String(e?.message || e);
    }

    await logComunicacao({
      usuarioId: pedido.usuario_id,
      pedidoId: pedido.id,
      canal: "email",
      tipoTemplate: template,
      destino: to,
      assunto: subject,
      mensagem: html,
      statusEnvio,
      erro,
    });

    return res.json({
      message:
        statusEnvio === "sucesso"
          ? "E-mail enviado com sucesso."
          : "E-mail registrado, mas houve erro no envio.",
      statusEnvio,
    });
  } catch (err) {
    console.error("[adminComunicacao] Erro em /email:", err);
    return res
      .status(500)
      .json({ message: "Erro ao enviar e-mail de comunicação." });
  }
});

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
 *             properties:
 *               template:
 *                 type: string
 *                 enum: [confirmacao_pedido, pagamento_aprovado, pedido_enviado]
 *               pedidoId:
 *                 type: integer
 *               telefoneOverride:
 *                 type: string
 *                 description: Telefone manual (apenas dígitos, com DDD)
 *     responses:
 *       200:
 *         description: Mensagem registrada/enviada
 *       400:
 *         description: Dados inválidos
 *       404:
 *         description: Pedido não encontrado
 *       500:
 *         description: Erro interno
 */
router.post("/whatsapp", verifyAdmin, async (req, res) => {
  const { template, pedidoId, telefoneOverride } = req.body || {};

  if (!template || !pedidoId) {
    return res
      .status(400)
      .json({ message: "template e pedidoId são obrigatórios." });
  }

  try {
    const pedido = await carregarPedidoBasico(pedidoId);

    if (!pedido) {
      return res.status(404).json({ message: "Pedido não encontrado." });
    }

    const telefoneCliente = normalizarTelefone(pedido.usuario_telefone);
    const destino = normalizarTelefone(telefoneOverride || telefoneCliente);

    if (!destino) {
      return res.status(400).json({
        message: "Cliente não possui telefone válido cadastrado.",
      });
    }

    const mensagem = buildWhatsappFromTemplate(template, pedido);

    let statusEnvio = "sucesso";
    let erro = null;

    try {
      // Integração real com API de WhatsApp entraria aqui.
      console.log(
        "[FAKE WHATSAPP] Enviando para 55" + destino + ": " + mensagem
      );
    } catch (e) {
      console.error("[adminComunicacao] Erro ao enviar WhatsApp:", e);
      statusEnvio = "erro";
      erro = String(e?.message || e);
    }

    await logComunicacao({
      usuarioId: pedido.usuario_id,
      pedidoId: pedido.id,
      canal: "whatsapp",
      tipoTemplate: template,
      destino,
      assunto: null,
      mensagem,
      statusEnvio,
      erro,
    });

    return res.json({
      message:
        statusEnvio === "sucesso"
          ? "WhatsApp enviado (ou simulado) com sucesso."
          : "WhatsApp registrado, mas houve erro no envio real.",
      statusEnvio,
    });
  } catch (err) {
    console.error("[adminComunicacao] Erro em /whatsapp:", err);
    return res.status(500).json({
      message: "Erro ao enviar mensagem de WhatsApp de comunicação.",
    });
  }
});

module.exports = router;
