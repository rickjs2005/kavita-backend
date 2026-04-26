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
  if (typeof UPLOAD_DIR !== "string" || UPLOAD_DIR.trim() === "") {
    // Fail-fast no boot — defesa contra MEDIA_UPLOAD_DIR setado vazio em prod.
    // Sem isso, path.resolve recebe undefined e o servidor sobe mas explode
    // em runtime na primeira requisicao de upload (TypeError obscuro do node:path).
    throw new Error(
      "MEDIA_UPLOAD_DIR vazio. Configure o diretorio de upload de midia (default: 'uploads').",
    );
  }
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
      const persisted = []; // pra rollback em caso de erro parcial

      try {
        for (const file of files) {
          if (!file || typeof file !== "object") {
            throw new Error("[mediaService] Arquivo invalido (vazio ou tipo errado).");
          }

          // Dois caminhos suportados:
          //   1) file.filename presente -> ja' gravado em disco pelo multer.diskStorage
          //   2) file.buffer presente   -> in-memory (ex.: assinatura PNG vinda
          //      de base64 no body, file sintetico construido pelo service).
          // Sem nenhum dos dois, NAO seguimos com TypeError do node:path —
          // lancamos erro claro que o errorHandler converte em 400 amigavel.
          const hasOnDisk = typeof file.filename === "string" && file.filename.length > 0;
          const hasBuffer =
            file.buffer && Buffer.isBuffer(file.buffer) && file.buffer.length > 0;

          if (!hasOnDisk && !hasBuffer) {
            throw new Error(
              "[mediaService] Arquivo invalido: precisa de buffer (memoryStorage) ou filename (diskStorage).",
            );
          }

          // Define filename final (no disco). Para in-memory geramos um a partir
          // do originalname; para diskStorage o multer ja' definiu.
          const filename = hasOnDisk
            ? file.filename
            : buildFilename(file.originalname || "upload");

          let relativePath = filename;
          let absoluteDestPath;

          if (folder) {
            const subDir = path.join(uploadRoot, folder);
            ensureDirSync(subDir);
            absoluteDestPath = path.join(subDir, filename);
            relativePath = `${folder}/${filename}`;
          } else {
            absoluteDestPath = path.join(uploadRoot, filename);
          }

          if (hasOnDisk) {
            // Caso 1: multer.diskStorage ja' gravou em uploadRoot/<filename>.
            // So' movemos pra subpasta se necessario.
            const srcPath = path.join(uploadRoot, file.filename);
            if (!fs.existsSync(srcPath)) {
              throw new Error(`Arquivo temporário não encontrado em ${srcPath}`);
            }
            if (folder) {
              fs.renameSync(srcPath, absoluteDestPath);
              if (!fs.existsSync(absoluteDestPath)) {
                throw new Error(`Arquivo não encontrado após mover para ${absoluteDestPath}`);
              }
            } else if (!fs.existsSync(absoluteDestPath)) {
              throw new Error(
                `[mediaService] Arquivo não encontrado após upload: ${absoluteDestPath}`,
              );
            }
          } else {
            // Caso 2: in-memory. Escrevemos o buffer diretamente no destino.
            // writeFileSync com flag 'wx' falha se ja' existir (filename e' UUID,
            // colisao e' essencialmente impossivel — mas se ocorrer, melhor falhar
            // do que sobrescrever).
            fs.writeFileSync(absoluteDestPath, file.buffer, { flag: "wx" });
            if (!fs.existsSync(absoluteDestPath)) {
              throw new Error(
                `[mediaService] Falha ao gravar arquivo em ${absoluteDestPath}`,
              );
            }
          }

          const publicPath = toPublicPath(relativePath);
          const result = { path: publicPath, key: resolveKey(publicPath) };
          results.push(result);
          persisted.push(absoluteDestPath);
        }

        return results;
      } catch (err) {
        // Rollback: se algum arquivo do lote falhou, limpa os que foram gravados
        // antes pra nao deixar lixo no disco.
        for (const p of persisted) {
          try { fs.unlinkSync(p); } catch { /* best-effort */ }
        }
        throw err;
      }
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
