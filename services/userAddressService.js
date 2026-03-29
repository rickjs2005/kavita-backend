"use strict";
// services/userAddressService.js
//
// Business logic for user address CRUD.
// Owns the transaction lifecycle for create and update.
//
// normalizeInput is exported so tests can exercise the normalisation
// rules in isolation without going through the HTTP layer.

const pool = require("../config/pool");
const addressRepo = require("../repositories/addressRepository");
const AppError = require("../errors/AppError");
const ERROR_CODES = require("../constants/ErrorCodes");

// ---------------------------------------------------------------------------
// Input normalisation
// (Moved from the legacy route verbatim — behaviour is unchanged.)
// ---------------------------------------------------------------------------

function isNonEmptyString(v) {
  return typeof v === "string" && v.trim().length > 0;
}

function asStr(v) {
  return typeof v === "string" ? v.trim() : "";
}

function upper(v, fallback = "") {
  const s = asStr(v);
  return s ? s.toUpperCase() : fallback;
}

function onlyDigits(s) {
  return String(s || "").replace(/\D+/g, "");
}

function normalizeCep(cep) {
  const d = onlyDigits(cep);
  return d || asStr(cep);
}

function normalizeTipoLocalidade(raw) {
  const t = upper(raw, "URBANA");
  return t === "RURAL" ? "RURAL" : "URBANA";
}

/**
 * Normalises raw request body into a validated, DB-ready address object.
 *
 * Aliases resolved:
 *   logradouro | rua → endereco
 *   referencia       → ponto_referencia
 *   complemento      → fallback for ponto_referencia
 *
 * Returns { ok: true, data } or { ok: false, errors: string[] }.
 */
function normalizeInput(raw) {
  const b = raw && typeof raw === "object" ? raw : {};

  const tipo_localidade = normalizeTipoLocalidade(b.tipo_localidade);
  const endereco = asStr(b.endereco) || asStr(b.rua) || asStr(b.logradouro) || "";
  const ponto_referencia =
    asStr(b.ponto_referencia) || asStr(b.referencia) || asStr(b.complemento) || "";
  const observacoes_acesso = asStr(b.observacoes_acesso);
  const comunidade = asStr(b.comunidade);

  const sem_numero =
    b.sem_numero === true ||
    String(b.sem_numero).toLowerCase() === "true" ||
    String(b.sem_numero) === "1";

  let numero = asStr(b.numero);
  if (!numero && sem_numero) numero = "S/N";

  const bairro = asStr(b.bairro);
  const cidade = asStr(b.cidade);
  const estado = upper(b.estado);
  const cep = normalizeCep(b.cep);
  const complemento = asStr(b.complemento);
  const telefone = asStr(b.telefone);
  const apelido = asStr(b.apelido);

  const is_default =
    b.is_default === 1 ||
    b.is_default === true ||
    String(b.is_default) === "1" ||
    String(b.is_default).toLowerCase() === "true";

  const errors = [];

  // Fields required by both URBANA and RURAL
  if (!isNonEmptyString(cep)) errors.push("cep é obrigatório.");
  if (!isNonEmptyString(cidade)) errors.push("cidade é obrigatória.");
  if (!isNonEmptyString(estado)) errors.push("estado é obrigatório.");

  if (tipo_localidade === "URBANA") {
    if (!isNonEmptyString(endereco))
      errors.push("endereco (ou rua/logradouro) é obrigatório para URBANA.");
    if (!isNonEmptyString(bairro)) errors.push("bairro é obrigatório para URBANA.");
    if (!isNonEmptyString(numero))
      errors.push("numero é obrigatório para URBANA (ou use sem_numero=true).");
  } else {
    // RURAL
    if (!isNonEmptyString(comunidade)) errors.push("comunidade é obrigatória para RURAL.");
    const ref = observacoes_acesso || ponto_referencia;
    if (!isNonEmptyString(ref)) {
      errors.push(
        "observacoes_acesso (ou ponto_referencia/referencia) é obrigatório para RURAL."
      );
    }
  }

  // Defensive placeholders for legacy DB columns that may have NOT NULL constraints
  let enderecoDb = endereco;
  let bairroDb = bairro;
  let numeroDb = numero;

  if (tipo_localidade === "RURAL") {
    if (!isNonEmptyString(enderecoDb)) enderecoDb = comunidade || "RURAL";
    if (!isNonEmptyString(bairroDb)) bairroDb = "RURAL";
    if (!isNonEmptyString(numeroDb)) numeroDb = "S/N";
  }

  return {
    ok: errors.length === 0,
    errors,
    data: {
      apelido: apelido || null,
      cep,
      endereco: enderecoDb || null,
      numero: numeroDb || null,
      bairro: bairroDb || null,
      cidade,
      estado,
      complemento: complemento || null,
      ponto_referencia: ponto_referencia || null,
      telefone: telefone || null,
      is_default: is_default ? 1 : 0,
      tipo_localidade,
      comunidade: tipo_localidade === "RURAL" ? comunidade || null : null,
      observacoes_acesso:
        tipo_localidade === "RURAL"
          ? observacoes_acesso || ponto_referencia || null
          : null,
    },
  };
}

// ---------------------------------------------------------------------------
// list
// ---------------------------------------------------------------------------

async function list(userId) {
  return addressRepo.findByUserId(userId);
}

// ---------------------------------------------------------------------------
// create (transactional)
// ---------------------------------------------------------------------------

async function create(userId, rawBody) {
  const norm = normalizeInput(rawBody);
  if (!norm.ok) {
    throw new AppError(norm.errors.join(" "), ERROR_CODES.VALIDATION_ERROR, 400);
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    if (norm.data.is_default) {
      await addressRepo.clearDefaultForUser(conn, userId);
    }

    await addressRepo.createAddress(conn, userId, norm.data);

    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

// ---------------------------------------------------------------------------
// update (transactional)
// ---------------------------------------------------------------------------

async function update(userId, addressId, rawBody) {
  if (!addressId) {
    throw new AppError("ID inválido.", ERROR_CODES.VALIDATION_ERROR, 400);
  }

  const norm = normalizeInput(rawBody);
  if (!norm.ok) {
    throw new AppError(norm.errors.join(" "), ERROR_CODES.VALIDATION_ERROR, 400);
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    if (norm.data.is_default) {
      await addressRepo.clearDefaultForUser(conn, userId);
    }

    const result = await addressRepo.updateAddress(conn, addressId, userId, norm.data);

    if (result.affectedRows === 0) {
      throw new AppError("Endereço não encontrado.", ERROR_CODES.NOT_FOUND, 404);
    }

    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

// ---------------------------------------------------------------------------
// remove
// ---------------------------------------------------------------------------

async function remove(userId, addressId) {
  const result = await addressRepo.deleteById(userId, addressId);
  if (result.affectedRows === 0) {
    throw new AppError("Endereço não encontrado.", ERROR_CODES.NOT_FOUND, 404);
  }
}

module.exports = { normalizeInput, list, create, update, remove };
