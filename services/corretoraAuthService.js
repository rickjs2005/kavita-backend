// services/corretoraAuthService.js
//
// Autenticação dos usuários de corretora (Mercado do Café Fase 2).
// Espelha authAdminService mas sem RBAC — o único papel é "corretora".
"use strict";

const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const AppError = require("../errors/AppError");
const ERROR_CODES = require("../constants/ErrorCodes");
const usersRepo = require("../repositories/corretoraUsersRepository");

const BCRYPT_ROUNDS = 12;
const COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 dias
const JWT_EXPIRES_IN = "7d";

function hashPassword(plain) {
  return bcrypt.hash(String(plain), BCRYPT_ROUNDS);
}

function verifyPassword(plain, hash) {
  return bcrypt.compare(String(plain), hash);
}

function generateToken(user) {
  const payload = {
    id: user.id,
    corretora_id: user.corretora_id,
    tokenVersion: user.token_version ?? 0,
    scope: "corretora",
  };
  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
  });
}

async function findUserByEmail(email) {
  return usersRepo.findByEmail(email);
}

async function findUserById(id) {
  return usersRepo.findById(id);
}

async function updateLastLogin(id) {
  return usersRepo.updateLastLogin(id);
}

async function incrementTokenVersion(id) {
  return usersRepo.incrementTokenVersion(id);
}

/**
 * Provisiona o primeiro usuário de uma corretora.
 * Regra da Fase 2: no máximo 1 usuário por corretora.
 * A tabela permite N — a restrição está aqui para ser relaxada depois.
 */
async function createFirstUserForCorretora(corretoraId, { nome, email, senha }) {
  const existingCount = await usersRepo.countByCorretoraId(corretoraId);
  if (existingCount > 0) {
    throw new AppError(
      "Esta corretora já possui um usuário cadastrado.",
      ERROR_CODES.CONFLICT,
      409
    );
  }

  const duplicate = await usersRepo.findByEmail(email);
  if (duplicate) {
    throw new AppError(
      "Já existe um usuário com este e-mail.",
      ERROR_CODES.CONFLICT,
      409
    );
  }

  const password_hash = await hashPassword(senha);
  const id = await usersRepo.create({
    corretora_id: corretoraId,
    nome,
    email,
    password_hash,
  });

  return { id, corretora_id: corretoraId, nome, email };
}

module.exports = {
  hashPassword,
  verifyPassword,
  generateToken,
  findUserByEmail,
  findUserById,
  updateLastLogin,
  incrementTokenVersion,
  createFirstUserForCorretora,
  COOKIE_MAX_AGE_MS,
};
