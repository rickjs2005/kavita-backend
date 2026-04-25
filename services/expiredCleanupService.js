"use strict";
// services/expiredCleanupService.js
//
// D2+D3 (auditoria automação) — limpeza diária defensiva de:
//   - product_promotions com end_at no passado
//   - hero_slides       com ends_at no passado
//
// Por que isso é defensivo: o backend público JÁ filtra por
// start_at/end_at em todas as queries (promoSql.activePromoWhere,
// heroSlidesRepository.findActiveSlides, promocoesRepository.BASE_SQL).
// Então uma promoção/slide vencido com is_active=1 não vaza pro
// público nem pro checkout — fica só "fantasma" no admin.
//
// Esta cleanup serve para:
//   1. Mostrar status real no painel admin (admin vê is_active=0)
//   2. Reduzir set de linhas que precisam ser filtradas em runtime
//   3. Evitar admin se confundir com dezenas de promoções "ativas"
//      vencidas anos atrás
//
// É IDEMPOTENTE: rodar 2x no mesmo dia não faz nada na segunda vez.
// Cron diário 00:30 BRT por padrão.

const pool = require("../config/pool");
const logger = require("../lib/logger");

/**
 * Roda 1 ciclo de limpeza:
 *   - Marca product_promotions.is_active=0 onde end_at < NOW()
 *   - Marca hero_slides.is_active=0      onde ends_at < NOW()
 *
 * Retorna { promotions: N, slides: N } com a contagem de linhas
 * efetivamente desativadas. Nunca lança — falhas são logadas e
 * o resultado parcial volta zerado pra esse canal.
 *
 * @returns {Promise<{promotions: number, slides: number}>}
 */
async function runOnce() {
  const report = { promotions: 0, slides: 0 };

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

  if (report.promotions > 0 || report.slides > 0) {
    logger.info(report, "expired-cleanup.done");
  }

  return report;
}

module.exports = { runOnce };
