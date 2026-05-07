"use strict";

const dronesRepo = require("../../repositories/dronesRepository");
const { clampInt, sanitizeText } = require("./helpers");

const ALLOWED_STATUS = new Set([
  "NOVO",
  "EM_CONTATO",
  "NEGOCIACAO",
  "CONVERTIDO",
  "PERDIDO",
]);

function sha256Hex(v) {
  try {
    return require("crypto")
      .createHash("sha256")
      .update(String(v || ""))
      .digest("hex");
  } catch {
    return null;
  }
}

async function listLeadsAdmin({
  page,
  limit,
  status,
  modelo_interesse,
  busca,
} = {}) {
  const p = clampInt(page, 1, 1, 999999);
  const l = clampInt(limit, 20, 1, 100);
  const offset = (p - 1) * l;

  const q = sanitizeText(busca, 120);
  const st = sanitizeText(status, 30);
  const mod = sanitizeText(modelo_interesse, 40);

  let where = "WHERE 1=1";
  const params = [];

  if (st && ALLOWED_STATUS.has(st.toUpperCase())) {
    where += " AND status=?";
    params.push(st.toUpperCase());
  }
  if (mod) {
    where += " AND modelo_interesse=?";
    params.push(mod);
  }
  if (q) {
    where += " AND (nome LIKE ? OR cidade LIKE ? OR telefone LIKE ?)";
    params.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }

  const total = await dronesRepo.countLeads(where, params);
  const totalPages = Math.max(1, Math.ceil(total / l));

  const rows = await dronesRepo.listLeadRows(where, params, l, offset);
  return { items: rows, page: p, limit: l, total, totalPages };
}

async function countLeadsByStatus(status = "NOVO") {
  const where = "WHERE status=?";
  return dronesRepo.countLeads(where, [String(status).toUpperCase()]);
}

async function getLeadById(id) {
  const leadId = clampInt(id, null, 1, 999999999);
  if (!leadId) return null;
  return dronesRepo.findLeadById(leadId);
}

async function createLeadPublic({
  nome,
  telefone,
  cidade,
  uf,
  modelo_interesse,
  mensagem,
  origem,
  ip,
  user_agent,
} = {}) {
  // Sanitiza tudo. Service é defensivo mesmo com Zod no controller —
  // dois pontos de checagem, custo zero.
  const nomeSan = sanitizeText(nome, 120);
  const telefoneSan = sanitizeText(telefone, 30);
  if (!nomeSan || !telefoneSan) {
    const err = new Error("nome e telefone são obrigatórios");
    err.code = "VALIDATION_ERROR";
    throw err;
  }

  const id = await dronesRepo.insertLead({
    nome: nomeSan,
    telefone: telefoneSan,
    cidade: sanitizeText(cidade, 80),
    uf: (sanitizeText(uf, 2) || "").toUpperCase() || null,
    modelo_interesse: (sanitizeText(modelo_interesse, 40) || "").toLowerCase() || null,
    mensagem: sanitizeText(mensagem, 1000),
    origem: sanitizeText(origem, 60) || "interest_form",
    ip_hash: ip ? sha256Hex(ip) : null,
    user_agent: sanitizeText(user_agent, 255),
  });

  return id;
}

async function updateLead(id, payload = {}) {
  const leadId = clampInt(id, null, 1, 999999999);
  if (!leadId) {
    const err = new Error("id inválido");
    err.code = "VALIDATION_ERROR";
    throw err;
  }

  const sets = [];
  const params = [];

  // Campos texto que admin pode editar
  const textMap = [
    ["nome", 120],
    ["telefone", 30],
    ["cidade", 80],
    ["uf", 2],
    ["modelo_interesse", 40],
    ["mensagem", 1000],
    ["origem", 60],
  ];
  for (const [k, maxLen] of textMap) {
    if (Object.prototype.hasOwnProperty.call(payload, k)) {
      sets.push(`${k}=?`);
      params.push(sanitizeText(payload[k], maxLen));
    }
  }

  if (Object.prototype.hasOwnProperty.call(payload, "status")) {
    const st = String(payload.status || "").toUpperCase();
    if (!ALLOWED_STATUS.has(st)) {
      const err = new Error("status inválido");
      err.code = "VALIDATION_ERROR";
      throw err;
    }
    sets.push("status=?");
    params.push(st);
  }

  if (Object.prototype.hasOwnProperty.call(payload, "assigned_to")) {
    const v = payload.assigned_to;
    sets.push("assigned_to=?");
    params.push(v == null || v === "" ? null : Number(v) || null);
  }

  return dronesRepo.updateLead(leadId, sets, params);
}

async function deleteLead(id) {
  const leadId = clampInt(id, null, 1, 999999999);
  if (!leadId) {
    const err = new Error("id inválido");
    err.code = "VALIDATION_ERROR";
    throw err;
  }
  return dronesRepo.deleteLead(leadId);
}

module.exports = {
  listLeadsAdmin,
  countLeadsByStatus,
  getLeadById,
  createLeadPublic,
  updateLead,
  deleteLead,
};
