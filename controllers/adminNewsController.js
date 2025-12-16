// controllers/adminNewsController.js
// Admin controller do Kavita News (CRUD + validações + logs em admin_logs via pool)

const newsModel = require("../models/newsModel");
const pool = require("../config/pool");

/* =========================
 * Helpers: respostas padronizadas
 * ========================= */
function ok(res, data, meta) {
  const payload = { ok: true, data };
  if (meta) payload.meta = meta;
  return res.status(200).json(payload);
}

function created(res, data) {
  return res.status(201).json({ ok: true, data });
}

function fail(res, status, code, message, details) {
  const payload = { ok: false, code, message };
  if (details) payload.details = details;
  return res.status(status).json(payload);
}

function toInt(v, def = 0) {
  const n = Number.parseInt(String(v ?? ""), 10);
  return Number.isNaN(n) ? def : n;
}

function toFloat(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number.parseFloat(String(v));
  return Number.isNaN(n) ? null : n;
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function normalizeSlug(s) {
  return String(s || "").trim().toLowerCase();
}

function isValidSlug(slug) {
  return typeof slug === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug);
}

function isNonEmptyStr(v, max = 999999) {
  return typeof v === "string" && v.trim().length > 0 && v.trim().length <= max;
}

function isOptionalStr(v, max) {
  if (v === null || v === undefined || v === "") return true;
  return typeof v === "string" && v.trim().length <= max;
}

function normalizeUF(v) {
  return String(v || "").trim().toUpperCase();
}

function toBoolTiny(v, def = 1) {
  if (v === null || v === undefined || v === "") return def;
  if (v === true) return 1;
  if (v === false) return 0;
  const s = String(v).trim().toLowerCase();
  if (s === "1" || s === "true" || s === "sim" || s === "yes") return 1;
  if (s === "0" || s === "false" || s === "nao" || s === "não" || s === "no") return 0;
  const n = toInt(v, def);
  return n ? 1 : 0;
}

function isValidDateTimeLike(v) {
  if (v instanceof Date && !Number.isNaN(v.getTime())) return true;
  if (typeof v !== "string") return false;
  const s = v.trim();
  if (!s) return false;
  return /^\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2}(?::\d{2})?)?$/.test(s);
}

function getAdminId(req) {
  // compatível com padrões comuns de verifyAdmin
  return req.admin?.id || req.user?.id || req.adminId || req.userId || null;
}

/* =========================
 * Logs: grava direto em admin_logs
 * Campos: admin_id, acao, entidade, entidade_id
 * ========================= */
async function logAdmin(req, acao, entidade, entidade_id = null) {
  try {
    const admin_id = getAdminId(req);
    if (!admin_id) return;

    await pool.query(
      `INSERT INTO admin_logs (admin_id, acao, entidade, entidade_id) VALUES (?, ?, ?, ?)`,
      [admin_id, acao, entidade, entidade_id]
    );
  } catch {
    // log nunca pode derrubar a request
  }
}

/* =========================================================
 * ADMIN - CLIMA (news_clima)
 * Campos obrigatórios: city_name, slug, uf
 * Campos opcionais: mm_24h, mm_7d, source, last_update_at, ativo
 * ========================================================= */

exports.listClima = async (req, res) => {
  try {
    const rows = await newsModel.listClima();
    return ok(res, rows);
  } catch (error) {
    console.error("adminNewsController.listClima:", error);
    return fail(res, 500, "INTERNAL_ERROR", "Erro ao listar clima.");
  }
};

