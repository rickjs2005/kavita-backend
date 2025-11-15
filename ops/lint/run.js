#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = process.cwd();
const TARGETS = ["server.js", "config", "controllers", "middleware", "routes", "services", "ops"];
const IGNORES = new Set(["node_modules", ".git", "uploads", "coverage"]);

const filesToCheck = [];

function walk(filePath) {
  const stat = fs.statSync(filePath);
  if (stat.isDirectory()) {
    const base = path.basename(filePath);
    if (IGNORES.has(base)) return;
    for (const entry of fs.readdirSync(filePath)) {
      walk(path.join(filePath, entry));
    }
    return;
  }

  if (filePath.endsWith(".js")) {
    filesToCheck.push(filePath);
  }
}

for (const target of TARGETS) {
  const absolute = path.join(ROOT, target);
  if (fs.existsSync(absolute)) {
    walk(absolute);
  }
}

let hasErrors = false;

for (const file of filesToCheck) {
  const { status, stderr } = spawnSync(process.execPath, ["--check", file], {
    stdio: ["ignore", "ignore", "pipe"],
  });
  if (status !== 0) {
    hasErrors = true;
    process.stderr.write(`Syntax error in ${path.relative(ROOT, file)}\n`);
    process.stderr.write(stderr.toString());
  }
}

if (hasErrors) {
  process.exitCode = 1;
  console.error("❌ Linting falhou: corrija os erros acima.");
} else {
  console.log(`✅ ${filesToCheck.length} arquivos verificados sem erros de sintaxe.`);
}
