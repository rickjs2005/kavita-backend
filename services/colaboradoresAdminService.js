"use strict";
// services/colaboradoresAdminService.js
// Business rules for the colaboradores admin module.
//
// Owns: image validation, media persistence, NOT_FOUND detection,
// verificado flag semantics (0 = public, 1 = admin), email stub.
//
// Does NOT own: HTTP request/response, SQL.

const fs = require("fs");
const AppError = require("../errors/AppError");
const ERROR_CODES = require("../constants/ErrorCodes");
const repo = require("../repositories/colaboradoresRepository");
const mediaService = require("./mediaService");
const { validateFileMagicBytes } = require("../utils/fileValidation");

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

function safeUnlink(file) {
  if (!file?.path) return;
  try {
    if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
  } catch (e) {
    console.warn("[colaboradoresService] Não foi possível remover arquivo temporário:", e.message);
  }
}

/**
 * Validates file magic bytes and throws AppError 400 if invalid.
 * Removes the temp file on rejection.
 *
 * @param {Express.Multer.File|undefined} file
 */
function assertValidFile(file) {
  if (!file) return;
  const { valid } = validateFileMagicBytes(file.path);
  if (!valid) {
    safeUnlink(file);
    throw new AppError(
      "Arquivo inválido. Envie uma imagem PNG, JPEG, WEBP ou GIF.",
      ERROR_CODES.VALIDATION_ERROR,
      400
    );
  }
}

/**
 * Persists an uploaded image and records it in the database.
 * Called inside the same logical unit as the colaborador insert.
 *
 * @param {number} colaboradorId
 * @param {Express.Multer.File} file
 */
async function _persistImage(colaboradorId, file) {
  const [uploaded] = await mediaService.persistMedia([file], { folder: "colaboradores" });
  const imagePath = uploaded.path;
  await repo.insertColaboradorImage(colaboradorId, imagePath);
  await repo.updateColaboradorImage(colaboradorId, imagePath);
}

/**
 * Shared insertion logic for both public and admin creation paths.
 *
 * @param {{ nome, cargo, whatsapp, email, descricao, especialidade_id, verificado }} data
 * @param {Express.Multer.File|undefined} file
 * @returns {{ id: number }}
 */
async function _create(data, file) {
  assertValidFile(file);
  const id = await repo.createColaborador(data);
  if (file) await _persistImage(id, file);
  return { id };
}

// ---------------------------------------------------------------------------
// Email stub
// TODO: replace with a real email service (e.g. comunicacaoService or SES).
// ---------------------------------------------------------------------------

async function _sendAprovadoEmail(email, nome) {
  if (!email) return;
  console.log(
    `[EMAIL STUB] Enviar para ${email}: Olá ${nome}, seu cadastro na Kavita foi aprovado!`
  );
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Creates a colaborador via the public "Trabalhe conosco" form.
 * Always sets verificado = 0 — requires admin approval.
 *
 * @param {{ nome, cargo, whatsapp, email, descricao, especialidade_id }} data
 * @param {Express.Multer.File|undefined} file
 * @returns {{ id: number }}
 */
async function createPublic(data, file) {
  return _create({ ...data, verificado: 0 }, file);
}

/**
 * Creates a colaborador directly from the admin panel.
 * Always sets verificado = 1 — immediately approved.
 *
 * @param {{ nome, cargo, whatsapp, email, descricao, especialidade_id }} data
 * @param {Express.Multer.File|undefined} file
 * @returns {{ id: number }}
 */
async function createAdmin(data, file) {
  return _create({ ...data, verificado: 1 }, file);
}

/**
 * Returns all colaboradores pending verification (verificado = 0).
 *
 * @returns {Array<object>}
 */
async function listPending() {
  return repo.listPendingColaboradores();
}

/**
 * Approves a colaborador: sets verificado = 1 and fires a notification email.
 * Email is fire-and-forget — failure does not roll back the verification.
 *
 * @param {number} id
 * @throws {AppError} 404 NOT_FOUND when colaborador does not exist
 */
async function verify(id) {
  const colab = await repo.findColaboradorById(id);
  if (!colab) {
    throw new AppError("Colaborador não encontrado.", ERROR_CODES.NOT_FOUND, 404);
  }
  await repo.verifyColaborador(id);

  // Fire-and-forget — email failure must not fail the verification response
  _sendAprovadoEmail(colab.email, colab.nome).catch((err) => {
    console.error("[colaboradoresService] Erro ao enviar e-mail de aprovação:", err);
  });
}

/**
 * Removes a colaborador and their images.
 * Physical file removal is fire-and-forget — failure does not affect the HTTP response.
 *
 * @param {number} id
 * @throws {AppError} 404 NOT_FOUND when colaborador does not exist
 */
async function remove(id) {
  const images = await repo.getColaboradorImages(id);
  await repo.deleteColaboradorImages(id);

  const affected = await repo.deleteColaborador(id);
  if (!affected) {
    throw new AppError("Colaborador não encontrado.", ERROR_CODES.NOT_FOUND, 404);
  }

  if (images.length) {
    mediaService
      .removeMedia(images.map((r) => ({ path: r.path })))
      .catch((err) => {
        console.error("[colaboradoresService] Falha ao remover mídias:", err);
      });
  }
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  createPublic,
  createAdmin,
  listPending,
  verify,
  remove,
};
