"use strict";

// lib/legal/versions.js
//
// Fonte única da verdade das versões correntes dos termos legais.
// Quando o texto muda materialmente (não só typo), incrementar a versão
// AQUI antes de subir o deploy. Isso muda o que o `consentsService`
// grava em cada novo aceite e o que o frontend recebe via
// `GET /api/public/legal/versions`.
//
// Versionamento semver:
//   - PATCH (1.0.x) — correção tipográfica, não exige re-aceite
//   - MINOR (1.x.0) — esclarecimento de finalidade existente, não exige
//     re-aceite mas vale registrar
//   - MAJOR (x.0.0) — nova finalidade / novo destinatário / nova base
//     legal — EXIGE re-aceite (futura: bloquear login até aceitar nova versão)
//
// Para o go-live inicial, ambos arrancam em 1.0.0.

const TERMS_VERSION = "1.0.0";
const PRIVACY_VERSION = "1.0.0";

// URLs públicas onde o usuário lê o texto completo antes de aceitar.
// Devem existir como rotas no frontend (Next.js).
const TERMS_URL = "/termos";
const PRIVACY_URL = "/privacidade";

// Sources válidos — espelham o ENUM da coluna `consents.source`.
// Manter sincronizado com a migration 2026050800000001-create-consents-table.
const SOURCES = Object.freeze({
  USER_REGISTER: "register",
  CORRETORA_SIGNUP: "corretora_signup",
  CORRETORA_LEAD: "lead_form",
  DRONE_LEAD: "drones_interest",
});

module.exports = {
  TERMS_VERSION,
  PRIVACY_VERSION,
  TERMS_URL,
  PRIVACY_URL,
  SOURCES,
};
