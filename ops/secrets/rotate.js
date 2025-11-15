#!/usr/bin/env node

require("dotenv").config();

const crypto = require("crypto");
const fs = require("fs/promises");
const path = require("path");
const mysql = require("mysql2/promise");
let SecretsManagerClient;
let GetSecretValueCommand;
let UpdateSecretCommand;

function ensureSecretsManager() {
  if (SecretsManagerClient) return;
  try {
    const mod = require("@aws-sdk/client-secrets-manager");
    SecretsManagerClient = mod.SecretsManagerClient;
    GetSecretValueCommand = mod.GetSecretValueCommand;
    UpdateSecretCommand = mod.UpdateSecretCommand;
  } catch (err) {
    throw new Error(
      "Pacote '@aws-sdk/client-secrets-manager' é necessário para rodar a rotação de segredos. Instale-o com npm install."
    );
  }
}

const SECRET_ID = process.env.SECRETS_MANAGER_SECRET_ID;

if (!SECRET_ID) {
  console.error("⚠️  Defina SECRETS_MANAGER_SECRET_ID para executar a rotação.");
  process.exit(1);
}

const escapeLiteral = (value) => value.replace(/'/g, "''");

async function rotateDatabasePassword(newPassword) {
  const adminUser = process.env.DB_ADMIN_USER || process.env.DB_USER || "root";
  const adminPassword = process.env.DB_ADMIN_PASSWORD || process.env.DB_PASSWORD || "";
  const host = process.env.DB_HOST || "localhost";
  const port = process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306;
  const targetUser = process.env.DB_USER || "root";
  const targetHost = process.env.DB_USER_HOST || "%";

  const connection = await mysql.createConnection({
    host,
    port,
    user: adminUser,
    password: adminPassword,
  });

  const alterSql = `ALTER USER '${escapeLiteral(targetUser)}'@'${escapeLiteral(targetHost)}' IDENTIFIED BY ?`;
  await connection.query(alterSql, [newPassword]);
  await connection.query("FLUSH PRIVILEGES");
  await connection.end();
}

async function updateSecretManager(newPassword) {
  ensureSecretsManager();
  const client = new SecretsManagerClient({ region: process.env.AWS_REGION || "us-east-1" });
  let secretPayload = {};

  try {
    const current = await client.send(new GetSecretValueCommand({ SecretId: SECRET_ID }));
    if (current.SecretString) {
      secretPayload = JSON.parse(current.SecretString);
    }
  } catch (err) {
    if (err.name !== "ResourceNotFoundException") {
      throw err;
    }
  }

  secretPayload.DB_PASSWORD = newPassword;
  await client.send(
    new UpdateSecretCommand({
      SecretId: SECRET_ID,
      SecretString: JSON.stringify(secretPayload),
    })
  );
}

async function updateEnvFile(newPassword) {
  if (!process.env.UPDATE_ENV_FILE) return;
  const envPath = process.env.ENV_FILE_PATH || path.join(process.cwd(), ".env");
  try {
    let content = "";
    try {
      content = await fs.readFile(envPath, "utf8");
    } catch (err) {
      if (err.code !== "ENOENT") throw err;
    }

    if (content.includes("DB_PASSWORD=")) {
      content = content.replace(/DB_PASSWORD=.*/g, `DB_PASSWORD=${newPassword}`);
    } else {
      content += `\nDB_PASSWORD=${newPassword}\n`;
    }

    await fs.writeFile(envPath, content);
  } catch (err) {
    console.warn("⚠️  Não foi possível atualizar o arquivo .env:", err.message);
  }
}

async function main() {
  const newPassword = crypto.randomBytes(24).toString("base64url");

  console.info("🔐 Rotacionando senha do banco de dados...");
  await rotateDatabasePassword(newPassword);

  console.info("📦 Atualizando Secrets Manager...");
  await updateSecretManager(newPassword);

  await updateEnvFile(newPassword);

  console.info("✅ Rotação concluída. Atualize seus serviços para usar a nova credencial.");
}

main().catch((err) => {
  console.error("❌ Falha ao rotacionar segredo:", err);
  process.exitCode = 1;
});
