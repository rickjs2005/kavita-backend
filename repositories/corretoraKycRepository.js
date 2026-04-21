// repositories/corretoraKycRepository.js
//
// Persistência do snapshot KYC. Chave natural: corretora_id (UNIQUE).
// Upsert para permitir re-consulta sem criar linhas duplicadas.
"use strict";

const pool = require("../config/pool");

function parseJsonField(value) {
  if (value == null) return null;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function hydrate(row) {
  if (!row) return null;
  return {
    ...row,
    qsa: parseJsonField(row.qsa),
    endereco: parseJsonField(row.endereco),
    provider_response_raw: parseJsonField(row.provider_response_raw),
  };
}

async function upsert({
  corretora_id,
  cnpj,
  razao_social,
  situacao_cadastral,
  qsa,
  endereco,
  natureza_juridica,
  provider,
  provider_response_raw,
  risk_score,
  verified_at,
  verified_by_admin_id,
  admin_notes,
  rejected_reason,
}) {
  await pool.query(
    `INSERT INTO corretora_kyc
       (corretora_id, cnpj, razao_social, situacao_cadastral, qsa,
        endereco, natureza_juridica, provider, provider_response_raw,
        risk_score, verified_at, verified_by_admin_id, admin_notes,
        rejected_reason)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       cnpj = VALUES(cnpj),
       razao_social = VALUES(razao_social),
       situacao_cadastral = VALUES(situacao_cadastral),
       qsa = VALUES(qsa),
       endereco = VALUES(endereco),
       natureza_juridica = VALUES(natureza_juridica),
       provider = VALUES(provider),
       provider_response_raw = VALUES(provider_response_raw),
       risk_score = VALUES(risk_score),
       verified_at = VALUES(verified_at),
       verified_by_admin_id = VALUES(verified_by_admin_id),
       admin_notes = VALUES(admin_notes),
       rejected_reason = VALUES(rejected_reason)`,
    [
      corretora_id,
      cnpj ?? null,
      razao_social ?? null,
      situacao_cadastral ?? null,
      qsa ? JSON.stringify(qsa) : null,
      endereco ? JSON.stringify(endereco) : null,
      natureza_juridica ?? null,
      provider ?? "mock",
      provider_response_raw ? JSON.stringify(provider_response_raw) : null,
      risk_score ?? null,
      verified_at ?? null,
      verified_by_admin_id ?? null,
      admin_notes ?? null,
      rejected_reason ?? null,
    ],
  );
}

async function findByCorretoraId(corretora_id) {
  const [rows] = await pool.query(
    `SELECT * FROM corretora_kyc WHERE corretora_id = ? LIMIT 1`,
    [corretora_id],
  );
  return hydrate(rows[0]);
}

module.exports = { upsert, findByCorretoraId };
