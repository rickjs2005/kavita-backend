"use strict";
// controllers/paymentController.js
// =============================================================================
// ⚠️  CONTRATO CONGELADO — NÃO USE COMO REFERÊNCIA PARA CÓDIGO NOVO
// =============================================================================
// Este controller retorna bare objects ({ methods }, { method }) nos endpoints
// de listagem/CRUD — divergente do padrão oficial { ok: true, data }.
// O frontend (admin e checkout) depende desses shapes exatos.
//
// Ao tocar este arquivo:
//   - PRESERVE o formato de resposta exato
//   - NÃO copie este padrão em código novo
//   - Para migrar: coordenar com frontend admin + checkout (ver CLAUDE.md § Contratos)
//
// Shapes congelados:
//   GET  /api/payment/methods       → { methods: [...] }
//   GET  /api/admin/.../methods     → { methods: [...] }
//   POST /api/admin/.../methods     → { method: {...} }   (201)
//   PUT  /api/admin/.../methods/:id → { method: {...} }
//   DELETE /api/admin/.../:id       → { ok: true }         ← único endpoint no padrão A
//   POST /api/payment/start         → bare result do paymentService
//   POST /api/payment/webhook       → { ok: true }         (webhook — padrão A)
//   Erros: via next(new AppError(...)) → padrão A (ok: false) ✅
// =============================================================================

const AppError = require("../errors/AppError");
const ERROR_CODES = require("../constants/ErrorCodes");
const paymentService = require("../services/paymentService");
const { handleWebhookEvent } = require("../services/paymentWebhookService");

// ---------------------------------------------------------------------------
// PUBLIC
// ---------------------------------------------------------------------------

const listMethods = async (_req, res, next) => {
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

const adminListMethods = async (_req, res, next) => {
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

const adminCreateMethod = async (req, res, next) => {
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

const adminUpdateMethod = async (req, res, next) => {
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

const adminDeleteMethod = async (req, res, next) => {
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

const startPayment = async (req, res, next) => {
  const { pedidoId } = req.body || {};
  const pedidoIdNum = Number(pedidoId);

  if (!Number.isFinite(pedidoIdNum) || pedidoIdNum <= 0) {
    return next(new AppError("pedidoId é obrigatório.", ERROR_CODES.VALIDATION_ERROR, 400));
  }

  try {
    const result = await paymentService.startPayment(pedidoIdNum, req.user.id);
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
  }
};

// ---------------------------------------------------------------------------
// MERCADO PAGO — webhook
// ---------------------------------------------------------------------------

const handleWebhook = async (req, res) => {
  const signatureHeader = req.get("x-signature");

  try {
    const { type, data } = req.body || {};
    const payload = JSON.stringify(req.body || {});
    const eventId = String(req.body?.id ?? "");

    if (!eventId) {
      console.warn("[payment/webhook] payload sem id de notificação");
      return res.status(200).json({ ok: true });
    }

    const outcome = await handleWebhookEvent({
      eventId,
      type,
      dataId: data?.id,
      payload,
      signatureHeader,
    });

    return res
      .status(200)
      .json({ ok: true, ...(outcome === "idempotent" ? { idempotent: true } : {}) });
  } catch (err) {
    console.error("[payment/webhook] erro:", err, err?.stack);
    const status = process.env.NODE_ENV === "development" ? 500 : 200;
    return res.status(status).json({ ok: status === 200 });
  }
};

module.exports = {
  listMethods,
  adminListMethods,
  adminCreateMethod,
  adminUpdateMethod,
  adminDeleteMethod,
  startPayment,
  handleWebhook,
};