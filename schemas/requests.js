// schemas/requests.js
// Schemas Zod para validação de request bodies nas rotas mutantes.
//
// CONTEXTO: rotas multipart/form-data enviam todos os campos como strings.
// Estes schemas validam shape e limites básicos dos dados brutos.
// A conversão de tipos (parseMoneyBR, toInt, etc.) continua nos handlers.
//
// REGRA: adicionar um schema por domínio ao estender este arquivo.
// Não validar campos de arquivo (req.files) aqui — responsabilidade do multer.

const { z } = require("zod");

// ---------------------------------------------------------------------------
// Helpers reutilizáveis
// ---------------------------------------------------------------------------

/** String obrigatória — rejeita undefined, null e string vazia após trim. */
const requiredString = (msg) =>
  z.string({ required_error: msg }).min(1, msg);

/** Formata os erros do Zod em array simples para resposta HTTP. */
const formatZodErrors = (zodError) =>
  zodError.issues.map((issue) => ({
    field: issue.path.join(".") || "body",
    message: issue.message,
  }));

// ---------------------------------------------------------------------------
// Produtos
// ---------------------------------------------------------------------------

/**
 * Campos compartilhados entre criação e edição de produto.
 * Todos chegam como string via multipart/form-data.
 *
 * Limites de tamanho existem para prevenir payloads abusivos.
 * A conversão para número (price → priceNum, etc.) ocorre nos handlers.
 */
const ProdutoBaseSchema = z.object({
  name: requiredString("Nome é obrigatório.")
    .max(255, "Nome deve ter no máximo 255 caracteres."),

  description: z
    .string()
    .max(2000, "Descrição deve ter no máximo 2000 caracteres.")
    .optional()
    .default(""),

  // Aceita formatos PT-BR: "199,90", "1.234,56", "R$ 20,00"
  // Validação de valor (> 0, finito) ocorre no handler via parseMoneyBR
  price: requiredString("Preço é obrigatório."),

  // Coerção: "10" → string válida; conversão para int ocorre no handler via toInt
  quantity: z.string().optional().default("0"),

  category_id: requiredString("Categoria é obrigatória."),

  // Aceita "1"/"0", "true"/"false", "yes"/"no" — parseBoolLike no handler
  shippingFree: z.string().optional().default("0"),

  // Quantidade mínima para frete grátis — parseNullablePositiveInt no handler
  shippingFreeFromQtyStr: z.string().optional().default(""),
});

/**
 * Schema para POST /api/admin/produtos
 */
const CriarProdutoSchema = ProdutoBaseSchema;

/**
 * Schema para PUT /api/admin/produtos/:id
 * Inclui keepImages — JSON string com array de paths a manter.
 */
const AtualizarProdutoSchema = ProdutoBaseSchema.extend({
  keepImages: z
    .string()
    .optional()
    .default("[]"),
});

// ---------------------------------------------------------------------------
// Params compartilhado — /produtos/:id
// ---------------------------------------------------------------------------

/**
 * Valida que o parâmetro de rota :id é um inteiro positivo.
 * z.coerce converte a string do URL para number antes de validar,
 * então o controller recebe req.params.id já como número.
 */
const ProdutoIdParamSchema = z.object({
  id: z
    .string({ required_error: "ID inválido." })
    .regex(/^[1-9]\d*$/, "ID inválido.")
    .transform(Number),
});

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  CriarProdutoSchema,
  AtualizarProdutoSchema,
  ProdutoIdParamSchema,
  formatZodErrors,
};
