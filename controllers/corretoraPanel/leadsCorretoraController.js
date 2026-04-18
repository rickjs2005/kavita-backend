// controllers/corretoraPanel/leadsCorretoraController.js
//
// Endpoints do painel para a corretora gerenciar os próprios leads.
// Todas as operações escopam por req.corretoraUser.corretora_id.
"use strict";

const { response } = require("../../lib");
const AppError = require("../../errors/AppError");
const ERROR_CODES = require("../../constants/ErrorCodes");
const leadsService = require("../../services/corretoraLeadsService");
const leadsRepo = require("../../repositories/corretoraLeadsRepository");
const logger = require("../../lib/logger");
const { listLeadsQuerySchema } = require("../../schemas/corretoraAuthSchemas");

// Labels human-readable para o CSV export. Espelham o catálogo do
// frontend (src/lib/regioes.ts). Mantidos aqui para evitar acoplar
// backend ao frontend.
const CSV_LABELS = {
  status: {
    new: "Novo",
    contacted: "Em contato",
    closed: "Fechado",
    lost: "Perdido",
  },
  objetivo: {
    vender: "Vender café",
    comprar: "Comprar café",
    cotacao: "Consultar cotação",
    outro: "Outro assunto",
  },
  tipo_cafe: {
    arabica_comum: "Arábica comum",
    arabica_especial: "Arábica especial",
    natural: "Natural",
    cereja_descascado: "Cereja descascado",
    ainda_nao_sei: "Ainda não sei",
  },
  volume_range: {
    ate_50: "Até 50 sacas",
    "50_200": "50 a 200 sacas",
    "200_500": "200 a 500 sacas",
    "500_mais": "Mais de 500 sacas",
  },
  canal_preferido: {
    whatsapp: "WhatsApp",
    ligacao: "Ligação",
    email: "E-mail",
  },
};

/** Escape de valor para CSV (RFC 4180): aspas duplas, quebras de linha. */
function csvEscape(value) {
  if (value == null) return "";
  const str = String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function label(map, value) {
  if (!value) return "";
  return map[value] ?? value;
}

function formatDateForCsv(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("pt-BR", {
      timeZone: "America/Sao_Paulo",
    });
  } catch {
    return String(iso);
  }
}

/**
 * GET /api/corretora/leads
 */
async function listMine(req, res, next) {
  try {
    const parsed = listLeadsQuerySchema.safeParse(req.query);
    const q = parsed.success ? parsed.data : { page: 1, limit: 20 };

    const result = await leadsService.listLeadsForCorretora(
      req.corretoraUser.corretora_id,
      q
    );
    // Retornamos o payload de paginação dentro de `data` (e não via
    // response.paginated) porque o apiClient do frontend faz unwrap
    // do envelope e descarta o `meta`. Colocando items+total+pages
    // dentro de data, o cliente recebe o objeto completo.
    return response.ok(res, {
      items: result.items,
      total: result.total,
      page: result.page,
      limit: result.limit,
      pages: Math.max(1, Math.ceil(result.total / result.limit)),
    });
  } catch (err) {
    return next(
      new AppError("Erro ao listar leads.", ERROR_CODES.SERVER_ERROR, 500)
    );
  }
}

/**
 * GET /api/corretora/leads/summary
 */
async function getSummary(req, res, next) {
  try {
    const summary = await leadsService.getSummary(
      req.corretoraUser.corretora_id
    );
    return response.ok(res, summary);
  } catch (err) {
    return next(
      new AppError(
        "Erro ao carregar resumo de leads.",
        ERROR_CODES.SERVER_ERROR,
        500
      )
    );
  }
}

/**
 * PATCH /api/corretora/leads/:id
 * Body validado por validate(updateLeadSchema).
 */
