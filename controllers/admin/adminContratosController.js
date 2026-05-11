// controllers/admin/adminContratosController.js
//
// Stub administrativo para simular a assinatura do contrato enquanto
// o provedor real (ClickSign) não está ligado. Só funciona quando
// CONTRATO_SIGNER_PROVIDER=stub. Usado para validar UX ponta a ponta
// com corretora real em staging sem queimar token.
//
// O service rejeita a chamada se o provedor estiver em 'clicksign',
// então esse endpoint fica inerte em produção mesmo se exposto.
"use strict";

const { response } = require("../../lib");
const AppError = require("../../errors/AppError");
const ERROR_CODES = require("../../constants/ErrorCodes");
const contratoService = require("../../services/contratoService");
const auditLog = require("../../services/contractAuditLogService");
const auditLogRepo = require("../../repositories/contractAuditLogRepository");
const contratoRepo = require("../../repositories/contratoRepository");

async function simularAssinatura(req, res, next) {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      throw new AppError("ID inválido.", ERROR_CODES.VALIDATION_ERROR, 400);
    }

    const result = await contratoService.simularAssinatura({
      id,
      actor: { id: req.admin?.id ?? null },
      auditContext: auditLog.fromRequest(req),
    });

    return response.ok(res, result, "Assinatura simulada com sucesso.");
  } catch (err) {
    return next(
      err instanceof AppError
        ? err
        : new AppError(
            "Erro ao simular assinatura.",
            ERROR_CODES.SERVER_ERROR,
            500,
          ),
    );
  }
}

// Fase 10.5 — Auditoria do contrato (timeline append-only).
// GET /api/admin/contratos/:id/audit-log
// RBAC já aplicado no mount (verifyAdmin + validateCSRF +
// requirePermission("mercado_cafe_view") na rota).
async function listAuditLog(req, res, next) {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      throw new AppError("ID inválido.", ERROR_CODES.VALIDATION_ERROR, 400);
    }
    const limit = Number(req.query.limit) || 100;
    const items = await auditLogRepo.listByContratoId(id, { limit });
    return response.ok(res, { items });
  } catch (err) {
    return next(
      err instanceof AppError
        ? err
        : new AppError(
            "Erro ao listar auditoria.",
            ERROR_CODES.SERVER_ERROR,
            500,
          ),
    );
  }
}

// Fase 10.10 — Listagem admin paginada de contratos.
// GET /api/admin/contratos
// RBAC: requirePermission("mercado_cafe_view") aplicado na rota.
// Query params validados via middleware `validate(adminListContratosQuerySchema)`
// — quando o controller é alcançado, req.body/req.query já está limpo.
async function listForAdmin(req, res, next) {
  try {
    // O middleware validate roda em req.body por default; aqui usamos
    // req.query diretamente (Zod coerce já cuidou de string→number).
    // Como `validate` está configurado pra body neste projeto, fazemos
    // o parse manualmente aqui — alinhado ao padrão de outros admin
    // listings (ex.: adminCorretoras listCorretoras).
    const schemas = require("../../schemas/contratoSchemas");
    const parsed = schemas.adminListContratosQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      const fields = parsed.error.issues.map((issue) => ({
        field: issue.path.join(".") || "query",
        message: issue.message,
      }));
      throw new AppError(
        "Parâmetros de filtro inválidos.",
        ERROR_CODES.VALIDATION_ERROR,
        400,
        { fields },
      );
    }
    const result = await contratoRepo.listForAdmin(parsed.data);
    return response.ok(res, result);
  } catch (err) {
    return next(
      err instanceof AppError
        ? err
        : new AppError(
            "Erro ao listar contratos.",
            ERROR_CODES.SERVER_ERROR,
            500,
          ),
    );
  }
}

module.exports = { simularAssinatura, listAuditLog, listForAdmin };