exports.createClima = async (req, res) => {
  try {
    const body = req.body || {};

    const city_name = isNonEmptyStr(body.city_name, 120) ? body.city_name.trim() : null;
    const slug = normalizeSlug(body.slug);
    const uf = normalizeUF(body.uf);

    if (!city_name) return fail(res, 400, "VALIDATION_ERROR", "city_name é obrigatório (máx 120).", { field: "city_name" });
    if (!isValidSlug(slug)) return fail(res, 400, "VALIDATION_ERROR", "slug inválido.", { field: "slug" });
    if (uf.length !== 2) return fail(res, 400, "VALIDATION_ERROR", "uf inválido (use 2 letras).", { field: "uf" });

    const mm_24h = toFloat(body.mm_24h);
    const mm_7d = toFloat(body.mm_7d);

    if (body.mm_24h !== undefined && body.mm_24h !== null && body.mm_24h !== "" && mm_24h === null) {
      return fail(res, 400, "VALIDATION_ERROR", "mm_24h inválido (deve ser número).", { field: "mm_24h" });
    }
    if (body.mm_7d !== undefined && body.mm_7d !== null && body.mm_7d !== "" && mm_7d === null) {
      return fail(res, 400, "VALIDATION_ERROR", "mm_7d inválido (deve ser número).", { field: "mm_7d" });
    }

    if (!isOptionalStr(body.source, 120)) {
      return fail(res, 400, "VALIDATION_ERROR", "source inválido (máx 120).", { field: "source" });
    }

    if (body.last_update_at !== undefined && body.last_update_at !== null && body.last_update_at !== "") {
      if (!isValidDateTimeLike(body.last_update_at)) {
        return fail(res, 400, "VALIDATION_ERROR", "last_update_at inválido (use YYYY-MM-DD HH:mm:ss).", { field: "last_update_at" });
      }
    }

    const payload = {
      city_name,
      slug,
      uf,
      mm_24h,
      mm_7d,
      source: body.source ? String(body.source).trim() : null,
      last_update_at: body.last_update_at ?? null,
      ativo: toBoolTiny(body.ativo, 1),
    };

    const createdRow = await newsModel.createClima(payload);
    await logAdmin(req, "criou", "news_clima", createdRow?.id ?? null);

    return created(res, createdRow);
  } catch (error) {
    console.error("adminNewsController.createClima:", error);

    if (String(error?.code || "").includes("ER_DUP_ENTRY")) {
      return fail(res, 409, "DUPLICATE", "Já existe um clima com esse slug.");
    }

    return fail(res, 500, "INTERNAL_ERROR", "Erro ao criar clima.");
  }
};

exports.updateClima = async (req, res) => {
  try {
    const id = toInt(req.params.id, 0);
    if (!id) return fail(res, 400, "VALIDATION_ERROR", "ID inválido.");

    const body = req.body || {};
    const patch = {};

    if (Object.prototype.hasOwnProperty.call(body, "city_name")) {
      if (body.city_name !== null && body.city_name !== "" && !isNonEmptyStr(body.city_name, 120)) {
        return fail(res, 400, "VALIDATION_ERROR", "city_name inválido (máx 120).", { field: "city_name" });
      }
      patch.city_name = body.city_name ? String(body.city_name).trim() : null;
    }

    if (Object.prototype.hasOwnProperty.call(body, "slug")) {
      const slug = normalizeSlug(body.slug);
      if (body.slug !== null && body.slug !== "" && !isValidSlug(slug)) {
        return fail(res, 400, "VALIDATION_ERROR", "slug inválido.", { field: "slug" });
      }
      patch.slug = body.slug ? slug : null;
    }

    if (Object.prototype.hasOwnProperty.call(body, "uf")) {
      const uf = normalizeUF(body.uf);
      if (body.uf !== null && body.uf !== "" && uf.length !== 2) {
        return fail(res, 400, "VALIDATION_ERROR", "uf inválido (use 2 letras).", { field: "uf" });
      }
      patch.uf = body.uf ? uf : null;
    }

    if (Object.prototype.hasOwnProperty.call(body, "mm_24h")) {
      const mm_24h = toFloat(body.mm_24h);
      if (body.mm_24h !== null && body.mm_24h !== "" && mm_24h === null) {
        return fail(res, 400, "VALIDATION_ERROR", "mm_24h inválido (deve ser número).", { field: "mm_24h" });
      }
      patch.mm_24h = body.mm_24h === "" ? null : mm_24h;
    }

    if (Object.prototype.hasOwnProperty.call(body, "mm_7d")) {
      const mm_7d = toFloat(body.mm_7d);
      if (body.mm_7d !== null && body.mm_7d !== "" && mm_7d === null) {
        return fail(res, 400, "VALIDATION_ERROR", "mm_7d inválido (deve ser número).", { field: "mm_7d" });
      }
      patch.mm_7d = body.mm_7d === "" ? null : mm_7d;
    }

    if (Object.prototype.hasOwnProperty.call(body, "source")) {
      if (body.source !== null && body.source !== "" && !isOptionalStr(body.source, 120)) {
        return fail(res, 400, "VALIDATION_ERROR", "source inválido (máx 120).", { field: "source" });
      }
      patch.source = body.source ? String(body.source).trim() : null;
    }

    if (Object.prototype.hasOwnProperty.call(body, "last_update_at")) {
      if (body.last_update_at !== null && body.last_update_at !== "" && !isValidDateTimeLike(body.last_update_at)) {
        return fail(res, 400, "VALIDATION_ERROR", "last_update_at inválido (YYYY-MM-DD HH:mm:ss).", { field: "last_update_at" });
      }
      patch.last_update_at = body.last_update_at ?? null;
    }

    if (Object.prototype.hasOwnProperty.call(body, "ativo")) {
      patch.ativo = toBoolTiny(body.ativo, 1);
    }

    const result = await newsModel.updateClima(id, patch);
    await logAdmin(req, "editou", "news_clima", id);

    return ok(res, result);
  } catch (error) {
    console.error("adminNewsController.updateClima:", error);

    if (String(error?.code || "").includes("ER_DUP_ENTRY")) {
      return fail(res, 409, "DUPLICATE", "Já existe um clima com esse slug.");
    }

    return fail(res, 500, "INTERNAL_ERROR", "Erro ao atualizar clima.");
  }
};

