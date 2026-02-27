const {
  readSchemaFile,
  splitCreateTableBlocks,
  extractForeignKeys,
  buildFkGraph,
  topoSortWithCycles,
} = require("./parse-show-create.cjs");

const EXPECTED_TABLES = [
  "admin_logs",
  "admin_permissions",
  "admin_role_permissions",
  "admin_roles",
  "admins",
  "avaliacoes_servico",
  "carrinho_itens",
  "carrinhos",
  "carrinhos_abandonados",
  "carrinhos_abandonados_notifications",
  "categories",
  "colaborador_images",
  "colaboradores",
  "comunicacoes_enviadas",
  "cupons",
  "drone_comment_media",
  "drone_comments",
  "drone_gallery_items",
  "drone_model_media_selections",
  "drone_models",
  "drone_page_settings",
  "drone_representatives",
  "enderecos_usuario",
  "especialidades",
  "favorites",
  "news_clima",
  "news_cotacoes",
  "news_cotacoes_history",
  "news_posts",
  "password_reset_tokens",
  "payment_methods",
  "pedidos",
  "pedidos_produtos",
  "product_categories",
  "product_images",
  "product_promotions",
  "products",
  "produto_avaliacoes",
  "shipping_rates",
  "shipping_zone_cities",
  "shipping_zones",
  "shop_settings",
  "site_hero_settings",
  "solicitacoes_servico",
  "usuarios",
];

function main() {
  const sql = readSchemaFile();
  const blocks = splitCreateTableBlocks(sql);

  console.log(`CREATE TABLE encontrados: ${blocks.length}`);
  const foundTables = blocks.map((b) => b.table);

  const missing = EXPECTED_TABLES.filter((t) => !foundTables.includes(t));
  const extra = foundTables.filter((t) => !EXPECTED_TABLES.includes(t));

  if (missing.length) {
    console.error("FALTANDO no schema_from_show_create.sql:", missing);
    process.exitCode = 1;
  }
  if (extra.length) {
    console.error("EXTRAS no schema_from_show_create.sql:", extra);
    process.exitCode = 1;
  }

  const allFks = [];
  for (const b of blocks) allFks.push(...extractForeignKeys(b.block));

  const deps = buildFkGraph(foundTables, allFks);
  const { order, cycles } = topoSortWithCycles(deps);

  console.log("\nOrdem topológica (dependências por FK):");
  console.log(order.join("\n"));

  console.log("\nTabelas em ciclo (exigem FKs pós-criação):");
  console.log(cycles.length ? cycles.join("\n") : "(nenhuma)");

  if (cycles.length) {
    const cycleSet = new Set(cycles);
    const cycleFks = allFks.filter(
      (fk) => cycleSet.has(fk.fromTable) || cycleSet.has(fk.refTable)
    );

    console.log("\nFKs relacionadas a ciclos:");
    for (const fk of cycleFks) {
      console.log(
        `- ${fk.fromTable}.${fk.columns.join(",")} -> ${fk.refTable}.${fk.refColumns.join(",")} ` +
          `[onDelete=${fk.onDelete || "-"} onUpdate=${fk.onUpdate || "-"}] name=${fk.name || "-"}`
      );
    }
  }

  if (blocks.length !== 45) {
    console.error(`\nERRO: esperado 45 CREATE TABLE, achei ${blocks.length}.`);
    process.exitCode = 1;
  }
}

main();