async function updateLead(req, res, next) {
  try {
    const leadId = Number(req.params.id);
    const updated = await leadsService.updateLead(
      leadId,
      req.corretoraUser.corretora_id,
      req.body,
      { userId: req.corretoraUser.id }
    );
    return response.ok(res, updated, "Lead atualizado.");
  } catch (err) {
    return next(
      err instanceof AppError
        ? err
        : new AppError(
            "Erro ao atualizar lead.",
            ERROR_CODES.SERVER_ERROR,
            500
          )
    );
  }
}

/**
 * GET /api/corretora/leads/export
 * Exporta leads da corretora como CSV (UTF-8 com BOM para abrir
 * corretamente no Excel em PT-BR). Aceita filtro ?status=.
 * Limite superior de 10k registros (ver repo).
 */
async function exportLeads(req, res, next) {
  try {
    const status = ["new", "contacted", "closed", "lost"].includes(req.query.status)
      ? req.query.status
      : undefined;

    const leads = await leadsRepo.listAllForExport(
      req.corretoraUser.corretora_id,
      { status },
    );

    const headers = [
      "ID",
      "Data",
      "Nome",
      "Telefone",
      "Cidade",
      "Status",
      "Objetivo",
      "Tipo de café",
      "Volume",
      "Canal preferido",
      "Primeira resposta (segundos)",
      "Mensagem",
      "Nota interna",
    ];

    const lines = [headers.map(csvEscape).join(",")];

    for (const l of leads) {
      lines.push(
        [
          l.id,
          formatDateForCsv(l.created_at),
          l.nome,
          l.telefone,
          l.cidade ?? "",
          label(CSV_LABELS.status, l.status),
          label(CSV_LABELS.objetivo, l.objetivo),
          label(CSV_LABELS.tipo_cafe, l.tipo_cafe),
          label(CSV_LABELS.volume_range, l.volume_range),
          label(CSV_LABELS.canal_preferido, l.canal_preferido),
          l.first_response_seconds ?? "",
          l.mensagem ?? "",
          l.nota_interna ?? "",
        ]
          .map(csvEscape)
          .join(","),
      );
    }

    // BOM UTF-8 — Excel PT-BR precisa para reconhecer acentos.
    const csv = "\uFEFF" + lines.join("\r\n");

    const timestamp = new Date().toISOString().slice(0, 10);
    const filename = `leads-kavita-${timestamp}.csv`;

    logger.info(
      {
        corretoraId: req.corretoraUser.corretora_id,
        actorId: req.corretoraUser.id,
        total: leads.length,
        status: status ?? "all",
      },
      "corretora.leads.export",
    );

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${filename}"`,
    );
    res.send(csv);
  } catch (err) {
    next(
      err instanceof AppError
        ? err
        : new AppError(
            "Erro ao exportar leads.",
            ERROR_CODES.SERVER_ERROR,
            500,
          ),
    );
  }
}

/**
 * GET /api/corretora/leads/risks
 * Snapshot operacional: overdue, stale, pipeline value.
 */
async function getDashboardRisks(req, res, next) {
  try {
    const data = await leadsService.getDashboardRisks(
      req.corretoraUser.corretora_id,
    );
    return response.ok(res, data);
  } catch (err) {
    return next(
      err instanceof AppError
        ? err
        : new AppError(
            "Erro ao carregar riscos.",
            ERROR_CODES.SERVER_ERROR,
            500,
          ),
    );
  }
}

/**
 * GET /api/corretora/leads/:id
 * Detalhe completo com notes + events.
 */
async function getLeadDetail(req, res, next) {
  try {
    const leadId = Number(req.params.id);
    if (!Number.isInteger(leadId) || leadId <= 0) {
      throw new AppError("ID inválido.", ERROR_CODES.VALIDATION_ERROR, 400);
    }
    const detail = await leadsService.getLeadDetail(
      leadId,
      req.corretoraUser.corretora_id,
    );
    return response.ok(res, detail);
  } catch (err) {
    return next(
      err instanceof AppError
        ? err
        : new AppError(
            "Erro ao carregar detalhe do lead.",
            ERROR_CODES.SERVER_ERROR,
            500,
          ),
    );
  }
}

