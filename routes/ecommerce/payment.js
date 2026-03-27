// routes/payment.js
// =============================================================================
// ARQUIVO HÍBRIDO — modernização parcial, migração pendente
// =============================================================================
// A maioria das operações delega para paymentService/paymentWebhookService.
// Ainda existem handlers com pool.query() direto e res.json() cru para
// gerenciamento de métodos de pagamento administrativos.
//
// Padrão canônico atual:
//   rota magra → controller → service → repository  (+  Zod em schemas/)
//   Referência: routes/admin/adminDrones.js
//
// Ao modificar este arquivo:
//   - use paymentService/paymentRepository — nunca pool.query() direto
//   - use lib/response.js — nunca res.json() cru
// =============================================================================
"use strict";

const express = require("express");
const router = express.Router();
const pool = require("../../config/pool");

const AppError = require("../../errors/AppError");
const ERROR_CODES = require("../../constants/ErrorCodes");

const authenticateToken = require("../../middleware/authenticateToken");
const verifyAdmin = require("../../middleware/verifyAdmin");
const validateMPSignature = require("../../middleware/validateMPSignature");
const { validateCSRF } = require("../../middleware/csrfProtection");

const paymentService = require("../../services/paymentService");
const { handleWebhookEvent } = require("../../services/paymentWebhookService");

/* ------------------------------------------------------------------ */
/*  Swagger — tags e schemas mantidos aqui para co-localização          */
/* ------------------------------------------------------------------ */

/**
 * @openapi
 * tags:
 *   - name: Pagamentos
 *     description: Integração Mercado Pago + métodos de pagamento
 *
 * components:
 *   schemas:
 *     ApiError:
 *       type: object
 *       properties:
 *         code:
 *           type: string
 *           example: VALIDATION_ERROR
 *         message:
 *           type: string
 *           example: "pedidoId é obrigatório."
 *     PaymentMethod:
 *       type: object
 *       properties:
 *         id: { type: integer, example: 1 }
 *         code: { type: string, example: "pix" }
 *         label: { type: string, example: "Pix" }
 *         description: { type: string, nullable: true, example: "Pagamento instantâneo via Pix." }
 *         is_active: { type: integer, example: 1 }
 *         sort_order: { type: integer, example: 10 }
 *         created_at: { type: string, example: "2026-01-09 10:00:00" }
 *         updated_at: { type: string, nullable: true, example: "2026-01-09 10:05:00" }
 */

/**
 * @openapi
 * /api/payment/methods:
 *   get:
 *     tags: [Pagamentos]
 *     summary: Lista métodos de pagamento ativos (para o checkout)
 *     responses:
 *       200:
 *         description: Lista de métodos ativos ordenados por sort_order
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 methods:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/PaymentMethod'
 */

/**
 * @openapi
 * /api/payment/admin/payment-methods:
 *   get:
 *     tags: [Pagamentos]
 *     summary: (Admin) Lista todos os métodos (ativos e inativos)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lista completa ordenada por sort_order
 *
 *   post:
 *     tags: [Pagamentos]
 *     summary: (Admin) Cria um método de pagamento
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       201:
 *         description: Criado
 *
 * /api/payment/admin/payment-methods/{id}:
 *   put:
 *     tags: [Pagamentos]
 *     summary: (Admin) Atualiza um método
 *     security:
 *       - bearerAuth: []
 *   delete:
 *     tags: [Pagamentos]
 *     summary: (Admin) Desativa (soft delete) um método
 *     security:
 *       - bearerAuth: []
 */

/**
 * @openapi
 * /api/payment/start:
 *   post:
 *     tags: [Pagamentos]
 *     summary: Inicia o fluxo de pagamento via Mercado Pago
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [pedidoId]
 *             properties:
 *               pedidoId: { type: integer, example: 123 }
 *     responses:
 *       200:
 *         description: Retorna dados da preferência de pagamento
 *       400:
 *         description: Campo pedidoId ausente/inválido ou forma_pagamento incompatível com MP
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ApiError' }
 *       404:
 *         description: Pedido não encontrado
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ApiError' }
 *       500:
 *         description: Erro ao iniciar pagamento
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ApiError' }
 */

/* ------------------------------------------------------------------ */
/*  PUBLIC: list active methods                                          */
/* ------------------------------------------------------------------ */

router.get("/methods", async (_req, res, next) => {
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
});

/* ------------------------------------------------------------------ */
/*  ADMIN: CRUD payment methods                                          */
/* ------------------------------------------------------------------ */

router.get("/admin/payment-methods", authenticateToken, verifyAdmin, async (_req, res, next) => {
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
});

router.post("/admin/payment-methods", authenticateToken, verifyAdmin, async (req, res, next) => {
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
});

router.put("/admin/payment-methods/:id", authenticateToken, verifyAdmin, async (req, res, next) => {
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
});

router.delete(
  "/admin/payment-methods/:id",
  authenticateToken,
  verifyAdmin,
  async (req, res, next) => {
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
  }
);

/* ------------------------------------------------------------------ */
/*  MERCADO PAGO: start payment                                          */
/* ------------------------------------------------------------------ */

router.post("/start", authenticateToken, validateCSRF, async (req, res, next) => {
  const { pedidoId } = req.body || {};
  const pedidoIdNum = Number(pedidoId);

  if (!Number.isFinite(pedidoIdNum) || pedidoIdNum <= 0) {
    return next(new AppError("pedidoId é obrigatório.", ERROR_CODES.VALIDATION_ERROR, 400));
  }

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
});

/* ------------------------------------------------------------------ */
/*  MERCADO PAGO: webhook                                                */
/* ------------------------------------------------------------------ */

router.post("/webhook", validateMPSignature, async (req, res) => {
  const signatureHeader = req.get("x-signature");

  try {
    const { type, data } = req.body || {};
    const payload = JSON.stringify(req.body || {});
    const eventId = String(req.body?.id ?? "");

    if (!eventId) {
      console.warn("[payment/webhook] payload sem id de notificação");
      return res.status(200).json({ ok: true });
    }

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
      return res.status(200).json({ ok: true, ...(outcome === "idempotent" ? { idempotent: true } : {}) });
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
});

module.exports = router;
