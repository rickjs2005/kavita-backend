// schemas/authSchemas.js
// Zod schemas for auth routes: login, register, forgot-password, reset-password.
// Applied via validate(schema) in routes/auth/login.js, routes/auth/userRegister.js,
// and routes/auth/authRoutes.js.

"use strict";

const { z } = require("zod");
const { sanitizeCPF, isValidCPF } = require("../utils/cpf");

// ---------------------------------------------------------------------------
// Shared primitive
// Normalizes to lowercase + trimmed string before email validation,
// mirroring the .normalizeEmail().trim() behavior of the legacy validator.
// ---------------------------------------------------------------------------

const emailField = (maxLen = 254) =>
  z.preprocess(
    (v) => (typeof v === "string" ? v.trim().toLowerCase() : v),
    z
      .string()
      .email("Email inválido.")
      .max(maxLen, "Email muito longo.")
  );

// ---------------------------------------------------------------------------
// POST /api/users/register
// ---------------------------------------------------------------------------

const registerSchema = z.object({
  nome: z.string().trim().min(1, "Nome é obrigatório."),
  email: emailField(),
  senha: z.string().trim().min(8, "Senha deve ter no mínimo 8 caracteres."),
  cpf: z.preprocess(
    (v) => (typeof v === "string" ? sanitizeCPF(v) : v),
    z.string().refine(isValidCPF, "CPF inválido.")
  ),
});

// ---------------------------------------------------------------------------
// POST /api/login
// ---------------------------------------------------------------------------

const loginSchema = z.object({
  email: emailField(),
  senha: z.string().trim().min(1, "Senha é obrigatória."),
});

// ---------------------------------------------------------------------------
// POST /api/forgot-password
// ---------------------------------------------------------------------------

const forgotPasswordSchema = z.object({
  email: emailField(254),
});

// ---------------------------------------------------------------------------
// POST /api/reset-password
// ---------------------------------------------------------------------------

const resetPasswordSchema = z.object({
  token: z
    .string()
    .trim()
    .min(10, "Token inválido.")
    .max(512, "Token inválido."),
  novaSenha: z
    .string()
    .min(8, "Nova senha deve ter entre 8 e 128 caracteres.")
    .max(128, "Nova senha deve ter entre 8 e 128 caracteres."),
});

module.exports = { registerSchema, loginSchema, forgotPasswordSchema, resetPasswordSchema };
