// teste/testUtils.js
const express = require("express");

/**
 * Cria um app Express mínimo para testar rotas isoladas.
 * Inclui JSON body parser e um error handler compatível com AppError-like.
 */
function makeTestApp(mountPath, router) {
  const app = express();
  app.use(express.json());

  app.use(mountPath, router);

  // Error handler de teste:
  // - Se a rota chamar next(AppError), responde JSON com { code, message }
  // - Se vier algo inesperado, responde 500 padronizado
  // Obs: não acopla a implementação interna, mas garante contrato estável.
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    const status = err?.status || err?.statusCode || 500;
    const code = err?.code || "SERVER_ERROR";
    const message = err?.message || "Erro interno.";

    return res.status(status).json({ code, message });
  });

  return app;
}

/**
 * Cria um mock de connection transacional (mysql2-like).
 */
function makeMockConn() {
  return {
    beginTransaction: jest.fn().mockResolvedValue(undefined),
    query: jest.fn(),
    commit: jest.fn().mockResolvedValue(undefined),
    rollback: jest.fn().mockResolvedValue(undefined),
    release: jest.fn().mockResolvedValue(undefined),
  };
}

module.exports = { makeTestApp, makeMockConn };
