"use strict";
// services/servicosAdminService.js
//
// Regras de negócio para o CRUD admin de colaboradores/serviços.
// Consumidor: controllers/servicosAdminController.js
//
// Tabelas: colaboradores, colaborador_images
// Pasta de mídia: services/

const { withTransaction } = require("../lib/withTransaction");
const AppError = require("../errors/AppError");
const ERROR_CODES = require("../constants/ErrorCodes");
const mediaService = require("./mediaService");
const { validateFileMagicBytes } = require("../utils/fileValidation");
const repo = require("../repositories/servicosAdminRepository");

const ALLOWED_MIME = ["image/png", "image/jpeg", "image/webp", "image/gif"];

// ---------------------------------------------------------------------------
// Helpers internos
// ---------------------------------------------------------------------------

function validateImages(files) {
  for (const file of files) {
    const { valid } = validateFileMagicBytes(file.path, ALLOWED_MIME);
    if (!valid) {
      throw new AppError(
        "Arquivo inválido. Envie PNG, JPG, WEBP ou GIF.",
        ERROR_CODES.VALIDATION_ERROR,
        400
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Leitura
// ---------------------------------------------------------------------------

/**
 * Lista todos os colaboradores com imagens extras anexadas.
 * @returns {object[]}
 */
async function listServicos() {
  const rows = await repo.findAll();
  if (!rows.length) return rows;

  const ids = rows.map((r) => r.id);
  const imgs = await repo.findImagesBatch(ids);

  const bucket = imgs.reduce((acc, r) => {
    (acc[r.colaborador_id] ||= []).push(r.path);
    return acc;
  }, {});

  return rows.map((r) => ({ ...r, images: bucket[r.id] || [] }));
}

// ---------------------------------------------------------------------------
// Criação
// ---------------------------------------------------------------------------

/**
 * Cria novo colaborador com imagens opcionais.
 * @param {{ nome, cargo, whatsapp, descricao, especialidade_id }} body
 * @param {Express.Multer.File[]} files
 * @returns {{ id: number }}
 */
async function createServico(body, files = []) {
  if (files.length) validateImages(files);

  let uploadedMedia = [];

  try {
    const result = await withTransaction(async (conn) => {
      const colaboradorId = await repo.insertServico(conn, body);

      if (files.length) {
        uploadedMedia = await mediaService.persistMedia(files, { folder: "services" });

        if (uploadedMedia.length) {
          const paths = uploadedMedia.map((m) => m.path);
          await repo.insertImages(conn, colaboradorId, paths);
          await repo.updateMainImage(conn, colaboradorId, paths[0]);
        }
      }

      return { id: colaboradorId };
    });
    return result;
  } catch (err) {
    if (uploadedMedia.length) mediaService.enqueueOrphanCleanup(uploadedMedia);
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Atualização
// ---------------------------------------------------------------------------

/**
 * Atualiza campos textuais e imagens de um colaborador.
 *
 * `keepImages` é um array de paths das imagens existentes que devem ser mantidas.
 * Imagens existentes que não estiverem em `keepImages` serão removidas do disco
 * após o commit.
 *
 * @param {number} id
 * @param {{ nome, cargo, whatsapp, descricao, especialidade_id }} body
 * @param {string[]} keepImages - paths a preservar
 * @param {Express.Multer.File[]} files - novas imagens
 */
async function updateServico(id, body, keepImages = [], files = []) {
  if (files.length) validateImages(files);

  let newlyUploaded = [];

  try {
    const toRemove = await withTransaction(async (conn) => {
      await repo.updateServico(conn, id, body);

      const existingImages = await repo.findImagesByColaboradorId(conn, id);

      const toKeep = existingImages.filter((img) => keepImages.includes(img.path));
      const removing = existingImages.filter((img) => !keepImages.includes(img.path));
      const removeIds = removing.map((img) => img.id);

      if (removeIds.length) {
        await repo.deleteImagesByIds(conn, removeIds, id);
      }

      if (files.length) {
        newlyUploaded = await mediaService.persistMedia(files, { folder: "services" });
        if (newlyUploaded.length) {
          const paths = newlyUploaded.map((m) => m.path);
          await repo.insertImages(conn, id, paths);
        }
      }

      const finalPaths = [
        ...toKeep.map((img) => img.path),
        ...newlyUploaded.map((m) => m.path),
      ];
      await repo.updateMainImage(conn, id, finalPaths[0] ?? null);

      return removing;
    });

    if (toRemove.length) {
      mediaService
        .removeMedia(toRemove.map((img) => ({ path: img.path })))
        .catch((err) => console.error("[servicosAdminService] Erro ao remover mídias antigas:", err));
    }
  } catch (err) {
    if (newlyUploaded.length) mediaService.enqueueOrphanCleanup(newlyUploaded);
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Remoção
// ---------------------------------------------------------------------------

/**
 * Remove colaborador e todas as suas imagens.
 * @param {number} id
 */
async function deleteServico(id) {
  const images = await withTransaction(async (conn) => {
    const imgs = await repo.findImagesByColaboradorId(conn, id);
    await repo.deleteAllImages(conn, id);
    const affected = await repo.deleteServico(conn, id);

    if (affected === 0) {
      throw new AppError("Serviço não encontrado.", ERROR_CODES.NOT_FOUND, 404);
    }

    return imgs;
  });

  if (images.length) {
    mediaService
      .removeMedia(images.map((img) => ({ path: img.path })))
      .catch((err) => console.error("[servicosAdminService] Erro ao remover mídias de serviço excluído:", err));
  }
}

// ---------------------------------------------------------------------------
// Verificação
// ---------------------------------------------------------------------------

/**
 * Alterna o campo `verificado` do colaborador.
 * @param {number} id
 * @param {boolean} verificado
 */
async function setVerificado(id, verificado) {
  const affected = await repo.setVerificado(id, verificado);
  if (affected === 0) {
    throw new AppError("Serviço não encontrado.", ERROR_CODES.NOT_FOUND, 404);
  }
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  listServicos,
  createServico,
  updateServico,
  deleteServico,
  setVerificado,
};
