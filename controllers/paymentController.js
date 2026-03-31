"use strict";
// controllers/paymentController.js
//
// Handlers de pagamento: Mercado Pago + CRUD de métodos de pagamento.
//
// Nota arquitetural — pool.getConnection() nos handlers startPayment e handleWebhook:
//   paymentService.startPayment(conn, ...) e handleWebhookEvent({conn, ...}) foram
//   projetados para receber uma conexão já aberta (permite transação compartilhada).
//   Enquanto essa assinatura não mudar no service, o controller precisa orquestrar
//   o ciclo de vida da conexão. Isso é uma dívida técnica conhecida do paymentService,
//   não do controller.

const pool = require("../config/pool");
const AppError = require("../errors/AppError");
const ERROR_CODES = require("../constants/ErrorCodes");
const paymentService = require("../services/paymentService");
const { handleWebhookEvent } = require("../services/paymentWebhookService");

// ---------------------------------------------------------------------------
// PUBLIC
// ---------------------------------------------------------------------------

exports.listMethods = async (_req, res, next) => {
  try {
    const methods = await paymentService.listActiveMethods();
    return res.json({ methods });
  } catch (err) {
    return next(
      err instanceof AppError
        ? err
        : new AppError("Erro ao listar métodos de pagamento.", ERROR_CODES.SERVER_ERROR, 500)
    );
  }
};

// ---------------------------------------------------------------------------
// ADMIN — CRUD de métodos de pagamento
// ---------------------------------------------------------------------------

exports.adminListMethods = async (_req, res, next) => {
  try {
    const methods = await paymentService.listAllMethods();
    return res.json({ methods });
  } catch (err) {
    return next(
      err instanceof AppError
        ? err
        : new AppError(
            "Erro ao listar métodos de pagamento (admin).",
            ERROR_CODES.SERVER_ERROR,
            500
          )
    );
  }
};

exports.adminCreateMethod = async (req, res, next) => {
  try {
    const created = await paymentService.addMethod(req.body || {});
    return res.status(201).json({ method: created });
  } catch (err) {
    return next(
      err instanceof AppError
        ? err
        : new AppError("Erro ao criar método de pagamento.", ERROR_CODES.SERVER_ERROR, 500)
    );
  }
};

exports.adminUpdateMethod = async (req, res, next) => {
  const id = Number(req.params.id);
  try {
    const updated = await paymentService.editMethod(id, req.body || {});
    return res.json({ method: updated });
  } catch (err) {
    return next(
      err instanceof AppError
        ? err
        : new AppError("Erro ao atualizar método de pagamento.", ERROR_CODES.SERVER_ERROR, 500)
    );
  }
};

exports.adminDeleteMethod = async (req, res, next) => {
  const id = Number(req.params.id);
  try {
    await paymentService.disableMethod(id);
    return res.json({ ok: true });
  } catch (err) {
    return next(
      err instanceof AppError
        ? err
        : new AppError(
            "Erro ao desativar método de pagamento.",
            ERROR_CODES.SERVER_ERROR,
            500
          )
    );
  }
};

// ---------------------------------------------------------------------------
// MERCADO PAGO — start payment
// ---------------------------------------------------------------------------

exports.startPayment = async (req, res, next) => {
  const { pedidoId } = req.body || {};
  const pedidoIdNum = Number(pedidoId);

  if (!Number.isFinite(pedidoIdNum) || pedidoIdNum <= 0) {
    return next(new AppError("pedidoId é obrigatório.", ERROR_CODES.VALIDATION_ERROR, 400));
  }

  // pool.getConnection() aqui porque paymentService.startPayment(conn, ...) requer
  // uma conexão já aberta. Ver nota arquitetural no topo do arquivo.
  const conn = await pool.getConnection();
  try {
    const result = await paymentService.startPayment(conn, pedidoIdNum, req.user.id);
    return res.json(result);
  } catch (err) {
    if (!(err instanceof AppError)) {
      console.error("[payment/start] erro bruto:", err);
      if (err?.message || err?.status || err?.error) {
        console.error("[payment/start] detalhes:", {
          message: err.message,
          error: err.error,
          status: err.status,
          cause: err.cause ?? null,
        });
      }
    }
    return next(
      err instanceof AppError
        ? err
        : new AppError(
            "Erro ao iniciar pagamento com o Mercado Pago.",
            ERROR_CODES.SERVER_ERROR,
            500
          )
    );
  } finally {
    conn.release();
  }
};

// ---------------------------------------------------------------------------
// MERCADO PAGO — webhook
// ---------------------------------------------------------------------------

exports.handleWebhook = async (req, res) => {
  const signatureHeader = req.get("x-signature");

  try {
    const { type, data } = req.body || {};
    const payload = JSON.stringify(req.body || {});
    const eventId = String(req.body?.id ?? "");

    if (!eventId) {
      console.warn("[payment/webhook] payload sem id de notificação");
      return res.status(200).json({ ok: true });
    }

    // pool.getConnection() aqui porque handleWebhookEvent({conn, ...}) precisa de
    // transação explícita para garantir idempotência. Ver nota arquitetural no topo.
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const outcome = await handleWebhookEvent({
        conn,
        eventId,
        type,
        dataId: data?.id,
        payload,
        signatureHeader,
      });

      await conn.commit();
      return res
        .status(200)
        .json({ ok: true, ...(outcome === "idempotent" ? { idempotent: true } : {}) });
    } catch (dbErr) {
      try {
        await conn.rollback();
      } catch (rollbackErr) {
        console.error("[payment/webhook] rollback falhou:", rollbackErr);
      }
      throw dbErr;
    } finally {
      conn.release();
    }
  } catch (err) {
    console.error("[payment/webhook] erro:", err, err?.stack);
    const status = process.env.NODE_ENV === "development" ? 500 : 200;
    return res.status(status).json({ ok: status === 200 });
  }
};
