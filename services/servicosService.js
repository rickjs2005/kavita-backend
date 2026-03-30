"use strict";
// services/servicosService.js
//
// Lógica de negócio para o módulo público de serviços (colaboradores).
// Responsabilidades:
//   - normalização e transformação de dados de DB para API
//   - orquestração de múltiplas queries (count + data em paralelo, attachImages)
//   - sanitização de entrada antes de gravar (anti-XSS persistido)
//   - ciclo de vida de transações para operações compostas (avaliacoes)
//
// normalizeImages e mapRowToService são exportados para testes unitários.

const pool = require("../config/pool");
const repo = require("../repositories/servicosRepository");
const AppError = require("../errors/AppError");
const ERROR_CODES = require("../constants/ErrorCodes");
const { sanitizeText } = require("../utils/sanitize");

// ---------------------------------------------------------------------------
// Helpers de transformação (movidos do legado)
// ---------------------------------------------------------------------------

/**
 * Normaliza o campo `images` de diferentes formatos (null, string simples,
 * string CSV, string JSON de array) para sempre retornar um array de strings.
 * Exportado para testes unitários.
 */
function normalizeImages(images) {
  if (!images) return [];
  try {
    if (typeof images === "string") {
      const s = images.trim();
      if (s.startsWith("[") && s.endsWith("]")) {
        const arr = JSON.parse(s);
        return Array.isArray(arr) ? arr.filter(Boolean) : [];
      }
      return s
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean);
    }
    if (Array.isArray(images)) return images.filter(Boolean);
    return [];
  } catch {
    return [];
  }
}

/**
 * Transforma um registro bruto do DB (com campo `images` já agregado)
 * no shape público do serviço/colaborador.
 *
 * rating_avg e rating_count são sempre Numbers (nunca null) para o frontend.
 * Exportado para testes unitários.
 */
function mapRowToService(row) {
  const extraFromColab = normalizeImages(row.images);
  const imagem = row.imagem_capa || extraFromColab[0] || null;

  return {
    id: row.id,
    nome: row.nome,
    descricao: row.descricao,
    imagem,
    images: extraFromColab,
    cargo: row.cargo,
    whatsapp: row.whatsapp,
    especialidade_id: row.especialidade_id,
    especialidade_nome: row.especialidade_nome,
    rating_avg: row.rating_avg != null ? Number(row.rating_avg) : 0,
    rating_count: row.rating_count != null ? Number(row.rating_count) : 0,
  };
}

/**
 * Agrega imagens de colaborador_images aos rows via uma única query.
 * Evita N+1 ao carregar uma página inteira.
 */
async function attachImages(rows) {
  if (!rows.length) return rows;
  const ids = rows.map((r) => r.id);
  const imgs = await repo.findImagesByIds(ids);

  const bucket = imgs.reduce((acc, it) => {
    (acc[it.colaborador_id] ||= []).push(it.path);
    return acc;
  }, {});

  return rows.map((r) => ({
    ...r,
    images: (bucket[r.id] || []).filter(Boolean),
  }));
}

// ---------------------------------------------------------------------------
// Listagem paginada
// ---------------------------------------------------------------------------

/**
 * Lista colaboradores verificados com paginação, ordenação e filtros.
 * COUNT e SELECT rodam em paralelo para reduzir latência.
 *
 * @param {{ page, limit, sort, order, busca, especialidade }} params
 *   Já normalizados pelo ServicosQuerySchema via validate middleware.
 */
async function listServicos(params) {
  const { page, limit, sort, order, busca, especialidade } = params;
  const filters = { busca, especialidade };

  const [total, rows] = await Promise.all([
    repo.countServicos(filters),
    repo.findAllPaginated(filters, { page, limit, sort, order }),
  ]);

  const withImages = await attachImages(rows);
  const data = withImages.map(mapRowToService);

  return { data, page, limit, total, sort, order };
}

// ---------------------------------------------------------------------------
// Detalhe
// ---------------------------------------------------------------------------

/**
 * Retorna um único colaborador verificado com suas imagens.
 * Lança NOT_FOUND se não existir ou não estiver verificado.
 */
