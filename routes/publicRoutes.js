"use strict";
// routes/publicRoutes.js
//
// Rotas sem autenticação: utilitários de infraestrutura e endpoints públicos.
//
// Contextos e contratos de middleware:
//   UTILITÁRIOS — sem auth, sem CSRF
//   PÚBLICO     — sem auth, sem CSRF (leitura aberta)

const router = require("express").Router();
const { loadRoute } = require("./routeLoader");

const load = (path, mod) => loadRoute(router, path, mod);

/* ============================================================
 * UTILITÁRIOS
 * Sem autenticação. Prefixo /uploads para assets físicos.
 * ============================================================ */

load("/uploads", "./utils/uploadsCheck");

/* ============================================================
 * ROTAS PÚBLICAS
 * Sem autenticação e sem CSRF.
 * Qualquer dado retornado aqui é legível por qualquer cliente.
 * ============================================================ */

// — Produtos e catálogo —
// publicProducts.js é o ponto único de montagem de /products.
// GET /:id (legado) é delegado internamente por publicProducts.js.
load("/products", "./public/publicProducts");
load("/public/categorias", "./public/publicCategorias");
load("/public/servicos", "./public/publicServicos");
load("/public/especialidades", "./public/publicEspecialidades");
load("/public/promocoes", "./public/publicPromocoes");
load("/public/produtos", "./public/_legacy/publicProdutos"); // avaliações de produtos

// — Configuração e visual —
load("/config", "./public/publicShopConfig");
load("/public/site-hero", "./public/publicSiteHero");

// — Editorial: notícias e drones —
load("/news", "./public/publicNews");
load("/public/drones", "./public/publicDrones");

module.exports = router;
