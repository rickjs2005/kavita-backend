"use strict";
// routes/authIndex.js
//
// Rotas de autenticação e de usuário autenticado.
//
// Contextos e contratos de middleware:
//   AUTENTICAÇÃO          — sem CSRF (pontos de entrada de sessão)
//   USUÁRIO AUTENTICADO   — authenticateToken dentro do sub-roteador
//                           validateCSRF aplicado aqui nas rotas de mutação

const router = require("express").Router();
const { validateCSRF } = require("../middleware/csrfProtection");
const { loadRoute, handleRouteLoadError } = require("./routeLoader");

const load = (path, mod) => loadRoute(router, path, mod);

/* ============================================================
 * AUTENTICAÇÃO
 * Rotas de entrada de sessão — sem CSRF (o token ainda não existe).
 * ============================================================ */

// Login de usuário e admin (pontos de entrada de sessão — sem CSRF)
load("/login", "./auth/login");
load("/admin", "./auth/adminLogin");

// Login/logout/me da corretora — mesmo contrato do admin (cookie HttpOnly)
load("/corretora", "./auth/corretoraAuth");

// Registro, forgot/reset password, logout, csrf-token (usuário)
load("/", "./auth/authRoutes");

/* ============================================================
 * USUÁRIO AUTENTICADO
 * authenticateToken é aplicado dentro de cada sub-roteador.
 * validateCSRF é aplicado aqui para proteger todas as mutações.
 * ============================================================ */

// Cadastro básico e recuperação de senha (sem CSRF — não é mutação de sessão autenticada)
load("/users", "./auth/userRegister");

// Perfil e endereços (autenticados + CSRF)
try {
  const userProfileRoutes = require("./auth/userProfile");
  router.use("/users", validateCSRF, userProfileRoutes);
} catch (err) {
  handleRouteLoadError("./auth/userProfile", err);
}
try {
  const userAddressesRoutes = require("./auth/userAddresses");
  router.use("/users/addresses", validateCSRF, userAddressesRoutes);
} catch (err) {
  handleRouteLoadError("./auth/userAddresses", err);
}

module.exports = router;
