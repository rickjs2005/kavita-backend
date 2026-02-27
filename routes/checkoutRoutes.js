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
 *       description: |
 *         Endereço do pedido.
 *
 *         Regras por tipo_localidade:
 *         - URBANA (padrão):
 *           - obrigatórios: cep, rua (ou endereco/logradouro), bairro, cidade, estado
 *           - numero é obrigatório, mas pode usar sem_numero=true (o backend normaliza numero para "S/N")
 *           - ponto_referencia/complemento opcionais
 *         - RURAL:
 *           - obrigatórios: cep, cidade, estado, comunidade, observacoes_acesso (ou ponto_referencia)
 *           - rua/bairro/numero NÃO são obrigatórios
 *       properties:
 *         cep:
 *           type: string
 *           example: "36940000"
 *         rua:
 *           type: string
 *           example: "Rua das Flores"
 *           description: |
 *             Aceita aliases: rua | endereco | logradouro (o backend normaliza).
 *         endereco:
 *           type: string
 *           nullable: true
 *           example: "Rua das Flores"
 *           description: Alias aceito para "rua".
 *         logradouro:
 *           type: string
 *           nullable: true
 *           example: "Rua das Flores"
 *           description: Alias aceito para "rua".
 *         numero:
 *           type: string
 *           nullable: true
 *           example: "288"
 *         sem_numero:
 *           type: boolean
 *           nullable: true
 *           example: false
 *           description: Quando true e tipo_localidade=URBANA, o backend normaliza numero para "S/N".
 *         bairro:
 *           type: string
 *           nullable: true
 *           example: "Centro"
 *         cidade:
 *           type: string
 *           example: "Manhuaçu"
 *         estado:
 *           type: string
 *           example: "MG"
 *         complemento:
 *           type: string
 *           nullable: true
 *           example: "Perto da pracinha"
 *         ponto_referencia:
 *           type: string
 *           nullable: true
 *           example: "Depois do mercado, casa amarela"
 *           description: |
 *             Opcional em URBANA. Em RURAL pode ser usado como alternativa a observacoes_acesso.
 *         observacoes_acesso:
 *           type: string
 *           nullable: true
 *           example: "Após a ponte, seguir 2km de estrada de chão; entrada à direita."
 *           description: Obrigatório quando tipo_localidade = RURAL (ou informe ponto_referencia).
 *         tipo_localidade:
 *           type: string
 *           enum: [URBANA, RURAL]
 *           example: "URBANA"
 *           description: |
 *             Tipo de localidade do endereço.
 *             - URBANA: padrão (campos urbanos normais)
 *             - RURAL: exige comunidade + observacoes_acesso (ou ponto_referencia)
 *         comunidade:
 *           type: string
 *           nullable: true
 *           example: "Córrego do Cedro"
 *           description: Obrigatório quando tipo_localidade = RURAL
 *
 *     CheckoutBody:
 *       type: object
 *       required:
 *         - formaPagamento
 *         - produtos
 *       properties:
 *         entrega_tipo:
 *           type: string
 *           enum: [ENTREGA, RETIRADA]
 *           example: "ENTREGA"
 *           description: |
 *             Tipo de atendimento:
 *             - ENTREGA: calcula frete e prazo via /services/shippingQuoteService (fonte da verdade).
 *             - RETIRADA: NÃO calcula frete, NÃO tem prazo (frete=0).
 *         formaPagamento:
 *           type: string
 *           example: "Cartão (Mercado Pago)"
 *           description: |
 *             Forma de pagamento escolhida no checkout.
 *             Valores aceitos (case-insensitive):
 *             - Pix
 *             - Boleto
 *             - Cartão (Mercado Pago)
 *             - Prazo
 *         endereco:
 *           $ref: "#/components/schemas/Endereco"
 *           nullable: true
 *           description: |
 *             Obrigatório quando entrega_tipo=ENTREGA.
 *             Em RETIRADA, pode ser omitido.
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
 *         nota_fiscal_aviso:
 *           type: string
 *           example: "Nota fiscal será entregue junto com o produto."
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
 *       Regras de entrega:
 *       - entrega_tipo=ENTREGA: exige endereço e calcula frete/prazo.
 *       - entrega_tipo=RETIRADA: não exige endereço; frete=0 e sem prazo.
 *
 *       Aviso:
 *       - Nota fiscal será entregue junto com o produto (sempre).
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
/*                           Helpers / Normalização                    */
/* ------------------------------------------------------------------ */

