#!/usr/bin/env node
// scripts/seed/demo.js
//
// Seed idempotente para apresentação controlada (demo de 30min ao sócio).
// Popula somente catálogo + editorial — o suficiente para o roteiro
// público não mostrar telas vazias. Pedidos, corretoras, drones e contas
// demo ficam fora deste script (instruções no README.md ao lado).
//
// Drones NÃO são populados: já há cadastro próprio (T25, T70, T100) feito
// via admin e não queremos duplicar nem conflitar.
//
// Idempotência:
//   - Categories  → INSERT IGNORE por slug (UNIQUE).
//   - Products    → checa por nome (LIKE exato) antes de inserir.
//   - Cupons      → INSERT IGNORE por codigo (UNIQUE).
//   - News posts  → INSERT IGNORE por slug (UNIQUE).
//
// Rodar:  node scripts/seed/demo.js
// Dry-run: node scripts/seed/demo.js --dry-run
//
// IMPORTANTE: usa o mesmo pool de config/env.js — respeita DB_* do .env.

"use strict";

require("dotenv").config();

const pool = require("../../config/pool");

const DRY_RUN = process.argv.includes("--dry-run");

function log(label, payload) {
  if (DRY_RUN) {
    console.log(`[dry-run] ${label}`, payload || "");
  } else {
    console.log(`[seed] ${label}`, payload || "");
  }
}

// ────────────────────────────────────────────────────────────────────────
// CATEGORIAS
// ────────────────────────────────────────────────────────────────────────

const CATEGORIES = [
  { name: "Suplementação e Nutrição", slug: "suplementacao-nutricao", sort_order: 1, description: "Núcleos minerais, sal proteinado, premix e suplementos para bovinos." },
  { name: "Saúde Animal", slug: "saude-animal", sort_order: 2, description: "Vacinas, antibióticos, vermífugos e cuidados veterinários." },
  { name: "Equipamentos", slug: "equipamentos", sort_order: 3, description: "Cochos, bebedouros, pulverizadores e equipamentos rurais." },
  { name: "Sementes e Pasto", slug: "sementes-pasto", sort_order: 4, description: "Sementes de pastagem, adubo foliar, calcário e insumos para forrageiras." },
  { name: "Cafeicultura", slug: "cafeicultura", sort_order: 5, description: "Adubos NPK, defensivos, micronutrientes e inoculantes para café." },
  { name: "Higiene e Manejo", slug: "higiene-manejo", sort_order: 6, description: "Detergentes, desinfetantes e produtos de manejo sanitário." },
];

async function seedCategories(conn) {
  let inserted = 0;
  for (const c of CATEGORIES) {
    if (DRY_RUN) { log("category", c.slug); inserted++; continue; }
    const [r] = await conn.query(
      `INSERT IGNORE INTO categories (name, slug, is_active, sort_order, description)
       VALUES (?, ?, 1, ?, ?)`,
      [c.name, c.slug, c.sort_order, c.description],
    );
    if (r.affectedRows > 0) inserted++;
  }
  log(`categorias inseridas: ${inserted}/${CATEGORIES.length}`);
}

async function getCategoryIdMap(conn) {
  const [rows] = await conn.query(`SELECT id, slug FROM categories`);
  return rows.reduce((acc, r) => { acc[r.slug] = r.id; return acc; }, {});
}

// ────────────────────────────────────────────────────────────────────────
// PRODUTOS
// ────────────────────────────────────────────────────────────────────────

