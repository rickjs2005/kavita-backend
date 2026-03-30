"use strict";
// repositories/servicosRepository.js
//
// Acesso a dados para o módulo público de serviços (colaboradores).
// Tabelas: colaboradores, especialidades, colaborador_images,
//          solicitacoes_servico, avaliacoes_servico.
//
// Todas as funções recebem pool como dependência implícita via require.
// Funções transacionais recebem `conn` como primeiro argumento.

const pool = require("../config/pool");

// ---------------------------------------------------------------------------
// Constantes de consulta
// ---------------------------------------------------------------------------

// Whitelist de colunas para ORDER BY — impede injeção de SQL.
const SORT_MAP = {
  id: "c.id",
  nome: "c.nome",
  cargo: "c.cargo",
  especialidade: "e.nome",
};

// SELECT base reusado em listagem e detalhe.
const BASE_SELECT = `
  SELECT
    c.id,
    c.nome,
    c.cargo,
    c.whatsapp,
    c.imagem    AS imagem_capa,
    c.descricao AS descricao,
    c.especialidade_id,
    e.nome      AS especialidade_nome,
    c.rating_avg,
    c.rating_count
  FROM colaboradores c
  LEFT JOIN especialidades e ON e.id = c.especialidade_id
`;

/**
 * Monta cláusula WHERE + parâmetros com base nos filtros.
 * Sempre força `verificado = 1` (exibe apenas colaboradores aprovados).
 * Exportado para facilitar testes unitários isolados.
 *
 * @param {{ busca: string, especialidade: number|null }} filters
 * @returns {{ whereSql: string, params: any[] }}
 */
function buildWhereClause({ busca, especialidade }) {
  const where = ["c.verificado = 1"];
  const params = [];

  if (busca) {
    const term = `%${String(busca).trim()}%`;
    where.push("(c.nome LIKE ? OR c.cargo LIKE ? OR c.descricao LIKE ?)");
    params.push(term, term, term);
  }

  if (especialidade != null && Number.isFinite(Number(especialidade))) {
    where.push("c.especialidade_id = ?");
    params.push(Number(especialidade));
  }

  return { whereSql: `WHERE ${where.join(" AND ")}`, params };
}

// ---------------------------------------------------------------------------
// Listagem paginada
// ---------------------------------------------------------------------------

/**
 * Conta o total de colaboradores verificados com os filtros aplicados.
 */
async function countServicos(filters) {
  const { whereSql, params } = buildWhereClause(filters);
  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) AS total
     FROM colaboradores c
     LEFT JOIN especialidades e ON e.id = c.especialidade_id
     ${whereSql}`,
    params
  );
  return total;
}

/**
 * Retorna a página de colaboradores com ordenação segura via SORT_MAP.
 */
async function findAllPaginated(filters, { page, limit, sort, order }) {
  const { whereSql, params } = buildWhereClause(filters);
  const sortCol = SORT_MAP[sort] || SORT_MAP.id;
  const orderDir = order === "ASC" ? "ASC" : "DESC";
  const offset = (page - 1) * limit;

  const [rows] = await pool.query(
    `${BASE_SELECT}
     ${whereSql}
     ORDER BY ${sortCol} ${orderDir}
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
  return rows;
}

// ---------------------------------------------------------------------------
// Detalhe de um colaborador
// ---------------------------------------------------------------------------

/**
 * Retorna um colaborador verificado por ID, ou null se não encontrado.
 */
async function findById(id) {
  const [rows] = await pool.query(
    `${BASE_SELECT}
     WHERE c.id = ? AND c.verificado = 1`,
    [id]
  );
  return rows[0] || null;
}

// ---------------------------------------------------------------------------
// Imagens
// ---------------------------------------------------------------------------

/**
 * Retorna todas as imagens dos colaboradores cujos IDs estão na lista.
 * Uma única query para toda a página — evita N+1.
 */
async function findImagesByIds(ids) {
  if (!ids.length) return [];
  const [imgs] = await pool.query(
    "SELECT colaborador_id, path FROM colaborador_images WHERE colaborador_id IN (?)",
    [ids]
  );
  return imgs;
}

