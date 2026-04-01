// validators/authValidator.js
//
// ⚠️  DEPRECIADO — não importar em código novo.
//
// Estado atual (2026-04):
//   loginValidators      → migrado para schemas/authSchemas.js (loginSchema)
//   forgotPasswordValidators → migrado para schemas/authSchemas.js (forgotPasswordSchema)
//   resetPasswordValidators  → migrado para schemas/authSchemas.js (resetPasswordSchema)
//
// Ainda necessário por:
//   routes/auth/_legacy/userAccount.js  →  registerValidators
//                                           forgotPasswordValidators
//                                           resetPasswordValidators
//
// Remover este arquivo ao concluir a migração de routes/auth/_legacy/userAccount.js.
//
const { body, validationResult } = require("express-validator");
const { isValidCPF } = require("../utils/cpf");

/**
 * Middleware que captura erros de validação e retorna 400 com detalhes.
 */
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      code: "VALIDATION_ERROR",
      message: "Dados inválidos.",
      errors: errors.array().map((e) => ({ field: e.path, message: e.msg })),
    });
  }
  return next();
};

/**
 * Validadores para o endpoint de login.
 */
const loginValidators = [
  body("email")
    .isEmail()
    .withMessage("Email inválido.")
    .normalizeEmail()
    .trim(),
  body("senha")
    .isString()
    .withMessage("Senha é obrigatória.")
    .notEmpty()
    .withMessage("Senha não pode ser vazia.")
    .trim(),
  handleValidationErrors,
];

/**
 * Validadores para o endpoint de register.
 */
const registerValidators = [
  body("nome")
    .isString()
    .withMessage("Nome é obrigatório.")
    .notEmpty()
    .withMessage("Nome não pode ser vazio.")
    .trim()
    .escape(),
  body("email")
    .isEmail()
    .withMessage("Email inválido.")
    .normalizeEmail()
    .trim(),
  body("senha")
    .isString()
    .withMessage("Senha é obrigatória.")
    .isLength({ min: 6 })
    .withMessage("Senha deve ter no mínimo 6 caracteres.")
    .trim(),
  body("cpf")
    .isString()
    .withMessage("CPF é obrigatório.")
    .notEmpty()
    .withMessage("CPF não pode ser vazio.")
    .trim()
    .custom((value) => isValidCPF(value))
    .withMessage("CPF inválido."),
  handleValidationErrors,
];

/**
 * Validadores para forgot-password.
 */
const forgotPasswordValidators = [
  body("email")
    .isEmail()
    .withMessage("Email inválido.")
    .normalizeEmail()
    .trim()
    .isLength({ max: 254 })
    .withMessage("Email muito longo."),
  handleValidationErrors,
];

/**
 * Validadores para reset-password.
 */
const resetPasswordValidators = [
  body("token")
    .isString()
    .withMessage("Token é obrigatório.")
    .notEmpty()
    .withMessage("Token não pode ser vazio.")
    .isLength({ min: 10, max: 512 })
    .withMessage("Token inválido.")
    .trim(),
  body("novaSenha")
    .isString()
    .withMessage("Nova senha é obrigatória.")
    .isLength({ min: 8, max: 128 })
    .withMessage("Nova senha deve ter entre 8 e 128 caracteres.")
    .trim(),
  handleValidationErrors,
];

module.exports = {
  loginValidators,
  registerValidators,
  forgotPasswordValidators,
  resetPasswordValidators,
  handleValidationErrors,
};
