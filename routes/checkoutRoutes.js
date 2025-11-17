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
 */

/**
 * @openapi
 * /api/checkout:
 *   post:
 *     summary: Cria um novo pedido
 *     description: Cria um pedido a partir do carrinho do usuário autenticado.
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
/*                               Rota                                 */
/* ------------------------------------------------------------------ */

// POST /api/checkout
router.post("/", authenticateToken, validateCheckoutBody, checkoutHandler);

module.exports = router;
