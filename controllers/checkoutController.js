const pool = require("../config/pool");
const { dispararEventoComunicacao } = require("../services/comunicacaoService");

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
    cupom_codigo, // <-- NOVO: código do cupom enviado pelo front
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
    /* 6.1) Aplicar cupom de desconto (opcional)                          */
    /* ------------------------------------------------------------------ */

    let totalFinal = totalPedido;
    let descontoTotal = 0;
    let cupomAplicado = null;

    if (cupom_codigo && String(cupom_codigo).trim()) {
      const codigo = String(cupom_codigo).trim();

      try {
        const [rowsCupom] = await connection.query(
          `
            SELECT id, codigo, tipo, valor, minimo, expiracao, usos, max_usos, ativo
            FROM cupons
            WHERE codigo = ?
            LIMIT 1
            FOR UPDATE
          `,
          [codigo]
        );

        if (!rowsCupom || rowsCupom.length === 0) {
          await connection.rollback();
          return res.status(400).json({
            success: false,
            message: "Cupom inválido ou não encontrado.",
          });
        }

        const cupom = rowsCupom[0];

        if (!cupom.ativo) {
          await connection.rollback();
          return res.status(400).json({
            success: false,
            message: "Este cupom está inativo.",
          });
        }

        if (cupom.expiracao) {
          const agora = new Date();
          const exp = new Date(cupom.expiracao);
          if (exp.getTime() < agora.getTime()) {
            await connection.rollback();
            return res.status(400).json({
              success: false,
              message: "Este cupom está expirado.",
            });
          }
        }

        const usos = Number(cupom.usos || 0);
        const maxUsos =
          cupom.max_usos === null || cupom.max_usos === undefined
            ? null
            : Number(cupom.max_usos);

        if (maxUsos !== null && usos >= maxUsos) {
          await connection.rollback();
          return res.status(400).json({
            success: false,
            message: "Este cupom já atingiu o limite de usos.",
          });
        }

        const minimo = Number(cupom.minimo || 0);
        if (minimo > 0 && totalPedido < minimo) {
          await connection.rollback();
          return res.status(400).json({
            success: false,
            message: `Este cupom exige um valor mínimo de R$ ${minimo.toFixed(
              2
            )}.`,
          });
        }

        const valor = Number(cupom.valor || 0);
        let desconto = 0;

        if (cupom.tipo === "percentual") {
          desconto = (totalPedido * valor) / 100;
        } else {
          // tipo "valor" (desconto fixo em R$)
          desconto = valor;
        }

        if (desconto < 0) desconto = 0;
        if (desconto > totalPedido) desconto = totalPedido;

        descontoTotal = desconto;
        totalFinal = totalPedido - descontoTotal;

        cupomAplicado = {
          id: cupom.id,
          codigo: cupom.codigo,
          tipo: cupom.tipo,
          valor: valor,
        };

        // incrementa usos do cupom
        await connection.query(
          "UPDATE cupons SET usos = usos + 1 WHERE id = ?",
          [cupom.id]
        );
      } catch (errCupom) {
        console.error("[checkout] Erro ao aplicar cupom:", errCupom);
        await connection.rollback();
        return res.status(500).json({
          success: false,
          message: "Erro ao aplicar o cupom de desconto.",
        });
      }
    }

    /* ------------------------------------------------------------------ */
    /* 6) Atualiza total do pedido (já com desconto, se houver)           */
    /* ------------------------------------------------------------------ */

    await connection.query("UPDATE pedidos SET total = ? WHERE id = ?", [
      totalFinal,
      pedidoId,
    ]);

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

    // ------------------------------------------------------
    // 8.1) Dispara comunicação automática de "pedido criado"
    //     (não quebra o fluxo se der erro)
    // ------------------------------------------------------
    try {
      await dispararEventoComunicacao("pedido_criado", pedidoId);
    } catch (errCom) {
      console.error(
        "[checkout] Erro ao disparar comunicação de pedido criado:",
        errCom
      );
    }

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
      total: totalFinal,
      total_sem_desconto: totalPedido,
      desconto_total: descontoTotal,
      cupom_aplicado: cupomAplicado,
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
