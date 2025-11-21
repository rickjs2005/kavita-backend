const pool = require("../config/pool");

/**
 * Cria um novo pedido a partir do checkout.
 * Espera no body:
 * {
 *   usuario_id,
 *   formaPagamento,
 *   endereco,
 *   produtos,
 *   nome,
 *   cpf,
 *   telefone,
 *   email
 * }
 */
async function create(req, res, next) {
  // agora também recebemos nome / cpf / telefone / email
  const {
    usuario_id,
    formaPagamento,
    endereco,
    produtos,
    nome,
    cpf,
    telefone,
    email,
  } = req.body;

  try {
    // Serializa o endereço fornecido (ou objeto vazio) para JSON
    const enderecoStr = JSON.stringify(endereco || {});

    // Abre uma conexão separada para a transação
    const connection = await pool.getConnection();
    try {
      // Inicia a transação para garantir que todas as operações ocorram de forma atômica
      await connection.beginTransaction();

      /**
       * 1) Atualiza dados básicos do usuário (fonte oficial para o admin)
       *    – isso garante que adminPedidos (JOIN usuarios) enxergue
       *      telefone e cpf preenchidos, se vierem do checkout.
       */
      if (usuario_id) {
        const campos = [];
        const valores = [];

        // nome
        if (nome && String(nome).trim()) {
          campos.push("nome = ?");
          valores.push(String(nome).trim());
        }

        // email
        if (email && String(email).trim()) {
          campos.push("email = ?");
          valores.push(String(email).trim());
        }

        // telefone (salvamos só dígitos)
        if (telefone && String(telefone).trim()) {
          const telDigits = String(telefone).replace(/\D/g, "");
          if (telDigits) {
            campos.push("telefone = ?");
            valores.push(telDigits);
          }
        }

        // cpf (também apenas dígitos)
        if (cpf && String(cpf).trim()) {
          const cpfDigits = String(cpf).replace(/\D/g, "");
          if (cpfDigits) {
            campos.push("cpf = ?");
            valores.push(cpfDigits);
          }
        }

        if (campos.length > 0) {
          await connection.query(
            `UPDATE usuarios SET ${campos.join(", ")} WHERE id = ?`,
            [...valores, usuario_id]
          );
        }
      }

      /**
       * 2) Cria o pedido
       *
       * Mantemos a coluna antiga `status` como 'pendente' para compatibilidade,
       * mas o fluxo novo usa status_pagamento / status_entrega.
       */
      const [pedidoIns] = await connection.query(
        `INSERT INTO pedidos (
            usuario_id,
            endereco,
            forma_pagamento,
            status,             -- legado (pode ser removido no futuro)
            status_pagamento,   -- novo: financeiro
            status_entrega,     -- novo: logístico
            total,
            data_pedido,
            pagamento_id
         )
         VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), ?)`,
        [
          usuario_id,
          enderecoStr,
          formaPagamento,
          "pendente", // legado
          "pendente", // aguardando pagamento
          "em_separacao", // pedido criado, aguardando preparação
          0,
          null,
        ]
      );
      const pedidoId = pedidoIns.insertId;

      /**
       * 3) Calcula o total do pedido e insere os itens
       */
      let totalPedido = 0;
      if (Array.isArray(produtos) && produtos.length > 0) {
        // Extrai todos os IDs dos produtos do checkout
        const ids = produtos.map((p) => Number(p.id));

        // Busca preço e estoque atual dos produtos para evitar corrida de condições
        const [prodRows] = await connection.query(
          `SELECT id, price, quantity FROM products WHERE id IN (?) FOR UPDATE`,
          [ids]
        );

        // Mapeia dados por ID para acesso rápido
        const priceMap = {};
        prodRows.forEach((r) => {
          priceMap[Number(r.id)] = {
            price: Number(r.price),
            stock: Number(r.quantity),
          };
        });

        // Percorre cada item do pedido
        for (const item of produtos) {
          const produtoId = Number(item.id);
          const qtd = Number(item.quantidade || 0);

          if (!produtoId || !Number.isFinite(qtd) || qtd <= 0) {
            throw new Error("Produto inválido no checkout");
          }

          const info = priceMap[produtoId];
          if (!info) {
            throw new Error(`Produto ${produtoId} não encontrado`);
          }

          const valorUnitario = info.price;

          // Verifica se há estoque suficiente
          if (info.stock < qtd) {
            throw new Error(
              `Estoque insuficiente para o produto ${produtoId}`
            );
          }

          // Insere item na tabela pedidos_produtos com o preço atual
          await connection.query(
            `INSERT INTO pedidos_produtos (pedido_id, produto_id, quantidade, valor_unitario)
             VALUES (?, ?, ?, ?)`,
            [pedidoId, produtoId, qtd, valorUnitario]
          );

          // Atualiza o estoque do produto
          await connection.query(
            `UPDATE products SET quantity = quantity - ? WHERE id = ?`,
            [qtd, produtoId]
          );

          totalPedido += valorUnitario * qtd;
        }
      }

      // Atualiza o total do pedido no próprio registro
      await connection.query(
        `UPDATE pedidos SET total = ? WHERE id = ?`,
        [totalPedido, pedidoId]
      );

      // Finaliza transação
      await connection.commit();

      return res.status(201).json({
        success: true,
        message: "Pedido criado com sucesso",
        pedido_id: pedidoId,
        total: totalPedido,
      });
    } catch (err) {
      // Reverte a transação em caso de erro
      await connection.rollback();
      return next(err);
    } finally {
      connection.release();
    }
  } catch (err) {
    return next(err);
  }
}

module.exports = { create };
