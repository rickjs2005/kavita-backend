// repositories/corretoraLeadsRepository.js
//
// Acesso à tabela corretora_leads. Todas as queries de leitura
// escopam por corretora_id para evitar vazamento entre corretoras.
"use strict";

const pool = require("../config/pool");

async function create({
  corretora_id,
  nome,
  telefone,
  telefone_normalizado,
  email,
  cidade,
  mensagem,
  objetivo,
  tipo_cafe,
  volume_range,
  canal_preferido,
  corrego_localidade,
  safra_tipo,
  possui_amostra,
  possui_laudo,
  bebida_percebida,
  preco_esperado_saca,
  urgencia,
  observacoes,
  consentimento_contato,
  source_ip,
  user_agent,
}) {
  const [result] = await pool.query(
    `INSERT INTO corretora_leads
       (corretora_id, nome, telefone, telefone_normalizado, email,
        cidade, mensagem, objetivo, tipo_cafe, volume_range,
        canal_preferido, corrego_localidade, safra_tipo,
        possui_amostra, possui_laudo, bebida_percebida,
        preco_esperado_saca, urgencia, observacoes,
        consentimento_contato,
        source_ip, user_agent)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      corretora_id,
      nome,
      telefone,
      telefone_normalizado ?? null,
      email ?? null,
      cidade ?? null,
      mensagem ?? null,
      objetivo ?? null,
      tipo_cafe ?? null,
      volume_range ?? null,
      canal_preferido ?? null,
      corrego_localidade ?? null,
      safra_tipo ?? null,
      possui_amostra ?? null,
      possui_laudo ?? null,
      bebida_percebida ?? null,
      preco_esperado_saca ?? null,
      urgencia ?? null,
      observacoes ?? null,
      consentimento_contato ? 1 : 0,
      source_ip ?? null,
      user_agent ?? null,
    ],
  );
  return result.insertId;
}

/**
 * Fase 2 dedupe — busca lead recente (janela de N horas) do mesmo
 * produtor (telefone_normalizado) na mesma corretora. Usado pelo
 * service antes de criar novo lead para evitar contato duplicado
 * quando o produtor re-submete em janela curta.
 *
 * Escopo por corretora_id intencional: o mesmo produtor pode (e deve)
 * aparecer em múltiplas corretoras — dedupe global bloquearia o
 * comportamento esperado do marketplace.
 */
async function findRecentByCorretoraAndPhone({
  corretora_id,
  telefone_normalizado,
  hours = 24,
}) {
  if (!telefone_normalizado) return null;
  const [[row]] = await pool.query(
    `SELECT id, created_at, status, first_response_at
       FROM corretora_leads
      WHERE corretora_id = ?
        AND telefone_normalizado = ?
        AND created_at >= DATE_SUB(NOW(), INTERVAL ? HOUR)
      ORDER BY created_at DESC
      LIMIT 1`,
    [corretora_id, telefone_normalizado, hours],
  );
  return row ?? null;
}

/**
 * Marca que o mesmo produtor tentou contato novamente — incrementa
 * contador e atualiza timestamp da última tentativa no lead existente.
 * Mantém o registro original do lead (nome/mensagem/etc) inalterado:
 * a corretora ainda está atendendo aquele contato; a nova tentativa
 * é sinal de que o produtor está preocupado/interessado.
 */
async function markRecontactAttempt(leadId) {
  const [result] = await pool.query(
    `UPDATE corretora_leads
        SET recontact_count = COALESCE(recontact_count, 0) + 1,
            last_recontact_at = NOW()
      WHERE id = ?`,
    [leadId],
  );
  return result.affectedRows;
}

async function findByIdForCorretora(id, corretoraId) {
  const [rows] = await pool.query(
    "SELECT * FROM corretora_leads WHERE id = ? AND corretora_id = ? LIMIT 1",
    [id, corretoraId]
  );
  return rows[0] ?? null;
}

/**
 * Conta leads anteriores do mesmo produtor (telefone_normalizado) na
 * MESMA corretora, excluindo o lead atual. Usado para banner de
 * dedupe no painel ("este produtor já te procurou N vezes").
 *
 * Escopo restrito a `corretora_id` intencionalmente: contagem entre
 * corretoras vazaria sinais privados de outras corretoras — mesmo
 * que só seja um número, viola a promessa de isolamento do tenant.
 */
async function countPreviousFromSameProducer({
  lead_id,
  corretora_id,
  telefone_normalizado,
}) {
  if (!telefone_normalizado) return 0;
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS total
     FROM corretora_leads
     WHERE corretora_id = ?
       AND telefone_normalizado = ?
       AND id <> ?`,
    [corretora_id, telefone_normalizado, lead_id],
  );
  return Number(rows[0]?.total || 0);
}

