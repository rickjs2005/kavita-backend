"use strict";
// services/media/adapters/s3Adapter.js

const multer = require("multer");
const {
  MEDIA_PUBLIC_BASE_URL, sanitizeSegment, buildFilename, normalizeTargets,
} = require("./storageUtils");

function createS3Adapter(fallback) {
  let S3Client, PutObjectCommand, DeleteObjectCommand;

  try {
    ({ S3Client, PutObjectCommand, DeleteObjectCommand } = require("@aws-sdk/client-s3"));
  } catch {
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
    const configured = process.env.AWS_S3_PUBLIC_BASE_URL || MEDIA_PUBLIC_BASE_URL;
    if (configured) return configured.endsWith("/") ? configured : `${configured}/`;
    if (endpoint) return `${endpoint.replace(/\/$/, "")}/${bucket}/`;
    return `https://${bucket}.s3.${region}.amazonaws.com/`;
  })();

  const client = new S3Client({
    region, endpoint, forcePathStyle,
    credentials: process.env.AWS_ACCESS_KEY_ID
      ? { accessKeyId: process.env.AWS_ACCESS_KEY_ID, secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY }
      : undefined,
  });

  const storage = multer.memoryStorage();

  const buildKey = (file, folder = "") => sanitizeSegment(buildFilename(file.originalname, folder));

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
    if (value.startsWith(baseUrl)) return decodeURIComponent(value.slice(baseUrl.length));
    return sanitizeSegment(value.replace(/^\/+/, ""));
  };

  return {
    type: "s3",
    storage, toPublicPath,
    resolveTargets: (inputs = []) =>
      normalizeTargets(inputs).map((t) => ({ path: t.path, key: t.key || resolveKey(t.path) })).filter((t) => t.key),
    persist: async (files = [], options = {}) => {
      const folder = sanitizeSegment(options.folder || "");
      const uploaded = [];
      try {
        for (const file of files) {
          const key = folder ? `${folder}/${buildKey(file)}` : buildKey(file);
          await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: file.buffer, ContentType: file.mimetype }));
          uploaded.push({ path: toPublicPath(key), key });
        }
      } catch (err) {
        if (uploaded.length) {
          try { for (const item of uploaded) await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: item.key })); }
          catch (cleanupErr) { console.error("Erro ao limpar uploads parciais no S3:", cleanupErr); }
        }
        throw err;
      }
      return uploaded;
    },
    remove: async (targets = []) => {
      for (const target of targets) {
        if (!target?.key) continue;
        try { await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: target.key })); }
        catch (err) {
          if (err?.name === "NoSuchKey" || err?.$metadata?.httpStatusCode === 404) continue;
          throw err;
        }
      }
    },
  };
}

module.exports = { createS3Adapter };
