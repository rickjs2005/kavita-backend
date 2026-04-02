"use strict";
// services/media/storageAdapter.js
//
// Factory que seleciona o adapter de storage baseado em MEDIA_STORAGE_DRIVER.
// Adapters individuais: adapters/diskAdapter.js, adapters/s3Adapter.js, adapters/gcsAdapter.js.
// Utilitários compartilhados: adapters/storageUtils.js.

const { createDiskAdapter } = require("./adapters/diskAdapter");
const { createS3Adapter } = require("./adapters/s3Adapter");
const { createGcsAdapter } = require("./adapters/gcsAdapter");
const { normalizeTargets } = require("./adapters/storageUtils");

const STORAGE_DRIVER = (
  process.env.MEDIA_STORAGE_DRIVER ||
  process.env.MEDIA_STORAGE ||
  "disk"
).toLowerCase();

const diskAdapter = createDiskAdapter();

const storageAdapter = (() => {
  if (STORAGE_DRIVER === "s3") return createS3Adapter(diskAdapter);
  if (["gcs", "cloud", "cloud-storage", "google"].includes(STORAGE_DRIVER)) {
    return createGcsAdapter(diskAdapter);
  }
  return diskAdapter;
})();

module.exports = { storageAdapter, normalizeTargets };