async function list({
  corretoraId,
  status,
  amostra_status,
  bebida_classificacao,
  page,
  limit,
}) {
  const where = ["corretora_id = ?"];
  const params = [corretoraId];

  if (status) {
    where.push("status = ?");
    params.push(status);
  }
  if (amostra_status) {
    where.push("amostra_status = ?");
    params.push(amostra_status);
  }
  if (bebida_classificacao) {
    where.push("bebida_classificacao = ?");
    params.push(bebida_classificacao);
  }

  const whereClause = where.join(" AND ");

  const [countRows] = await pool.query(
    `SELECT COUNT(*) AS total FROM corretora_leads WHERE ${whereClause}`,
    params
  );
  const total = Number(countRows[0]?.total || 0);

  const offset = (page - 1) * limit;
  // Subquery correlacionada para contar leads anteriores do mesmo
  // telefone_normalizado nesta mesma corretora (exclui o próprio
  // lead via l.id <> cl.id). Custo O(N) em rows da página — aceitável
  // para limit<=100 com o volume atual. Se o conjunto crescer, trocar
  // por CTE com window function ou índice composto dedicado.
  const [rows] = await pool.query(
    `SELECT cl.*,
            (
              SELECT COUNT(*)
              FROM corretora_leads l
              WHERE l.corretora_id = cl.corretora_id
                AND l.telefone_normalizado = cl.telefone_normalizado
                AND l.telefone_normalizado IS NOT NULL
                AND l.id <> cl.id
            ) AS previous_contacts_count
     FROM corretora_leads cl
     WHERE ${whereClause.replace(/corretora_id/g, "cl.corretora_id")}
     ORDER BY cl.created_at DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  return {
    items: rows.map((r) => ({
      ...r,
      previous_contacts_count: Number(r.previous_contacts_count ?? 0),
    })),
    total,
    page,
    limit,
  };
}

async function update(id, corretoraId, data) {
  const allowed = [
    "status",
    "nota_interna",
    "amostra_status",
    "bebida_classificacao",
    "pontuacao_sca",
    "preco_referencia_saca",
    // Classificação expandida
    "umidade_pct",
    "peneira",
    "catacao_defeitos",
    "aspecto_lote",
    "obs_sensoriais",
    "obs_comerciais",
    "mercado_indicado",
    "aptidao_oferta",
    "prioridade_comercial",
    "altitude_origem",
    "variedade_cultivar",
    // Fase 3 — proposta/compra + próxima ação
    "preco_proposto",
    "preco_fechado",
    "data_compra",
    "destino_venda",
    "next_action_text",
    "next_action_at",
  ];
  const sets = [];
  const values = [];

  for (const key of allowed) {
    if (data[key] !== undefined) {
      sets.push(`${key} = ?`);
      values.push(data[key]);
    }
  }

  if (sets.length === 0) return 0;

  values.push(id, corretoraId);
  const [result] = await pool.query(
    `UPDATE corretora_leads SET ${sets.join(", ")} WHERE id = ? AND corretora_id = ?`,
    values
  );
  return result.affectedRows;
}

/**
 * Marca o timestamp do primeiro response do lead + grava duração em
 * segundos. Usado para SLA tracking (Sprint 3). Só deve ser chamado
 * quando first_response_at ainda for NULL (guard no service).
 */
async function markFirstResponse(leadId, corretoraId, responseSeconds) {
  const [result] = await pool.query(
    `UPDATE corretora_leads
       SET first_response_at = NOW(),
           first_response_seconds = ?
     WHERE id = ? AND corretora_id = ? AND first_response_at IS NULL`,
    [responseSeconds, leadId, corretoraId],
  );
  return result.affectedRows;
}

/**
 * Lista TODOS os leads da corretora sem paginação — uso exclusivo
 * para export CSV. Limite superior hard de 10k para evitar
 * memory issue em casos extremos.
 */
async function listAllForExport(corretoraId, { status } = {}) {
  const where = ["corretora_id = ?"];
  const params = [corretoraId];
  if (status) {
    where.push("status = ?");
    params.push(status);
  }
  const [rows] = await pool.query(
    `SELECT *
     FROM corretora_leads
     WHERE ${where.join(" AND ")}
     ORDER BY created_at DESC
     LIMIT 10000`,
    params,
  );
  return rows;
}

/**
 * Sprint 7 — Busca lead por id sem filtro de corretora (uso público
 * pela rota de confirmação de lote vendido). Usado APENAS após
 * validação de token HMAC.
 */
async function findByIdRaw(id) {
  const [[row]] = await pool.query(
    "SELECT * FROM corretora_leads WHERE id = ? LIMIT 1",
    [id],
  );
  return row ?? null;
}

/**
 * Broadcast de "lote vendido": marca lote_disponivel = 0 em TODOS os
 * leads ativos com mesmo telefone_normalizado. Retorna lista das
 * corretoras afetadas para criar notificações.
 */
async function broadcastLoteVendido(telefoneNormalizado) {
  if (!telefoneNormalizado) return [];

  // 1. Identifica leads alvos antes do update (precisa de corretora_id
  //    pra notificar).
  const [targets] = await pool.query(
    `SELECT id, corretora_id, nome, cidade
     FROM corretora_leads
     WHERE telefone_normalizado = ? AND lote_disponivel = 1`,
    [telefoneNormalizado],
  );

  if (targets.length === 0) return [];

  // 2. Marca todos.
  await pool.query(
    `UPDATE corretora_leads
       SET lote_disponivel = 0
     WHERE telefone_normalizado = ? AND lote_disponivel = 1`,
    [telefoneNormalizado],
  );

  return targets;
}

/**
 * Sprint 7 — Top córregos com mais leads na janela. Usado pelo
 * widget admin "Mapa de córregos ativos".
 */
async function getTopCorregos({ daysBack = 7, limit = 5 } = {}) {
  const [rows] = await pool.query(
    `SELECT
       corrego_localidade AS corrego,
       COUNT(*) AS total,
       SUM(CASE WHEN volume_range IN ('200_500', '500_mais') THEN 1 ELSE 0 END) AS alta_prioridade,
       COUNT(DISTINCT corretora_id) AS corretoras_atingidas,
       MAX(created_at) AS ultimo_lead
     FROM corretora_leads
     WHERE corrego_localidade IS NOT NULL
       AND corrego_localidade != ''
       AND created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
     GROUP BY corrego_localidade
     ORDER BY total DESC, alta_prioridade DESC
     LIMIT ?`,
    [daysBack, limit],
  );

  return rows.map((r) => ({
    corrego: r.corrego,
    total: Number(r.total),
    alta_prioridade: Number(r.alta_prioridade),
    corretoras_atingidas: Number(r.corretoras_atingidas),
    ultimo_lead: r.ultimo_lead,
  }));
}

/**
 * Fase 4 — próximas ações vencidas. Lista leads com next_action_at
 * no passado, ainda relevantes (status != closed/lost). Ordena pelas
 * mais antigas primeiro. Limite para não inundar o dashboard.
 */
async function listOverdueNextActions({ corretoraId, limit = 10 }) {
  const [rows] = await pool.query(
    `SELECT id, nome, cidade, corrego_localidade, status,
            next_action_text, next_action_at
       FROM corretora_leads
      WHERE corretora_id = ?
        AND next_action_at IS NOT NULL
        AND next_action_at < NOW()
        AND status NOT IN ('closed', 'lost')
      ORDER BY next_action_at ASC
      LIMIT ?`,
    [corretoraId, Number(limit)],
  );
  return rows;
}

/**
 * Fase 4 — leads parados. status='new' + criado há mais que
 * `hoursThreshold` horas + sem first_response_at. São os leads que
 * estão esfriando sem ninguém tocar. Ordena pelos mais velhos.
 */
async function listStaleNewLeads({
  corretoraId,
  hoursThreshold = 48,
  limit = 10,
}) {
  const [rows] = await pool.query(
    `SELECT id, nome, cidade, corrego_localidade, telefone,
            volume_range, tipo_cafe, urgencia,
            created_at, recontact_count
       FROM corretora_leads
      WHERE corretora_id = ?
        AND status = 'new'
        AND first_response_at IS NULL
        AND created_at < DATE_SUB(NOW(), INTERVAL ? HOUR)
      ORDER BY created_at ASC
      LIMIT ?`,
    [corretoraId, Number(hoursThreshold), Number(limit)],
  );
  return rows;
}

/**
 * Fase 4 — valor do pipeline e compras do mês. Duas agregações:
 *   - Em negociação: leads com preco_proposto != null e status ativo
 *   - Fechadas no mês: leads com preco_fechado != null e
 *     data_compra no mês corrente
 *
 * Retorna contagens e somas simples. Cálculo de "sacas negociadas"
 * usa o range médio do volume_range (heurística — não temos o
 * número exato de sacas; é aproximação editorial).
 */
async function getPipelineValue(corretoraId) {
  const [[negotiating]] = await pool.query(
    `SELECT COUNT(*) AS total,
            SUM(preco_proposto) AS soma_propostos
       FROM corretora_leads
      WHERE corretora_id = ?
        AND preco_proposto IS NOT NULL
        AND status NOT IN ('closed', 'lost')`,
    [corretoraId],
  );
  const [[closedMonth]] = await pool.query(
    `SELECT COUNT(*) AS total,
            SUM(preco_fechado) AS soma_fechados
       FROM corretora_leads
      WHERE corretora_id = ?
        AND preco_fechado IS NOT NULL
        AND data_compra IS NOT NULL
        AND YEAR(data_compra) = YEAR(CURDATE())
        AND MONTH(data_compra) = MONTH(CURDATE())`,
    [corretoraId],
  );
  return {
    negotiating: {
      total: Number(negotiating?.total || 0),
      soma_propostos: negotiating?.soma_propostos
        ? Number(negotiating.soma_propostos)
        : 0,
    },
    closed_month: {
      total: Number(closedMonth?.total || 0),
      soma_fechados: closedMonth?.soma_fechados
        ? Number(closedMonth.soma_fechados)
        : 0,
    },
  };
}

async function summary(corretoraId) {
  const [rows] = await pool.query(
    `SELECT status, COUNT(*) AS total
     FROM corretora_leads
     WHERE corretora_id = ?
     GROUP BY status`,
    [corretoraId]
  );

  const result = { total: 0, new: 0, contacted: 0, closed: 0, lost: 0 };
  for (const row of rows) {
    const count = Number(row.total || 0);
    result[row.status] = count;
    result.total += count;
  }
  return result;
}

module.exports = {
  create,
  findByIdForCorretora,
  countPreviousFromSameProducer,
  findByIdRaw,
  findRecentByCorretoraAndPhone,
  markRecontactAttempt,
  list,
  listAllForExport,
  update,
  markFirstResponse,
  broadcastLoteVendido,
  getTopCorregos,
  listOverdueNextActions,
  listStaleNewLeads,
  getPipelineValue,
  summary,
};
