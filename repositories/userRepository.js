// repositories/userRepository.js
// All SQL for the usuarios table (auth, profile, admin user management).
"use strict";

const pool = require("../config/pool");

// ---------------------------------------------------------------------------
// Auth queries
// ---------------------------------------------------------------------------

/**
 * Finds a user by email, returning fields needed for auth.
 *
 * @param {string} email
 * @returns {{ id, nome, email, senha, tokenVersion }|null}
 */
async function findUserByEmail(email) {
  const [rows] = await pool.query(
    "SELECT id, nome, email, senha, tokenVersion FROM usuarios WHERE email = ?",
    [email]
  );
  return rows[0] || null;
}

/**
 * Returns true if an email is already registered.
 *
 * @param {string} email
 * @returns {boolean}
 */
async function emailExists(email) {
  const [rows] = await pool.query(
    "SELECT id FROM usuarios WHERE email = ?",
    [email]
  );
  return rows.length > 0;
}

/**
 * Creates a new user. Password must already be hashed.
 *
 * @param {{ nome: string, email: string, senha: string }} data
 */
async function createUser({ nome, email, senha }) {
  await pool.query(
    "INSERT INTO usuarios (nome, email, senha) VALUES (?, ?, ?)",
    [nome, email, senha]
  );
}

/**
 * Increments tokenVersion to invalidate all existing JWTs for the user.
 * Uses COALESCE to handle NULL → 1 correctly.
 *
 * @param {number} userId
 */
async function incrementTokenVersion(userId) {
  await pool.query(
    "UPDATE usuarios SET tokenVersion = COALESCE(tokenVersion, 0) + 1 WHERE id = ?",
    [userId]
  );
}

/**
 * Updates a user's password hash.
 *
 * @param {number} userId
 * @param {string} hashedPassword
 */
async function updatePassword(userId, hashedPassword) {
  await pool.execute(
    "UPDATE usuarios SET senha = ? WHERE id = ?",
    [hashedPassword, userId]
  );
}

// ---------------------------------------------------------------------------
// Profile queries
// ---------------------------------------------------------------------------

const PROFILE_FIELDS =
  "id, nome, email, telefone, cpf, endereco, cidade, estado, cep, pais, ponto_referencia";

const ADMIN_PROFILE_FIELDS =
  "id, nome, email, telefone, cpf, endereco, cidade, estado, cep, pais, ponto_referencia, status_conta";

/**
 * Returns a user's public profile by ID.
 *
 * @param {number} userId
 * @returns {object|null}
 */
async function findProfileById(userId) {
  const [rows] = await pool.query(
    `SELECT ${PROFILE_FIELDS} FROM usuarios WHERE id = ?`,
    [userId]
  );
  return rows[0] || null;
}

/**
 * Returns a user's profile (including status_conta) for admin use.
 *
 * @param {number} userId
 * @returns {object|null}
 */
async function findProfileByIdAdmin(userId) {
  const [rows] = await pool.query(
    `SELECT ${ADMIN_PROFILE_FIELDS} FROM usuarios WHERE id = ?`,
    [userId]
  );
  return rows[0] || null;
}

/**
 * Checks whether a CPF is already used by another user.
 *
 * @param {string} cpf    Sanitized digits-only CPF
 * @param {number} excludeUserId  ID of the user being updated (excluded from check)
 * @returns {boolean}
 */
async function cpfExistsForOtherUser(cpf, excludeUserId) {
  const [rows] = await pool.query(
    "SELECT id FROM usuarios WHERE cpf = ? AND id <> ?",
    [cpf, excludeUserId]
  );
  return rows.length > 0;
}

/**
 * Updates user profile fields via a pre-built SET clause.
 * Callers are responsible for validating column names against a whitelist
 * before building the sets array.
 *
 * @param {number} userId
 * @param {string[]} sets    Array of "field = ?" or "field = NULL" fragments
 * @param {any[]} values     Positional values for the ? placeholders in sets
 */
async function updateUserById(userId, sets, values) {
  await pool.query(
    `UPDATE usuarios SET ${sets.join(", ")} WHERE id = ?`,
    [...values, userId]
  );
}

module.exports = {
  // Auth
  findUserByEmail,
  emailExists,
  createUser,
  incrementTokenVersion,
  updatePassword,
  // Profile
  findProfileById,
  findProfileByIdAdmin,
  cpfExistsForOtherUser,
  updateUserById,
};
