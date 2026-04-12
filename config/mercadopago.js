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
    const accessToken = process.env.MP_ACCESS_TOKEN;
    if (!accessToken) {
      throw new Error(
        "MP_ACCESS_TOKEN não configurado. Pagamentos via Mercado Pago estão indisponíveis."
      );
    }
    _client = new MercadoPagoConfig({ accessToken });
  }
  return _client;
}

/** Reseta o singleton (uso em testes) */
function resetMPClient() {
  _client = null;
}

module.exports = { getMPClient, resetMPClient };
