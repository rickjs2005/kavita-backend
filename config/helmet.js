"use strict";

// config/helmet.js
// Helmet security headers configuration.
//
// Origens localhost (DEV_ORIGINS) são incluídas apenas fora de produção.
// Em produção, nenhuma diretiva CSP contém referências a localhost.

const isDev = process.env.NODE_ENV !== "production";

const DEV_ORIGINS = isDev
  ? [
      "http://localhost:5000",
      "http://127.0.0.1:5000",
      "http://localhost:3000",
      "http://127.0.0.1:3000",
    ]
  : [];

module.exports = {
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:", ...DEV_ORIGINS],
      connectSrc: ["'self'", ...DEV_ORIGINS],
      mediaSrc: ["'self'", "https:", ...DEV_ORIGINS],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameSrc: ["'none'"],
      upgradeInsecureRequests: [],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
  frameguard: { action: "deny" },
  noSniff: true,
  referrerPolicy: { policy: "strict-origin-when-cross-origin" },
};
