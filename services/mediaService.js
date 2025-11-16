const path = require("path");
const fs = require("fs");
const fsPromises = require("fs/promises");
const multer = require("multer");
const { randomUUID } = require("crypto");

const STORAGE_DRIVER = (process.env.MEDIA_STORAGE_DRIVER || process.env.MEDIA_STORAGE || "disk").toLowerCase();
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

const sanitizeSegment = (segment = "") => segment.replace(/\\+/g, "/").replace(/^\/+|\/+$/g, "");

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

const createDiskAdapter = () => {
  const uploadRoot = path.isAbsolute(UPLOAD_DIR)
    ? UPLOAD_DIR
    : path.join(process.cwd(), UPLOAD_DIR);

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

  const toPublicPath = (filename = "") => {
    const normalizedPrefix = PUBLIC_PREFIX.endsWith("/")
      ? PUBLIC_PREFIX.slice(0, -1)
      : PUBLIC_PREFIX;
    return `${normalizedPrefix}/${sanitizeSegment(filename)}`.replace(/\\+/g, "/");
  };

  const resolveKey = (value = "") => {
    if (!value) return "";
    const withoutBaseUrl = value.replace(MEDIA_PUBLIC_BASE_URL, "");
    const prefixNormalized = PUBLIC_PREFIX.endsWith("/")
      ? PUBLIC_PREFIX
      : `${PUBLIC_PREFIX}/`;
    let relative = withoutBaseUrl.startsWith(prefixNormalized)
      ? withoutBaseUrl.slice(prefixNormalized.length)
      : withoutBaseUrl.replace(PUBLIC_PREFIX, "");
    relative = relative.replace(/^\/+/, "");
    return path.join(uploadRoot, relative);
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
    persist: async (files = []) =>
      files.map((file) => ({
        path: toPublicPath(file.filename),
        key: resolveKey(toPublicPath(file.filename)),
      })),
    remove: async (targets = []) => {
      for (const target of targets) {
        if (!target?.key) continue;
        try {
          await fsPromises.unlink(target.key);
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
              await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: item.key }));
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
          await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: target.key }));
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
          uploaded.push({ path: `${baseUrl}${sanitizeSegment(key)}`, key: sanitizeSegment(key) });
        }
      } catch (err) {
        if (uploaded.length) {
          try {
            await Promise.all(
              uploaded.map((item) => bucket.file(item.key).delete({ ignoreNotFound: true }))
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

const imageFilter = (_req, file, cb) => {
  if (!file.mimetype || !file.mimetype.startsWith("image/")) {
    return cb(new Error("Arquivo não é uma imagem."));
  }
  cb(null, true);
};

const upload = multer({
  storage: storageAdapter.storage,
  fileFilter: imageFilter,
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
      processCleanupQueue().catch((err) => console.error("Erro na fila de limpeza:", err));
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