exports.deleteClima = async (req, res) => {
  try {
    const id = toInt(req.params.id, 0);
    if (!id) return fail(res, 400, "VALIDATION_ERROR", "ID inválido.");

    const result = await newsModel.deleteClima(id);
    await logAdmin(req, "excluiu", "news_clima", id);

    return ok(res, { deleted: true, result });
  } catch (error) {
    console.error("adminNewsController.deleteClima:", error);
    return fail(res, 500, "INTERNAL_ERROR", "Erro ao deletar clima.");
  }
};

/* =========================================================
 * ADMIN - COTAÇÕES (news_cotacoes)
 * Campos obrigatórios: name, slug, type
 * Campos opcionais: price, unit, variation_day, market, source, last_update_at, ativo
 * ========================================================= */

exports.listCotacoes = async (req, res) => {
  try {
    const rows = await newsModel.listCotacoes();
    return ok(res, rows);
  } catch (error) {
    console.error("adminNewsController.listCotacoes:", error);
    return fail(res, 500, "INTERNAL_ERROR", "Erro ao listar cotações.");
  }
};

exports.createCotacao = async (req, res) => {
  try {
    const body = req.body || {};

    const name = isNonEmptyStr(body.name, 160) ? body.name.trim() : null;
    const slug = normalizeSlug(body.slug);
    const type = isNonEmptyStr(body.type, 40) ? body.type.trim().toLowerCase() : null;

    if (!name) return fail(res, 400, "VALIDATION_ERROR", "name é obrigatório (máx 160).", { field: "name" });
    if (!isValidSlug(slug)) return fail(res, 400, "VALIDATION_ERROR", "slug inválido.", { field: "slug" });
    if (!type) return fail(res, 400, "VALIDATION_ERROR", "type é obrigatório (máx 40).", { field: "type" });

    const price = toFloat(body.price);
    if (body.price !== undefined && body.price !== null && body.price !== "" && price === null) {
      return fail(res, 400, "VALIDATION_ERROR", "price inválido (deve ser número).", { field: "price" });
    }

    const variation_day = toFloat(body.variation_day);
    if (body.variation_day !== undefined && body.variation_day !== null && body.variation_day !== "" && variation_day === null) {
      return fail(res, 400, "VALIDATION_ERROR", "variation_day inválido (deve ser número).", { field: "variation_day" });
    }

    if (!isOptionalStr(body.unit, 40)) return fail(res, 400, "VALIDATION_ERROR", "unit inválido (máx 40).", { field: "unit" });
    if (!isOptionalStr(body.market, 120)) return fail(res, 400, "VALIDATION_ERROR", "market inválido (máx 120).", { field: "market" });
    if (!isOptionalStr(body.source, 120)) return fail(res, 400, "VALIDATION_ERROR", "source inválido (máx 120).", { field: "source" });

    if (body.last_update_at !== undefined && body.last_update_at !== null && body.last_update_at !== "") {
      if (!isValidDateTimeLike(body.last_update_at)) {
        return fail(res, 400, "VALIDATION_ERROR", "last_update_at inválido (YYYY-MM-DD HH:mm:ss).", { field: "last_update_at" });
      }
    }

    const payload = {
      name,
      slug,
      type,
      price,
      unit: body.unit ? String(body.unit).trim() : null,
      variation_day,
      market: body.market ? String(body.market).trim() : null,
      source: body.source ? String(body.source).trim() : null,
      last_update_at: body.last_update_at ?? null,
      ativo: toBoolTiny(body.ativo, 1),
    };

    const createdRow = await newsModel.createCotacao(payload);
    await logAdmin(req, "criou", "news_cotacoes", createdRow?.id ?? null);

    return created(res, createdRow);
  } catch (error) {
    console.error("adminNewsController.createCotacao:", error);

    if (String(error?.code || "").includes("ER_DUP_ENTRY")) {
      return fail(res, 409, "DUPLICATE", "Já existe uma cotação com esse slug.");
    }

    return fail(res, 500, "INTERNAL_ERROR", "Erro ao criar cotação.");
  }
};

