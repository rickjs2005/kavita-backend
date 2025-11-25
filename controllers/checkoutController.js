const pool = require("../config/pool");

/**
 * Controller de Checkout
 *
 * - Cria um novo pedido.
 * - Atualiza dados básicos do usuário (nome, email, telefone, cpf).
 * - Valida estoque e atualiza quantity dos produtos.
 * - Integra com o sistema de carrinhos abandonados:
 *   - Se existir um carrinho "aberto" para o usuário, tenta marcar
 *     esse carrinho como "recuperado" na tabela `carrinhos_abandonados`.
 */
async function create(req, res) {
  const {
    usuario_id,
    formaPagamento,
    endereco,
    produtos,
    nome,
    cpf,
    telefone,
    email,
  } = req.body || {};

  // Segurança extra: se por algum motivo não vier nada, evita quebrar
  if (!usuario_id || !Array.isArray(produtos) || produtos.length === 0) {
    return res.status(400).json({
      success: false,
      message: "Dados de checkout inválidos.",
    });
  }

  let connection;

  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    /* ------------------------------------------------------------------ */
    /* 1) (Opcional) Atualiza informações do usuário (CRM básico)         */
    /* ------------------------------------------------------------------ */

    try {
      const campos = [];
      const valores = [];

      if (nome && String(nome).trim()) {
        campos.push("nome = ?");
        valores.push(String(nome).trim());
      }

      if (email && String(email).trim()) {
        campos.push("email = ?");
        valores.push(String(email).trim());
      }

      if (telefone && String(telefone).trim()) {
        const telDigits = String(telefone).replace(/\D/g, "");
        if (telDigits) {
          campos.push("telefone = ?");
          valores.push(telDigits);
        }
      }

      if (cpf && String(cpf).trim()) {
        const cpfDigits = String(cpf).replace(/\D/g, "");
        if (cpfDigits) {
          // aqui você poderia limitar para 11 dígitos, se quiser ser mais rígido
          // const normalizado = cpfDigits.slice(0, 11);
          // valores.push(normalizado);
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
    } catch (err) {
      console.error("[checkout] Erro ao atualizar dados do usuário:", err);
      // não damos throw aqui para não impedir o pedido;
      // se preferir ser mais rígido, pode lançar o erro.
    }

    /* ------------------------------------------------------------------ */
    /* 2) (Novo) Descobre um carrinho aberto do usuário, se existir       */
    /* ------------------------------------------------------------------ */

    let carrinhoAberto = null;

    try {
      const [rowsCarrinho] = await connection.query(
        `
          SELECT id
          FROM carrinhos
          WHERE usuario_id = ? AND status = "aberto"
          ORDER BY id DESC
          LIMIT 1
        `,
        [usuario_id]
      );

      if (rowsCarrinho && rowsCarrinho.length > 0) {
        carrinhoAberto = rowsCarrinho[0]; // { id: ... }
      }
    } catch (err) {
      console.error(
        "[checkout] Erro ao buscar carrinho aberto do usuário:",
        err
      );
      // não bloqueia o fluxo do pedido
    }

    /* ------------------------------------------------------------------ */
    /* 3) Cria o pedido (registro principal)                              */
    /* ------------------------------------------------------------------ */

    const enderecoStr = JSON.stringify(endereco || {});

    const [pedidoIns] = await connection.query(
      `INSERT INTO pedidos (
        usuario_id,
        endereco,
        forma_pagamento,
        status,             -- legado
        status_pagamento,   -- financeiro
        status_entrega,     -- logístico
        total,
        data_pedido,
        pagamento_id
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), ?)`,
      [
        usuario_id,
        enderecoStr,
        formaPagamento,
        "pendente",      // coluna antiga
        "pendente",      // aguardando pagamento
        "em_separacao",  // fluxo logístico
        0,               // total será atualizado depois
        null,            // pagamento_id (pode receber id do MP futuramente)
      ]
    );

    const pedidoId = pedidoIns.insertId;

    /* ------------------------------------------------------------------ */
    /* 4) Busca os produtos no banco para validar preço e estoque         */
    /* ------------------------------------------------------------------ */

    const ids = produtos.map((p) => Number(p.id));
    const [prodRows] = await connection.query(
      "SELECT id, price, quantity FROM products WHERE id IN (?) FOR UPDATE",
      [ids]
    );

    const mapProdutos = {};
    prodRows.forEach((row) => {
      mapProdutos[Number(row.id)] = {
        price: Number(row.price),
        stock: Number(row.quantity),
      };
    });

    /* ------------------------------------------------------------------ */
    /* 5) Insere itens do pedido e atualiza estoque                       */
    /* ------------------------------------------------------------------ */

    let totalPedido = 0;

    for (const item of produtos) {
      const produtoId = Number(item.id);
      const qtd = Number(item.quantidade || 0);

      if (!produtoId || !Number.isFinite(qtd) || qtd <= 0) {
        await connection.rollback();
        return res.status(400).json({
          success: false,
          message: "Produto inválido no checkout.",
        });
      }

      const info = mapProdutos[produtoId];
      if (!info) {
        await connection.rollback();
        return res.status(400).json({
          success: false,
          message: `Produto ${produtoId} não encontrado.`,
        });
      }

      if (info.stock < qtd) {
        await connection.rollback();
        return res.status(400).json({
          success: false,
          message: `Estoque insuficiente para o produto ${produtoId}.`,
        });
      }

      const valorUnitario = info.price;

      await connection.query(
        `INSERT INTO pedidos_produtos (pedido_id, produto_id, quantidade, valor_unitario)
         VALUES (?, ?, ?, ?)`,
        [pedidoId, produtoId, qtd, valorUnitario]
      );

      await connection.query(
        "UPDATE products SET quantity = quantity - ? WHERE id = ?",
        [qtd, produtoId]
      );

      totalPedido += valorUnitario * qtd;
    }

    /* ------------------------------------------------------------------ */
    /* 6) Atualiza total do pedido                                        */
    /* ------------------------------------------------------------------ */

    await connection.query(
      "UPDATE pedidos SET total = ? WHERE id = ?",
      [totalPedido, pedidoId]
    );

    /* ------------------------------------------------------------------ */
    /* 7) Integração com carrinhos_abandonados                            */
    /*    - Se houver um carrinho aberto para o usuário e ele estiver     */
    /*      registrado em carrinhos_abandonados, marcamos como            */
    /*      recuperado = 1.                                               */
    /* ------------------------------------------------------------------ */

    try {
      if (carrinhoAberto && carrinhoAberto.id) {
        await connection.query(
          `
            UPDATE carrinhos_abandonados
            SET recuperado = 1,
                atualizado_em = NOW()
            WHERE carrinho_id = ?
          `,
          [carrinhoAberto.id]
        );
      }
    } catch (err) {
      console.error(
        "[checkout] Erro ao marcar carrinho abandonado como recuperado:",
        err
      );
      // não impede o pedido; se der erro aqui, apenas não marca como recuperado
    }

    /* ------------------------------------------------------------------ */
    /* 8) Commit na transação principal                                   */
    /* ------------------------------------------------------------------ */

    await connection.commit();

    /* ------------------------------------------------------------------ */
    /* 9) Fora da transação: fecha qualquer carrinho aberto desse usuário */
    /*    (comportamento antigo preservado)                               */
    /* ------------------------------------------------------------------ */

    try {
      await pool.query(
       'UPDATE carrinhos SET status = "convertido" WHERE usuario_id = ? AND status = "aberto"',
        [usuario_id]
      );
    } catch (err) {
      console.error("[checkout] Erro ao fechar carrinho após checkout:", err);
      // não lançamos erro aqui para não quebrar a resposta
    }

    /* ------------------------------------------------------------------ */
    /* 10) Resposta final                                                 */
    /* ------------------------------------------------------------------ */

    return res.status(201).json({
      success: true,
      message: "Pedido criado com sucesso",
      pedido_id: pedidoId,
      total: totalPedido,
    });
  } catch (err) {
    console.error("[checkout] Erro geral no checkout:", err);

    if (connection) {
      try {
        await connection.rollback();
      } catch (rollbackErr) {
        console.error("[checkout] Erro ao dar rollback:", rollbackErr);
      }
    }

    return res.status(500).json({
      success: false,
      message: "Erro interno ao processar checkout.",
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
}

module.exports = { create };