function isNonEmptyString(v) {
  return typeof v === "string" && v.trim().length > 0;
}

function asStr(v) {
  return typeof v === "string" ? v.trim() : "";
}

function upper(v, fallback) {
  const s = asStr(v) || (fallback || "");
  return s.toUpperCase();
}

function normalizeEntregaTipo(raw) {
  const tipo = upper(raw, "ENTREGA");
  if (tipo !== "ENTREGA" && tipo !== "RETIRADA") return "ENTREGA";
  return tipo;
}

/**
 * Normaliza "endereco" aceitando aliases do frontend e do legado:
 * - rua | endereco | logradouro
 * - ponto_referencia | referencia | complemento
 */
function normalizeCheckoutEndereco(rawEndereco) {
  const e = rawEndereco && typeof rawEndereco === "object" ? rawEndereco : {};

  const tipo_localidade = upper(e.tipo_localidade, "URBANA") === "RURAL" ? "RURAL" : "URBANA";

  const rua = asStr(e.rua) || asStr(e.endereco) || asStr(e.logradouro);

  const ponto_referencia =
    asStr(e.ponto_referencia) ||
    asStr(e.referencia) ||
    asStr(e.complemento);

  const observacoes_acesso = asStr(e.observacoes_acesso);
  const comunidade = asStr(e.comunidade);

  const sem_numero =
    e.sem_numero === true ||
    upper(e.sem_numero) === "TRUE" ||
    upper(e.sem_numero) === "1";

  const numero = asStr(e.numero);

  return {
    ...e,
    cep: asStr(e.cep),
    cidade: asStr(e.cidade),
    estado: upper(e.estado),
    tipo_localidade,
    rua,
    bairro: asStr(e.bairro),
    numero,
    sem_numero,
    ponto_referencia,
    observacoes_acesso,
    comunidade,
  };
}

/* ------------------------------------------------------------------ */
/*                           Validação básica                         */
/* ------------------------------------------------------------------ */

