"use strict";

const dronesRepo = require("../../repositories/dronesRepository");
const { clampInt, sanitizeText } = require("./helpers");

async function listFaqPublic() {
  const rows = await dronesRepo.listFaqRows({ activeOnly: true });
  // Resposta pública não expõe is_active/sort_order — só o que a UI usa.
  return rows.map((r) => ({
    id: r.id,
    question: r.question,
    answer: r.answer,
  }));
}

async function listFaqAdmin() {
  return dronesRepo.listFaqRows({ activeOnly: false });
}

async function getFaqById(id) {
  const faqId = clampInt(id, null, 1, 999999999);
  if (!faqId) return null;
  return dronesRepo.findFaqById(faqId);
}

async function createFaq(payload = {}) {
  const question = sanitizeText(payload.question, 255);
  // Para answer não usamos sanitizeText padrão (que tem limite). FAQ é
  // texto longo legítimo. Limite gerenciado no schema Zod (5000 chars).
  const answer =
    payload.answer == null ? null : String(payload.answer).trim() || null;

  if (!question || !answer) {
    const err = new Error("question e answer são obrigatórios");
    err.code = "VALIDATION_ERROR";
    throw err;
  }

  const sort_order = clampInt(payload.sort_order, 0, 0, 999999);
  const is_active = payload.is_active == null ? 1 : Number(payload.is_active) ? 1 : 0;

  return dronesRepo.insertFaq({ question, answer, sort_order, is_active });
}

async function updateFaq(id, payload = {}) {
  const faqId = clampInt(id, null, 1, 999999999);
  if (!faqId) {
    const err = new Error("id inválido");
    err.code = "VALIDATION_ERROR";
    throw err;
  }

  const sets = [];
  const params = [];

  if (Object.prototype.hasOwnProperty.call(payload, "question")) {
    sets.push("question=?");
    params.push(sanitizeText(payload.question, 255));
  }
  if (Object.prototype.hasOwnProperty.call(payload, "answer")) {
    const a = payload.answer == null ? null : String(payload.answer).trim() || null;
    sets.push("answer=?");
    params.push(a);
  }
  if (Object.prototype.hasOwnProperty.call(payload, "sort_order")) {
    sets.push("sort_order=?");
    params.push(clampInt(payload.sort_order, 0, 0, 999999));
  }
  if (Object.prototype.hasOwnProperty.call(payload, "is_active")) {
    sets.push("is_active=?");
    params.push(Number(payload.is_active) ? 1 : 0);
  }

  return dronesRepo.updateFaq(faqId, sets, params);
}

async function deleteFaq(id) {
  const faqId = clampInt(id, null, 1, 999999999);
  if (!faqId) {
    const err = new Error("id inválido");
    err.code = "VALIDATION_ERROR";
    throw err;
  }
  return dronesRepo.deleteFaq(faqId);
}

module.exports = {
  listFaqPublic,
  listFaqAdmin,
  getFaqById,
  createFaq,
  updateFaq,
  deleteFaq,
};