exports.updateCotacao = async (req, res) => {
  try {
    const id = toInt(req.params.id, 0);
    if (!id) return fail(res, 400, "VALIDATION_ERROR", "ID inválido.");

    const body = req.body || {};
    const patch = { ...body };

    if (Object.prototype.hasOwnProperty.call(patch, "slug")) {
      const slug = normalizeSlug(patch.slug);
      if (patch.slug !== null && patch.slug !== "" && !isValidSlug(slug)) {
        return fail(res, 400, "VALIDATION_ERROR", "slug inválido.", { field: "slug" });
      }
      patch.slug = patch.slug ? slug : null;
    }

    if (Object.prototype.hasOwnProperty.call(patch, "price")) {
      const price = toFloat(patch.price);
      if (patch.price !== null && patch.price !== "" && price === null) {
        return fail(res, 400, "VALIDATION_ERROR", "price inválido (deve ser número).", { field: "price" });
      }
      patch.price = patch.price === "" ? null : price;
    }

    if (Object.prototype.hasOwnProperty.call(patch, "variation_day")) {
      const variation_day = toFloat(patch.variation_day);
      if (patch.variation_day !== null && patch.variation_day !== "" && variation_day === null) {
        return fail(res, 400, "VALIDATION_ERROR", "variation_day inválido (deve ser número).", { field: "variation_day" });
      }
      patch.variation_day = patch.variation_day === "" ? null : variation_day;
    }

    if (Object.prototype.hasOwnProperty.call(patch, "unit") && patch.unit !== null && patch.unit !== "" && !isOptionalStr(patch.unit, 40)) {
      return fail(res, 400, "VALIDATION_ERROR", "unit inválido (máx 40).", { field: "unit" });
    }
    if (Object.prototype.hasOwnProperty.call(patch, "market") && patch.market !== null && patch.market !== "" && !isOptionalStr(patch.market, 120)) {
      return fail(res, 400, "VALIDATION_ERROR", "market inválido (máx 120).", { field: "market" });
    }
    if (Object.prototype.hasOwnProperty.call(patch, "source") && patch.source !== null && patch.source !== "" && !isOptionalStr(patch.source, 120)) {
      return fail(res, 400, "VALIDATION_ERROR", "source inválido (máx 120).", { field: "source" });
    }

    if (Object.prototype.hasOwnProperty.call(patch, "last_update_at")) {
      if (patch.last_update_at !== null && patch.last_update_at !== "" && !isValidDateTimeLike(patch.last_update_at)) {
        return fail(res, 400, "VALIDATION_ERROR", "last_update_at inválido (YYYY-MM-DD HH:mm:ss).", { field: "last_update_at" });
      }
      patch.last_update_at = patch.last_update_at ?? null;
    }

    if (Object.prototype.hasOwnProperty.call(patch, "ativo")) {
      patch.ativo = toBoolTiny(patch.ativo, 1);
    }

    const result = await newsModel.updateCotacao(id, patch);
    await logAdmin(req, "editou", "news_cotacoes", id);

    return ok(res, result);
  } catch (error) {
    console.error("adminNewsController.updateCotacao:", error);

    if (String(error?.code || "").includes("ER_DUP_ENTRY")) {
      return fail(res, 409, "DUPLICATE", "Já existe uma cotação com esse slug.");
    }

    return fail(res, 500, "INTERNAL_ERROR", "Erro ao atualizar cotação.");
  }
};

exports.deleteCotacao = async (req, res) => {
  try {
    const id = toInt(req.params.id, 0);
    if (!id) return fail(res, 400, "VALIDATION_ERROR", "ID inválido.");

    const result = await newsModel.deleteCotacao(id);
    await logAdmin(req, "excluiu", "news_cotacoes", id);

    return ok(res, { deleted: true, result });
  } catch (error) {
    console.error("adminNewsController.deleteCotacao:", error);
    return fail(res, 500, "INTERNAL_ERROR", "Erro ao deletar cotação.");
  }
};

