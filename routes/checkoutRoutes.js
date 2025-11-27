// routes/checkoutRoutes.js
const express = require("express");
const router = express.Router();
const pool = require("../config/pool");
const controller = require("../controllers/checkoutController");
const authenticateToken = require("../middleware/authenticateToken");

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
 *         - usuario_id
 *         - formaPagamento
 *         - endereco
 *         - produtos
 *         - total
 *       properties:
 *         usuario_id:
 *           type: integer
 *           example: 1
 *           description: >
 *             ID do usuário que está realizando o pedido.
 *             Se o usuário estiver autenticado via JWT, o backend irá usar o ID do token.
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
 *       - Valida estoque e estrutura dos dados do checkout.
 *       - Usa o `usuario_id` do token JWT quando disponível.
 *       - Dentro do controller de checkout, após a criação do pedido,
 *         o carrinho aberto associado pode ser marcado como **recuperado**
 *         na tabela `carrinhos_abandonados` (quando existir), integrando com
 *         o sistema de carrinhos abandonados do admin.
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
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/CheckoutResponse"
 *       400:
 *         description: Erro de validação ou estoque insuficiente
 *       401:
 *         description: Usuário não autenticado
 *       403:
 *         description: usuario_id não corresponde ao usuário autenticado
 *       500:
 *         description: Erro interno do servidor
 */

/* ------------------------------------------------------------------ */
/*                           Validação básica                         */
/* ------------------------------------------------------------------ */

function validateCheckoutBody(req, res, next) {
  const { formaPagamento, endereco, produtos } = req.body || {};
  const errors = [];

  // Determina o usuário a partir do token ou do body (compatibilidade)
  const usuarioIdFromToken = req.user && req.user.id;
  const usuarioIdFromBody = req.body && req.body.usuario_id;

  let resolvedUsuarioId = usuarioIdFromToken || usuarioIdFromBody;

  if (!resolvedUsuarioId) {
    errors.push("usuario_id é obrigatório e/ou usuário não autenticado.");
  }

  // Se vier no body e também no token, eles devem coincidir
  if (
    usuarioIdFromToken &&
    usuarioIdFromBody &&
    Number(usuarioIdFromBody) !== Number(usuarioIdFromToken)
  ) {
    errors.push(
      "usuario_id no corpo não corresponde ao usuário autenticado (token)."
    );
  }

  const formasValidas = ["pix", "boleto", "mercadopago", "prazo"];
  if (!formaPagamento || !formasValidas.includes(formaPagamento)) {
    errors.push(
      `formaPagamento é obrigatória e deve ser uma destas: ${formasValidas.join(
        ", "
      )}`
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

  if (errors.length) {
    return res.status(400).json({
      success: false,
      message: "Erro de validação no checkout.",
      errors,
    });
  }

  // Garante que o controller receba usuario_id correto (do token, se existir)
  if (resolvedUsuarioId) {
    req.body.usuario_id = resolvedUsuarioId;
  }

  next();
}

/* ------------------------------------------------------------------ */
/*                    Resolve o handler do controller                 */
/* ------------------------------------------------------------------ */

let checkoutHandler;

if (typeof controller === "function") {
  // caso o controller exporte diretamente uma função
  checkoutHandler = controller;
} else if (controller && typeof controller.create === "function") {
  // caso padrão: module.exports = { create }
  checkoutHandler = controller.create;
} else {
  // fallback caso o controller não esteja configurado
  checkoutHandler = (req, res) => {
    console.error(
      "[checkoutRoutes] checkoutController não configurado corretamente. Esperado função ou { create }."
    );
    res.status(500).json({
      success: false,
      message:
        "Checkout não está configurado corretamente no servidor. Avise o administrador.",
    });
  };
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
router.post("/preview-cupom", authenticateToken, async (req, res) => {
  const { codigo, total } = req.body || {};
  const subtotal = Number(total || 0);

  if (!codigo || !String(codigo).trim()) {
    return res.status(400).json({
      success: false,
      message: "Informe o código do cupom.",
    });
  }

  if (!Number.isFinite(subtotal) || subtotal <= 0) {
    return res.status(400).json({
      success: false,
      message: "Total inválido para cálculo do cupom.",
    });
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
      return res.status(400).json({
        success: false,
        message: "Cupom inválido ou não encontrado.",
      });
    }

    const cupom = rows[0];

    if (!cupom.ativo) {
      return res.status(400).json({
        success: false,
        message: "Este cupom está inativo.",
      });
    }

    if (cupom.expiracao) {
      const agora = new Date();
      const exp = new Date(cupom.expiracao);
      if (exp.getTime() < agora.getTime()) {
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
      return res.status(400).json({
        success: false,
        message: "Este cupom já atingiu o limite de usos.",
      });
    }

    const minimo = Number(cupom.minimo || 0);
    if (minimo > 0 && subtotal < minimo) {
      return res.status(400).json({
        success: false,
        message: `Este cupom exige um valor mínimo de R$ ${minimo.toFixed(2)}.`,
      });
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
    return res.status(500).json({
      success: false,
      message: "Erro ao validar o cupom.",
    });
  }
});

/* ------------------------------------------------------------------ */
/*                               Rota                                 */
/* ------------------------------------------------------------------ */

// POST /api/checkout
router.post("/", authenticateToken, validateCheckoutBody, checkoutHandler);

module.exports = router;