const PRODUCTS = [
  // Suplementação e Nutrição
  { name: "Núcleo Mineral Bovinos de Corte 60", price: 189.90, quantity: 84, slug: "suplementacao-nutricao", description: "Núcleo mineral premium para bovinos de corte em fase de engorda. Saco 30 kg." },
  { name: "Sal Proteinado 30% Vacas em Cria", price: 142.00, quantity: 120, slug: "suplementacao-nutricao", description: "Suplementação proteica 30 % para vacas de cria a pasto. Saco 30 kg." },
  { name: "Premix Engorda Confinamento", price: 268.50, quantity: 42, slug: "suplementacao-nutricao", description: "Premix completo para confinamento intensivo, balanceamento mineral + ureia. Saco 25 kg." },

  // Saúde Animal
  { name: "Ivermectina 1% 500 ml", price: 78.90, quantity: 215, slug: "saude-animal", description: "Endectocida injetável de longa ação, controle de carrapatos, vermes e bernes. Frasco 500 ml." },
  { name: "Vacina Aftosa Bivalente — 50 doses", price: 154.00, quantity: 60, slug: "saude-animal", description: "Vacina antiaftosa bivalente, dose 5 ml. Frasco 250 ml (50 doses)." },
  { name: "Vermífugo Bolus Liberação Lenta", price: 32.50, quantity: 380, slug: "saude-animal", description: "Bolus ruminal de liberação lenta — 90 dias de proteção. Pacote 10 un." },

  // Equipamentos
  { name: "Pulverizador Costal Manual 20 L", price: 219.00, quantity: 24, slug: "equipamentos", description: "Pulverizador costal manual reforçado, 20 L, com bicos cônico e leque." },
  { name: "Bebedouro Australiano Galvanizado 2 m", price: 1280.00, quantity: 8, slug: "equipamentos", description: "Bebedouro australiano em chapa galvanizada, capacidade 800 L, boia automática." },

  // Sementes e Pasto
  { name: "Semente Brachiaria Brizantha Marandu 20 kg", price: 485.00, quantity: 36, slug: "sementes-pasto", description: "Semente de brachiaria brizantha cv. Marandu, VC 60 %. Saco 20 kg." },
  { name: "Calcário Dolomítico Filler 25 kg", price: 38.90, quantity: 200, slug: "sementes-pasto", description: "Calcário dolomítico filler PRNT 95 %, ideal para correção de solo. Saco 25 kg." },

  // Cafeicultura
  { name: "Adubo NPK 20-05-20 + Zn + B 50 kg", price: 312.00, quantity: 88, slug: "cafeicultura", description: "Adubo formulado 20-05-20 com zinco e boro, ideal para manutenção do cafezal. Saco 50 kg." },
  { name: "Defensivo Cobre Sulfato 5 kg", price: 96.50, quantity: 64, slug: "cafeicultura", description: "Sulfato de cobre para controle de ferrugem e cercospora em café. Embalagem 5 kg." },
];

async function seedProducts(conn, categoryIds) {
  let inserted = 0;
  for (const p of PRODUCTS) {
    const categoryId = categoryIds[p.slug];
    if (!categoryId) {
      log(`SKIP produto sem categoria: ${p.name}`);
      continue;
    }
    if (DRY_RUN) { log("product", p.name); inserted++; continue; }

    // checa duplicata por nome
    const [exists] = await conn.query(
      `SELECT id FROM products WHERE name = ? LIMIT 1`,
      [p.name],
    );
    if (exists.length > 0) continue;

    await conn.query(
      `INSERT INTO products (name, description, price, quantity, category_id, image)
       VALUES (?, ?, ?, ?, ?, NULL)`,
      [p.name, p.description, p.price, p.quantity, categoryId],
    );
    inserted++;
  }
  log(`produtos inseridos: ${inserted}/${PRODUCTS.length}`);
}

// ────────────────────────────────────────────────────────────────────────
// CUPONS
// ────────────────────────────────────────────────────────────────────────

const CUPONS = [
  { codigo: "BEMVINDO10", tipo: "percentual", valor: 10.00, minimo: 100.00, max_usos: 500, expira_dias: 60 },
  { codigo: "FRETEAGRO50", tipo: "valor", valor: 50.00, minimo: 500.00, max_usos: 200, expira_dias: 30 },
  { codigo: "CAFE15", tipo: "percentual", valor: 15.00, minimo: 200.00, max_usos: 150, expira_dias: 45 },
];

