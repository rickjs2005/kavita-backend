"use strict";
// services/motoristaService.js
//
// Acoes operacionais do motorista (logado via verifyMotorista):
//   - getRotaHoje
//   - obterRotaCompleta
//   - iniciarRota / finalizarRota
//   - abrirParada (em_andamento)
//   - marcarEntregue
//   - reportarProblema (transacional: cria pedido_ocorrencia + atualiza parada)
//   - fixarPosicao (insere historico GPS + popula pedidos.lat/lng se NULL)
//
// Idempotencia: helper withIdempotency() grava a chave + status na tabela
// motorista_idempotency_keys. Replay com mesmo key retorna 200 sem efeito.
//
// Toda operacao filtra "minha parada" via JOIN com motorista_id da rota.
// Motorista A nao consegue tocar parada de motorista B.

const AppError = require("../errors/AppError");
const ERROR_CODES = require("../constants/ErrorCodes");
const logger = require("../lib/logger");
const { withTransaction } = require("../lib/withTransaction");
const pool = require("../config/pool");

const rotasRepo = require("../repositories/rotasRepository");
const paradasRepo = require("../repositories/rotaParadasRepository");
const posicoesRepo = require("../repositories/pedidoPosicoesRepository");
const rotasService = require("./rotasService");
const mediaService = require("./mediaService");

const PROBLEMA_TIPOS = new Set([
  "endereco_incorreto",
  "cliente_ausente",
  "estrada_intransitavel",
  "pagamento_pendente_na_entrega",
  "produto_avariado",
  "outro_motivo",
]);

