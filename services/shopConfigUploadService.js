"use strict";
// services/shopConfigUploadService.js
// Lógica de negócio para upload da logo da loja.

const path = require("path");
const fs = require("fs");
const configRepo = require("../repositories/configRepository");
const mediaService = require("./mediaService");

function safeUnlink(filePath) {
  try {
    if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch (e) {
    console.warn("⚠️ Não foi possível remover logo antiga:", e.message);
  }
}

async function uploadLogo(file) {
  const id = await configRepo.ensureSettings();
  const oldLogoUrl = await configRepo.findLogoUrl(id);

  const [uploaded] = await mediaService.persistMedia([file], { folder: "logos" });
  const publicPath = uploaded.path;

  await configRepo.updateLogoUrl(id, publicPath);

  if (oldLogoUrl && typeof oldLogoUrl === "string" && oldLogoUrl.startsWith("/uploads/logos/")) {
    const absPath = path.resolve(process.cwd(), oldLogoUrl.replace(/^\//, ""));
    safeUnlink(absPath);
  }

  return { logo_url: publicPath, updated_at: new Date().toISOString() };
}

module.exports = { uploadLogo };
