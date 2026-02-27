require("dotenv").config();

const fs = require("fs");
const path = require("path");
const mysql = require("mysql2/promise");

const realDb = process.env.DB_REAL || process.env.DB_NAME || "kavita";

const TABLES = [
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

async function getShowCreate(conn, table) {
  const [rows] = await conn.query(`SHOW CREATE TABLE \`${table}\``);
  const key = Object.keys(rows[0]).find((k) => k.toLowerCase().includes("create table"));
  return rows[0][key];
}

async function main() {
  // DB real padrão: DB_NAME (ou override via DB_REAL)
  const realDb = process.env.DB_REAL || process.env.DB_NAME;
  if (!realDb) {
    throw new Error("Defina DB_NAME (ou DB_REAL) no .env para apontar pro banco real.");
  }

  const baseConfig = {
    host: process.env.DB_HOST || "127.0.0.1",
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
  };

  const conn = await mysql.createConnection({ ...baseConfig, database: realDb });

  try {
    const out = [];
    for (const t of TABLES) {
      const create = await getShowCreate(conn, t);
      out.push(create.endsWith(";") ? create : create + ";");
      out.push(""); // linha em branco entre tabelas
    }

    const target = path.resolve(__dirname, "schema_from_show_create.sql");
    fs.writeFileSync(target, out.join("\n"), "utf8");
    console.log(`✅ Gerado: ${target}`);
    console.log(`✅ Tabelas: ${TABLES.length}`);
  } finally {
    await conn.end();
  }
}

main().catch((e) => {
  console.error("ERRO dump-show-create:", e);
  process.exit(1);
});