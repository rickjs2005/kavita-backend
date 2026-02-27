/* eslint-disable no-console */
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const domains = require("./_domains.cjs");
const { readSchemaFile, splitCreateTableBlocks, extractForeignKeys, buildFkGraph, topoSortWithCycles } = require("./parse-show-create.cjs");

const MIGRATIONS_DIR = path.resolve(process.cwd(), "migrations");

/** -------------------------
 *  Utils
 *  ------------------------- */
function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function sha1(s) {
  return crypto.createHash("sha1").update(String(s)).digest("hex").slice(0, 10);
}

/** Timestamp no padrão sequelize-cli: YYYYMMDDHHmmss */
function stamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds());
}

function writeMigration(filename, content) {
  ensureDir(MIGRATIONS_DIR);
  const p = path.join(MIGRATIONS_DIR, filename);
  fs.writeFileSync(p, content, "utf8");
  console.log("Gerado:", p);
}

function tableToDomain(table) {
  for (const [dom, list] of Object.entries(domains)) {
    if (Array.isArray(list) && list.includes(table)) return dom;
  }
  return "misc";
}

function buildDomainBuckets(order) {
  const buckets = new Map();
  for (const t of order) {
    const dom = tableToDomain(t);
    if (!buckets.has(dom)) buckets.set(dom, []);
    buckets.get(dom).push(t);
  }
  return buckets;
}

function migrationTemplate({ upSqlList, downSqlList }) {
  const render = (list) =>
    list
      .filter(Boolean)
      .map((q) => `      await queryInterface.sequelize.query(${JSON.stringify(q)}, { transaction: t });`)
      .join("\n");

  return `/* eslint-disable no-unused-vars */
"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (t) => {
${render(upSqlList)}
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (t) => {
${render(downSqlList)}
    });
  },
};
`;
}

/** -------------------------
 *  Remove CONSTRAINTs órfãs dentro do CREATE TABLE
 *  ------------------------- */
function getReferencedTableFromConstraintLine(line) {
  const m = /\bREFERENCES\s+`?([a-zA-Z0-9_]+)`?\b/i.exec(line);
  return m ? m[1] : null;
}

function stripOrphanConstraints(innerLines, tableSet, tableName) {
  const out = [];

  for (const line of innerLines) {
    const isConstraint = /^CONSTRAINT\b/i.test(line);
    if (!isConstraint) {
      out.push(line);
      continue;
    }

    const refTable = getReferencedTableFromConstraintLine(line);
    if (refTable && !tableSet.has(refTable)) {
      console.warn(`⚠️ CONSTRAINT ignorada em ${tableName}: REFERENCES ${refTable} (tabela não existe no dump)`);
      continue; // remove linha
    }

    out.push(line);
  }

  // última linha antes do ")" não deve terminar com vírgula
  if (out.length) out[out.length - 1] = out[out.length - 1].replace(/,\s*$/, "");
  return out;
}

/** -------------------------
 *  CREATE TABLE: "lossless" + limpeza de constraints órfãs
 *  ------------------------- */
function buildCreateTable(table, block, tableSet) {
  const lines = String(block)
    .split("\n")
    .map((l) => l.replace(/\r/g, "").trim())
    .filter(Boolean);

  if (!lines.length) throw new Error(`Bloco vazio em tabela ${table}`);

  const createIdx = lines.findIndex((l) => /^CREATE TABLE\b/i.test(l));
  if (createIdx === -1) throw new Error(`Não achei "CREATE TABLE" no bloco da tabela ${table}`);

  const engineIdx = lines.findIndex((l) => /\bENGINE=/i.test(l));
  if (engineIdx === -1) throw new Error(`Não achei "ENGINE=" no bloco da tabela ${table}`);

  let innerLines = lines.slice(createIdx + 1, engineIdx);
  innerLines = stripOrphanConstraints(innerLines, tableSet, table);

  let engineLine = lines[engineIdx].replace(/;+\s*$/, "").trim();
  if (!engineLine.startsWith(")")) engineLine = `) ${engineLine}`.trim();
  engineLine = `${engineLine};`;

  const firstLine = `CREATE TABLE \`${table}\` (`;
  return [firstLine, ...innerLines, engineLine].join("\n");
}

/** -------------------------
 *  Main
 *  ------------------------- */
function main() {
  const sql = readSchemaFile();
  const blocks = splitCreateTableBlocks(sql);

  if (!blocks.length) {
    throw new Error("Nenhum CREATE TABLE encontrado no schema.sql (ou arquivo fonte).");
  }

  const byTable = new Map(blocks.map((b) => [b.table, b.block]));
  const tables = blocks.map((b) => b.table);
  const tableSet = new Set(tables);

  // Só para ordem topológica (não vamos gerar migration extra de FK)
  const allFks = [];
  for (const b of blocks) allFks.push(...extractForeignKeys(b.block));

  const deps = buildFkGraph(tables, allFks);
  const { order, cycles } = topoSortWithCycles(deps);

  const buckets = buildDomainBuckets(order);

  ensureDir(MIGRATIONS_DIR);

  const base = stamp();
  let seq = 1;

  for (const [dom, tlist] of buckets.entries()) {
    const upSqlList = [];
    const downSqlList = [];

    for (const t of tlist) {
      const original = byTable.get(t);
      if (!original) throw new Error(`Bloco CREATE TABLE não encontrado para tabela: ${t}`);
      upSqlList.push(buildCreateTable(t, original, tableSet));
    }

    for (const t of [...tlist].reverse()) {
      downSqlList.push(`DROP TABLE IF EXISTS \`${t}\`;`);
    }

    const filename = `${base}${String(seq).padStart(2, "0")}-create-${dom}-tables-${sha1(dom + ":" + tlist.join(","))}.js`;
    writeMigration(filename, migrationTemplate({ upSqlList, downSqlList }));
    seq++;
  }

  console.log("\nResumo:");
  console.log("- CREATE TABLEs:", tables.length);
  console.log("- Ordem topológica total:", order.length);
  console.log("- Tabelas em ciclo:", cycles.length);
  console.log("- FKs extraídas (somente p/ ordenar):", allFks.length);
}

if (require.main === module) {
  main();
}

module.exports = { main };