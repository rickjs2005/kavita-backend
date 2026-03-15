const path = require("path");
const fs = require("fs");
const fsPromises = require("fs/promises");
const multer = require("multer");
const { randomUUID } = require("crypto");

const STORAGE_DRIVER = (
  process.env.MEDIA_STORAGE_DRIVER ||
  process.env.MEDIA_STORAGE ||
  "disk"
).toLowerCase();

const UPLOAD_DIR = process.env.MEDIA_UPLOAD_DIR || "uploads";
const PUBLIC_PREFIX = process.env.MEDIA_PUBLIC_PREFIX || "/uploads";
const MEDIA_PUBLIC_BASE_URL = process.env.MEDIA_PUBLIC_BASE_URL || "";

const cleanupQueue = [];
let cleanupProcessing = false;

const ensureDirSync = (dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
};

const generateId = () => {
  try {
    return randomUUID();
  } catch (_) {
    return Math.random().toString(36).slice(2);
  }
};

const sanitizeSegment = (segment = "") =>
  String(segment).replace(/\\+/g, "/").replace(/^\/+|\/+$/g, "");

const buildFilename = (original = "", prefix = "") => {
  const ext = path.extname(original) || "";
  const safePrefix = prefix ? `${sanitizeSegment(prefix)}-` : "";
  return `${safePrefix}${Date.now()}-${generateId()}${ext}`.replace(/\s+/g, "");
};

const normalizeTargets = (targets = []) => {
  const items = Array.isArray(targets) ? targets : [targets];
  return items
    .filter(Boolean)
    .map((item) => (typeof item === "string" ? { path: item } : item))
    .filter((item) => item && item.path);
};

const normalizePublicPrefix = () =>
  PUBLIC_PREFIX.endsWith("/") ? PUBLIC_PREFIX.slice(0, -1) : PUBLIC_PREFIX;

const stripConfiguredBaseUrl = (value = "") => {
  if (!MEDIA_PUBLIC_BASE_URL) return value;
  return value.replace(MEDIA_PUBLIC_BASE_URL, "");
};

const createDiskAdapter = () => {
  const uploadRoot = path.isAbsolute(UPLOAD_DIR)
    ? UPLOAD_DIR
    : path.resolve(__dirname, "..", UPLOAD_DIR);

  ensureDirSync(uploadRoot);

  const storage = multer.diskStorage({
    destination: (_req, _file, cb) => {
      try {
        ensureDirSync(uploadRoot);
        cb(null, uploadRoot);
      } catch (err) {
        cb(err);
      }
    },
    filename: (_req, file, cb) => {
      try {
        const filename = buildFilename(file.originalname);
        cb(null, filename);
      } catch (err) {
        cb(err);
      }
    },
  });

  const toPublicPath = (relativePath = "") => {
    const normalizedPrefix = normalizePublicPrefix();
    const cleanRelative = sanitizeSegment(relativePath);
    if (!cleanRelative) return normalizedPrefix;
    return `${normalizedPrefix}/${cleanRelative}`.replace(/\\+/g, "/");
  };

  const resolveKey = (value = "") => {
    if (!value) return "";

    const withoutBaseUrl = stripConfiguredBaseUrl(String(value));
    const normalizedPrefix = normalizePublicPrefix();
    const prefixWithSlash = `${normalizedPrefix}/`;

    let relative = withoutBaseUrl;

    if (relative.startsWith(prefixWithSlash)) {
      relative = relative.slice(prefixWithSlash.length);
    } else if (relative === normalizedPrefix) {
      relative = "";
    } else if (relative.startsWith(normalizedPrefix)) {
      relative = relative.slice(normalizedPrefix.length);
    }

    relative = sanitizeSegment(relative);

    return path.resolve(uploadRoot, relative);
  };

  return {
    type: "disk",
    storage,
    toPublicPath,
    resolveTargets: (inputs = []) => {
      return normalizeTargets(inputs).map((target) => ({
        path: target.path,
        key: target.key || resolveKey(target.path),
      }));
    },
    persist: async (files = [], options = {}) => {
      const folder = sanitizeSegment(options.folder || "");
      const results = [];

      for (const file of files) {
        let relativePath = file.filename;

        console.log("[mediaService] ------------------------------");
        console.log("[mediaService] storage=disk");
        console.log("[mediaService] uploadRoot:", uploadRoot);
        console.log("[mediaService] folder:", folder || "(root)");
        console.log("[mediaService] file.originalname:", file.originalname);
        console.log("[mediaService] file.filename:", file.filename);

        if (folder) {
          const subDir = path.join(uploadRoot, folder);
          ensureDirSync(subDir);

          const srcPath = path.join(uploadRoot, file.filename);
          const destPath = path.join(subDir, file.filename);

          console.log("[mediaService] srcPath:", srcPath);
          console.log("[mediaService] destPath:", destPath);

          try {
            if (!fs.existsSync(srcPath)) {
              throw new Error(`Arquivo temporário não encontrado em ${srcPath}`);
            }

            fs.renameSync(srcPath, destPath);

            if (!fs.existsSync(destPath)) {
              throw new Error(`Arquivo não encontrado após mover para ${destPath}`);
            }

            relativePath = `${folder}/${file.filename}`;
            console.log(`[mediaService] ✅ Arquivo movido para: ${destPath}`);
          } catch (err) {
            console.error(
              `[mediaService] ❌ Erro ao mover arquivo para ${destPath}: ${err.message}`
            );
            throw err;
          }
        } else {
          const diskPath = path.join(uploadRoot, file.filename);
          if (!fs.existsSync(diskPath)) {
            throw new Error(
              `[mediaService] Arquivo não encontrado após upload: ${diskPath}`
            );
          }
          console.log(`[mediaService] ✅ Arquivo salvo: ${diskPath}`);
        }

        const publicPath = toPublicPath(relativePath);
        const resolvedKey = resolveKey(publicPath);

        console.log("[mediaService] publicPath:", publicPath);
        console.log("[mediaService] resolvedKey:", resolvedKey);

        results.push({
          path: publicPath,
          key: resolvedKey,
        });
      }

      return results;
    },
    remove: async (targets = []) => {
      for (const target of targets) {
        if (!target?.key) continue;

        try {
          await fsPromises.unlink(target.key);
          console.log(`[mediaService] 🗑️ Arquivo removido: ${target.key}`);
        } catch (err) {
          if (err?.code !== "ENOENT") throw err;
        }
      }
    },
  };
};

