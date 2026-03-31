"use strict";

/**
 * services/media/mediaCleanup.js
 *
 * removeMedia síncrono-assíncrono e fila de cleanup de órfãos.
 * O estado da fila (cleanupQueue / cleanupProcessing) é singleton de módulo —
 * intencional para garantir que múltiplas chamadas concorrentes não
 * processem a mesma fila duas vezes.
 */

const { storageAdapter, normalizeTargets } = require("./storageAdapter");

// ── Estado da fila (singleton de módulo) ──────────────────────────────────

const cleanupQueue = [];
let cleanupProcessing = false;

// ── Resolução de targets ───────────────────────────────────────────────────

const resolveTargets = (targets) => {
  if (typeof storageAdapter.resolveTargets === "function") {
    return storageAdapter.resolveTargets(targets);
  }
  return normalizeTargets(targets);
};

// ── removeMedia ────────────────────────────────────────────────────────────

async function removeMedia(targets = []) {
  const normalized = resolveTargets(targets);

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

// ── Fila de cleanup de órfãos ──────────────────────────────────────────────

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
  const normalized = resolveTargets(targets);

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

module.exports = { removeMedia, enqueueOrphanCleanup };
