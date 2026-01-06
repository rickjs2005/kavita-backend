const express = require("express");
const router = express.Router();
const pool = require("../config/pool");
const controller = require("../controllers/checkoutController");
const authenticateToken = require("../middleware/authenticateToken");
const AppError = require("../errors/AppError");
const ERROR_CODES = require("../constants/ErrorCodes");
const { getQuote, parseCep, normalizeItems } = require("../services/shippingQuoteService");

/* ------------------------------------------------------------------ */
/*                               Swagger                              */
/* ------------------------------------------------------------------ */

/**
 * @openapi
 * tags:
 *   - name: Checkout
 *     description: Criação de pedidos no e-commerce
 */

/**
 * @openapi
 * components:
 *   schemas:
 *     CheckoutProduto:
 *       type: object
 *       required:
 *         - id
 *         - quantidade
 *       properties:
 *         id:
 *           type: integer
 *           example: 1
 *         quantidade:
 *           type: integer
 *           example: 2
 *
 *     Endereco:
 *       type: object
 *       required:
 *         - cep
 *         - rua
 *         - numero
 *         - bairro
 *         - cidade
 *         - estado
 *       properties:
 *         cep:
 *           type: string
 *           example: "36940000"
 *         rua:
 *           type: string
 *           example: "Rua das Flores"
 *         numero:
 *           type: string
 *           example: "288"
 *         bairro:
 *           type: string
 *           example: "Centro"
 *         cidade:
 *           type: string
 *           example: "Manhuaçu"
 *         estado:
 *           type: string
 *           example: "MG"
 *         complemento:
 *           type: string
 *           example: "Perto da pracinha"
 *
 *     CheckoutBody:
 *       type: object
 *       required:
 *         - formaPagamento
 *         - endereco
 *         - produtos
 *       properties:
 *         formaPagamento:
 *           type: string
 *           enum: [pix, boleto, mercadopago, prazo]
 *           example: pix
 *         endereco:
 *           $ref: "#/components/schemas/Endereco"
 *         produtos:
 *           type: array
 *           items:
 *             $ref: "#/components/schemas/CheckoutProduto"
 *         total:
 *           type: number
 *           example: 1890.88
 *         cupom_codigo:
 *           type: string
 *           nullable: true
 *           example: "PROMO10"
 *           description: Código de cupom de desconto a ser aplicado no pedido.
 *
 *     CheckoutResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           example: true
 *         message:
 *           type: string
 *           example: "Pedido criado com sucesso"
 *         pedido_id:
 *           type: integer
 *           example: 123
 *         total:
 *           type: number
 *           example: 150.5
 *         total_sem_desconto:
 *           type: number
 *           nullable: true
 *         desconto_total:
 *           type: number
 *           nullable: true
 *         cupom_aplicado:
 *           type: object
 *           nullable: true
 *           properties:
 *             id:
 *               type: integer
 *             codigo:
 *               type: string
 *             tipo:
 *               type: string
 *             valor:
 *               type: number
 */

/**
 * @openapi
 * /api/checkout:
 *   post:
 *     summary: Cria um novo pedido
 *     description: |
 *       Cria um pedido a partir do carrinho do usuário autenticado.
 *
 *       Regras de segurança (obrigatório):
 *       - O backend recalcula o frete com o mesmo motor do quote (zona/faixa CEP + frete grátis por produto).
 *       - NÃO confia em frete enviado pelo frontend.
 *       - Salva no pedido: shipping_price, shipping_rule_applied, shipping_prazo_dias, shipping_cep.
 *
 *       - Valida estoque e estrutura dos dados do checkout.
 *       - Usa SEMPRE o `id` vindo do token JWT (cookie HttpOnly ou Bearer).
 *       - Dentro do controller de checkout, após a criação do pedido,
 *         o carrinho aberto associado pode ser marcado como **recuperado**
 *         na tabela `carrinhos_abandonados`.
 *       - Opcionalmente, aplica um **cupom de desconto** informado em `cupom_codigo`.
 *     tags:
 *       - Checkout
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: "#/components/schemas/CheckoutBody"
 *     responses:
 *       201:
 *         description: Pedido criado com sucesso
 *       400:
 *         description: Erro de validação ou estoque insuficiente
 *       401:
 *         description: Usuário não autenticado
 *       500:
 *         description: Erro interno do servidor
 */

/* ------------------------------------------------------------------ */
/*                           Validação básica                         */
/* ------------------------------------------------------------------ */

