"use strict";
// routes/routeLoader.js
//
// Utilitários de carregamento de rota usados por todos os sub-índices.
// Importar em vez de duplicar.

const router = require("express").Router;

/**
 * Trata falha de carregamento de rota:
 * - Em produção: lança erro para abortar a inicialização do processo.
 *   O supervisor (PM2, Docker) detectará a falha e não subirá a instância.
 * - Fora de produção: loga com aviso proeminente e continua (dev/CI).
 */
function handleRouteLoadError(moduleName, err) {
  const msg = `❌ Falha ao carregar rota "${moduleName}": ${err.message}`;
  if (process.env.NODE_ENV === "production") {
    throw new Error(msg);
  }
  console.error(msg);
  console.error("⚠️  ATENÇÃO: esta rota está INDISPONÍVEL. Corrija antes de ir para produção.\n");
}

/**
 * Monta um módulo de rota em `r` no caminho `path`.
 * Captura falhas de require sem travar o processo (exceto em produção).
 *
 * @param {import("express").Router} r  O router receptor
 * @param {string} path                Prefixo de montagem
 * @param {string} moduleName          Caminho passado ao require()
 */
function loadRoute(r, path, moduleName) {
  try {
    const routeModule = require(moduleName);
    r.use(path, routeModule);
  } catch (err) {
    handleRouteLoadError(moduleName, err);
  }
}

module.exports = { handleRouteLoadError, loadRoute };
