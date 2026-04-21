// services/contratoService.js
//
// Fase 10.1 — geração e ciclo de vida do contrato de compra e venda
// de café. Responsabilidades:
//
//   - renderizar Handlebars (base + corpo por tipo)
//   - gerar PDF via Puppeteer a partir do HTML
//   - gravar PDF em storage privado (fora de /uploads público)
//   - calcular SHA-256 + embed de QR Code de verificação
//   - persistir em `contratos` + emitir evento na timeline do lead
//   - orquestrar envio para assinatura (stub hoje, ClickSign em PR 2)
//
// O método `gerarContrato` é atômico no sentido funcional: se falha
// no meio (render, puppeteer, disk write), nada é persistido no DB.
// A ordem propositalmente fecha o DB por último — PDF em disco órfão
// é limpo por cron (vide mediaService.enqueueOrphanCleanup, futuro).
"use strict";

const crypto = require("crypto");
const fs = require("fs/promises");
const path = require("path");
const { randomUUID } = require("crypto");

const Handlebars = require("handlebars");
const QRCode = require("qrcode");

const AppError = require("../errors/AppError");
const ERROR_CODES = require("../constants/ErrorCodes");
const logger = require("../lib/logger");

const contratoRepo = require("../repositories/contratoRepository");
const leadsRepo = require("../repositories/corretoraLeadsRepository");
const publicCorretorasRepo = require("../repositories/corretorasPublicRepository");
const leadEventsRepo = require("../repositories/corretoraLeadEventsRepository");
const contratoSignerService = require("./contratoSignerService");
const corretoraKycService = require("./corretoraKycService");
const { parseDataFieldsByTipo } = require("../schemas/contratoSchemas");

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

// `stub` mantém o fluxo testável ponta a ponta sem queimar token
// ClickSign. Em produção, setar `CONTRATO_SIGNER_PROVIDER=clicksign`
// e ligar `services/clicksignService.js` (PR 2).
const SIGNER_PROVIDER = process.env.CONTRATO_SIGNER_PROVIDER || "stub";

// Diretório fora de /uploads (public). Lido somente via endpoint
// autenticado `/api/corretora/contratos/:id/pdf`.
const STORAGE_ROOT = path.join(process.cwd(), "storage", "contratos");

const APP_URL = process.env.APP_URL || "http://localhost:3000";

// Mapa tipo → arquivo .hbs. Templates ficam em templates/contratos.
const TEMPLATE_FILES = {
  disponivel: "cv-disponivel.hbs",
  entrega_futura: "cv-entrega-futura.hbs",
};

const TEMPLATES_DIR = path.join(__dirname, "..", "templates", "contratos");

// Cache em memória dos templates compilados. Invalida em redeploy.
const _compiledCache = new Map();

async function _loadTemplate(fileName) {
  if (_compiledCache.has(fileName)) return _compiledCache.get(fileName);
  const raw = await fs.readFile(path.join(TEMPLATES_DIR, fileName), "utf8");
  const compiled = Handlebars.compile(raw, { noEscape: false });
  _compiledCache.set(fileName, compiled);
  return compiled;
}

// Registra o helper `brl` uma única vez.
let _helpersRegistered = false;
function _registerHandlebarsHelpers() {
  if (_helpersRegistered) return;
  Handlebars.registerHelper("brl", function (value) {
    if (value == null || value === "") return "R$ 0,00";
    const n = Number(value);
    if (!Number.isFinite(n)) return "R$ 0,00";
    return n.toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
      minimumFractionDigits: 2,
    });
  });
  Handlebars.registerHelper("multiply", function (a, b) {
    const na = Number(a);
    const nb = Number(b);
    if (!Number.isFinite(na) || !Number.isFinite(nb)) return 0;
    return na * nb;
  });
  Handlebars.registerHelper("dataBR", function (iso) {
    if (!iso) return "";
    try {
      return new Date(iso).toLocaleDateString("pt-BR", {
        timeZone: "America/Sao_Paulo",
      });
    } catch {
      return String(iso);
    }
  });
  _helpersRegistered = true;
}

