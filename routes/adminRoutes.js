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
mount("/admin/site-hero",       "./admin/adminSiteHero");
mount("/admin/colaboradores",   "./admin/adminColaboradores");
mount("/admin/servicos",        "./admin/adminServicos");
mount("/admin/servicos/solicitacoes", "./admin/adminSolicitacoesServicos");
mount("/admin/especialidades",  "./admin/adminEspecialidades");
mount("/admin/drones",          "./admin/adminDrones");

/* ============================================================
 * Operações de negócio
 * ============================================================ */

mount("/admin/pedidos",    "./admin/adminPedidos",   requirePermission("pedidos.ver"));
mount("/admin/carrinhos",  "./admin/adminCarts");
mount("/admin/stats",      "./admin/adminStats");
mount("/admin/relatorios", "./admin/adminRelatorios", requirePermission("relatorios.ver"));

/* ============================================================
 * Configuração da loja
 * ============================================================ */

mount("/admin/config",            "./admin/adminConfig",              requirePermission("config.editar"));
mount("/admin/shop-config/upload","./admin/adminConfigUpload", requirePermission("config.editar"));
mount("/admin/shipping",          "./admin/adminShippingZones");

/* ============================================================
 * Sistema e segurança
 * ============================================================ */

mount("/admin/comunicacao",  "./admin/adminComunicacao");
mount("/admin/users",        "./admin/adminUsers",       requirePermission("usuarios.ver"));
mount("/admin/admins",       "./admin/adminAdmins");
mount("/admin/roles",        "./admin/adminRoles");
mount("/admin/permissions",  "./admin/adminPermissions");
mount("/admin/logs",         "./admin/adminLogs");

module.exports = router;