async function getServico(id) {
  const row = await repo.findById(id);
  if (!row) {
    throw new AppError("Serviço não encontrado.", ERROR_CODES.NOT_FOUND, 404);
  }
  const [withImages] = await attachImages([row]);
  return mapRowToService(withImages);
}

// ---------------------------------------------------------------------------
// Solicitações de serviço
// ---------------------------------------------------------------------------

/**
 * Cria uma solicitação de contato para um colaborador.
 * Sanitiza campos de texto antes de gravar (anti-XSS persistido).
 */
async function createSolicitacao(body) {
  const { colaborador_id, nome_contato, whatsapp, descricao, origem } = body;
  const insertId = await repo.createSolicitacao({
    colaborador_id,
    nome_contato: sanitizeText(nome_contato, 200),
    whatsapp: sanitizeText(whatsapp, 50),
    descricao: sanitizeText(descricao, 2000),
    origem: origem ? sanitizeText(String(origem), 100) : null,
  });
  return { id: insertId };
}

// ---------------------------------------------------------------------------
// Avaliações
// ---------------------------------------------------------------------------

/**
 * Cria uma avaliação e atualiza a média/contador do colaborador.
 * Executa em transação: se o UPDATE de rating falhar, a avaliação é revertida.
 * Sanitiza o comentário para prevenir XSS persistido.
 */
async function createAvaliacao(body) {
  const { colaborador_id, nota, comentario, autor_nome } = body;
  const nomeFinal =
    typeof autor_nome === "string" && autor_nome.trim()
      ? autor_nome.trim()
      : "Cliente Kavita";
  const comentarioSanitizado = comentario
    ? sanitizeText(String(comentario), 1000)
    : null;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const insertId = await repo.createAvaliacao(conn, {
      colaborador_id,
      nota,
      comentario: comentarioSanitizado,
      autor_nome: nomeFinal,
    });
    await repo.updateRating(conn, colaborador_id, nota);
    await conn.commit();
    return { id: insertId };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

/**
 * Lista avaliações de um colaborador (recentes primeiro, máx 50).
 */
async function listAvaliacoes(colaboradorId) {
  return repo.findAvaliacoes(colaboradorId);
}

// ---------------------------------------------------------------------------
// Contadores de engajamento
// ---------------------------------------------------------------------------

/**
 * Registra uma visualização do perfil do colaborador.
 * Verifica existência antes de incrementar (evita criar entrada para ID fantasma).
 */
async function registerView(id) {
  const exists = await repo.existsById(id);
  if (!exists) {
    throw new AppError("Colaborador não encontrado.", ERROR_CODES.NOT_FOUND, 404);
  }
  await repo.incrementViews(id);
}

/**
 * Registra um clique no WhatsApp do colaborador.
 * Verifica existência antes de incrementar.
 */
async function registerWhatsappClick(id) {
  const exists = await repo.existsById(id);
  if (!exists) {
    throw new AppError("Colaborador não encontrado.", ERROR_CODES.NOT_FOUND, 404);
  }
  await repo.incrementWhatsapp(id);
}

// ---------------------------------------------------------------------------
// Trabalhe Conosco
// ---------------------------------------------------------------------------

/**
 * Registra interesse de prestador para se tornar colaborador.
 * O colaborador é inserido com verificado=0 — fica invisível nas listagens
 * públicas até aprovação manual no painel admin.
 * Sanitiza todos os campos de texto antes de gravar.
 */
async function createTrabalheConosco(body) {
  const { nome, whatsapp, cargo, descricao, especialidade_id } = body;
  const insertId = await repo.createTrabalheConosco({
    nome: sanitizeText(nome, 200),
    cargo: cargo ? sanitizeText(String(cargo), 200) : null,
    whatsapp: sanitizeText(whatsapp, 50),
    descricao: descricao ? sanitizeText(String(descricao), 2000) : null,
    especialidade_id: especialidade_id != null ? Number(especialidade_id) : null,
  });
  return { id: insertId };
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  listServicos,
  getServico,
  createSolicitacao,
  createAvaliacao,
  listAvaliacoes,
  registerView,
  registerWhatsappClick,
  createTrabalheConosco,
  // exportados para testes unitários
  normalizeImages,
  mapRowToService,
};