const createS3Adapter = (fallback) => {
  let S3Client;
  let PutObjectCommand;
  let DeleteObjectCommand;

  try {
    ({ S3Client, PutObjectCommand, DeleteObjectCommand } = require("@aws-sdk/client-s3"));
  } catch (err) {
    console.warn("@aws-sdk/client-s3 não encontrado. Recuando para storage local.");
    return fallback;
  }

  const bucket = process.env.AWS_S3_BUCKET || process.env.S3_BUCKET;
  const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || "us-east-1";

  if (!bucket) {
    console.warn("Bucket S3 não configurado. Recuando para storage local.");
    return fallback;
  }

  const endpoint = process.env.AWS_S3_ENDPOINT || process.env.S3_ENDPOINT;
  const forcePathStyle = /^true$/i.test(process.env.AWS_S3_FORCE_PATH_STYLE || "");

  const baseUrl = (() => {
    const configuredBase = process.env.AWS_S3_PUBLIC_BASE_URL || MEDIA_PUBLIC_BASE_URL;
    if (configuredBase) {
      return configuredBase.endsWith("/") ? configuredBase : `${configuredBase}/`;
    }
    if (endpoint) {
      return `${endpoint.replace(/\/$/, "")}/${bucket}/`;
    }
    return `https://${bucket}.s3.${region}.amazonaws.com/`;
  })();

  const client = new S3Client({
    region,
    endpoint,
    forcePathStyle,
    credentials: process.env.AWS_ACCESS_KEY_ID
      ? {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        }
      : undefined,
  });

  const storage = multer.memoryStorage();

  const buildKey = (file, folder = "") => {
    const base = buildFilename(file.originalname, folder);
    return sanitizeSegment(base);
  };

  const toPublicPath = (key = "") => {
    if (!key) return key;
    if (/^https?:\/\//i.test(key)) return key;
    return `${baseUrl}${sanitizeSegment(key)}`;
  };

  const resolveKey = (value = "") => {
    if (!value) return "";
    if (value.startsWith("s3://")) {
      const prefix = `s3://${bucket}/`;
      return value.startsWith(prefix) ? value.slice(prefix.length) : value;
    }
    if (value.startsWith(baseUrl)) {
      return decodeURIComponent(value.slice(baseUrl.length));
    }
    return sanitizeSegment(value.replace(/^\/+/, ""));
  };

  return {
    type: "s3",
    storage,
    toPublicPath,
    resolveTargets: (inputs = []) =>
      normalizeTargets(inputs)
        .map((target) => ({
          path: target.path,
          key: target.key || resolveKey(target.path),
        }))
        .filter((target) => target.key),
    persist: async (files = [], options = {}) => {
      const folder = sanitizeSegment(options.folder || "");
      const uploaded = [];

      try {
        for (const file of files) {
          const key = folder ? `${folder}/${buildKey(file)}` : buildKey(file);

          await client.send(
            new PutObjectCommand({
              Bucket: bucket,
              Key: key,
              Body: file.buffer,
              ContentType: file.mimetype,
            })
          );

          uploaded.push({ path: toPublicPath(key), key });
        }
      } catch (err) {
        if (uploaded.length) {
          try {
            for (const item of uploaded) {
              await client.send(
                new DeleteObjectCommand({
                  Bucket: bucket,
                  Key: item.key,
                })
              );
            }
          } catch (cleanupErr) {
            console.error("Erro ao limpar uploads parciais no S3:", cleanupErr);
          }
        }
        throw err;
      }

      return uploaded;
    },
    remove: async (targets = []) => {
      for (const target of targets) {
        if (!target?.key) continue;

        try {
          await client.send(
            new DeleteObjectCommand({
              Bucket: bucket,
              Key: target.key,
            })
          );
        } catch (err) {
          if (err?.name === "NoSuchKey") continue;
          if (err?.$metadata?.httpStatusCode === 404) continue;
          throw err;
        }
      }
    },
  };
};

const createGcsAdapter = (fallback) => {
  let Storage;

  try {
    ({ Storage } = require("@google-cloud/storage"));
  } catch (err) {
    console.warn("@google-cloud/storage não encontrado. Recuando para storage local.");
    return fallback;
  }

  const bucketName =
    process.env.GCS_BUCKET ||
    process.env.GOOGLE_CLOUD_BUCKET ||
    process.env.GCLOUD_STORAGE_BUCKET;

  if (!bucketName) {
    console.warn("Bucket do Cloud Storage não configurado. Recuando para storage local.");
    return fallback;
  }

  const storage = new Storage({
    projectId: process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT,
    keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS,
  });

  const bucket = storage.bucket(bucketName);

  const baseUrl = (() => {
    const configured = process.env.GCS_PUBLIC_BASE_URL || MEDIA_PUBLIC_BASE_URL;
    if (configured) {
      return configured.endsWith("/") ? configured : `${configured}/`;
    }
    return `https://storage.googleapis.com/${bucketName}/`;
  })();

  const memoryStorage = multer.memoryStorage();

  const resolveKey = (value = "") => {
    if (!value) return "";
    if (value.startsWith("gs://")) {
      const prefix = `gs://${bucketName}/`;
      return value.startsWith(prefix) ? value.slice(prefix.length) : value;
    }
    if (value.startsWith(baseUrl)) {
      return decodeURIComponent(value.slice(baseUrl.length));
    }
    return sanitizeSegment(value.replace(/^\/+/, ""));
  };

  return {
    type: "gcs",
    storage: memoryStorage,
    toPublicPath: (key = "") => {
      if (!key) return key;
      if (/^https?:\/\//i.test(key)) return key;
      return `${baseUrl}${sanitizeSegment(key)}`;
    },
    resolveTargets: (inputs = []) =>
      normalizeTargets(inputs)
        .map((target) => ({
          path: target.path,
          key: target.key || resolveKey(target.path),
        }))
        .filter((target) => target.key),
    persist: async (files = [], options = {}) => {
      const folder = sanitizeSegment(options.folder || "");
      const uploaded = [];

      try {
        for (const file of files) {
          const key = folder
            ? `${folder}/${buildFilename(file.originalname)}`
            : buildFilename(file.originalname);

          const fileRef = bucket.file(sanitizeSegment(key));

          await fileRef.save(file.buffer, {
            resumable: false,
            contentType: file.mimetype,
            public: true,
          });

          uploaded.push({
            path: `${baseUrl}${sanitizeSegment(key)}`,
            key: sanitizeSegment(key),
          });
        }
      } catch (err) {
        if (uploaded.length) {
          try {
            await Promise.all(
              uploaded.map((item) =>
                bucket.file(item.key).delete({ ignoreNotFound: true })
              )
            );
          } catch (cleanupErr) {
            console.error("Erro ao limpar uploads parciais no Cloud Storage:", cleanupErr);
          }
        }
        throw err;
      }

      return uploaded;
    },
    remove: async (targets = []) => {
      for (const target of targets) {
        if (!target?.key) continue;

        try {
          await bucket.file(target.key).delete({ ignoreNotFound: true });
        } catch (err) {
          if (err?.code === 404) continue;
          throw err;
        }
      }
    },
  };
};

const diskAdapter = createDiskAdapter();

const storageAdapter = (() => {
  if (STORAGE_DRIVER === "s3") {
    return createS3Adapter(diskAdapter);
  }
  if (["gcs", "cloud", "cloud-storage", "google"].includes(STORAGE_DRIVER)) {
    return createGcsAdapter(diskAdapter);
  }
  return diskAdapter;
})();

/* ====================================================================== */
/* Filtro de upload                                                        */
/* ====================================================================== */

// Tipos de imagem explicitamente permitidos.
// image/* proposital NÃO é usado para evitar image/svg+xml (XSS) e outros tipos perigosos.
const ALLOWED_IMAGE_MIMES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

// Tipos de vídeo permitidos para campos específicos (heroVideo / media)
const ALLOWED_VIDEO_MIMES = new Set([
  "video/mp4",
  "video/webm",
  "video/ogg",
]);

const imageFilter = (_req, file, cb) => {
  const mime = String(file.mimetype || "");

  if (file.fieldname === "heroVideo") {
    if (!ALLOWED_VIDEO_MIMES.has(mime)) {
      return cb(Object.assign(new Error("heroVideo inválido. Use mp4, webm ou ogg."), { status: 400 }));
    }
    return cb(null, true);
  }

  if (file.fieldname === "media") {
    if (!ALLOWED_IMAGE_MIMES.has(mime) && !ALLOWED_VIDEO_MIMES.has(mime)) {
      return cb(Object.assign(new Error("Arquivo inválido. Envie imagem (jpeg/png/webp/gif) ou vídeo (mp4/webm/ogg)."), { status: 400 }));
    }
    return cb(null, true);
  }

  if (!ALLOWED_IMAGE_MIMES.has(mime)) {
    return cb(Object.assign(new Error("Tipo de arquivo não permitido. Use: jpeg, png, webp ou gif."), { status: 400 }));
  }

  return cb(null, true);
};

const upload = multer({
  storage: storageAdapter.storage,
  fileFilter: imageFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5 MB por arquivo (multipart — diferente do limit do express.json)
    files: 10,                  // máx 10 arquivos por requisição
  },
});

const resolveTargetsForAdapter = (targets) => {
  if (typeof storageAdapter.resolveTargets === "function") {
    return storageAdapter.resolveTargets(targets);
  }
  return normalizeTargets(targets);
};

async function persistMedia(files = [], options = {}) {
  if (!files.length || typeof storageAdapter.persist !== "function") {
    return [];
  }
  return storageAdapter.persist(files, options);
}

async function removeMedia(targets = []) {
  const normalized = resolveTargetsForAdapter(targets);

  if (!normalized.length || typeof storageAdapter.remove !== "function") {
    return;
  }

  try {
    await storageAdapter.remove(normalized);
  } catch (err) {
    console.error("Erro ao remover mídia:", err);
    throw err;
  }
}

async function processCleanupQueue() {
  if (cleanupProcessing) return;
  cleanupProcessing = true;

  while (cleanupQueue.length) {
    const job = cleanupQueue.shift();

    try {
      await removeMedia(job.targets);
    } catch (err) {
      console.error("Erro ao processar limpeza de mídia:", err);
    } finally {
      job.resolve();
    }
  }

  cleanupProcessing = false;
}

function enqueueOrphanCleanup(targets = []) {
  const normalized = resolveTargetsForAdapter(targets);

  if (!normalized.length) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    cleanupQueue.push({ targets: normalized, resolve });

    setImmediate(() => {
      processCleanupQueue().catch((err) =>
        console.error("Erro na fila de limpeza:", err)
      );
    });
  });
}

module.exports = {
  upload,
  persistMedia,
  removeMedia,
  enqueueOrphanCleanup,
  storageType: storageAdapter.type,
  toPublicPath: (filename) =>
    typeof storageAdapter.toPublicPath === "function"
      ? storageAdapter.toPublicPath(filename)
      : filename,
};