async function seedCupons(conn) {
  let inserted = 0;
  for (const c of CUPONS) {
    if (DRY_RUN) { log("cupom", c.codigo); inserted++; continue; }
    const expira = new Date(Date.now() + c.expira_dias * 24 * 60 * 60 * 1000)
      .toISOString().slice(0, 19).replace("T", " ");
    const [r] = await conn.query(
      `INSERT IGNORE INTO cupons (codigo, tipo, valor, minimo, expiracao, usos, max_usos, ativo)
       VALUES (?, ?, ?, ?, ?, 0, ?, 1)`,
      [c.codigo, c.tipo, c.valor, c.minimo, expira, c.max_usos],
    );
    if (r.affectedRows > 0) inserted++;
  }
  log(`cupons inseridos: ${inserted}/${CUPONS.length}`);
}

// ────────────────────────────────────────────────────────────────────────
// NEWS POSTS
// ────────────────────────────────────────────────────────────────────────

const NEWS_POSTS = [
  {
    title: "Cotação do café arábica fecha em alta sustentada na semana",
    slug: "cotacao-cafe-arabica-alta-semanal",
    category: "Mercado",
    excerpt: "Sacas do tipo 6 negociadas com prêmio na Zona da Mata; oferta restrita e clima irregular sustentam preços.",
    content: "Os preços da saca de café arábica fecharam a semana em alta no mercado físico brasileiro. Negociantes da Zona da Mata Mineira reportam prêmio firme para o tipo 6 bebida dura, refletindo oferta restrita após colheita irregular e demanda firme dos compradores. A queda do real frente ao dólar também sustenta a remuneração ao produtor. Analistas avaliam que, mantida a estiagem em curso, o segundo semestre pode trazer novas altas, especialmente para cafés finos com classificação superior.",
    tags: "café,arábica,cotação,zona da mata",
  },
  {
    title: "Confinamento bovino: balanceamento de premix e ganho médio diário",
    slug: "confinamento-bovino-premix-ganho-medio-diario",
    category: "Manejo",
    excerpt: "Como ajustar o premix mineral em dietas de alto concentrado para confinamento intensivo de bovinos de corte.",
    content: "O confinamento intensivo exige balanceamento preciso entre concentrado, volumoso e suplementação mineral. Dietas com mais de 70 % de concentrado demandam premix mineral fortificado com tampões ruminais, ionóforos e nível elevado de fósforo. O ganho médio diário esperado fica entre 1,4 kg e 1,7 kg, dependendo da genética do animal e da fase de terminação. Recomenda-se monitoramento semanal do consumo e ajuste mensal da formulação conforme análise bromatológica do volumoso.",
    tags: "confinamento,bovinos,premix,ganho médio",
  },
  {
    title: "Pulverização aérea com drone reduz consumo de defensivo em até 35%",
    slug: "pulverizacao-aerea-drone-reducao-defensivo-35",
    category: "Tecnologia",
    excerpt: "Estudos de campo na Zona da Mata Mineira apontam redução de defensivo e maior uniformidade na aplicação aérea.",
    content: "A tecnologia de pulverização aérea com drones agrícolas vem se consolidando em lavouras de café, soja e pastagens. Operações monitoradas em fazendas da Zona da Mata Mineira indicam redução média de 35 % no consumo de defensivos, com maior uniformidade de deposição e velocidade três vezes superior à pulverização costal. O modelo DJI Agras T40 lidera o mercado nacional, com tanque de 40 L e autonomia de 21,5 hectares por hora. Operações exigem certificação ANAC, registro DECEA e laudo aeroagrícola.",
    tags: "drone,pulverização,DJI Agras,tecnologia",
  },
  {
    title: "Calendário sanitário 2026: vacinação aftosa e brucelose no primeiro semestre",
    slug: "calendario-sanitario-2026-aftosa-brucelose",
    category: "Sanidade",
    excerpt: "Calendário oficial de vacinação para o primeiro semestre de 2026 já está disponível em Minas Gerais.",
    content: "O IMA (Instituto Mineiro de Agropecuária) divulgou o calendário sanitário do primeiro semestre de 2026. A vacinação contra febre aftosa segue obrigatória em todo o estado de Minas Gerais para bovinos de qualquer idade. A vacinação contra brucelose continua compulsória para fêmeas bovinas de 3 a 8 meses, conforme PNCEBT. Produtores devem manter o GTA atualizado e registrar a vacinação no sistema oficial em até 7 dias após aplicação.",
    tags: "aftosa,brucelose,calendário sanitário,IMA",
  },
  {
    title: "Clima: previsão de chuvas regulares para a Zona da Mata em maio",
    slug: "clima-chuvas-regulares-zona-da-mata-maio",
    category: "Clima",
    excerpt: "Modelo do INMET projeta chuvas dentro da média histórica para a região cafeeira nos próximos 15 dias.",
    content: "A previsão climática para a Zona da Mata Mineira indica chuvas dentro da média histórica para a primeira quinzena de maio. As estações INMET de Manhuaçu, Caratinga e Espera Feliz registram volumes acumulados próximos da normal climatológica. Para os cafeicultores, é janela favorável à aplicação de adubação de pós-colheita e poda. Produtores devem acompanhar boletins semanais e aproveitar janelas secas para pulverização preventiva contra ferrugem e cercospora.",
    tags: "clima,INMET,zona da mata,maio",
  },
  {
    title: "Mercado do Café Kavita: corretoras verificadas conectam produtor a comprador",
    slug: "mercado-do-cafe-kavita-corretoras-verificadas",
    category: "Kavita",
    excerpt: "Conheça o marketplace B2B da Kavita que aproxima cafeicultores e corretoras certificadas da Zona da Mata.",
    content: "O Mercado do Café Kavita é um marketplace vertical que conecta produtores de café arábica a corretoras verificadas da Zona da Mata Mineira. As corretoras passam por curadoria documental, KYC e avaliação contínua dos produtores atendidos. A plataforma oferece dashboard de leads, métricas regionais, contrato digital e canal direto de comunicação. O produtor cadastra sua oferta uma única vez e recebe propostas de corretoras qualificadas — sem intermediários ocultos e com histórico transparente.",
    tags: "mercado do café,corretoras,zona da mata,kavita",
  },
];

