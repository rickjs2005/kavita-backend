// config/mercadopago.js
"use strict";

const { MercadoPagoConfig } = require("mercadopago");

/**
 * Singleton do cliente Mercado Pago.
 * Inicializado lazy para que testes possam definir MP_ACCESS_TOKEN antes do require.
 */
let _client = null;

function getMPClient() {
  if (!_client) {
    _client = new MercadoPagoConfig({
      accessToken: process.env.MP_ACCESS_TOKEN,
    });
  }
  return _client;
}

/** Reseta o singleton (uso em testes) */
function resetMPClient() {
  _client = null;
}

module.exports = { getMPClient, resetMPClient };
