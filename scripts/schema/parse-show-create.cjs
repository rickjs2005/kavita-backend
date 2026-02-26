const fs = require("fs");
const path = require("path");

function readSchemaFile() {
  const p = path.resolve(__dirname, "schema_from_show_create.sql");
  if (!fs.existsSync(p)) {
    throw new Error(
      `Arquivo não encontrado: ${p}\nColoque o schema em scripts/schema/schema_from_show_create.sql`
    );
  }
  return fs.readFileSync(p, "utf8");
}

function splitCreateTableBlocks(sql) {
  const blocks = [];
  const re = /CREATE TABLE\s+`([^`]+)`\s*\(/g;
  let m;

  while ((m = re.exec(sql)) !== null) {
    const table = m[1];
    const start = m.index;

    const end = sql.indexOf(";\n", start);
    if (end === -1) throw new Error(`Não encontrei ';' final para a tabela ${table}`);

    const block = sql.slice(start, end + 1);
    blocks.push({ table, block });
    re.lastIndex = end + 2;
  }

  return blocks;
}

function extractForeignKeys(block) {
  const fks = [];
  const fromTable = /CREATE TABLE\s+`([^`]+)`/i.exec(block)?.[1] || null;
  const lines = block.split("\n");

  for (const line of lines) {
    const s = line.trim();
    if (!s.startsWith("CONSTRAINT")) continue;
    if (!s.includes("FOREIGN KEY")) continue;

    const name = /CONSTRAINT\s+`([^`]+)`/i.exec(s)?.[1] || null;

    const colsRaw = /FOREIGN KEY\s+\(([^)]+)\)/i.exec(s)?.[1] || "";
    const refTable = /REFERENCES\s+`([^`]+)`/i.exec(s)?.[1] || null;
    const refColsRaw = /REFERENCES\s+`[^`]+`\s+\(([^)]+)\)/i.exec(s)?.[1] || "";

    const onDelete = /ON DELETE\s+([A-Z ]+)/i.exec(s)?.[1]?.trim() || null;
    const onUpdate = /ON UPDATE\s+([A-Z ]+)/i.exec(s)?.[1]?.trim() || null;

    const cols = colsRaw
      .split(",")
      .map((c) => c.replace(/`/g, "").trim())
      .filter(Boolean);

    const refCols = refColsRaw
      .split(",")
      .map((c) => c.replace(/`/g, "").trim())
      .filter(Boolean);

    if (!fromTable || !refTable) continue;

    fks.push({
      name,
      fromTable,
      columns: cols,
      refTable,
      refColumns: refCols,
      onDelete,
      onUpdate,
      rawLine: s.replace(/,$/, ""),
    });
  }

  return fks;
}

function buildFkGraph(tables, fkList) {
  const deps = new Map();
  const tableSet = new Set(tables);

  for (const t of tables) {
    deps.set(t, new Set());
  }

  for (const fk of fkList) {
    if (!fk.fromTable || !fk.refTable) continue;

    // 🔒 Só adiciona dependência se a tabela referenciada realmente existir no schema
    if (!tableSet.has(fk.refTable)) {
      console.warn(
        `⚠️ FK ignorada: ${fk.fromTable} -> ${fk.refTable} (tabela referenciada não existe no dump)`
      );
      continue;
    }

    deps.get(fk.fromTable).add(fk.refTable);
  }

  return deps;
}

function topoSortWithCycles(deps) {
  const inDeg = new Map();
  for (const [t] of deps) inDeg.set(t, 0);

  for (const [child, parents] of deps) {
    for (const p of parents) {
      if (!inDeg.has(p)) inDeg.set(p, 0);
      inDeg.set(child, (inDeg.get(child) || 0) + 1);
    }
  }

  const q = [];
  for (const [t, d] of inDeg) if (d === 0) q.push(t);

  const order = [];
  const depsCopy = new Map();
  for (const [k, v] of deps) depsCopy.set(k, new Set(v));

  while (q.length) {
    const n = q.shift();
    order.push(n);

    for (const [child, parents] of depsCopy) {
      if (parents.has(n)) {
        parents.delete(n);
        inDeg.set(child, (inDeg.get(child) || 0) - 1);
        if (inDeg.get(child) === 0) q.push(child);
      }
    }
  }

  const remaining = [];
  for (const [t, d] of inDeg) if (d > 0) remaining.push(t);

  return { order, cycles: remaining };
}

function stripForeignKeyConstraints(createBlock) {
  const lines = createBlock.split("\n");
  const out = [];

  for (const s of lines) {
    const trim = s.trim();
    if (trim.startsWith("CONSTRAINT") && trim.includes("FOREIGN KEY")) continue;
    out.push(s);
  }

  let joined = out.join("\n");
  joined = joined.replace(/,\s*\n\)/g, "\n)");
  return joined;
}

// ✅ Patch: só captura charset se estiver explicitamente presente
function extractColumnCharsetAndCollate(colLine) {
  const charsetMatch = colLine.match(/\bCHARACTER SET\s+([a-zA-Z0-9_]+)/i);
  const collateMatch = colLine.match(/\bCOLLATE\s+([a-zA-Z0-9_]+)/i);

  return {
    charset: charsetMatch ? charsetMatch[1] : null,
    collate: collateMatch ? collateMatch[1] : null,
  };
}

module.exports = {
  readSchemaFile,
  splitCreateTableBlocks,
  extractForeignKeys,
  buildFkGraph,
  topoSortWithCycles,
  stripForeignKeyConstraints,
  extractColumnCharsetAndCollate,
};