function validateCheckoutBody(req, _res, next) {
  const { endereco, produtos } = req.body || {};
  const errors = [];

  // usuário vem exclusivamente do token
  const usuarioIdFromToken = req.user?.id;

  if (!usuarioIdFromToken) {
    return next(
      new AppError(
        "Usuário não autenticado para realizar o checkout.",
        ERROR_CODES.AUTH_ERROR,
        401
      )
    );
  }

  if (!endereco) {
    errors.push("endereco é obrigatório.");
  } else {
    ["cep", "rua", "numero", "bairro", "cidade", "estado"].forEach((campo) => {
      if (!endereco[campo]) errors.push(`endereco.${campo} é obrigatório.`);
    });
  }

  if (!Array.isArray(produtos) || produtos.length === 0) {
    errors.push("produtos deve ser um array com ao menos um item.");
  } else {
    produtos.forEach((p, i) => {
      if (!p.id) errors.push(`produtos[${i}].id é obrigatório.`);
      if (!Number.isInteger(p.quantidade) || p.quantidade <= 0) {
        errors.push(
          `produtos[${i}].quantidade deve ser um inteiro maior que zero.`
        );
      }
    });
  }

  if (errors.length > 0) {
    return next(
      new AppError(errors.join(" "), ERROR_CODES.VALIDATION_ERROR, 400)
    );
  }

  // compatibilidade com controller/logs (deprecated)
  if (!req.body) req.body = {};
  req.body.usuario_id = usuarioIdFromToken;

  return next();
}

/* ------------------------------------------------------------------ */
/*                 Resolve o handler do controller                     */
/* ------------------------------------------------------------------ */

let checkoutHandler;

if (typeof controller === "function") {
  checkoutHandler = controller;
} else if (controller && typeof controller.create === "function") {
  checkoutHandler = controller.create;
} else {
  checkoutHandler = (_req, _res, next) => {
    console.error(
      "[checkoutRoutes] checkoutController não configurado corretamente. Esperado função ou { create }."
    );
    return next(
      new AppError(
        "Checkout não está configurado corretamente no servidor.",
        ERROR_CODES.SERVER_ERROR,
        500
      )
    );
  };
}

/* ------------------------------------------------------------------ */
/*                Frete: fonte da verdade (via service)                */
/* ------------------------------------------------------------------ */

/**
 * Middleware obrigatório:
 * - Recalcula frete no backend usando o mesmo motor do quote (service único)
 * - Ignora qualquer frete enviado pelo frontend
 * - Injeta no req.body para o controller
 * - Guarda em req.__shippingCalc para persistência pós-criação
 */
async function recalcShippingMiddleware(req, _res, next) {
  try {
    const { endereco, produtos } = req.body || {};

    const cep = parseCep(endereco?.cep);
    if (!cep || cep.length !== 8) {
      throw new AppError(
        "CEP inválido para cálculo do frete.",
        ERROR_CODES.VALIDATION_ERROR,
        400
      );
    }

    // Normaliza itens para o formato do service
    const items = normalizeItems(
      (produtos || []).map((p) => ({
        id: Number(p.id),
        quantidade: Number(p.quantidade),
      }))
    );

    if (!items || items.length === 0) {
      throw new AppError(
        "Carrinho vazio para cálculo do frete.",
        ERROR_CODES.VALIDATION_ERROR,
        400
      );
    }

    // Fonte da verdade: mesmo motor do /api/shipping/quote
    const quote = await getQuote({ cep, items });

    // Não confia em frete vindo do frontend; sobrescreve.
    req.body.shipping_price = Number(quote.price || 0);
    req.body.shipping_rule_applied = String(quote.ruleApplied || "ZONE");
    req.body.shipping_prazo_dias =
      quote.prazo_dias === undefined ? null : quote.prazo_dias;
    req.body.shipping_cep = String(quote.cep || cep);

    // cache interno (útil para debug e persistência)
    req.__shippingCalc = {
      shipping_price: req.body.shipping_price,
      shipping_rule_applied: req.body.shipping_rule_applied,
      shipping_prazo_dias: req.body.shipping_prazo_dias,
      shipping_cep: req.body.shipping_cep,
      freeItems: quote.freeItems || [],
    };

    return next();
  } catch (err) {
    return next(err);
  }
}

/**
 * Persistência obrigatória no pedido sem depender do controller:
 * intercepta o res.json para pegar pedido_id e fazer UPDATE.
 */
function persistShippingOnResponse(req, res, next) {
  const originalJson = res.json.bind(res);

  res.json = async (body) => {
    try {
      const pedidoId = body?.pedido_id;

      if (pedidoId && req.__shippingCalc) {
        const s = req.__shippingCalc;

        // IMPORTANTE: exige que a tabela pedidos tenha as colunas.
        // Se não tiver, falha explicitamente para garantir "fonte da verdade".
        await pool.query(
          `
            UPDATE pedidos
            SET
              shipping_price = ?,
              shipping_rule_applied = ?,
              shipping_prazo_dias = ?,
              shipping_cep = ?
            WHERE id = ?
            LIMIT 1
          `,
          [
            Number(s.shipping_price || 0),
            String(s.shipping_rule_applied || "ZONE"),
            s.shipping_prazo_dias === null || s.shipping_prazo_dias === undefined
              ? null
              : Number(s.shipping_prazo_dias),
            String(s.shipping_cep || ""),
            Number(pedidoId),
          ]
        );
      }
    } catch (e) {
      console.error("[checkoutRoutes] Falha ao salvar frete no pedido:", e);

      // Para manter segurança/consistência, não devolve sucesso sem persistir.
      // (o pedido pode ter sido criado, mas sem frete salvo o sistema fica inconsistente)
      if (!res.headersSent) {
        res.status(500);
      }
      return originalJson({
        success: false,
        message:
          "Pedido criado, mas falhou ao persistir dados de frete. Verifique colunas shipping_* em pedidos.",
        error: e?.message || "Erro ao salvar frete",
      });
    }

    return originalJson(body);
  };

  return next();
}

