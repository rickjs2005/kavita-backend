"use strict";

// Feature flag do módulo público de drones.
//
// Controlada por env DRONES_PUBLIC_ENABLED:
//   - "0", "false", "off"      → módulo desligado (404 nas rotas públicas)
//   - qualquer outro valor      → módulo ligado (default)
//   - undefined                 → módulo ligado (default)
//
// Quando desligado, as rotas /api/public/drones/* respondem 404 sem
// expor que o módulo existe. O admin continua acessível para que
// o time interno possa preparar conteúdo antes do go-live.
//
// Não controla nada do admin — só o público. Para esconder o módulo
// inteiro do admin é preciso fluxo separado (não escopado nesta fase).

const AppError = require("../errors/AppError");
const ERROR_CODES = require("../constants/ErrorCodes");

const DISABLED_VALUES = new Set(["0", "false", "off", "no", "disabled"]);

function isDisabled() {
  const v = String(process.env.DRONES_PUBLIC_ENABLED ?? "")
    .trim()
    .toLowerCase();
  return DISABLED_VALUES.has(v);
}

module.exports = function requireDronesPublicEnabled(req, _res, next) {
  if (isDisabled()) {
    return next(
      new AppError(
        "Módulo de drones temporariamente indisponível.",
        ERROR_CODES.NOT_FOUND,
        404,
      ),
    );
  }
  return next();
};

module.exports.isDisabled = isDisabled;
