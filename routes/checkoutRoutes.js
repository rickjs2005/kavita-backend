const express = require("express");
const pool = require("../config/pool"); // Conexão com o banco de dados MySQL
const axios = require("axios"); // Pode ser usado para enviar mensagens no WhatsApp
const router = express.Router();

// 📦 POST /api/checkout — Registra um novo pedido no banco
router.post("/", async (req, res) => {
  console.log("🔔 [POST] /api/checkout foi acionada!");

  // Desestrutura os dados esperados no corpo da requisição
  const {
    usuario_id,        // ID do usuário que está fazendo o pedido
    endereco,          // Objeto contendo logradouro, cidade, número, etc.
    formaPagamento,    // Exemplo: "Pix", "Cartão", "Dinheiro"
    produtos,          // Lista de produtos comprados com quantidade
  } = req.body;

  // Valida se todos os campos obrigatórios foram enviados
  if (!usuario_id || !endereco || !formaPagamento || !produtos) {
    console.warn("⚠️ Campos obrigatórios ausentes no corpo da requisição.");
    return res.status(400).json({ message: "Todos os campos são obrigatórios" });
  }

  const connection = await pool.getConnection(); // Pega uma conexão do pool

  try {
    await connection.beginTransaction(); // Inicia transação para garantir integridade do pedido

    // 🔸 Insere o pedido na tabela principal
    const [pedidoResult] = await connection.query(
      "INSERT INTO pedidos (usuario_id, endereco, forma_pagamento) VALUES (?, ?, ?)",
      [usuario_id, JSON.stringify(endereco), formaPagamento]
    );

    const pedidoId = pedidoResult.insertId; // Pega o ID do pedido recém-criado

    // 🔸 Insere os itens do pedido na tabela de ligação pedidos_produtos
    for (const produto of produtos) {
      await connection.query(
        "INSERT INTO pedidos_produtos (pedido_id, produto_id, quantidade) VALUES (?, ?, ?)",
        [pedidoId, produto.id, produto.quantidade]
      );
    }

    await connection.commit(); // Finaliza a transação com sucesso
    console.log(`✅ Pedido #${pedidoId} salvo com sucesso no banco de dados!`);

    // 💬 Mensagem de confirmação (opcional: envio para WhatsApp)
    const mensagem = `📦 *Novo Pedido Confirmado!* \n\n🛒 Pedido ID: ${pedidoId}\n📍 Endereço: ${endereco.logradouro}, ${endereco.numero} - ${endereco.cidade}\n💳 Pagamento: ${formaPagamento}\n\n✅ Seu pedido foi registrado!`;

    // (Comentado) Exemplo de integração com API do WhatsApp:
    /*
    await axios.post("https://api.whatsapp.com/send", {
      to: "+55SEUNUMERO",
      message: mensagem,
    });
    */

    res.status(201).json({ message: "Pedido registrado com sucesso!" });
  } catch (error) {
    await connection.rollback(); // Se algo falhar, desfaz tudo
    console.error("❌ Erro ao salvar pedido:", error);
    res.status(500).json({ message: "Erro ao processar o pedido" });
  } finally {
    connection.release(); // Libera a conexão para ser usada novamente
  }
});

module.exports = router; // Exporta o roteador para ser usado na aplicação principal
