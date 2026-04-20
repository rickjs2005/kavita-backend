// scripts/dev/fetch-market-quotes.js
//
// Utility CLI para rodar marketQuotesService.syncAll() uma vez,
// sem esperar o cron. Útil em dev pra validar que os adapters
// estão respondendo e persistindo no DB.
//
// Uso:
//   node scripts/dev/fetch-market-quotes.js
//
// Pré-requisitos:
//   - migration 2026042000000003 aplicada
//   - COTACAO_CAFE_PROVIDER=noticias_agricolas no .env (para CEPEA)
"use strict";

require("dotenv").config();

(async () => {
  const marketQuotesService = require("../../services/marketQuotesService");
  try {
    console.log("▶ Disparando sync…");
    const t0 = Date.now();
    const result = await marketQuotesService.syncAll();
    console.log(`✓ Sync concluído em ${Date.now() - t0}ms`);
    console.log("  coletados:", result.collected);
    console.log("  falhas:", result.failed);

    console.log("\n▶ Estado atual do ticker:");
    const current = await marketQuotesService.getCurrent();
    console.log(JSON.stringify(current, null, 2));
    process.exit(0);
  } catch (err) {
    console.error("✗ ERRO:", err?.message ?? String(err));
    console.error(err?.stack?.split("\n").slice(0, 8).join("\n"));
    process.exit(1);
  }
})();
