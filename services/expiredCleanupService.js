"use strict";
// services/expiredCleanupService.js
//
// D2+D3+D1 (auditoria automação) — limpeza diária defensiva de:
//   - product_promotions com end_at no passado
//   - hero_slides       com ends_at no passado
//   - cupons            com expiracao no passado (D1, 2026-04-25)
//
// Por que é defensivo: o backend já filtra/rejeita esses recursos no
// uso real:
//   - promoSql.activePromoWhere filtra promoções por janela
//   - heroSlidesRepository.findActiveSlides filtra slides por janela
//   - couponService.validateCouponRules rejeita cupom vencido em runtime
//
// Logo, registro vencido com flag de ativo continua "fantasma" no admin
// mas não vaza pro público nem é aceito no checkout. Esta cleanup serve
// para:
//   1. Mostrar status real no painel admin (admin vê ativo=0)
//   2. Reduzir set de linhas que precisam ser filtradas em runtime
//   3. Evitar admin se confundir com dezenas de itens "ativos" vencidos
//
// É IDEMPOTENTE: rodar 2x no mesmo dia não faz nada na segunda vez.
// Cron diário 00:30 BRT por padrão.

const pool = require("../config/pool");
const logger = require("../lib/logger");

/**
 * Roda 1 ciclo de limpeza:
 *   - Marca product_promotions.is_active=0 onde end_at    < NOW()
 *   - Marca hero_slides.is_active=0        onde ends_at   < NOW()
 *   - Marca cupons.ativo=0                 onde expiracao < NOW()
 *
 * Cupons SEM expiração (NULL) NUNCA são tocados — campanhas perpétuas
 * ficam intactas. Idem produtos/slides sem ends_at.
 *
 * Retorna contagem de linhas afetadas por canal. Nunca lança — falhas
 * isoladas são logadas e a contagem do canal volta zerada.
 *
 * @returns {Promise<{promotions: number, slides: number, coupons: number}>}
 */
async function runOnce() {
  const report = { promotions: 0, slides: 0, coupons: 0 };

  try {
    const [r1] = await pool.query(
      `UPDATE product_promotions
          SET is_active = 0
        WHERE is_active = 1
          AND end_at IS NOT NULL
          AND end_at < NOW()`,
    );
    report.promotions = Number(r1.affectedRows || 0);
  } catch (err) {
    logger.error({ err }, "expired-cleanup.promotions.failed");
  }

  try {
    const [r2] = await pool.query(
      `UPDATE hero_slides
          SET is_active = 0
        WHERE is_active = 1
          AND ends_at IS NOT NULL
          AND ends_at < NOW()`,
    );
    report.slides = Number(r2.affectedRows || 0);
  } catch (err) {
    logger.error({ err }, "expired-cleanup.slides.failed");
  }

  // D1 — cupons vencidos. Mantém a validação em couponService.validateCouponRules
  // como defesa em runtime (cupom expirado é rejeitado no checkout mesmo
  // se admin marcar ativo=1 manualmente).
  try {
    const [r3] = await pool.query(
      `UPDATE cupons
          SET ativo = 0
        WHERE ativo = 1
          AND expiracao IS NOT NULL
          AND expiracao < NOW()`,
    );
    report.coupons = Number(r3.affectedRows || 0);
  } catch (err) {
    logger.error({ err }, "expired-cleanup.coupons.failed");
  }

  if (report.promotions > 0 || report.slides > 0 || report.coupons > 0) {
    logger.info(report, "expired-cleanup.done");
  }

  return report;
}

module.exports = { runOnce };
