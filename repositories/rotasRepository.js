"use strict";
// repositories/rotasRepository.js
//
// Persistencia de rotas de entrega. Servidor de regras (anti-dup, FSM)
// fica em services/rotasService.js. Aqui so' SQL.

const pool = require("../config/pool");

async function findById(id, conn = pool) {
  const [rows] = await conn.query(
    `SELECT r.*,
            m.nome     AS motorista_nome,
            m.telefone AS motorista_telefone
       FROM rotas r
       LEFT JOIN motoristas m ON m.id = r.motorista_id
      WHERE r.id = ?
      LIMIT 1`,
    [id],
  );
  return rows[0] || null;
}

async function list({ data, status, motoristaId } = {}, conn = pool) {
  const where = ["1=1"];
  const params = [];
  if (data) {
    where.push("r.data_programada = ?");
    params.push(data);
  }
  if (status) {
    where.push("r.status = ?");
    params.push(status);
  }
  if (motoristaId) {
    where.push("r.motorista_id = ?");
    params.push(motoristaId);
  }
  const [rows] = await conn.query(
    `SELECT r.id, r.data_programada, r.motorista_id, r.veiculo,
            r.regiao_label, r.status, r.total_paradas, r.total_entregues,
            r.iniciada_em, r.finalizada_em, r.tempo_total_minutos,
            r.km_estimado, r.km_real, r.created_at,
            m.nome AS motorista_nome
       FROM rotas r
       LEFT JOIN motoristas m ON m.id = r.motorista_id
      WHERE ${where.join(" AND ")}
      ORDER BY r.data_programada DESC, r.id DESC`,
    params,
  );
  return rows;
}

async function create(
  {
    data_programada,
    motorista_id,
    veiculo,
    regiao_label,
    observacoes,
    km_estimado,
    created_by_admin_id,
  },
  conn = pool,
) {
  const [r] = await conn.query(
    `INSERT INTO rotas
       (data_programada, motorista_id, veiculo, regiao_label, observacoes,
        km_estimado, created_by_admin_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      data_programada,
      motorista_id ?? null,
      veiculo ?? null,
      regiao_label ?? null,
      observacoes ?? null,
      km_estimado ?? null,
      created_by_admin_id ?? null,
    ],
  );
  return r.insertId;
}

async function update(id, patch, conn = pool) {
  const allowed = [
    "motorista_id",
    "veiculo",
    "regiao_label",
    "observacoes",
    "km_estimado",
  ];
  const sets = [];
  const params = [];
  for (const k of allowed) {
    if (Object.prototype.hasOwnProperty.call(patch, k)) {
      sets.push(`${k} = ?`);
      params.push(patch[k]);
    }
  }
  if (sets.length === 0) return 0;
  params.push(id);
  const [r] = await conn.query(
    `UPDATE rotas SET ${sets.join(", ")} WHERE id = ?`,
    params,
  );
  return r.affectedRows;
}

async function updateStatus(id, status, extras = {}, conn = pool) {
  const sets = ["status = ?"];
  const params = [status];
  if (extras.iniciada_em !== undefined) {
    sets.push("iniciada_em = ?");
    params.push(extras.iniciada_em);
  }
  if (extras.finalizada_em !== undefined) {
    sets.push("finalizada_em = ?");
    params.push(extras.finalizada_em);
  }
  if (extras.tempo_total_minutos !== undefined) {
    sets.push("tempo_total_minutos = ?");
    params.push(extras.tempo_total_minutos);
  }
  if (extras.km_real !== undefined) {
    sets.push("km_real = ?");
    params.push(extras.km_real);
  }
  params.push(id);
  const [r] = await conn.query(
    `UPDATE rotas SET ${sets.join(", ")} WHERE id = ?`,
    params,
  );
  return r.affectedRows;
}

async function deleteById(id, conn = pool) {
  const [r] = await conn.query(`DELETE FROM rotas WHERE id = ?`, [id]);
  return r.affectedRows;
}

async function recalcTotals(rotaId, conn = pool) {
  // Recalcula total_paradas e total_entregues a partir de rota_paradas.
  await conn.query(
    `UPDATE rotas r
        SET total_paradas = (
              SELECT COUNT(*) FROM rota_paradas WHERE rota_id = r.id
            ),
            total_entregues = (
              SELECT COUNT(*) FROM rota_paradas
               WHERE rota_id = r.id AND status = 'entregue'
            )
      WHERE r.id = ?`,
    [rotaId],
  );
}

/**
 * Lista a rota "ativa" do motorista pra exibir em /motorista/rota-hoje.
 *
 * Regra:
 *   - rota PRONTA so' aparece no dia exato (evita motorista pegar
 *     uma rota futura sem querer)
 *   - rota EM_ROTA aparece mesmo se data_programada < hoje — caso
 *     classico do motorista que iniciou ontem e nao finalizou; sem
 *     isso, ao virar meia-noite a rota some do app e o motorista ve
 *     "nao tem entrega" enquanto ainda tem paradas pendentes
 *
 * Ordenacao: em_rota primeiro (status DESC = 'em_rota' > 'pronta'
 * em ordem alfabetica reversa), depois id DESC pra desempate.
 *
 * `today` (YYYY-MM-DD) e' obrigatorio e computado em BRT lado servico —
 * NAO usar CURDATE() do MySQL, porque o pool em prod pode estar em UTC
 * e isso faria o motorista perder a rota entre 21:00–23:59 BRT (CURDATE
 * em UTC ja' retorna o dia seguinte). Ver motoristaService.getRotaHoje.
 */
async function findActiveTodayForMotorista(motoristaId, opts = {}) {
  const { today, conn = pool } = opts;
  if (!today || typeof today !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(today)) {
    throw new Error(
      "findActiveTodayForMotorista: opts.today (YYYY-MM-DD) e' obrigatorio.",
    );
  }
  const [rows] = await conn.query(
    `SELECT * FROM rotas
      WHERE motorista_id = ?
        AND (
              (status = 'pronta'  AND data_programada = ?)
           OR (status = 'em_rota' AND data_programada <= ?)
            )
      ORDER BY status DESC, id DESC
      LIMIT 1`,
    [motoristaId, today, today],
  );
  return rows[0] || null;
}

module.exports = {
  findById,
  list,
  create,
  update,
  updateStatus,
  deleteById,
  recalcTotals,
  findActiveTodayForMotorista,
};