/* ------------------------------------------------------------------ */
/*                 Rota de pré-visualização de cupom                  */
/* ------------------------------------------------------------------ */

/**
 * @openapi
 * /api/checkout/preview-cupom:
 *   post:
 *     summary: Valida um cupom de desconto para um determinado total
 *     description: |
 *       Verifica se o cupom existe, está ativo, não expirou, não atingiu o limite
 *       de usos e se o total informado atende ao valor mínimo.
 *     tags:
 *       - Checkout
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               codigo:
 *                 type: string
 *                 example: "PROMO10"
 *               total:
 *                 type: number
 *                 example: 189.9
 *     responses:
 *       200:
 *         description: Cupom válido e desconto calculado
 *       400:
 *         description: Cupom inválido ou não aplicável
 */
router.post("/preview-cupom", authenticateToken, async (req, res, next) => {
  const { codigo, total } = req.body || {};
  const subtotal = Number(total || 0);

  if (!codigo || !String(codigo).trim()) {
    return next(
      new AppError("Informe o código do cupom.", ERROR_CODES.VALIDATION_ERROR, 400)
    );
  }

  if (!Number.isFinite(subtotal) || subtotal <= 0) {
    return next(
      new AppError(
        "Total inválido para cálculo do cupom.",
        ERROR_CODES.VALIDATION_ERROR,
        400
      )
    );
  }

  try {
    const [rows] = await pool.query(
      `
        SELECT id, codigo, tipo, valor, minimo, expiracao, usos, max_usos, ativo
        FROM cupons
        WHERE codigo = ?
        LIMIT 1
      `,
      [String(codigo).trim()]
    );

    if (!rows || rows.length === 0) {
      return next(
        new AppError("Cupom inválido ou não encontrado.", ERROR_CODES.VALIDATION_ERROR, 400)
      );
    }

    const cupom = rows[0];

    if (!cupom.ativo) {
      return next(new AppError("Este cupom está inativo.", ERROR_CODES.VALIDATION_ERROR, 400));
    }

    if (cupom.expiracao) {
      const agora = new Date();
      const exp = new Date(cupom.expiracao);
      if (exp.getTime() < agora.getTime()) {
        return next(new AppError("Este cupom está expirado.", ERROR_CODES.VALIDATION_ERROR, 400));
      }
    }

    const usos = Number(cupom.usos || 0);
    const maxUsos =
      cupom.max_usos === null || cupom.max_usos === undefined ? null : Number(cupom.max_usos);

    if (maxUsos !== null && usos >= maxUsos) {
      return next(
        new AppError(
          "Este cupom já atingiu o limite de usos.",
          ERROR_CODES.VALIDATION_ERROR,
          400
        )
      );
    }

    const minimo = Number(cupom.minimo || 0);
    if (minimo > 0 && subtotal < minimo) {
      return next(
        new AppError(
          `Este cupom exige um valor mínimo de R$ ${minimo.toFixed(2)}.`,
          ERROR_CODES.VALIDATION_ERROR,
          400
        )
      );
    }

    const valor = Number(cupom.valor || 0);
    let desconto = 0;

    if (cupom.tipo === "percentual") {
      desconto = (subtotal * valor) / 100;
    } else {
      desconto = valor;
    }

    if (desconto < 0) desconto = 0;
    if (desconto > subtotal) desconto = subtotal;

    const totalComDesconto = subtotal - desconto;

    return res.status(200).json({
      success: true,
      message: "Cupom aplicado com sucesso.",
      desconto,
      total_original: subtotal,
      total_com_desconto: totalComDesconto,
      cupom: {
        id: cupom.id,
        codigo: cupom.codigo,
        tipo: cupom.tipo,
        valor: valor,
      },
    });
  } catch (err) {
    console.error("[checkoutRoutes] Erro em /preview-cupom:", err);

    return next(
      err instanceof AppError
        ? err
        : new AppError("Erro ao validar o cupom.", ERROR_CODES.SERVER_ERROR, 500)
    );
  }
});

/* ------------------------------------------------------------------ */
/*                               Rota                                 */
/* ------------------------------------------------------------------ */

// POST /api/checkout
// Ordem intencional:
// - autentica
// - valida body
// - recalcula frete (fonte da verdade) via service único
// - intercepta resposta para persistir shipping_* no pedido (sem mudar controller)
// - chama controller atual
router.post(
  "/",
  authenticateToken,
  validateCheckoutBody,
  recalcShippingMiddleware,
  persistShippingOnResponse,
  checkoutHandler
);

module.exports = router;