/* =========================================================
 * ADMIN - POSTS (news_posts)
 * ========================================================= */

exports.listPosts = async (req, res) => {
  try {
    const status = req.query.status ? String(req.query.status) : undefined;
    const search = req.query.search ? String(req.query.search) : undefined;

    const limit = clamp(toInt(req.query.limit, 20), 1, 100);
    const offset = clamp(toInt(req.query.offset, 0), 0, 100000);

    const result = await newsModel.listPostsAdmin({ status, search, limit, offset });
    if (result && Array.isArray(result.rows)) return ok(res, result.rows, result.meta);
    return ok(res, result);
  } catch (error) {
    console.error("adminNewsController.listPosts:", error);
    return fail(res, 500, "INTERNAL_ERROR", "Erro ao listar posts.");
  }
};

exports.createPost = async (req, res) => {
  try {
    const body = req.body || {};

    const title = body.title;
    const slug = normalizeSlug(body.slug);
    const content = body.content;
    const status = body.status ? String(body.status) : "draft";

    if (!isNonEmptyStr(title, 220)) {
      return fail(res, 400, "VALIDATION_ERROR", "title é obrigatório (máx 220).", { field: "title" });
    }
    if (!isValidSlug(slug)) {
      return fail(res, 400, "VALIDATION_ERROR", "slug inválido.", { field: "slug" });
    }
    if (!isNonEmptyStr(content)) {
      return fail(res, 400, "VALIDATION_ERROR", "content é obrigatório.", { field: "content" });
    }
    if (!["draft", "published", "archived"].includes(status)) {
      return fail(res, 400, "VALIDATION_ERROR", "status inválido.", { field: "status" });
    }

    if (body.excerpt !== undefined && body.excerpt !== null && body.excerpt !== "" && !isOptionalStr(body.excerpt, 500)) {
      return fail(res, 400, "VALIDATION_ERROR", "excerpt inválido (máx 500).", { field: "excerpt" });
    }
    if (body.cover_image_url !== undefined && body.cover_image_url !== null && body.cover_image_url !== "" && !isOptionalStr(body.cover_image_url, 500)) {
      return fail(res, 400, "VALIDATION_ERROR", "cover_image_url inválido (máx 500).", { field: "cover_image_url" });
    }
    if (body.category !== undefined && body.category !== null && body.category !== "" && !isOptionalStr(body.category, 80)) {
      return fail(res, 400, "VALIDATION_ERROR", "category inválida (máx 80).", { field: "category" });
    }
    if (body.tags !== undefined && body.tags !== null && body.tags !== "" && !isOptionalStr(body.tags, 500)) {
      return fail(res, 400, "VALIDATION_ERROR", "tags inválida (máx 500).", { field: "tags" });
    }

    const adminId = getAdminId(req);

    const payload = {
      ...body,
      title: String(title).trim(),
      slug,
      content,
      status,
      author_admin_id: body.author_admin_id ?? adminId ?? null,
      published_at: status === "published" ? (body.published_at ?? new Date()) : null,
    };

    const createdRow = await newsModel.createPost(payload);
    await logAdmin(req, "criou", "news_posts", createdRow?.id ?? null);

    return created(res, createdRow);
  } catch (error) {
    console.error("adminNewsController.createPost:", error);

    if (String(error?.code || "").includes("ER_DUP_ENTRY")) {
      return fail(res, 409, "DUPLICATE", "Já existe um post com esse slug.");
    }

    return fail(res, 500, "INTERNAL_ERROR", "Erro ao criar post.");
  }
};

