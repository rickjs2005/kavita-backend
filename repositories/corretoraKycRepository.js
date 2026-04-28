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
    "SELECT * FROM corretora_kyc WHERE corretora_id = ? LIMIT 1",
    [corretora_id],
  );
  return hydrate(rows[0]);
}

/**
 * Lista corretoras com KYC parado em um status (G5 — alerta de KYC pendente).
 *
 * Regras (status terminais ficam de fora):
 *   - status='pending_verification': mede idade desde corretoras.created_at
 *     (corretora cadastrou conta mas nunca submeteu CNPJ).
 *   - status='under_review': mede idade desde corretora_kyc.updated_at
 *     (corretora submeteu, admin sentado em cima da revisão). LEFT JOIN
 *     com fallback pra corretoras.created_at caso o snapshot tenha sumido.
 *
 * Filtros conservadores:
 *   - corretoras.status = 'active'
 *   - corretoras.deleted_at IS NULL
 *
 * Retorna lista ordenada por idade desc (mais antigas primeiro).
 *
 * @param {{status: 'pending_verification'|'under_review', olderThanDays: number}} opts
 * @returns {Promise<Array<{
 *   corretora_id: number,
 *   nome: string,
 *   email: string|null,
 *   kyc_status: string,
 *   stale_since: Date,
 *   age_days: number,
 * }>>}
 */
async function findStaleByStatus({ status, olderThanDays }) {
  if (status !== "pending_verification" && status !== "under_review") {
    throw new Error(
      `findStaleByStatus: status invalido "${status}". ` +
        "Apenas pending_verification ou under_review.",
    );
  }
  const days = Math.max(1, Number(olderThanDays) || 0);

  if (status === "pending_verification") {
    const [rows] = await pool.query(
      `SELECT c.id   AS corretora_id,
              c.name AS nome,
              c.email,
              c.kyc_status,
              c.created_at AS stale_since,
              TIMESTAMPDIFF(DAY, c.created_at, NOW()) AS age_days
         FROM corretoras c
        WHERE c.kyc_status = 'pending_verification'
          AND c.status = 'active'
          AND c.deleted_at IS NULL
          AND c.created_at < (NOW() - INTERVAL ? DAY)
        ORDER BY c.created_at ASC`,
      [days],
    );
    return rows;
  }

  // under_review
  const [rows] = await pool.query(
    `SELECT c.id   AS corretora_id,
            c.name AS nome,
            c.email,
            c.kyc_status,
            COALESCE(k.updated_at, c.created_at) AS stale_since,
            TIMESTAMPDIFF(DAY, COALESCE(k.updated_at, c.created_at), NOW()) AS age_days
       FROM corretoras c
       LEFT JOIN corretora_kyc k ON k.corretora_id = c.id
      WHERE c.kyc_status = 'under_review'
        AND c.status = 'active'
        AND c.deleted_at IS NULL
        AND COALESCE(k.updated_at, c.created_at) < (NOW() - INTERVAL ? DAY)
      ORDER BY COALESCE(k.updated_at, c.created_at) ASC`,
    [days],
  );
  return rows;
}

module.exports = { upsert, findByCorretoraId, findStaleByStatus };
