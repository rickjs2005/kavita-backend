const express = require("express");
const router = express.Router();
const controller = require("../../controllers/checkoutController");
const authenticateToken = require("../../middleware/authenticateToken");
const AppError = require("../../errors/AppError");
const ERROR_CODES = require("../../constants/ErrorCodes");
const recalcShipping = require("../../middleware/recalcShipping");
const { validateCSRF } = require("../../middleware/csrfProtection");
const { validate } = require("../../middleware/validate");
const { checkoutBodySchema } = require("../../schemas/checkoutSchemas");

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
/*            Body validation — see schemas/checkoutSchemas.js        */
/* ------------------------------------------------------------------ */

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
/*   Autenticação — todas as rotas abaixo exigem token válido         */
/* ------------------------------------------------------------------ */

// Aplicado uma vez no mount: qualquer nova rota adicionada aqui já nasce protegida.
// Equivale ao padrão de cart.js (router.use(authenticateToken)).
router.use(authenticateToken);

/* ------------------------------------------------------------------ */
/*                 Rota de pré-visualização de cupom                  */
/* ------------------------------------------------------------------ */

/**
 * @openapi
 * /api/checkout/preview-cupom:
 *   post:
 *     summary: Valida um cupom de desconto calculando o subtotal no servidor
 *     description: |
 *       Recebe a lista de produtos do carrinho, calcula o subtotal no backend
 *       usando a mesma regra de preço do checkout real (promoção ativa tem
 *       prioridade sobre products.price) e retorna o desconto do cupom.
 *       O campo `produtos` é obrigatório; o backend é a única fonte do cálculo.
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
 *             required: [codigo, produtos]
 *             properties:
 *               codigo:
 *                 type: string
 *                 example: "PROMO10"
 *               produtos:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     id: { type: integer }
 *                     quantidade: { type: integer }
 *     responses:
 *       200:
 *         description: Cupom válido e desconto calculado
 *       400:
 *         description: Cupom inválido ou não aplicável
 */
router.post("/preview-cupom", validateCSRF, controller.previewCoupon);

/* ------------------------------------------------------------------ */
/*                               Rota                                 */
/* ------------------------------------------------------------------ */

// POST /api/checkout
// Ordem intencional:
// - autenticação: já aplicada via router.use(authenticateToken) acima
// - valida CSRF (impede cross-site form submit criando pedido real)
// - valida body (inclui regras URBANA/RURAL e RETIRADA)
// - recalcula frete (ENTREGA) ou força pickup (RETIRADA) — injeta req.body.shipping_*
// - chama controller (shipping_* persistido dentro da transação do controller)
router.post(
  "/",
  validateCSRF,
  validate(checkoutBodySchema),
  recalcShipping,
  checkoutHandler
);

module.exports = router;
