const pool = require("../config/pool");
const { dispararEventoComunicacao } = require("../services/comunicacaoService");

const AppError = require("../errors/AppError");
const ERROR_CODES = require("../constants/ErrorCodes");

function isFormaPagamentoValida(value) {
  const s = String(value || "").trim().toLowerCase();
  if (!s) return false;

  if (s === "pix") return true;
  if (s === "boleto") return true;
  if (s === "mercadopago") return true;
  if (s.includes("cart") && s.includes("mercado")) return true;
  if (s === "prazo") return true;

  return false;
}

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

  // ✅ Defesa extra: se alguém burlar a validação do router, não cria pedido "sem pagamento"
  if (!isFormaPagamentoValida(formaPagamento)) {
    return next(
      new AppError(
        "Forma de pagamento inválida. Use: Pix, Boleto, Cartão (Mercado Pago) ou Prazo.",
        ERROR_CODES.VALIDATION_ERROR,
        400
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
  let lockAcquired = false;

  try {
    connection = await pool.getConnection();

    /* 0) Lock de idempotência: serializa checkouts simultâneos do mesmo usuário.
     *    GET_LOCK é um advisory lock MySQL global por nome.
     *    Timeout de 5 s: se outra transação do mesmo usuário não liberar em 5 s,
     *    retorna 409 (cenário de latência extrema, não do caso normal).       */
    const lockName = `kavita_checkout_${usuario_id}`;
    const [[lockRow]] = await connection.query(
      "SELECT GET_LOCK(?, 5) AS ok",
      [lockName]
    );
    lockAcquired = lockRow?.ok === 1;

    if (!lockAcquired) {
      return next(
        new AppError(
          "Outro checkout está em andamento para esta conta. Aguarde alguns segundos e tente novamente.",
          ERROR_CODES.VALIDATION_ERROR,
          409
        )
      );
    }

    await connection.beginTransaction();

    /* 1) Atualiza informações do usuário (não bloqueia pedido) */
    // ✅ FIX: email removido do update — é credencial de login, não deve ser alterado
    // no checkout. Alterações de email devem passar por endpoint de perfil com confirmação.
    try {
      const campos = [];
      const valores = [];

      if (nome && String(nome).trim()) {
        campos.push("nome = ?");
        valores.push(String(nome).trim());
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

    /* 2.5) Deduplicação por composição: impede double submit com mesma lista de produtos.
     *
     *  Fingerprint: ids+quantidades ordenados → string comparável.
     *  Janela de 2 min cobre latência alta, duplo clique e retry automático.
     *  O GET_LOCK (passo 0) já garante que apenas uma transação deste usuário
     *  chega aqui de cada vez, então o SELECT lê o estado já commitado da
     *  transação anterior, sem race condition.                                */
    const prodFingerprint = [...produtos]
      .map((p) => `${Number(p.id)}:${Number(p.quantidade || 0)}`)
      .sort()
      .join(",");

    const [recentOrders] = await connection.query(
      `SELECT pp.pedido_id,
              GROUP_CONCAT(
                CONCAT(pp.produto_id, ':', pp.quantidade)
                ORDER BY pp.produto_id SEPARATOR ','
              ) AS composicao
         FROM pedidos_produtos pp
         JOIN pedidos p ON p.id = pp.pedido_id
        WHERE p.usuario_id      = ?
          AND p.status          = 'pendente'
          AND p.status_pagamento = 'pendente'
          AND p.data_pedido     >= NOW() - INTERVAL 2 MINUTE
        GROUP BY pp.pedido_id`,
      [usuario_id]
    );

    const pedidoDuplicado = recentOrders.find(
      (row) => row.composicao === prodFingerprint
    );

    if (pedidoDuplicado) {
      await connection.rollback();
      return res.status(200).json({
        success: true,
        message: "Pedido já registrado.",
        pedido_id: pedidoDuplicado.pedido_id,
        nota_fiscal_aviso: "Nota fiscal será entregue junto com o produto.",
        idempotente: true,
      });
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
        formaPagamento, // mantém exatamente como já estava (não quebra lógica atual)
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

    /*
     * Regra de preço do sistema:
     *   products.price  = preço de tabela (nunca alterado pela promoção).
     *   product_promotions.final_price = preço efetivo de venda quando há promoção ativa.
     *   O checkout usa final_price se existir promoção ativa, caso contrário products.price.
     *   O cupom incide sobre esse subtotal pós-promoção.
     *   A mesma fórmula de final_price é usada em publicPromocoes.js e preview-cupom.
     */

    /* 4.1) Busca promoções ativas para os produtos do pedido */
    const [promoRows] = await connection.query(
      `SELECT
         pp.product_id,
         CAST(
           CASE
             WHEN pp.promo_price IS NOT NULL
               THEN pp.promo_price
             WHEN pp.discount_percent IS NOT NULL
               THEN p.price - (p.price * (pp.discount_percent / 100))
             ELSE p.price
           END
         AS DECIMAL(10,2)) AS final_price
       FROM product_promotions pp
       JOIN products p ON p.id = pp.product_id
       WHERE pp.product_id IN (?)
         AND pp.is_active = 1
         AND (pp.start_at IS NULL OR pp.start_at <= NOW())
         AND (pp.end_at   IS NULL OR pp.end_at   >= NOW())`,
      [ids]
    );

    // product_id → final_price (promoção ativa)
    const mapPromocoes = {};
    promoRows.forEach((row) => {
      mapPromocoes[Number(row.product_id)] = Number(row.final_price);
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

      // Usa final_price da promoção ativa; caso não haja promoção, usa preço de tabela.
      const valorUnitario = mapPromocoes[produtoId] ?? info.price;

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

    /* 7.1) Persiste dados de frete dentro da transação (antes do commit) */
    await connection.query(
      `UPDATE pedidos
          SET shipping_price        = ?,
              shipping_rule_applied = ?,
              shipping_prazo_dias   = ?,
              shipping_cep          = ?
        WHERE id = ?`,
      [
        Number(req.body.shipping_price ?? 0),
        String(req.body.shipping_rule_applied ?? "ZONE"),
        req.body.shipping_prazo_dias == null ? null : Number(req.body.shipping_prazo_dias),
        req.body.shipping_cep == null ? null : String(req.body.shipping_cep),
        pedidoId,
      ]
    );

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
      nota_fiscal_aviso: "Nota fiscal será entregue junto com o produto.",
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
      // RELEASE_LOCK deve ser chamado ANTES de connection.release() para não
      // vazar o lock no pool (o lock MySQL é por conexão; release() não o libera).
      if (lockAcquired) {
        await connection
          .query("SELECT RELEASE_LOCK(?)", [`kavita_checkout_${usuario_id}`])
          .catch(() => {});
      }
      connection.release();
    }
  }
}

module.exports = { create };
