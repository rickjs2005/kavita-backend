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
load("/public/produtos", "./public/publicAvaliacoes"); // avaliações de produtos

// — Configuração e visual —
load("/config", "./public/publicShopConfig");
load("/public/site-hero", "./public/publicSiteHero");
load("/public/hero-slides", "./public/publicHeroSlides");

// — Editorial: notícias e drones —
load("/news", "./public/publicNews");
load("/public/drones", "./public/publicDrones");

// — Mercado do Café: corretoras —
load("/public/corretoras", "./public/publicCorretoras");
load("/public/plans", "./public/publicPlans");

// — Fase 10.1: verificação pública de contrato (QR Code do rodapé).
load("/public/verificar-contrato", "./public/publicContratoVerificacao");

// — Webhooks externos (sem auth; validação via assinatura no adapter)
load("/webhooks/asaas", "./public/webhookAsaas");
load("/webhooks/clicksign", "./public/webhookClicksign");

// — ETAPA 3.1: cotação café (fail-silent quando provider desligado)
load("/public/cotacoes-cafe", "./public/publicCotacoesCafe");

// — FIX #3: features ativas no ambiente (SMS, cotação)
load("/public/features", "./public/publicFeatures");

// — Contato público —
load("/public/contato", "./public/publicContato");
load("/public/support-config", "./public/publicSupportConfig");

// — Consulta de CEP (proxy para ViaCEP) —
load("/public/cep", "./public/publicCep");

// — Gestão de preferência de email (unsubscribe por HMAC) —
load("/public/email", "./public/publicEmail");

module.exports = router;
