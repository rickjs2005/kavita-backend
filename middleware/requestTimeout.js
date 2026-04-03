"use strict";
// middleware/requestTimeout.js
//
// Aborta requests que excedam o tempo limite, evitando que queries lentas
// ou APIs externas travadas segurem conexões indefinidamente.
//
// Retorna 503 Service Unavailable com Retry-After header.
// Não afeta streaming ou uploads longos (use timeout por rota para esses).

const AppError = require("../errors/AppError");
const ERROR_CODES = require("../constants/ErrorCodes");

const DEFAULT_TIMEOUT_MS = 30_000; // 30 segundos

/**
 * @param {number} [ms=30000] Timeout em milissegundos
 */
function requestTimeout(ms = DEFAULT_TIMEOUT_MS) {
  return (req, res, next) => {
    const timer = setTimeout(() => {
      if (res.headersSent) return;

      res.set("Retry-After", "5");
      next(
        new AppError(
          "A requisição excedeu o tempo limite. Tente novamente.",
          ERROR_CODES.SERVER_ERROR,
          503
        )
      );
    }, ms);

    // Limpa o timer quando a resposta é enviada (normal ou erro)
    res.on("close", () => clearTimeout(timer));

    next();
  };
}

module.exports = requestTimeout;