// ---------------------------------------------------------------------------
// Renderização
// ---------------------------------------------------------------------------

async function _renderHtml({ tipo, partes, dataFields, metaContrato }) {
  _registerHandlebarsHelpers();
  const baseTpl = await _loadTemplate("_base.hbs");
  const bodyTpl = await _loadTemplate(TEMPLATE_FILES[tipo]);

  const bodyHtml = bodyTpl({ partes, ...dataFields, metaContrato });

  return baseTpl({
    partes,
    metaContrato,
    bodyHtml,
  });
}

// ---------------------------------------------------------------------------
// Puppeteer
// ---------------------------------------------------------------------------

// Singleton lazy — Chromium pesa ~170MB no boot; só subimos quando
// o primeiro contrato é gerado. Em produção com tráfego regular, o
// processo vive e reusa. Em serverless, seria preciso outro adapter.
let _browserPromise = null;

function _launchBrowser() {
  if (_browserPromise) return _browserPromise;
  // Carregamento preguiçoso — evita pagar o custo de require puppeteer
  // em testes unitários que não usam o gerador de PDF.
  const puppeteer = require("puppeteer");
  _browserPromise = puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  return _browserPromise;
}

async function _htmlToPdfBuffer(html) {
  const browser = await _launchBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: "networkidle0" });
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "20mm", bottom: "20mm", left: "20mm", right: "20mm" },
    });
    return pdf;
  } finally {
    await page.close();
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function _sha256Hex(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

async function _qrCodeDataUrl(url) {
  // margin:1 + errorCorrectionLevel:M — legibilidade boa em impressão
  // doméstica sem engordar demais o PNG.
  return QRCode.toDataURL(url, { margin: 1, errorCorrectionLevel: "M" });
}

async function _persistPdf({ corretoraId, token, pdfBuffer }) {
  const dir = path.join(STORAGE_ROOT, String(corretoraId));
  await fs.mkdir(dir, { recursive: true });
  const filename = `${token}.pdf`;
  const absPath = path.join(dir, filename);
  await fs.writeFile(absPath, pdfBuffer);
  // Path relativo ao root do backend — é isso que vai no DB.
  const relPath = path
    .relative(process.cwd(), absPath)
    .split(path.sep)
    .join("/");
  return { absPath, relPath };
}

// Redução LGPD do nome do produtor para verificação pública:
// "João Silva Santos" → "J. S. Santos". Preserva identificação
// sem expor nome completo a qualquer visitante do QR Code.
function _maskProducerName(fullName) {
  if (!fullName || typeof fullName !== "string") return null;
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return null;
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase() + ".";
  const last = parts[parts.length - 1];
  const initials = parts
    .slice(0, -1)
    .map((p) => p.charAt(0).toUpperCase() + ".")
    .join(" ");
  return `${initials} ${last}`;
}

// Recorte público seguro para a página de verificação.
//
// Não expõe: telefone, e-mail, CPF/CNPJ, endereço, preço, prazo de
// pagamento. Expõe apenas o mínimo que prova autenticidade do
// documento impresso com o QR Code: corretora (razão social/slug),
// tipo, status, hash, datas e resumo genérico (safra + sacas).
// Nome do produtor aparece apenas em forma abreviada (iniciais).
function _publicProjection(contrato) {
  const df = contrato.data_fields || {};
  return {
    tipo: contrato.tipo,
    status: contrato.status,
    hash_sha256: contrato.hash_sha256,
    signed_at: contrato.signed_at,
    created_at: contrato.created_at,
    corretora: {
      name: contrato.corretora_name,
      slug: contrato.corretora_slug,
    },
    resumo: {
      safra: df.safra ?? df.safra_futura ?? null,
      quantidade_sacas: df.quantidade_sacas ?? null,
      // Iniciais em vez de nome completo — defesa LGPD em rota pública.
      produtor_iniciais: _maskProducerName(df.__partes_produtor_nome),
    },
  };
}

// ---------------------------------------------------------------------------
// API pública do service
// ---------------------------------------------------------------------------

/**
 * Gera um contrato em status `draft` para um lead marcado como
 * deal_won. Produz o PDF, grava no storage privado e registra na
 * timeline do lead.
 */
async function gerarContrato({
  leadId,
  corretoraId,
  tipo,
  dataFields,
  createdByUserId,
}) {
  // 1) Carrega lead + corretora (scope)
  const lead = await leadsRepo.findByIdForCorretora(leadId, corretoraId);
  if (!lead) {
    throw new AppError(
      "Lead não encontrado.",
      ERROR_CODES.NOT_FOUND,
      404,
    );
  }
  if (lead.status !== "closed") {
    // No CRM do módulo, `closed` é o status "deal_won" (negócio fechado).
    // Só permitimos contrato em cima de negócio fechado.
    throw new AppError(
      "Só é possível gerar contrato de lead com negócio fechado.",
      ERROR_CODES.CONFLICT,
      409,
    );
  }

  if (await contratoRepo.hasActiveForLead(leadId, corretoraId)) {
    throw new AppError(
      "Já existe contrato ativo para este lead.",
      ERROR_CODES.CONFLICT,
      409,
    );
  }

  const corretora = await publicCorretorasRepo.findById(corretoraId);
  if (!corretora) {
    throw new AppError(
      "Corretora não encontrada.",
      ERROR_CODES.NOT_FOUND,
      404,
    );
  }

  // Fase 10.2 — gate de KYC. Corretora precisa estar verified antes
  // de emitir qualquer contrato. `publicCorretorasRepo.findById` já
  // inclui `kyc_status` (coluna adicionada na migration 07).
  corretoraKycService.requireVerifiedOrThrow(corretora);

  // 2) Valida dataFields do tipo certo (Zod discriminado)
  let parsedFields;
  try {
    parsedFields = parseDataFieldsByTipo(tipo, dataFields);
  } catch (err) {
    throw new AppError(
      "Dados do contrato inválidos.",
      ERROR_CODES.VALIDATION_ERROR,
      400,
      { fields: err?.issues ?? [] },
    );
  }

  // 3) Token, QR, URLs
  const token = randomUUID();
  const verifyUrl = `${APP_URL}/verificar/${token}`;
  const qrDataUrl = await _qrCodeDataUrl(verifyUrl);

  const partes = {
    corretora_nome: corretora.name,
    corretora_cnpj: corretora.cnpj ?? null,
    corretora_endereco: corretora.endereco_textual ?? null,
    produtor_nome: lead.nome,
    produtor_telefone: lead.telefone,
    produtor_email: lead.email ?? null,
    produtor_cidade: lead.cidade ?? null,
  };

  const metaContrato = {
    numero_externo: `KVT-${Date.now().toString(36).toUpperCase()}`,
    emitido_em: new Date().toISOString(),
    verify_url: verifyUrl,
    qr_data_url: qrDataUrl,
  };

  // 4) Render HTML + PDF
  const html = await _renderHtml({
    tipo,
    partes,
    dataFields: parsedFields,
    metaContrato,
  });

  const pdfBuffer = await _htmlToPdfBuffer(html);
  const hash = _sha256Hex(pdfBuffer);

  // 5) Persiste PDF no storage privado
  const { relPath } = await _persistPdf({
    corretoraId,
    token,
    pdfBuffer,
  });

  // 6) INSERT contrato. Guardamos nome do produtor no data_fields pra
  // a projeção pública conseguir mostrar sem precisar re-ler o lead.
  const snapshot = {
    ...parsedFields,
    __partes_produtor_nome: partes.produtor_nome,
    __partes_corretora_nome: partes.corretora_nome,
    __numero_externo: metaContrato.numero_externo,
  };

  const contratoId = await contratoRepo.create({
    lead_id: leadId,
    corretora_id: corretoraId,
    created_by_user_id: createdByUserId ?? null,
    tipo,
    pdf_url: relPath,
    hash_sha256: hash,
    qr_verification_token: token,
    data_fields: snapshot,
  });

  // 7) Evento na timeline do lead (fire-and-forget por convenção,
  // mas aqui aguardamos porque é parte do rito jurídico).
  await leadEventsRepo
    .create({
      lead_id: leadId,
      corretora_id: corretoraId,
      actor_user_id: createdByUserId ?? null,
      actor_type: "corretora_user",
      event_type: "contract_generated",
      title: `Contrato gerado (${tipo})`,
      meta: {
        contrato_id: contratoId,
        tipo,
        hash_sha256: hash,
        numero_externo: metaContrato.numero_externo,
      },
    })
    .catch((err) => {
      logger.warn(
        { err, contratoId, leadId },
        "contrato.event_create_failed",
      );
    });

  logger.info(
    {
      contratoId,
      leadId,
      corretoraId,
      tipo,
      hash,
      pdfPath: relPath,
    },
    "contrato.gerado",
  );

  return {
    id: contratoId,
    lead_id: leadId,
    corretora_id: corretoraId,
    tipo,
    status: "draft",
    hash_sha256: hash,
    qr_verification_token: token,
    numero_externo: metaContrato.numero_externo,
    verify_url: verifyUrl,
  };
}

/**
 * Marca o contrato como enviado para assinatura. No modo stub, só
 * muda status; no modo ClickSign (PR 2), chamará a API e guardará
 * envelope_id.
 */
async function enviarParaAssinatura({ id, corretoraId, actor }) {
  const contrato = await contratoRepo.findById(id, corretoraId);
  if (!contrato) {
    throw new AppError("Contrato não encontrado.", ERROR_CODES.NOT_FOUND, 404);
  }
  if (contrato.status !== "draft") {
    throw new AppError(
      "Contrato não está em rascunho.",
      ERROR_CODES.CONFLICT,
      409,
    );
  }

  if (SIGNER_PROVIDER === "clicksign") {
    // Delega para o orquestrador — ele fala com a API e persiste os
    // IDs do envelope. Eventos, logs e transição também são de lá.
    return contratoSignerService.enviarParaClickSign({ contrato, actor });
  }

  await contratoRepo.updateStatus(id, "sent", {
    signer_provider: "stub",
    signer_document_id: `stub-${randomUUID()}`,
    sent_at: new Date(),
  });

  await leadEventsRepo
    .create({
      lead_id: contrato.lead_id,
      corretora_id: corretoraId,
      actor_user_id: actor?.userId ?? null,
      actor_type: "corretora_user",
      event_type: "contract_sent",
      title: "Contrato enviado para assinatura",
      meta: { contrato_id: id, provider: "stub" },
    })
    .catch((err) => {
      logger.warn({ err, id }, "contrato.event_create_failed");
    });

  logger.info({ id, corretoraId, provider: "stub" }, "contrato.enviado");
  return { id, status: "sent", signer_provider: "stub" };
}

/**
 * Cancela um contrato que ainda não foi assinado.
 */
async function cancelar({ id, corretoraId, motivo, actor }) {
  const contrato = await contratoRepo.findById(id, corretoraId);
  if (!contrato) {
    throw new AppError("Contrato não encontrado.", ERROR_CODES.NOT_FOUND, 404);
  }
  if (!["draft", "sent"].includes(contrato.status)) {
    throw new AppError(
      "Contrato não pode ser cancelado neste status.",
      ERROR_CODES.CONFLICT,
      409,
    );
  }

  await contratoRepo.updateStatus(id, "cancelled", {
    cancelled_at: new Date(),
    cancel_reason: motivo,
  });

  await leadEventsRepo
    .create({
      lead_id: contrato.lead_id,
      corretora_id: corretoraId,
      actor_user_id: actor?.userId ?? null,
      actor_type: "corretora_user",
      event_type: "contract_cancelled",
      title: "Contrato cancelado",
      meta: { contrato_id: id, motivo },
    })
    .catch((err) => {
      logger.warn({ err, id }, "contrato.event_create_failed");
    });

  return { id, status: "cancelled" };
}

/**
 * Simulação de assinatura concluída — só disponível enquanto o
 * provedor ativo for `stub`. Endpoint admin.
 */
async function simularAssinatura({ id, actor }) {
  if (SIGNER_PROVIDER !== "stub") {
    throw new AppError(
      "Simulação de assinatura só funciona com CONTRATO_SIGNER_PROVIDER=stub.",
      ERROR_CODES.CONFLICT,
      409,
    );
  }

  const contrato = await contratoRepo.findByIdUnscoped(id);
  if (!contrato) {
    throw new AppError("Contrato não encontrado.", ERROR_CODES.NOT_FOUND, 404);
  }
  if (contrato.status !== "sent") {
    throw new AppError(
      "Contrato precisa estar em 'sent' para simular assinatura.",
      ERROR_CODES.CONFLICT,
      409,
    );
  }

  const signedAt = new Date();
  await contratoRepo.updateStatus(id, "signed", { signed_at: signedAt });

  await leadEventsRepo
    .create({
      lead_id: contrato.lead_id,
      corretora_id: contrato.corretora_id,
      actor_user_id: null,
      actor_type: "system",
      event_type: "contract_signed",
      title: "Contrato assinado (stub)",
      meta: { contrato_id: id, provider: "stub", admin_actor: actor?.id ?? null },
    })
    .catch((err) => {
      logger.warn({ err, id }, "contrato.event_create_failed");
    });

  logger.info({ id, adminActor: actor?.id }, "contrato.assinado.stub");
  return { id, status: "signed", signed_at: signedAt };
}

/**
 * Busca o contrato pelo token público de verificação.
 * Retorna uma projeção segura (sem telefone, email ou valores).
 */
async function getByVerificationToken(token) {
  const contrato = await contratoRepo.findByToken(token);
  if (!contrato) return null;
  return _publicProjection(contrato);
}

/**
 * Retorna o path absoluto do PDF para o controller servir via
 * res.sendFile. Escopado — só a corretora dona.
 */
async function getPdfPathForCorretora({ id, corretoraId }) {
  const contrato = await contratoRepo.findById(id, corretoraId);
  if (!contrato) {
    throw new AppError("Contrato não encontrado.", ERROR_CODES.NOT_FOUND, 404);
  }
  const abs = path.resolve(process.cwd(), contrato.pdf_url);
  // Defesa em profundidade: garante que o path resolvido fica dentro
  // do STORAGE_ROOT — evita path-traversal em caso de corrupção do DB.
  if (!abs.startsWith(STORAGE_ROOT)) {
    throw new AppError(
      "Caminho de contrato inválido.",
      ERROR_CODES.SERVER_ERROR,
      500,
    );
  }
  return { absPath: abs, contrato };
}

async function listByLead({ leadId, corretoraId }) {
  // Sanidade: garante que o lead pertence à corretora antes de
  // listar. Sem isso, um usuário autenticado de outra corretora
  // poderia tentar ID arbitrário.
  const lead = await leadsRepo.findByIdForCorretora(leadId, corretoraId);
  if (!lead) {
    throw new AppError(
      "Lead não encontrado.",
      ERROR_CODES.NOT_FOUND,
      404,
    );
  }
  return contratoRepo.listByLead(leadId, corretoraId);
}

// ---------------------------------------------------------------------------
// Exports (inclui helpers internos para testes unitários)
// ---------------------------------------------------------------------------

module.exports = {
  gerarContrato,
  enviarParaAssinatura,
  cancelar,
  simularAssinatura,
  getByVerificationToken,
  getPdfPathForCorretora,
  listByLead,

  // expostos para teste
  _internals: {
    _sha256Hex,
    _publicProjection,
    _renderHtml,
  },
};