exports.updatePost = async (req, res) => {
  try {
    const id = toInt(req.params.id, 0);
    if (!id) return fail(res, 400, "VALIDATION_ERROR", "ID inválido.");

    const body = req.body || {};
    const patch = { ...body };

    if (Object.prototype.hasOwnProperty.call(patch, "slug")) {
      const slug = normalizeSlug(patch.slug);
      if (!isValidSlug(slug)) return fail(res, 400, "VALIDATION_ERROR", "slug inválido.", { field: "slug" });
      patch.slug = slug;
    }

    if (Object.prototype.hasOwnProperty.call(patch, "status")) {
      const status = String(patch.status);
      if (!["draft", "published", "archived"].includes(status)) {
        return fail(res, 400, "VALIDATION_ERROR", "status inválido.", { field: "status" });
      }
      // coerência: se sair de published, zera published_at; se entrar, seta se não veio
      if (status !== "published") patch.published_at = null;
      if (status === "published" && !Object.prototype.hasOwnProperty.call(patch, "published_at")) {
        patch.published_at = new Date();
      }
    }

    if (Object.prototype.hasOwnProperty.call(patch, "published_at")) {
      if (patch.published_at !== null && patch.published_at !== "" && !isValidDateTimeLike(patch.published_at)) {
        return fail(res, 400, "VALIDATION_ERROR", "published_at inválido (YYYY-MM-DD HH:mm:ss).", { field: "published_at" });
      }
    }

    if (Object.prototype.hasOwnProperty.call(patch, "excerpt") && patch.excerpt !== null && patch.excerpt !== "" && !isOptionalStr(patch.excerpt, 500)) {
      return fail(res, 400, "VALIDATION_ERROR", "excerpt inválido (máx 500).", { field: "excerpt" });
    }
    if (Object.prototype.hasOwnProperty.call(patch, "cover_image_url") && patch.cover_image_url !== null && patch.cover_image_url !== "" && !isOptionalStr(patch.cover_image_url, 500)) {
      return fail(res, 400, "VALIDATION_ERROR", "cover_image_url inválido (máx 500).", { field: "cover_image_url" });
    }
    if (Object.prototype.hasOwnProperty.call(patch, "category") && patch.category !== null && patch.category !== "" && !isOptionalStr(patch.category, 80)) {
      return fail(res, 400, "VALIDATION_ERROR", "category inválida (máx 80).", { field: "category" });
    }
    if (Object.prototype.hasOwnProperty.call(patch, "tags") && patch.tags !== null && patch.tags !== "" && !isOptionalStr(patch.tags, 500)) {
      return fail(res, 400, "VALIDATION_ERROR", "tags inválida (máx 500).", { field: "tags" });
    }

    const result = await newsModel.updatePost(id, patch);
    await logAdmin(req, "editou", "news_posts", id);

    return ok(res, result);
  } catch (error) {
    console.error("adminNewsController.updatePost:", error);

    if (String(error?.code || "").includes("ER_DUP_ENTRY")) {
      return fail(res, 409, "DUPLICATE", "Já existe um post com esse slug.");
    }

    return fail(res, 500, "INTERNAL_ERROR", "Erro ao atualizar post.");
  }
};

exports.deletePost = async (req, res) => {
  try {
    const id = toInt(req.params.id, 0);
    if (!id) return fail(res, 400, "VALIDATION_ERROR", "ID inválido.");

    const result = await newsModel.deletePost(id);
    await logAdmin(req, "excluiu", "news_posts", id);

    return ok(res, { deleted: true, result });
  } catch (error) {
    console.error("adminNewsController.deletePost:", error);
    return fail(res, 500, "INTERNAL_ERROR", "Erro ao deletar post.");
  }
};

exports.publishPost = async (req, res) => {
  try {
    const id = toInt(req.params.id, 0);
    if (!id) return fail(res, 400, "VALIDATION_ERROR", "ID inválido.");

    let result;
    if (typeof newsModel.publishPost === "function") {
      result = await newsModel.publishPost(id);
    } else {
      result = await newsModel.updatePost(id, { status: "published", published_at: new Date() });
    }

    await logAdmin(req, "publicou", "news_posts", id);
    return ok(res, result);
  } catch (error) {
    console.error("adminNewsController.publishPost:", error);
    return fail(res, 500, "INTERNAL_ERROR", "Erro ao publicar post.");
  }
};

exports.unpublishPost = async (req, res) => {
  try {
    const id = toInt(req.params.id, 0);
    if (!id) return fail(res, 400, "VALIDATION_ERROR", "ID inválido.");

    let result;
    if (typeof newsModel.unpublishPost === "function") {
      result = await newsModel.unpublishPost(id);
    } else {
      result = await newsModel.updatePost(id, { status: "draft", published_at: null });
    }

    await logAdmin(req, "despublicou", "news_posts", id);
    return ok(res, result);
  } catch (error) {
    console.error("adminNewsController.unpublishPost:", error);
    return fail(res, 500, "INTERNAL_ERROR", "Erro ao despublicar post.");
  }
};
