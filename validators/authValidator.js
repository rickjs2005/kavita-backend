// validators/authValidator.js
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

module.exports = { loginValidators, registerValidators, handleValidationErrors };
