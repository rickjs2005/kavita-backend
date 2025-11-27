// routes/adminComunicacao.js
const express = require("express");
const router = express.Router();
const pool = require("../config/pool");
const verifyAdmin = require("../middleware/verifyAdmin");
const { sendTransactionalEmail } = require("../services/mailService");

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

// garante que total é number, mesmo vindo como string do MySQL
function getPedidoTotalNumber(pedido) {
  const n = Number(pedido.total ?? 0);
  if (Number.isNaN(n)) return 0;
  return n;
}

// -----------------------------------------------------------------------------
// Templates de E-MAIL
// -----------------------------------------------------------------------------

function buildEmailFromTemplate(templateId, pedido) {
  switch (templateId) {
    case "confirmacao_pedido": {
      const total = getPedidoTotalNumber(pedido);
      return {
        subject: `Kavita - Pedido #${pedido.id} recebido`,
        html: `
          <p>Olá ${pedido.usuario_nome},</p>
          <p>Recebemos o seu pedido <strong>#${pedido.id}</strong> no valor de <strong>R$ ${total.toFixed(
            2
          )}</strong>.</p>
          <p>Forma de pagamento: <strong>${pedido.forma_pagamento}</strong></p>
          <p>Você receberá novas atualizações assim que o pedido avançar.</p>
          <p>Equipe Kavita 🐄🌱</p>
        `,
      };
    }

    case "pagamento_aprovado": {
      const total = getPedidoTotalNumber(pedido);
      return {
        subject: `Kavita - Pagamento do pedido #${pedido.id} aprovado`,
        html: `
          <p>Olá ${pedido.usuario_nome},</p>
          <p>O pagamento do seu pedido <strong>#${pedido.id}</strong> foi aprovado 🎉.</p>
          <p>Valor: <strong>R$ ${total.toFixed(2)}</strong></p>
          <p>Agora vamos separar e preparar o envio.</p>
          <p>Equipe Kavita</p>
        `,
      };
    }

    case "pedido_enviado":
      return {
        subject: `Kavita - Seu pedido #${pedido.id} foi enviado`,
        html: `
          <p>Olá ${pedido.usuario_nome},</p>
          <p>O seu pedido <strong>#${pedido.id}</strong> já foi <strong>enviado</strong> 🚚.</p>
          <p>Status de entrega atual: <strong>${pedido.status_entrega}</strong></p>
          <p>Em breve ele chega até você.</p>
          <p>Equipe Kavita</p>
        `,
      };

    default:
      throw new Error("Template de e-mail não suportado.");
  }
}

// -----------------------------------------------------------------------------
// Templates de WHATSAPP
// -----------------------------------------------------------------------------

function buildWhatsappFromTemplate(templateId, pedido) {
  switch (templateId) {
    case "confirmacao_pedido": {
      const total = getPedidoTotalNumber(pedido);
      return `Olá ${
        pedido.usuario_nome
      }! Recebemos o seu pedido #${pedido.id} no valor de R$ ${total.toFixed(
        2
      )}. Assim que avançar, te avisamos aqui. Equipe Kavita.`;
    }

    case "pagamento_aprovado": {
      const total = getPedidoTotalNumber(pedido);
      return `Olá ${
        pedido.usuario_nome
      }! O pagamento do seu pedido #${pedido.id} foi aprovado 🎉. Valor: R$ ${total.toFixed(
        2
      )}. Vamos separar e já avisamos quando sair para entrega.`;
    }

    case "pedido_enviado":
      return `Olá ${pedido.usuario_nome}! Seu pedido #${pedido.id} foi enviado 🚚. Status de entrega: ${pedido.status_entrega}.`;

    default:
      throw new Error("Template de WhatsApp não suportado.");
  }
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
