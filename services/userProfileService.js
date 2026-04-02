"use strict";
// services/userProfileService.js
//
// Business logic for user profile reads and updates.
// Handles CPF validation, duplicate checking, and field building.
// Delegates all SQL to repositories/userRepository.js.

const userRepo = require("../repositories/userRepository");
const { sanitizeCPF, isValidCPF } = require("../utils/cpf");
const { encryptCPF, hashCPF } = require("../utils/cpfCrypto");
const { sanitizeText } = require("../utils/sanitize");
const AppError = require("../errors/AppError");
const ERROR_CODES = require("../constants/ErrorCodes");

// Fields that map directly to DB columns (excluding cpf, handled separately)
const SIMPLE_FIELDS = [
  "nome",
  "telefone",
  "endereco",
  "cidade",
  "estado",
  "cep",
  "pais",
  "ponto_referencia",
];

const FIELD_MAX_LENGTH = {
  nome: 100,
  telefone: 30,
  endereco: 255,
  cidade: 100,
  estado: 50,
  cep: 20,
  pais: 80,
  ponto_referencia: 200,
};

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

async function getProfile(userId) {
  const user = await userRepo.findProfileById(userId);
  if (!user) {
    throw new AppError("Usuário não encontrado.", ERROR_CODES.NOT_FOUND, 404);
  }
  return user;
}

async function getProfileAdmin(userId) {
  const user = await userRepo.findProfileByIdAdmin(userId);
  if (!user) {
    throw new AppError("Usuário não encontrado.", ERROR_CODES.NOT_FOUND, 404);
  }
  return user;
}

// ---------------------------------------------------------------------------
// Update (shared logic for /me and /admin/:id)
// ---------------------------------------------------------------------------

/**
 * Builds SET clause fragments and values, validates CPF, checks duplicates.
 *
 * @param {number} userId   ID of the user being updated
 * @param {object} data     Validated body from Zod (already trimmed)
 * @returns {{ sets: string[], values: any[] }}
 */
async function _buildUpdateSets(userId, data) {
  const sets = [];
  const values = [];

  // --- CPF (special handling: encrypt + hash + dedup) ---
  if (Object.prototype.hasOwnProperty.call(data, "cpf")) {
    const v = data.cpf;
    if (v === null || v === "") {
      sets.push("cpf = NULL", "cpf_hash = NULL");
    } else {
      const cpfLimpo = sanitizeCPF(v);
      if (!isValidCPF(cpfLimpo)) {
        throw new AppError("CPF inválido.", ERROR_CODES.VALIDATION_ERROR, 400);
      }
      if (await userRepo.cpfExistsForOtherUser(cpfLimpo, userId)) {
        throw new AppError(
          "CPF já cadastrado para outro usuário.",
          ERROR_CODES.CONFLICT,
          409
        );
      }
      sets.push("cpf = ?", "cpf_hash = ?");
      values.push(encryptCPF(cpfLimpo), hashCPF(cpfLimpo));
    }
  }

  // --- Simple fields ---
  for (const key of SIMPLE_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(data, key)) continue;
    const raw = data[key];
    if (raw === null || raw === "") {
      sets.push(`${key} = NULL`);
    } else {
      const maxLen = FIELD_MAX_LENGTH[key] || 255;
      sets.push(`${key} = ?`);
      values.push(sanitizeText(String(raw), maxLen));
    }
  }

  if (sets.length === 0) {
    throw new AppError(
      "Nada para atualizar.",
      ERROR_CODES.VALIDATION_ERROR,
      400
    );
  }

  return { sets, values };
}

async function updateProfile(userId, data) {
  // Ensure user exists before updating
  await getProfile(userId);
  const { sets, values } = await _buildUpdateSets(userId, data);
  await userRepo.updateUserById(userId, sets, values);
  return userRepo.findProfileById(userId);
}

async function updateProfileAdmin(userId, data) {
  // Ensure user exists before updating (admin view includes status_conta)
  await getProfileAdmin(userId);
  const { sets, values } = await _buildUpdateSets(userId, data);
  await userRepo.updateUserById(userId, sets, values);
  return userRepo.findProfileByIdAdmin(userId);
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  getProfile,
  getProfileAdmin,
  updateProfile,
  updateProfileAdmin,
};