// Data "hoje" em horario de Brasilia (BRT/BRST). NAO usar CURDATE() do
// MySQL — pool em prod pode estar em UTC, e CURDATE em UTC vira o dia
// seguinte das 21:00 as 23:59 BRT, fazendo o motorista perder rota a
// noite. Sao_Paulo cobre todo Brasil exceto Acre/parte do AM (ambos
// fora da area atendida pelo Kavita hoje).
function _todayBR() {
  // Intl com en-CA garante formato YYYY-MM-DD canonico.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

// ----------------------------------------------------------------------------
// Idempotencia
// ----------------------------------------------------------------------------

/**
 * Verifica/registra idempotency_key. Se ja' processada, retorna o status
 * salvo. Se ainda nao, executa fn() e grava o status. Em caso de erro,
 * NAO persiste o key (proxima tentativa repete).
 *
 * @param {{ motoristaId: number, idempotencyKey: string|null|undefined,
 *           endpoint: string }} ctx
 * @param {() => Promise<any>} fn
 */
async function withIdempotency(ctx, fn) {
  const { motoristaId, idempotencyKey, endpoint } = ctx;
  if (!idempotencyKey) {
    // Nao obrigatorio: se cliente nao mandou, executa direto
    return fn();
  }
  // Verifica se ja' foi processada
  const [[existing]] = await pool.query(
    `SELECT id, response_status FROM motorista_idempotency_keys
      WHERE idempotency_key = ? LIMIT 1`,
    [idempotencyKey],
  );
  if (existing) {
    // Replay: retorna marker indicando que foi noop. Caller decide o body.
    return { __replayed: true, status: existing.response_status };
  }
  const result = await fn();
  // Grava o key APOS sucesso
  try {
    await pool.query(
      `INSERT INTO motorista_idempotency_keys
         (idempotency_key, motorista_id, endpoint, response_status)
       VALUES (?, ?, ?, ?)`,
      [idempotencyKey, motoristaId, endpoint, 200],
    );
  } catch (err) {
    // Race: outra request gravou primeiro. OK — efeito ja' aconteceu.
    if (err?.code !== "ER_DUP_ENTRY") {
      logger.warn(
        { err: err?.message, idempotencyKey },
        "motorista.idempotency.persist_failed",
      );
    }
  }
  return result;
}

// ----------------------------------------------------------------------------
// Helpers de autorizacao por motorista
// ----------------------------------------------------------------------------

async function _findRotaDoMotorista(rotaId, motoristaId) {
  const rota = await rotasRepo.findById(rotaId);
  if (!rota) {
    throw new AppError("Rota nao encontrada.", ERROR_CODES.NOT_FOUND, 404);
  }
  if (rota.motorista_id !== motoristaId) {
    throw new AppError(
      "Esta rota nao esta atribuida a voce.",
      ERROR_CODES.FORBIDDEN,
      403,
    );
  }
  return rota;
}

async function _findParadaDoMotorista(paradaId, motoristaId) {
  const parada = await paradasRepo.findById(paradaId);
  if (!parada) {
    throw new AppError("Parada nao encontrada.", ERROR_CODES.NOT_FOUND, 404);
  }
  if (parada.rota_motorista_id !== motoristaId) {
    throw new AppError(
      "Esta parada nao esta atribuida a voce.",
      ERROR_CODES.FORBIDDEN,
      403,
    );
  }
  return parada;
}

// ----------------------------------------------------------------------------
// Leitura
// ----------------------------------------------------------------------------

async function getRotaHoje(motoristaId) {
  const today = _todayBR();
  const rota = await rotasRepo.findActiveTodayForMotorista(motoristaId, { today });
  if (!rota) return null;
  return rotasService.obterRotaCompleta(rota.id);
}

async function getRotaDetalhe(rotaId, motoristaId) {
  await _findRotaDoMotorista(rotaId, motoristaId);
  return rotasService.obterRotaCompleta(rotaId);
}

// ----------------------------------------------------------------------------
// Transicoes da rota inteira
// ----------------------------------------------------------------------------

async function iniciarRota(rotaId, motoristaId) {
  const rota = await _findRotaDoMotorista(rotaId, motoristaId);
  if (rota.status === "em_rota") {
    return rotasService.obterRotaCompleta(rotaId); // idempotente
  }
  return rotasService.alterarStatus(rotaId, "em_rota");
}

async function finalizarRota(rotaId, motoristaId, { km_real } = {}) {
  const rota = await _findRotaDoMotorista(rotaId, motoristaId);
  if (rota.status === "finalizada") {
    return rotasService.obterRotaCompleta(rotaId); // idempotente
  }
  if (rota.status !== "em_rota") {
    throw new AppError(
      `Nao e' possivel finalizar rota em status ${rota.status}.`,
      ERROR_CODES.CONFLICT,
      409,
    );
  }
  return rotasService.alterarStatus(rotaId, "finalizada", { km_real });
}

// ----------------------------------------------------------------------------
// Acoes em parada
// ----------------------------------------------------------------------------

async function abrirParada(paradaId, motoristaId, ctx = {}) {
  const result = await withIdempotency(
    {
      motoristaId,
      idempotencyKey: ctx.idempotencyKey,
      endpoint: `POST /api/motorista/paradas/${paradaId}/abrir`,
    },
    async () => {
      const parada = await _findParadaDoMotorista(paradaId, motoristaId);
      // So' faz sentido em rota em_rota
      if (parada.rota_status !== "em_rota") {
        throw new AppError(
          "Inicie a rota antes de abrir paradas.",
          ERROR_CODES.CONFLICT,
          409,
        );
      }
      // Idempotente: se ja' nao esta pendente, nao mexe
      if (parada.status === "pendente") {
        await paradasRepo.updateStatus(paradaId, { status: "em_andamento" });
      }
      return paradasRepo.findById(paradaId);
    },
  );
  if (result && result.__replayed) {
    return paradasRepo.findById(paradaId);
  }
  return result;
}

async function marcarEntregue(paradaId, motoristaId, { observacao } = {}, ctx = {}) {
  const result = await withIdempotency(
    {
      motoristaId,
      idempotencyKey: ctx.idempotencyKey,
      endpoint: `POST /api/motorista/paradas/${paradaId}/entregue`,
    },
    async () => {
      return withTransaction(async (conn) => {
        const parada = await _findParadaDoMotorista(paradaId, motoristaId);
        if (parada.rota_status !== "em_rota") {
          throw new AppError(
            "Inicie a rota antes de marcar entregas.",
            ERROR_CODES.CONFLICT,
            409,
          );
        }
        // Idempotente: ja' entregue -> retorna a parada sem mexer
        if (parada.status === "entregue") {
          return paradasRepo.findById(paradaId, conn);
        }

        // Opt-in: exigir comprovante salvo antes de aceitar a entrega.
        // Endereca o caso onde POST /comprovante falha 500 e o frontend
        // chama POST /entregue mesmo assim — sem este guard, parada vira
        // 'entregue' sem nenhuma evidencia salva no banco.
        // Default OFF (preserva regra de produto da Fase 5: comprovante
        // opcional). Operacao liga em prod com 1 env var.
        if (
          String(process.env.MOTORISTA_REQUIRE_COMPROVANTE || "false")
            .toLowerCase() === "true"
        ) {
          const temFoto = !!parada.comprovante_foto_url;
          const temAssinatura = !!parada.assinatura_url;
          if (!temFoto && !temAssinatura) {
            throw new AppError(
              "Envie a foto ou assinatura do comprovante antes de marcar como entregue.",
              ERROR_CODES.CONFLICT,
              409,
              { motivo: "comprovante_ausente" },
            );
          }
        }
        await paradasRepo.updateStatus(
          paradaId,
          {
            status: "entregue",
            entregue_em: new Date(),
            observacao_motorista: observacao || null,
          },
          conn,
        );
        // Bug 1 fix — sincroniza pedidos.status_entrega na MESMA tx.
        // Sem isso, /admin/pedidos e /pedidos do cliente continuam mostrando
        // "enviado"/"em_separacao" mesmo apos motorista marcar entregue.
        // Tambem evita que o pedido volte ao pool de disponiveis (Bug 2).
        await conn.query(
          "UPDATE pedidos SET status_entrega = 'entregue' WHERE id = ?",
          [parada.pedido_id],
        );
        await rotasRepo.recalcTotals(parada.rota_id, conn);
        logger.info(
          {
            paradaId,
            motoristaId,
            rotaId: parada.rota_id,
            pedidoId: parada.pedido_id,
          },
          "motorista.parada.entregue",
        );
        return paradasRepo.findById(paradaId, conn);
      });
    },
  );
  if (result && result.__replayed) {
    return paradasRepo.findById(paradaId);
  }
  return result;
}

async function reportarProblema(
  paradaId,
  motoristaId,
  { tipo, observacao } = {},
  ctx = {},
) {
  if (!PROBLEMA_TIPOS.has(tipo)) {
    throw new AppError(
      `Tipo de problema invalido: ${tipo}.`,
      ERROR_CODES.VALIDATION_ERROR,
      400,
      { aceitos: Array.from(PROBLEMA_TIPOS) },
    );
  }
  const result = await withIdempotency(
    {
      motoristaId,
      idempotencyKey: ctx.idempotencyKey,
      endpoint: `POST /api/motorista/paradas/${paradaId}/problema`,
    },
    async () => {
      return withTransaction(async (conn) => {
        const parada = await _findParadaDoMotorista(paradaId, motoristaId);
        if (parada.rota_status !== "em_rota") {
          throw new AppError(
            "Inicie a rota antes de reportar problemas.",
            ERROR_CODES.CONFLICT,
            409,
          );
        }
        if (parada.status === "problema" && parada.ocorrencia_id) {
          // Idempotente: ja' foi reportado, devolve a parada
          return paradasRepo.findById(paradaId, conn);
        }

        // Busca usuario_id do pedido (necessario pra ocorrencia)
        const [[ped]] = await conn.query(
          "SELECT usuario_id FROM pedidos WHERE id = ? LIMIT 1",
          [parada.pedido_id],
        );
        if (!ped) {
          throw new AppError(
            "Pedido da parada nao encontrado.",
            ERROR_CODES.SERVER_ERROR,
            500,
          );
        }

        // Cria ocorrencia diretamente via SQL (repo legacy nao aceita conn)
        const [ocResult] = await conn.query(
          `INSERT INTO pedido_ocorrencias
             (pedido_id, usuario_id, tipo, motivo, observacao)
           VALUES (?, ?, ?, ?, ?)`,
          [
            parada.pedido_id,
            ped.usuario_id,
            tipo,
            observacao || `Reportado pelo motorista #${motoristaId} na entrega.`,
            observacao || null,
          ],
        );
        const ocorrenciaId = ocResult.insertId;

        await paradasRepo.updateStatus(
          paradaId,
          {
            status: "problema",
            ocorrencia_id: ocorrenciaId,
            observacao_motorista: observacao || null,
          },
          conn,
        );
        await rotasRepo.recalcTotals(parada.rota_id, conn);

        logger.info(
          { paradaId, motoristaId, ocorrenciaId, tipo },
          "motorista.parada.problema",
        );
        return paradasRepo.findById(paradaId, conn);
      });
    },
  );
  if (result && result.__replayed) {
    return paradasRepo.findById(paradaId);
  }
  return result;
}

async function fixarPosicao(
  paradaId,
  motoristaId,
  { latitude, longitude } = {},
  ctx = {},
) {
  if (
    typeof latitude !== "number" ||
    typeof longitude !== "number" ||
    Number.isNaN(latitude) ||
    Number.isNaN(longitude) ||
    Math.abs(latitude) > 90 ||
    Math.abs(longitude) > 180
  ) {
    throw new AppError(
      "Latitude/longitude invalidas.",
      ERROR_CODES.VALIDATION_ERROR,
      400,
    );
  }
  const result = await withIdempotency(
    {
      motoristaId,
      idempotencyKey: ctx.idempotencyKey,
      endpoint: `POST /api/motorista/paradas/${paradaId}/posicao`,
    },
    async () => {
      const parada = await _findParadaDoMotorista(paradaId, motoristaId);
      const id = await posicoesRepo.create({
        pedido_id: parada.pedido_id,
        parada_id: parada.id,
        motorista_id: motoristaId,
        latitude,
        longitude,
        origem: "fixacao_motorista",
      });
      const promovido = await posicoesRepo.setPedidoLatLngIfEmpty(
        parada.pedido_id,
        latitude,
        longitude,
      );
      logger.info(
        {
          paradaId,
          motoristaId,
          posicaoId: id,
          promovido_para_pedido: promovido,
        },
        "motorista.parada.posicao",
      );
      return { posicao_id: id, promovido_para_pedido: promovido };
    },
  );
  if (result && result.__replayed) {
    return { replayed: true };
  }
  return result;
}

/**
 * Fase 5 — salva foto de comprovante e/ou assinatura na parada.
 *
 * Aceita ambos opcionais (compat Fase 5: motorista pode pular).
 * O 400 explicito quando ambos vazios e' opt-in via env
 * MOTORISTA_REQUIRE_COMPROVANTE_PAYLOAD=true.
 *
 * Atomicidade: se persistMedia OU updateComprovante falhar, removemos
 * do disco quaisquer arquivos ja' gravados (best-effort via remove queue),
 * pra nao deixar lixo / mostrar comprovante orfao no admin.
 *
 * @param {{
 *   foto?: Express.Multer.File,
 *   assinaturaPng?: { buffer: Buffer, mimetype: string }
 * }} payload
 * @param {{ idempotencyKey?: string }} [ctx]
 */
async function salvarComprovante(paradaId, motoristaId, payload = {}, ctx = {}) {
  const result = await withIdempotency(
    {
      motoristaId,
      idempotencyKey: ctx.idempotencyKey,
      endpoint: `POST /api/motorista/paradas/${paradaId}/comprovante`,
    },
    async () => {
      const parada = await _findParadaDoMotorista(paradaId, motoristaId);
      if (parada.rota_status !== "em_rota") {
        throw new AppError(
          "Inicie a rota antes de enviar comprovante.",
          ERROR_CODES.CONFLICT,
          409,
        );
      }

      const hasFoto = !!payload.foto;
      const hasAssinatura = !!(
        payload.assinaturaPng?.buffer && payload.assinaturaPng.buffer.length > 0
      );

      // Opt-in: bloquear payload vazio com 400 amigavel.
      if (!hasFoto && !hasAssinatura) {
        if (
          String(process.env.MOTORISTA_REQUIRE_COMPROVANTE_PAYLOAD || "false")
            .toLowerCase() === "true"
        ) {
          throw new AppError(
            "Envie ao menos uma foto OU assinatura como comprovante.",
            ERROR_CODES.VALIDATION_ERROR,
            400,
          );
        }
        // Fase 5 default: no-op silencioso (preserva comportamento atual).
        return paradasRepo.findById(paradaId);
      }

      const updates = {};
      const persistedTargets = []; // pra rollback se DB falhar

      try {
        if (hasFoto) {
          const [uploaded] = await mediaService.persistMedia([payload.foto], {
            folder: "entregas",
          });
          if (!uploaded?.path) {
            throw new AppError(
              "Falha ao salvar a foto do comprovante.",
              ERROR_CODES.SERVER_ERROR,
              500,
            );
          }
          updates.comprovante_foto_url = uploaded.path;
          persistedTargets.push(uploaded);
        }

        if (hasAssinatura) {
          // Reusa o mesmo storage adapter via persistMedia. Constroi um
          // file-like sintetico — diskAdapter aceita buffer (in-memory).
          const fakeFile = {
            buffer: payload.assinaturaPng.buffer,
            mimetype: payload.assinaturaPng.mimetype || "image/png",
            originalname: `assinatura-parada-${paradaId}.png`,
            size: payload.assinaturaPng.buffer.length,
          };
          const [uploaded] = await mediaService.persistMedia([fakeFile], {
            folder: "entregas",
          });
          if (!uploaded?.path) {
            throw new AppError(
              "Falha ao salvar a assinatura do comprovante.",
              ERROR_CODES.SERVER_ERROR,
              500,
            );
          }
          updates.assinatura_url = uploaded.path;
          persistedTargets.push(uploaded);
        }

        await paradasRepo.updateComprovante(paradaId, updates);
        logger.info(
          {
            paradaId,
            motoristaId,
            temFoto: !!updates.comprovante_foto_url,
            temAssinatura: !!updates.assinatura_url,
          },
          "motorista.parada.comprovante",
        );
        return paradasRepo.findById(paradaId);
      } catch (err) {
        // Rollback de midia: o que ja' foi gravado em disco vira orfao
        // se o UPDATE falhar (ou se a 2a midia falhar e a 1a ja' gravou).
        // enqueueOrphanCleanup e' fire-and-forget seguro.
        if (persistedTargets.length > 0) {
          mediaService
            .enqueueOrphanCleanup(persistedTargets)
            .catch((cleanErr) =>
              logger.warn(
                { err: cleanErr?.message, paradaId, motoristaId },
                "motorista.parada.comprovante.cleanup_failed",
              ),
            );
        }
        // Re-classifica TypeError cru (defesa-em-profundidade caso outro
        // adapter envie undefined em algum path) como erro 500 controlado.
        if (
          err &&
          err.name === "TypeError" &&
          /must be of type string/i.test(err.message || "")
        ) {
          logger.error(
            { err: err.message, paradaId, motoristaId },
            "motorista.parada.comprovante.path_undefined",
          );
          throw new AppError(
            "Configuracao de upload de midia invalida. Contate o suporte.",
            ERROR_CODES.SERVER_ERROR,
            500,
          );
        }
        throw err;
      }
    },
  );
  if (result && result.__replayed) {
    return paradasRepo.findById(paradaId);
  }
  return result;
}

module.exports = {
  // leitura
  getRotaHoje,
  getRotaDetalhe,
  // rota
  iniciarRota,
  finalizarRota,
  // parada
  abrirParada,
  marcarEntregue,
  reportarProblema,
  fixarPosicao,
  salvarComprovante,
  // export
  PROBLEMA_TIPOS: Array.from(PROBLEMA_TIPOS),
  withIdempotency,
};
