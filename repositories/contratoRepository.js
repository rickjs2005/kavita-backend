// repositories/contratoRepository.js
//
// Acesso à tabela `contratos`. Escopo por corretora_id em todas as
// leituras autenticadas. Leitura pública é só via token (findByToken)
// que devolve um recorte seguro — nunca joga dados sensíveis numa
// busca por ID sem scope.
"use strict";

const pool = require("../config/pool");
const AppError = require("../errors/AppError");
const ERROR_CODES = require("../constants/ErrorCodes");

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
  return { ...row, data_fields: parseJsonField(row.data_fields) };
}

// Aceita uma conexão transacional opcional para que o caller envolva
// o INSERT com o registro de contract_audit_log (event_type='created')
// em uma única transação. Sem conn explícita, cai no pool padrão.
async function create(
  {
    lead_id,
    corretora_id,
    created_by_user_id,
    tipo,
    pdf_url,
    hash_sha256,
    qr_verification_token,
    data_fields,
  },
  conn = pool,
) {
  const [result] = await conn.query(
    `INSERT INTO contratos
       (lead_id, corretora_id, created_by_user_id, tipo,
        status, pdf_url, hash_sha256, qr_verification_token,
        data_fields)
     VALUES (?, ?, ?, ?, 'draft', ?, ?, ?, ?)`,
    [
      lead_id,
      corretora_id,
      created_by_user_id ?? null,
      tipo,
      pdf_url,
      hash_sha256,
      qr_verification_token,
      JSON.stringify(data_fields ?? {}),
    ],
  );
  return result.insertId;
}

async function findById(id, corretora_id) {
  const [rows] = await pool.query(
    "SELECT * FROM contratos WHERE id = ? AND corretora_id = ? LIMIT 1",
    [id, corretora_id],
  );
  return hydrate(rows[0]);
}

async function findByIdUnscoped(id) {
  const [rows] = await pool.query(
    "SELECT * FROM contratos WHERE id = ? LIMIT 1",
    [id],
  );
  return hydrate(rows[0]);
}

async function findByToken(token) {
  const [rows] = await pool.query(
    `SELECT c.id, c.tipo, c.status, c.hash_sha256,
            c.qr_verification_token, c.signed_at, c.created_at,
            c.data_fields,
            co.name AS corretora_name, co.slug AS corretora_slug
       FROM contratos c
       JOIN corretoras co ON co.id = c.corretora_id
      WHERE c.qr_verification_token = ?
      LIMIT 1`,
    [token],
  );
  return hydrate(rows[0]);
}

async function listByLead(lead_id, corretora_id) {
  const [rows] = await pool.query(
    `SELECT id, tipo, status, pdf_url, hash_sha256,
            qr_verification_token, sent_at, signed_at,
            cancelled_at, cancel_reason, created_at
       FROM contratos
      WHERE lead_id = ? AND corretora_id = ?
      ORDER BY created_at DESC`,
    [lead_id, corretora_id],
  );
  return rows;
}

async function hasActiveForLead(lead_id, corretora_id) {
  const [rows] = await pool.query(
    `SELECT id FROM contratos
      WHERE lead_id = ? AND corretora_id = ?
        AND status IN ('draft', 'sent', 'signed')
      LIMIT 1`,
    [lead_id, corretora_id],
  );
  return rows.length > 0;
}

