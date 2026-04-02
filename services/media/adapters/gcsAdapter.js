"use strict";
// services/media/adapters/gcsAdapter.js

const multer = require("multer");
const {
  MEDIA_PUBLIC_BASE_URL, sanitizeSegment, buildFilename, normalizeTargets,
} = require("./storageUtils");

function createGcsAdapter(fallback) {
  let Storage;

  try {
    ({ Storage } = require("@google-cloud/storage"));
  } catch {
    console.warn("@google-cloud/storage não encontrado. Recuando para storage local.");
    return fallback;
  }

  const bucketName = process.env.GCS_BUCKET || process.env.GOOGLE_CLOUD_BUCKET || process.env.GCLOUD_STORAGE_BUCKET;

  if (!bucketName) {
    console.warn("Bucket do Cloud Storage não configurado. Recuando para storage local.");
    return fallback;
  }

  const gcsStorage = new Storage({
    projectId: process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT,
    keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS,
  });

  const bucket = gcsStorage.bucket(bucketName);

  const baseUrl = (() => {
    const configured = process.env.GCS_PUBLIC_BASE_URL || MEDIA_PUBLIC_BASE_URL;
    if (configured) return configured.endsWith("/") ? configured : `${configured}/`;
    return `https://storage.googleapis.com/${bucketName}/`;
  })();

  const resolveKey = (value = "") => {
    if (!value) return "";
    if (value.startsWith("gs://")) {
      const prefix = `gs://${bucketName}/`;
      return value.startsWith(prefix) ? value.slice(prefix.length) : value;
    }
    if (value.startsWith(baseUrl)) return decodeURIComponent(value.slice(baseUrl.length));
    return sanitizeSegment(value.replace(/^\/+/, ""));
  };

  return {
    type: "gcs",
    storage: multer.memoryStorage(),
    toPublicPath: (key = "") => {
      if (!key || /^https?:\/\//i.test(key)) return key;
      return `${baseUrl}${sanitizeSegment(key)}`;
    },
    resolveTargets: (inputs = []) =>
      normalizeTargets(inputs).map((t) => ({ path: t.path, key: t.key || resolveKey(t.path) })).filter((t) => t.key),
    persist: async (files = [], options = {}) => {
      const folder = sanitizeSegment(options.folder || "");
      const uploaded = [];
      try {
        for (const file of files) {
          const key = folder ? `${folder}/${buildFilename(file.originalname)}` : buildFilename(file.originalname);
          const fileRef = bucket.file(sanitizeSegment(key));
          await fileRef.save(file.buffer, { resumable: false, contentType: file.mimetype, public: true });
          uploaded.push({ path: `${baseUrl}${sanitizeSegment(key)}`, key: sanitizeSegment(key) });
        }
      } catch (err) {
        if (uploaded.length) {
          try { await Promise.all(uploaded.map((item) => bucket.file(item.key).delete({ ignoreNotFound: true }))); }
          catch (cleanupErr) { console.error("Erro ao limpar uploads parciais no Cloud Storage:", cleanupErr); }
        }
        throw err;
      }
      return uploaded;
    },
    remove: async (targets = []) => {
      for (const target of targets) {
        if (!target?.key) continue;
        try { await bucket.file(target.key).delete({ ignoreNotFound: true }); }
        catch (err) { if (err?.code === 404) continue; throw err; }
      }
    },
  };
}

module.exports = { createGcsAdapter };
