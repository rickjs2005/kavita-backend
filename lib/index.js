"use strict";
// lib/index.js
// Ponto de entrada único para a infraestrutura compartilhada.
//
// Uso:
//   const { logger, redis, response } = require("../lib");

module.exports = {
  logger:   require("./logger"),
  redis:    require("./redis"),
  response: require("./response"),
};