async function seedNewsPosts(conn) {
  const now = new Date();
  let inserted = 0;
  for (let i = 0; i < NEWS_POSTS.length; i++) {
    const p = NEWS_POSTS[i];
    if (DRY_RUN) { log("post", p.slug); inserted++; continue; }
    const published = new Date(now.getTime() - i * 24 * 60 * 60 * 1000)
      .toISOString().slice(0, 19).replace("T", " ");
    const [r] = await conn.query(
      `INSERT IGNORE INTO news_posts
        (title, slug, excerpt, content, category, tags, status, published_at, ativo, views)
       VALUES (?, ?, ?, ?, ?, ?, 'published', ?, 1, ?)`,
      [p.title, p.slug, p.excerpt, p.content, p.category, p.tags, published, 100 + i * 47],
    );
    if (r.affectedRows > 0) inserted++;
  }
  log(`posts inseridos: ${inserted}/${NEWS_POSTS.length}`);
}

// ────────────────────────────────────────────────────────────────────────
// MAIN
// ────────────────────────────────────────────────────────────────────────

async function main() {
  log(`Conectando ao banco ${process.env.DB_NAME || "(default)"}…`);

  if (DRY_RUN) {
    log("--dry-run: nada será gravado");
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    await seedCategories(conn);
    const categoryIds = DRY_RUN ? {} : await getCategoryIdMap(conn);
    await seedProducts(conn, categoryIds);
    await seedCupons(conn);
    await seedNewsPosts(conn);

    if (DRY_RUN) {
      await conn.rollback();
      log("Dry-run finalizado — transação revertida.");
    } else {
      await conn.commit();
      log("Seed concluído com sucesso.");
    }
  } catch (err) {
    try { await conn.rollback(); } catch { /* noop */ }
    console.error("[seed] ERRO — transação revertida.", err);
    process.exitCode = 1;
  } finally {
    conn.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error("[seed] erro fatal:", err);
  process.exit(1);
});
