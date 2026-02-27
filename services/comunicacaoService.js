// services/comunicacaoService.js
const pool = require("../config/pool");
const { sendTransactionalEmail } = require("./mailService");

/* ------------------------------------------------------------------ */
/*                               Helpers                              */
/* ------------------------------------------------------------------ */

// 🔧 busca os dados principais do pedido + cliente
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
      u.nome   AS usuario_nome,
      u.email  AS usuario_email,
      u.telefone AS usuario_telefone
    FROM pedidos p
    JOIN usuarios u ON u.id = p.usuario_id
    WHERE p.id = ?
  `,
    [pedidoId]
  );

  return pedido || null;
}

// 🔧 tabela de log (aquela comunicacoes_enviadas que combinamos)
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
    console.error("[comunicacao] Erro ao logar comunicação:", err);
  }
}

// 🔧 normaliza telefone (só dígitos)
function normalizarTelefone(valor) {
  if (!valor) return "";
  return String(valor).replace(/\D/g, "");
}

// ✅ normaliza valor monetário para 2 casas (evita toFixed em string/decimal)
function money2(v) {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n.toFixed(2) : "0.00";
}

/* ------------------------------------------------------------------ */
/*                          TEMPLATES - E-MAIL                         */
/* ------------------------------------------------------------------ */

function buildEmailFromTemplate(templateId, pedido) {
  const totalFmt = money2(pedido?.total);

  switch (templateId) {
    case "confirmacao_pedido":
      return {
        subject: `Kavita - Pedido #${pedido.id} recebido`,
        html: `
          <p>Olá ${pedido.usuario_nome},</p>
          <p>Recebemos o seu pedido <strong>#${pedido.id}</strong> no valor de <strong>R$ ${totalFmt}</strong>.</p>
          <p>Forma de pagamento: <strong>${pedido.forma_pagamento}</strong></p>
          <p>Você receberá novas atualizações assim que o pedido avançar.</p>
          <p>Equipe Kavita 🐄🌱</p>
        `,
      };

    case "pagamento_aprovado":
      return {
        subject: `Kavita - Pagamento do pedido #${pedido.id} aprovado`,
        html: `
          <p>Olá ${pedido.usuario_nome},</p>
          <p>O pagamento do seu pedido <strong>#${pedido.id}</strong> foi aprovado 🎉.</p>
          <p>Valor: <strong>R$ ${totalFmt}</strong></p>
          <p>Agora vamos separar e preparar o envio.</p>
          <p>Equipe Kavita</p>
        `,
      };

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

/* ------------------------------------------------------------------ */
/*                        TEMPLATES - WHATSAPP                         */
/* ------------------------------------------------------------------ */

function buildWhatsappFromTemplate(templateId, pedido) {
  const totalFmt = money2(pedido?.total);

  switch (templateId) {
    case "confirmacao_pedido":
      return `Olá ${pedido.usuario_nome}! Recebemos o seu pedido #${pedido.id} no valor de R$ ${totalFmt}. Assim que avançar, te aviso por aqui. Equipe Kavita.`;

    case "pagamento_aprovado":
      return `Olá ${pedido.usuario_nome}! O pagamento do seu pedido #${pedido.id} foi aprovado 🎉. Vamos separar e já te avisamos quando sair para entrega.`;

    case "pedido_enviado":
      return `Olá ${pedido.usuario_nome}! Seu pedido #${pedido.id} foi enviado 🚚. Status de entrega: ${pedido.status_entrega}. Qualquer dúvida é só responder.`;

    default:
      throw new Error("Template de WhatsApp não suportado.");
  }
}

/* ------------------------------------------------------------------ */
/*                     ENVIO UNITÁRIO (e-mail/whats)                   */
/* ------------------------------------------------------------------ */

async function enviarEmailTemplate(templateId, pedido) {
  const to = pedido.usuario_email;
  if (!to) return; // sem e-mail, só ignora

  const { subject, html } = buildEmailFromTemplate(templateId, pedido);

  let statusEnvio = "sucesso";
  let erro = null;

  try {
    await sendTransactionalEmail(to, subject, html);
  } catch (e) {
    console.error("[comunicacao] Erro ao enviar e-mail:", e);
    statusEnvio = "erro";
    erro = String(e?.message || e);
  }

  await logComunicacao({
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
}

async function enviarWhatsappTemplate(templateId, pedido) {
  const telefone = normalizarTelefone(pedido.usuario_telefone);
  if (!telefone) return; // sem telefone, ignora

  const mensagem = buildWhatsappFromTemplate(templateId, pedido);

  let statusEnvio = "sucesso";
  let erro = null;

  try {
    // Aqui entra a integração real com a API de WhatsApp (Cloud API, Z-API etc.)
    // Exemplo por enquanto:
    console.log(`[FAKE WHATSAPP] Enviando mensagem para 55${telefone}: ${mensagem}`);
  } catch (e) {
    console.error("[comunicacao] Erro ao enviar WhatsApp:", e);
    statusEnvio = "erro";
    erro = String(e?.message || e);
  }

  await logComunicacao({
    usuarioId: pedido.usuario_id,
    pedidoId: pedido.id,
    canal: "whatsapp",
    tipoTemplate: templateId,
    destino: telefone,
    assunto: null,
    mensagem,
    statusEnvio,
    erro,
  });
}

/* ------------------------------------------------------------------ */
/*                    FUNÇÃO PRINCIPAL DE EVENTO                       */
/* ------------------------------------------------------------------ */
/**
 * tipoEvento:
 *  - "pedido_criado"
 *  - "pagamento_aprovado"
 *  - "pedido_enviado"
 */
async function dispararEventoComunicacao(tipoEvento, pedidoId) {
  try {
    const pedido = await carregarPedidoBasico(pedidoId);
    if (!pedido) {
      console.warn(
        `[comunicacao] Pedido ${pedidoId} não encontrado para evento ${tipoEvento}`
      );
      return;
    }

    switch (tipoEvento) {
      case "pedido_criado":
        // foco no WhatsApp + e-mail se tiver
        await enviarWhatsappTemplate("confirmacao_pedido", pedido);
        await enviarEmailTemplate("confirmacao_pedido", pedido);
        break;

      case "pagamento_aprovado":
        await enviarWhatsappTemplate("pagamento_aprovado", pedido);
        await enviarEmailTemplate("pagamento_aprovado", pedido);
        break;

      case "pedido_enviado":
        await enviarWhatsappTemplate("pedido_enviado", pedido);
        await enviarEmailTemplate("pedido_enviado", pedido);
        break;

      default:
        console.warn("[comunicacao] tipoEvento não suportado:", tipoEvento);
    }
  } catch (err) {
    console.error(
      "[comunicacao] Erro geral ao disparar evento de comunicação:",
      err
    );
  }
}

module.exports = {
  dispararEventoComunicacao,
};