// ---------------------------------------------------------------------------
// Solicitações de serviço
// ---------------------------------------------------------------------------

/**
 * Insere uma solicitação de serviço. Retorna o insertId.
 */
async function createSolicitacao({ colaborador_id, nome_contato, whatsapp, descricao, origem }) {
  const [result] = await pool.query(
    `INSERT INTO solicitacoes_servico
       (colaborador_id, nome_contato, whatsapp, descricao, origem)
     VALUES (?, ?, ?, ?, ?)`,
    [colaborador_id, nome_contato, whatsapp, descricao, origem || null]
  );
  return result.insertId;
}

// ---------------------------------------------------------------------------
// Avaliações
// ---------------------------------------------------------------------------

/**
 * Insere uma avaliação dentro de uma transação existente.
 * Retorna o insertId.
 */
async function createAvaliacao(conn, { colaborador_id, nota, comentario, autor_nome }) {
  const [result] = await conn.query(
    `INSERT INTO avaliacoes_servico (colaborador_id, nota, comentario, autor_nome)
     VALUES (?, ?, ?, ?)`,
    [colaborador_id, nota, comentario || null, autor_nome]
  );
  return result.insertId;
}

/**
 * Atualiza a média e o contador de avaliações do colaborador.
 * Usa fórmula incremental para evitar recalcular toda a tabela.
 * Deve ser chamado dentro da mesma transação de createAvaliacao.
 */
async function updateRating(conn, colaboradorId, nota) {
  await conn.query(
    `UPDATE colaboradores
     SET
       rating_avg   = ((rating_avg * rating_count) + ?) / (rating_count + 1),
       rating_count = rating_count + 1
     WHERE id = ?`,
    [nota, colaboradorId]
  );
}

/**
 * Lista as avaliações de um colaborador (LIMIT 50, recentes primeiro).
 */
async function findAvaliacoes(colaboradorId) {
  const [rows] = await pool.query(
    `SELECT id, colaborador_id, nota, comentario, autor_nome, created_at
     FROM avaliacoes_servico
     WHERE colaborador_id = ?
     ORDER BY created_at DESC
     LIMIT 50`,
    [colaboradorId]
  );
  return rows;
}

// ---------------------------------------------------------------------------
// Contadores de engajamento
// ---------------------------------------------------------------------------

/**
 * Verifica se um colaborador existe (independente de verificado).
 */
async function existsById(id) {
  const [rows] = await pool.query(
    "SELECT id FROM colaboradores WHERE id = ?",
    [id]
  );
  return rows.length > 0;
}

/**
 * Incrementa o contador de visualizações.
 */
async function incrementViews(id) {
  await pool.query(
    "UPDATE colaboradores SET views_count = views_count + 1 WHERE id = ?",
    [id]
  );
}

/**
 * Incrementa o contador de cliques no WhatsApp.
 */
async function incrementWhatsapp(id) {
  await pool.query(
    "UPDATE colaboradores SET whatsapp_clicks = whatsapp_clicks + 1 WHERE id = ?",
    [id]
  );
}

// ---------------------------------------------------------------------------
// Trabalhe Conosco
// ---------------------------------------------------------------------------

/**
 * Insere um novo colaborador NÃO verificado (lead de interesse de prestador).
 * verificado = 0 garante que o registro não aparece nas listagens públicas
 * até aprovação manual pelo admin.
 */
async function createTrabalheConosco({ nome, cargo, whatsapp, descricao, especialidade_id }) {
  const [result] = await pool.query(
    `INSERT INTO colaboradores
       (nome, cargo, whatsapp, descricao, especialidade_id, verificado, created_at)
     VALUES (?, ?, ?, ?, ?, 0, NOW())`,
    [nome, cargo || null, whatsapp, descricao || null, especialidade_id || null]
  );
  return result.insertId;
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  buildWhereClause,  // exportado para testes unitários
  countServicos,
  findAllPaginated,
  findById,
  findImagesByIds,
  createSolicitacao,
  createAvaliacao,
  updateRating,
  findAvaliacoes,
  existsById,
  incrementViews,
  incrementWhatsapp,
  createTrabalheConosco,
};