/**
 * POST /api/corretora/leads/:id/notes
 * Body validado por validate(createLeadNoteSchema).
 */
async function addLeadNote(req, res, next) {
  try {
    const leadId = Number(req.params.id);
    if (!Number.isInteger(leadId) || leadId <= 0) {
      throw new AppError("ID inválido.", ERROR_CODES.VALIDATION_ERROR, 400);
    }
    const result = await leadsService.addLeadNote({
      leadId,
      corretoraId: req.corretoraUser.corretora_id,
      actor: { userId: req.corretoraUser.id },
      body: req.body.body,
    });
    return response.created(res, result, "Nota adicionada.");
  } catch (err) {
    return next(
      err instanceof AppError
        ? err
        : new AppError(
            "Erro ao adicionar nota.",
            ERROR_CODES.SERVER_ERROR,
            500,
          ),
    );
  }
}

/**
 * DELETE /api/corretora/leads/:id/notes/:noteId
 * Remove uma nota do lead. Só autor/manager/owner devem poder —
 * RBAC do route cuida disso.
 */
async function deleteLeadNote(req, res, next) {
  try {
    const leadId = Number(req.params.id);
    const noteId = Number(req.params.noteId);
    if (
      !Number.isInteger(leadId) ||
      leadId <= 0 ||
      !Number.isInteger(noteId) ||
      noteId <= 0
    ) {
      throw new AppError("ID inválido.", ERROR_CODES.VALIDATION_ERROR, 400);
    }
    await leadsService.deleteLeadNote({
      leadId,
      corretoraId: req.corretoraUser.corretora_id,
      noteId,
    });
    return response.ok(res, null, "Nota removida.");
  } catch (err) {
    return next(
      err instanceof AppError
        ? err
        : new AppError(
            "Erro ao remover nota.",
            ERROR_CODES.SERVER_ERROR,
            500,
          ),
    );
  }
}

/**
 * PATCH /api/corretora/leads/:id/proposal
 */
async function updateLeadProposal(req, res, next) {
  try {
    const leadId = Number(req.params.id);
    if (!Number.isInteger(leadId) || leadId <= 0) {
      throw new AppError("ID inválido.", ERROR_CODES.VALIDATION_ERROR, 400);
    }
    const updated = await leadsService.updateLeadProposal({
      leadId,
      corretoraId: req.corretoraUser.corretora_id,
      actor: { userId: req.corretoraUser.id },
      data: req.body,
    });
    return response.ok(res, updated, "Proposta atualizada.");
  } catch (err) {
    return next(
      err instanceof AppError
        ? err
        : new AppError(
            "Erro ao atualizar proposta.",
            ERROR_CODES.SERVER_ERROR,
            500,
          ),
    );
  }
}

/**
 * PATCH /api/corretora/leads/:id/next-action
 */
async function updateLeadNextAction(req, res, next) {
  try {
    const leadId = Number(req.params.id);
    if (!Number.isInteger(leadId) || leadId <= 0) {
      throw new AppError("ID inválido.", ERROR_CODES.VALIDATION_ERROR, 400);
    }
    const updated = await leadsService.updateLeadNextAction({
      leadId,
      corretoraId: req.corretoraUser.corretora_id,
      actor: { userId: req.corretoraUser.id },
      data: req.body,
    });
    return response.ok(res, updated, "Próxima ação atualizada.");
  } catch (err) {
    return next(
      err instanceof AppError
        ? err
        : new AppError(
            "Erro ao atualizar próxima ação.",
            ERROR_CODES.SERVER_ERROR,
            500,
          ),
    );
  }
}

module.exports = {
  listMine,
  getSummary,
  getDashboardRisks,
  updateLead,
  exportLeads,
  getLeadDetail,
  addLeadNote,
  deleteLeadNote,
  updateLeadProposal,
  updateLeadNextAction,
};