function validateCheckoutBody(req, _res, next) {
  const body = req.body || {};
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

  // normaliza entrega_tipo (default ENTREGA)
  body.entrega_tipo = normalizeEntregaTipo(body.entrega_tipo);

  const { endereco, produtos } = body;

  // ENTREGA => endereço obrigatório; RETIRADA => endereço opcional
  if (body.entrega_tipo === "ENTREGA") {
    if (!endereco) {
      errors.push("endereco é obrigatório quando entrega_tipo = ENTREGA.");
    } else {
      const endNorm = normalizeCheckoutEndereco(endereco);
      body.endereco = endNorm; // normaliza no payload (compatível com controller)

      // obrigatórios comuns
      if (!endNorm.cep) errors.push("endereco.cep é obrigatório.");
      if (!endNorm.cidade) errors.push("endereco.cidade é obrigatório.");
      if (!endNorm.estado) errors.push("endereco.estado é obrigatório.");

      // valida tipo_localidade
      if (endNorm.tipo_localidade !== "URBANA" && endNorm.tipo_localidade !== "RURAL") {
        errors.push("endereco.tipo_localidade deve ser 'URBANA' ou 'RURAL'.");
      }

      if (endNorm.tipo_localidade === "URBANA") {
        // URBANA: rua + bairro obrigatórios
        if (!endNorm.rua) errors.push("endereco.rua é obrigatório.");
        if (!endNorm.bairro) errors.push("endereco.bairro é obrigatório.");

        // número obrigatório, com opção "não tem número"
        if (!endNorm.sem_numero && !endNorm.numero) {
          errors.push("endereco.numero é obrigatório.");
        }
        if (endNorm.sem_numero && !endNorm.numero) {
          body.endereco.numero = "S/N";
        }
      } else {
        // RURAL: exige comunidade + observacoes_acesso (ou ponto_referencia)
        if (!isNonEmptyString(endNorm.comunidade)) {
          errors.push("endereco.comunidade é obrigatório quando tipo_localidade = RURAL.");
        }

        const ref = endNorm.observacoes_acesso || endNorm.ponto_referencia;
        if (!isNonEmptyString(ref)) {
          errors.push(
            "endereco.observacoes_acesso (ou ponto_referencia) é obrigatório quando tipo_localidade = RURAL."
          );
        }
      }
    }
  } else {
    // RETIRADA: se vier endereco, normaliza para consistência, mas não exige campos
    if (endereco) {
      body.endereco = normalizeCheckoutEndereco(endereco);
    }
  }

  // produtos obrigatórios sempre (ENTREGA e RETIRADA)
  if (!Array.isArray(produtos) || produtos.length === 0) {
    errors.push("produtos deve ser um array com ao menos um item.");
  } else {
    produtos.forEach((p, i) => {
      if (!p.id) errors.push(`produtos[${i}].id é obrigatório.`);
      if (!Number.isInteger(p.quantidade) || p.quantidade <= 0) {
        errors.push(`produtos[${i}].quantidade deve ser um inteiro maior que zero.`);
      }
    });
  }

  if (errors.length > 0) {
    return next(new AppError(errors.join(" "), ERROR_CODES.VALIDATION_ERROR, 400));
  }

  // compatibilidade com controller/logs (deprecated)
  req.body = body;
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
 * - ENTREGA: recalcula frete no backend usando o mesmo motor do quote (service único)
 * - RETIRADA: força frete=0 e sem prazo
 * - Ignora qualquer frete enviado pelo frontend
 * - Injeta no req.body para o controller
 * - Guarda em req.__shippingCalc para persistência pós-criação
 */
async function recalcShippingMiddleware(req, _res, next) {
  try {
    const body = req.body || {};
    const entregaTipo = normalizeEntregaTipo(body.entrega_tipo);

    // RETIRADA: sem frete e sem prazo
    if (entregaTipo === "RETIRADA") {
      req.body.shipping_price = 0;
      req.body.shipping_rule_applied = "PICKUP";
      req.body.shipping_prazo_dias = null;
      req.body.shipping_cep = null;

      req.__shippingCalc = {
        shipping_price: 0,
        shipping_rule_applied: "PICKUP",
        shipping_prazo_dias: null,
        shipping_cep: null,
        freeItems: [],
        entrega_tipo: "RETIRADA",
      };

      return next();
    }

    // ENTREGA (padrão)
    const { endereco, produtos } = body;

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
      entrega_tipo: "ENTREGA",
    };

    return next();
  } catch (err) {
    return next(err);
  }
}

/**
 * Persistência obrigatória no pedido sem depender do controller:
 * intercepta o res.json para pegar pedido_id e fazer UPDATE.
 *
 * Também injeta aviso fixo de Nota Fiscal (sempre).
 */
function persistShippingOnResponse(req, res, next) {
  const originalJson = res.json.bind(res);

  res.json = async (body) => {
    const safeBody =
      body && typeof body === "object"
        ? { ...body }
        : { success: true, message: "OK" };

    // Aviso fixo para qualquer opção
    if (!safeBody.nota_fiscal_aviso) {
      safeBody.nota_fiscal_aviso = "Nota fiscal será entregue junto com o produto.";
    }

    try {
      const pedidoId = safeBody?.pedido_id;

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
            s.shipping_cep === null || s.shipping_cep === undefined
              ? null
              : String(s.shipping_cep),
            Number(pedidoId),
          ]
        );
      }
    } catch (e) {
      console.error("[checkoutRoutes] Falha ao salvar frete no pedido:", e);

      // Para manter segurança/consistência, não devolve sucesso sem persistir.
      if (!res.headersSent) {
        res.status(500);
      }
      return originalJson({
        success: false,
        message:
          "Pedido criado, mas falhou ao persistir dados de frete. Verifique colunas shipping_* em pedidos.",
        error: e?.message || "Erro ao salvar frete",
        nota_fiscal_aviso: "Nota fiscal será entregue junto com o produto.",
      });
    }

    return originalJson(safeBody);
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
// - valida body (inclui regras URBANA/RURAL e RETIRADA)
// - recalcula frete (ENTREGA) ou força pickup (RETIRADA)
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