// Aceita conexão transacional opcional (Fase 10.7). Caller que precisa
// atomicidade entre o UPDATE de transição (ex: cancelled) e o audit
// correspondente passa a `conn` do withTransaction — UPDATE e o
// SELECT diagnóstico subsequente rodam na mesma tx, permitindo
// rollback caso o audit crítico falhe depois.
async function updateStatus(id, status, patch = {}, conn = pool) {
  const sets = ["status = ?", "updated_at = CURRENT_TIMESTAMP"];
  const values = [status];

  for (const key of [
    "signer_provider",
    "signer_document_id",
    "signer_envelope_id",
    "sent_at",
    "signed_at",
    "cancelled_at",
    "cancel_reason",
    "signed_pdf_url",
    "signed_hash_sha256",
  ]) {
    if (Object.prototype.hasOwnProperty.call(patch, key)) {
      sets.push(`${key} = ?`);
      values.push(patch[key] ?? null);
    }
  }

  values.push(id);
  // Imutabilidade pós-assinatura (Fase 10.4): contrato em status
  // 'signed' não pode mais ser alterado por nenhum caminho — nem pelo
  // service da corretora, nem pelo webhook ClickSign reenviando
  // evento depois da assinatura, nem por bug acidental em outro
  // lugar do código. Defesa atômica em um SQL: se a linha está
  // signed, o WHERE não casa, affectedRows=0 e levantamos AppError.
  //
  // O caminho legítimo do webhook (sent → signed) passa, porque
  // status atual é 'sent' nesse momento — só fica imutável depois
  // que a transição completa.
  const [result] = await conn.query(
    `UPDATE contratos
        SET ${sets.join(", ")}
      WHERE id = ?
        AND status <> 'signed'`,
    values,
  );

  if (result.affectedRows === 0) {
    // 0 linhas: ou contrato não existe, ou já está signed. Diferenciar
    // ajuda o caller a decidir (404 vs 409). Lê na MESMA conexão para
    // ver dentro da própria transação (caso a inconsistência seja
    // mid-flight no mesmo escopo).
    const [rows] = await conn.query(
      "SELECT status FROM contratos WHERE id = ? LIMIT 1",
      [id],
    );
    if (rows.length === 0) {
      throw new AppError(
        "Contrato não encontrado.",
        ERROR_CODES.NOT_FOUND,
        404,
      );
    }
    if (rows[0].status === "signed") {
      throw new AppError(
        "Contrato assinado não pode ser alterado.",
        ERROR_CODES.CONFLICT,
        409,
        { contrato_id: id, current_status: "signed" },
      );
    }
    // Mesmo status já está aplicado — UPDATE sem efeito real (idempotência).
    // Não tratamos como erro pois pode acontecer em race condition leve
    // entre o pre-check do service e o UPDATE.
  }
}

async function findBySignerDocumentId(documentId) {
  const [rows] = await pool.query(
    "SELECT * FROM contratos WHERE signer_document_id = ? LIMIT 1",
    [documentId],
  );
  return hydrate(rows[0]);
}

/**
 * Lista contratos em que o produtor identificado pelo email é
 * signatário. O vínculo é via `corretora_leads.email` — o lead guarda
 * o email informado pelo produtor na captura, que é o mesmo usado
 * pela ClickSign. Retorna já com dados da corretora para o frontend
 * renderizar sem segunda query.
 *
 * Segurança: escopa estritamente por email da sessão autenticada.
 * Um produtor com email X nunca vê contrato de lead com email Y.
 */
async function listByProducerEmail(email) {
  if (!email) return [];
  const [rows] = await pool.query(
    `SELECT
        c.id, c.tipo, c.status, c.hash_sha256,
        c.qr_verification_token,
        c.sent_at, c.signed_at, c.cancelled_at, c.cancel_reason,
        c.created_at,
        c.data_fields,
        (c.signed_pdf_url IS NOT NULL) AS has_signed_pdf,
        co.id AS corretora_id, co.name AS corretora_name,
        co.slug AS corretora_slug, co.logo_path AS corretora_logo
       FROM contratos c
       JOIN corretora_leads l ON l.id = c.lead_id
       JOIN corretoras co ON co.id = c.corretora_id
      WHERE LOWER(l.email) = LOWER(?)
      ORDER BY c.created_at DESC
      LIMIT 100`,
    [email],
  );
  return rows.map((r) => ({
    ...r,
    data_fields: parseJsonField(r.data_fields),
    has_signed_pdf: Boolean(r.has_signed_pdf),
  }));
}

/**
 * Busca 1 contrato por id, escopado por email do produtor. Usado
 * pelo endpoint de download de PDF — evita IDOR (produtor com id A
 * não consegue baixar contrato de produtor B mesmo guessando o id).
 */
