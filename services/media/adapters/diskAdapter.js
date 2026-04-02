"use strict";
// services/media/adapters/diskAdapter.js

const path = require("path");
const fs = require("fs");
const fsPromises = require("fs/promises");
const multer = require("multer");
const {
  UPLOAD_DIR, ensureDirSync, sanitizeSegment, buildFilename,
  normalizeTargets, normalizePublicPrefix, stripConfiguredBaseUrl,
} = require("./storageUtils");

function createDiskAdapter() {
  const uploadRoot = path.isAbsolute(UPLOAD_DIR)
    ? UPLOAD_DIR
    : path.resolve(__dirname, "../../..", UPLOAD_DIR);

  ensureDirSync(uploadRoot);

  const storage = multer.diskStorage({
    destination: (_req, _file, cb) => {
      try { ensureDirSync(uploadRoot); cb(null, uploadRoot); }
      catch (err) { cb(err); }
    },
    filename: (_req, file, cb) => {
      try { cb(null, buildFilename(file.originalname)); }
      catch (err) { cb(err); }
    },
  });

  const toPublicPath = (relativePath = "") => {
    const prefix = normalizePublicPrefix();
    const clean = sanitizeSegment(relativePath);
    if (!clean) return prefix;
    return `${prefix}/${clean}`.replace(/\\+/g, "/");
  };

  const resolveKey = (value = "") => {
    if (!value) return "";
    const withoutBaseUrl = stripConfiguredBaseUrl(String(value));
    const prefix = normalizePublicPrefix();
    const prefixSlash = `${prefix}/`;

    let relative = withoutBaseUrl;
    if (relative.startsWith(prefixSlash)) relative = relative.slice(prefixSlash.length);
    else if (relative === prefix) relative = "";
    else if (relative.startsWith(prefix)) relative = relative.slice(prefix.length);

    return path.resolve(uploadRoot, sanitizeSegment(relative));
  };

  return {
    type: "disk",
    storage,
    toPublicPath,
    resolveTargets: (inputs = []) =>
      normalizeTargets(inputs).map((t) => ({ path: t.path, key: t.key || resolveKey(t.path) })),
    persist: async (files = [], options = {}) => {
      const folder = sanitizeSegment(options.folder || "");
      const results = [];

      for (const file of files) {
        let relativePath = file.filename;

        if (folder) {
          const subDir = path.join(uploadRoot, folder);
          ensureDirSync(subDir);
          const srcPath = path.join(uploadRoot, file.filename);
          const destPath = path.join(subDir, file.filename);

          if (!fs.existsSync(srcPath)) throw new Error(`Arquivo temporário não encontrado em ${srcPath}`);
          fs.renameSync(srcPath, destPath);
          if (!fs.existsSync(destPath)) throw new Error(`Arquivo não encontrado após mover para ${destPath}`);

          relativePath = `${folder}/${file.filename}`;
        } else {
          const diskPath = path.join(uploadRoot, file.filename);
          if (!fs.existsSync(diskPath)) throw new Error(`[mediaService] Arquivo não encontrado após upload: ${diskPath}`);
        }

        const publicPath = toPublicPath(relativePath);
        results.push({ path: publicPath, key: resolveKey(publicPath) });
      }

      return results;
    },
    remove: async (targets = []) => {
      for (const target of targets) {
        if (!target?.key) continue;
        try { await fsPromises.unlink(target.key); }
        catch (err) { if (err?.code !== "ENOENT") throw err; }
      }
    },
  };
}

module.exports = { createDiskAdapter };
