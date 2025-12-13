const pool = require("../config/pool");
const { dispararEventoComunicacao } = require("../services/comunicacaoService");

const AppError = require("../errors/AppError");
const ERROR_CODES = require("../constants/ErrorCodes");

/**
 * Controller de Checkout
 *
 * - Cria um novo pedido.
 * - Atualiza dados básicos do usuário (nome, email, telefone, cpf).
 * - Valida estoque e atualiza quantity dos produtos.
 * - Integra com carrinhos abandonados.
 */
async function create(req, res, next) {
  const {
    formaPagamento,
    endereco,
    produtos,
    nome,
    cpf,
    telefone,
    email,
    cupom_codigo,
  } = req.body || {};

  const usuario_id = req.user && req.user.id;

  // Segurança extra (auth + payload)
  if (!usuario_id) {
    return next(
      new AppError(
        "Você precisa estar logado para finalizar o checkout.",
        ERROR_CODES.AUTH_ERROR,
        401
      )
    );
  }

  if (!Array.isArray(produtos) || produtos.length === 0) {
    return next(
      new AppError(
        "Dados de checkout inválidos.",
        ERROR_CODES.VALIDATION_ERROR,
        400
      )
    );
  }

  let connection;

  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    /* 1) Atualiza informações do usuário (não bloqueia pedido) */
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
      // não bloqueia o pedido
    }

    /* 2) Descobre carrinho aberto (não bloqueia pedido) */
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
        carrinhoAberto = rowsCarrinho[0];
      }
    } catch (err) {
      console.error("[checkout] Erro ao buscar carrinho aberto:", err);
    }

    /* 3) Cria pedido */
    const enderecoStr = JSON.stringify(endereco || {});

    const [pedidoIns] = await connection.query(
      `INSERT INTO pedidos (
        usuario_id,
        endereco,
        forma_pagamento,
        status,
        status_pagamento,
        status_entrega,
        total,
        data_pedido,
        pagamento_id
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), ?)`,
      [
        usuario_id,
        enderecoStr,
        formaPagamento,
        "pendente",
        "pendente",
        "em_separacao",
        0,
        null,
      ]
    );

    const pedidoId = pedidoIns.insertId;

    /* 4) Busca produtos para validar preço/estoque */
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

    /* 5) Insere itens e atualiza estoque */
    let totalPedido = 0;

    for (const item of produtos) {
      const produtoId = Number(item.id);
      const qtd = Number(item.quantidade || 0);

      if (!produtoId || !Number.isFinite(qtd) || qtd <= 0) {
        throw new AppError(
          "Produto inválido no checkout.",
          ERROR_CODES.VALIDATION_ERROR,
          400
        );
      }

      const info = mapProdutos[produtoId];
      if (!info) {
        throw new AppError(
          `Produto ${produtoId} não encontrado.`,
          ERROR_CODES.NOT_FOUND,
          404
        );
      }

      if (info.stock < qtd) {
        throw new AppError(
          `Estoque insuficiente para o produto ${produtoId}.`,
          ERROR_CODES.VALIDATION_ERROR,
          400
        );
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

    /* 6) Cupom (opcional) */
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
          throw new AppError(
            "Cupom inválido ou não encontrado.",
            ERROR_CODES.VALIDATION_ERROR,
            400
          );
        }

        const cupom = rowsCupom[0];

        if (!cupom.ativo) {
          throw new AppError(
            "Este cupom está inativo.",
            ERROR_CODES.VALIDATION_ERROR,
            400
          );
        }

        if (cupom.expiracao) {
          const agora = new Date();
          const exp = new Date(cupom.expiracao);
          if (exp.getTime() < agora.getTime()) {
            throw new AppError(
              "Este cupom está expirado.",
              ERROR_CODES.VALIDATION_ERROR,
              400
            );
          }
        }

        const usos = Number(cupom.usos || 0);
        const maxUsos =
          cupom.max_usos === null || cupom.max_usos === undefined
            ? null
            : Number(cupom.max_usos);

        if (maxUsos !== null && usos >= maxUsos) {
          throw new AppError(
            "Este cupom já atingiu o limite de usos.",
            ERROR_CODES.VALIDATION_ERROR,
            400
          );
        }

        const minimo = Number(cupom.minimo || 0);
        if (minimo > 0 && totalPedido < minimo) {
          throw new AppError(
            `Este cupom exige um valor mínimo de R$ ${minimo.toFixed(2)}.`,
            ERROR_CODES.VALIDATION_ERROR,
            400
          );
        }

        const valor = Number(cupom.valor || 0);
        let desconto = 0;

        if (cupom.tipo === "percentual") {
          desconto = (totalPedido * valor) / 100;
        } else {
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
          valor,
        };

        await connection.query("UPDATE cupons SET usos = usos + 1 WHERE id = ?", [
          cupom.id,
        ]);
      } catch (errCupom) {
        // Se já for AppError, respeita. Se não, vira erro interno de cupom
        if (errCupom instanceof AppError) throw errCupom;

        console.error("[checkout] Erro ao aplicar cupom:", errCupom);
        throw new AppError(
          "Erro ao aplicar o cupom de desconto.",
          ERROR_CODES.SERVER_ERROR,
          500
        );
      }
    }

    /* 7) Atualiza total do pedido */
    await connection.query("UPDATE pedidos SET total = ? WHERE id = ?", [
      totalFinal,
      pedidoId,
    ]);

    /* 8) Marca carrinho abandonado como recuperado (não bloqueia) */
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
      console.error("[checkout] Erro ao marcar carrinho como recuperado:", err);
    }

    /* 9) Commit */
    await connection.commit();

    /* 9.1) Comunicação (não bloqueia) */
    try {
      await dispararEventoComunicacao("pedido_criado", pedidoId);
    } catch (errCom) {
      console.error("[checkout] Erro ao disparar comunicação:", errCom);
    }

    /* 10) Fecha carrinho aberto (fora da transação, não bloqueia) */
    try {
      await pool.query(
        'UPDATE carrinhos SET status = "convertido" WHERE usuario_id = ? AND status = "aberto"',
        [usuario_id]
      );
    } catch (err) {
      console.error("[checkout] Erro ao fechar carrinho:", err);
    }

    /* 11) Resposta final */
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

    // Se já é AppError, repassa; se não, padroniza como SERVER_ERROR
    if (err instanceof AppError) {
      return next(err);
    }

    return next(
      new AppError(
        "Erro interno ao processar checkout.",
        ERROR_CODES.SERVER_ERROR,
        500
      )
    );
  } finally {
    if (connection) {
      connection.release();
    }
  }
}

module.exports = { create };