async function findByIdForProducer(id, email) {
  if (!email) return null;
  const [rows] = await pool.query(
    `SELECT c.*
       FROM contratos c
       JOIN corretora_leads l ON l.id = c.lead_id
      WHERE c.id = ? AND LOWER(l.email) = LOWER(?)
      LIMIT 1`,
    [id, email],
  );
  return hydrate(rows[0]);
}

/**
 * Listagem admin paginada com filtros (Fase 10.10).
 *
 * JOIN com `corretoras` e `corretora_leads` traz nomes legíveis sem
 * obrigar segunda query. Não retorna `data_fields` (snapshot JSON
 * potencialmente grande) — a tela de detalhe / auditoria carrega
 * isso quando precisa.
 *
 * Filtros opcionais:
 *   - status, tipo
 *   - corretora_id, lead_id
 *   - q (busca em c.id, data_fields.__numero_externo, l.nome)
 *   - date_from / date_to (inclusivos por dia em America/Sao_Paulo)
 *
 * Paginação: page (1-based), limit (1..100). Retorna { items, meta }
 * onde meta inclui total, page, limit, total_pages.
 */
async function listForAdmin(filters = {}) {
  const where = [];
  const params = [];

  if (filters.status) {
    where.push("c.status = ?");
    params.push(filters.status);
  }
  if (filters.tipo) {
    where.push("c.tipo = ?");
    params.push(filters.tipo);
  }
  if (Number.isInteger(filters.corretora_id)) {
    where.push("c.corretora_id = ?");
    params.push(filters.corretora_id);
  }
  if (Number.isInteger(filters.lead_id)) {
    where.push("c.lead_id = ?");
    params.push(filters.lead_id);
  }
  // q: busca em (id numérico OU numero_externo no JSON OU nome do
  // produtor no lead). JSON_UNQUOTE evita aspas no LIKE.
  if (filters.q) {
    const q = String(filters.q).trim();
    const like = `%${q}%`;
    const conds = ["l.nome LIKE ?", "JSON_UNQUOTE(JSON_EXTRACT(c.data_fields, '$.__numero_externo')) LIKE ?"];
    params.push(like, like);
    const asNum = Number(q);
    if (Number.isInteger(asNum) && asNum > 0) {
      conds.unshift("c.id = ?");
      params.unshift(asNum);
    }
    where.push(`(${conds.join(" OR ")})`);
  }
  if (filters.date_from) {
    where.push("c.created_at >= ?");
    params.push(`${filters.date_from} 00:00:00`);
  }
  if (filters.date_to) {
    where.push("c.created_at <= ?");
    params.push(`${filters.date_to} 23:59:59`);
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const page = Math.max(1, Number(filters.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(filters.limit) || 20));
  const offset = (page - 1) * limit;

  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) AS total
       FROM contratos c
       LEFT JOIN corretoras co ON co.id = c.corretora_id
       LEFT JOIN corretora_leads l ON l.id = c.lead_id
       ${whereSql}`,
    params,
  );

  const [rows] = await pool.query(
    `SELECT
        c.id, c.tipo, c.status, c.lead_id, c.corretora_id,
        c.created_at, c.sent_at, c.signed_at, c.cancelled_at,
        JSON_UNQUOTE(JSON_EXTRACT(c.data_fields, '$.__numero_externo')) AS numero_externo,
        co.name AS corretora_name, co.slug AS corretora_slug,
        l.nome AS lead_nome
       FROM contratos c
       LEFT JOIN corretoras co ON co.id = c.corretora_id
       LEFT JOIN corretora_leads l ON l.id = c.lead_id
       ${whereSql}
      ORDER BY c.created_at DESC, c.id DESC
      LIMIT ? OFFSET ?`,
    [...params, limit, offset],
  );

  const totalNum = Number(total) || 0;
  return {
    items: rows,
    meta: {
      total: totalNum,
      page,
      limit,
      total_pages: Math.max(1, Math.ceil(totalNum / limit)),
    },
  };
}

module.exports = {
  create,
  findById,
  findByIdUnscoped,
  findByToken,
  findBySignerDocumentId,
  listByLead,
  listByProducerEmail,
  listForAdmin,
  findByIdForProducer,
  hasActiveForLead,
  updateStatus,
};
