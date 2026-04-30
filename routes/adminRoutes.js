"use strict";
// routes/adminRoutes.js
//
// Rotas do painel admin — todas protegidas por verifyAdmin + validateCSRF.
//
// Sub-grupos:
//   Catálogo     — produtos, categorias, promoções, cupons
//   Conteúdo     — news, hero, colaboradores, serviços, drones
//   Operações    — pedidos, carrinhos, stats, relatórios
//   Configuração — config, uploads, frete
//   Sistema      — comunicação, logs, permissões, roles, admins
//
// Nota: usuários, roles e permissões são sensíveis; qualquer acesso aqui
// já está coberto por verifyAdmin. requirePermission adicional pode ser
// aplicado dentro dos sub-roteadores quando necessário.

const router = require("express").Router();
const verifyAdmin = require("../middleware/verifyAdmin");
const { validateCSRF } = require("../middleware/csrfProtection");
const requirePermission = require("../middleware/requirePermission");
const { handleRouteLoadError } = require("./routeLoader");

// Helper local: todas as rotas admin levam verifyAdmin + validateCSRF.
function mount(path, moduleName, ...extra) {
  try {
    const mod = require(moduleName);
    router.use(path, verifyAdmin, validateCSRF, ...extra, mod);
  } catch (err) {
    handleRouteLoadError(moduleName, err);
  }
}

/* ============================================================
 * Catálogo
 * ============================================================ */

mount("/admin/produtos",            "./admin/adminProdutos");
mount("/admin/categorias",          "./admin/adminCategorias");
mount("/admin/marketing/promocoes", "./admin/adminMarketingPromocoes");
mount("/admin/cupons",              "./admin/adminCupons");

/* ============================================================
 * Conteúdo editorial
 * ============================================================ */

mount("/admin/news",            "./admin/adminNews");
// Separado de adminNews porque usa multer (ver adminNewsUpload.js)
mount("/admin/news",            "./admin/adminNewsUpload");
// Legacy singleton hero — kept for backward compat but superseded by hero-slides
mount("/admin/site-hero",       "./admin/adminSiteHero");
mount("/admin/hero-slides",    "./admin/adminHeroSlides");
mount("/admin/colaboradores",   "./admin/adminColaboradores");
mount("/admin/servicos",        "./admin/adminServicos");
mount("/admin/servicos/solicitacoes", "./admin/adminSolicitacoesServicos");
mount("/admin/especialidades",  "./admin/adminEspecialidades");
mount("/admin/drones",          "./admin/adminDrones");
// Bloco 5 — permissões granulares. O mount exige o piso mínimo (view).
// Ações mais sensíveis (approve/moderate/plan_manage/financial) ficam
// no controller/router individual via requirePermission. Quem tem a
// super-permissão legada `mercado_cafe_manage` continua passando tudo
// (ver middleware/requirePermission.js -> MODULE_SUPER_PERMISSIONS).
mount(
  "/admin/mercado-do-cafe",
  "./admin/adminCorretoras",
  requirePermission("mercado_cafe_view"),
);
mount(
  "/admin/mercado-do-cafe/metrics",
  "./admin/adminCorretorasMetrics",
  requirePermission("mercado_cafe_view"),
);
mount(
  "/admin/monetization",
  "./admin/adminPlans",
  requirePermission("mercado_cafe_view"),
);
mount("/admin/audit", "./admin/adminAudit");
// Fase 10.1 — stub de simulação de assinatura de contrato. Inerte em
// produção (service valida CONTRATO_SIGNER_PROVIDER=stub).
mount("/admin/contratos", "./admin/adminContratos");

/* ============================================================
 * Operações de negócio
 * ============================================================ */

mount("/admin/pedidos",    "./admin/adminPedidos",   requirePermission("pedidos.ver"));
mount("/admin/carrinhos",  "./admin/adminCarts");
mount("/admin/stats",      "./admin/adminStats");
mount("/admin/relatorios", "./admin/adminRelatorios", requirePermission("relatorios.ver"));

// Modulo Rotas de Entrega (Fase 1 backend marketplace)
mount("/admin/motoristas", "./admin/adminMotoristas", requirePermission("motoristas.view"));
mount("/admin/rotas",      "./admin/adminRotas",      requirePermission("rotas.view"));

/* ============================================================
 * Configuração da loja
 * ============================================================ */

mount("/admin/config",            "./admin/adminConfig",              requirePermission("config.editar"));
mount("/admin/shop-config/upload","./admin/adminConfigUpload", requirePermission("config.editar"));
mount("/admin/shipping",          "./admin/adminShippingZones");

/* ============================================================
 * Sistema e segurança
 * ============================================================ */

mount("/admin/comunicacao",         "./admin/adminComunicacao");
mount("/admin/support-config",     "./admin/adminSupportConfig");
mount("/admin/contato-mensagens",  "./admin/adminContatoMensagens");
mount("/admin/users",        "./admin/adminUsers",       requirePermission("usuarios.ver"));
mount("/admin/admins",       "./admin/adminAdmins");
mount("/admin/roles",        "./admin/adminRoles");
mount("/admin/permissions",  "./admin/adminPermissions");
mount("/admin/logs",         "./admin/adminLogs");
// F1 — 2FA admin (setup/confirm/regen/disable). Login MFA challenge
// é em routes/auth/adminLogin.js (sem CSRF, sem verifyAdmin).
mount("/admin/totp",         "./admin/adminTotp");

module.exports = router;
