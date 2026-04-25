"use strict";
// services/motoristaAuthService.js
//
// Auth passwordless do motorista via magic-link entregue por WhatsApp.
//
// Fluxo:
//   1. Admin (ou motorista no /motorista/login) chama:
//      requestMagicLink({ telefone })
//      -> gera 1 magic-link (JWT short-lived) + tenta enviar via
//         services/whatsapp.sendWhatsapp; sempre devolve { link } pra
//         admin poder copiar manualmente caso WhatsApp falhe
//      -> bumpa motorista.token_version para invalidar links anteriores
//   2. Motorista clica → frontend chama
//      consumeMagicLink({ token })
//      -> valida JWT (scope='motorista_magic') + bate token_version
//      -> emite JWT de sessao (kind='motorista', TTL 4h)
//      -> revoga futuros consumes do MESMO link via token_version bump
//   3. Cookie motoristaToken usado pelo middleware verifyMotorista
//
// JWT_SECRET compartilhado (mesmo dos outros contextos).

const jwt = require("jsonwebtoken");
const AppError = require("../errors/AppError");
const ERROR_CODES = require("../constants/ErrorCodes");
const motoristasRepo = require("../repositories/motoristasRepository");
const { normalizePhoneBR } = require("../lib/waLink");
const { sendWhatsapp } = require("./whatsapp");
const logger = require("../lib/logger");

const SCOPE_MAGIC = "motorista_magic";
const SCOPE_SESSION = "motorista_session";
const MAGIC_TTL_MIN = Number(process.env.MOTORISTA_MAGIC_TTL_MIN) || 15;
const SESSION_TTL_HOURS = Number(process.env.MOTORISTA_SESSION_TTL_HOURS) || 4;

function _jwtSecret() {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error("JWT_SECRET ausente.");
  return s;
}

function _appUrl() {
  return (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");
}

function _signMagicJwt(motorista) {
  return jwt.sign(
    {
      sub: motorista.id,
      kind: SCOPE_MAGIC,
      v: motorista.token_version,
    },
    _jwtSecret(),
    { expiresIn: `${MAGIC_TTL_MIN}m` },
  );
}

function _signSessionJwt(motorista) {
  return jwt.sign(
    {
      sub: motorista.id,
      kind: SCOPE_SESSION,
      v: motorista.token_version,
    },
    _jwtSecret(),
    { expiresIn: `${SESSION_TTL_HOURS}h` },
  );
}

function _verifyJwt(token, expectedKind) {
  try {
    const payload = jwt.verify(token, _jwtSecret());
    if (!payload || payload.kind !== expectedKind || !payload.sub) return null;
    return payload;
  } catch {
    return null;
  }
}

function _buildLink(token) {
  return `${_appUrl()}/motorista/verificar?token=${encodeURIComponent(token)}`;
}

function _buildWhatsappMessage(motorista, link) {
  const nome = motorista.nome?.split(/\s+/)[0] || "motorista";
  return (
    `Ola ${nome}! Seu acesso ao painel de entregas Kavita esta pronto.\n\n` +
    `Acesse pelo link (valido por ${MAGIC_TTL_MIN} minutos):\n${link}\n\n` +
    `Se nao foi voce que pediu, ignore esta mensagem.`
  );
}

/**
 * Gera magic-link e tenta enviar via WhatsApp.
 *
 * @param {{telefone?: string, motoristaId?: number}} input
 *   - se telefone: usa pra achar motorista pelo numero
 *   - se motoristaId: usa direto (admin clicando "enviar link" no painel)
 * @returns {Promise<{ link, telefone, whatsapp: { status, url, erro } }>}
 *   link sempre presente (admin pode copiar manualmente).
 */
async function requestMagicLink({ telefone, motoristaId } = {}) {
  let motorista = null;
  if (motoristaId) {
    motorista = await motoristasRepo.findById(motoristaId);
    if (!motorista) {
      throw new AppError("Motorista nao encontrado.", ERROR_CODES.NOT_FOUND, 404);
    }
  } else {
    const tel = normalizePhoneBR(telefone);
    if (!tel) {
      throw new AppError(
        "Telefone invalido. Use formato com DDD.",
        ERROR_CODES.VALIDATION_ERROR,
        400,
      );
    }
    motorista = await motoristasRepo.findByTelefone(tel);
    if (!motorista) {
      // Nao revelamos se o telefone existe ou nao (anti-enumeracao).
      // Mas registramos pro admin.
      logger.info({ telefone: tel }, "motorista.magic_link.unknown_phone");
      return {
        link: null,
        telefone: tel,
        whatsapp: { status: "skipped", url: null, erro: "Motorista nao cadastrado" },
        sent: false,
      };
    }
  }

  if (!motorista.ativo) {
    throw new AppError(
      "Motorista inativo. Reative no painel admin.",
      ERROR_CODES.FORBIDDEN,
      403,
    );
  }

  // Bumpa token_version: invalida QUALQUER magic-link anterior + sessoes
  // ativas (motorista vai precisar logar de novo). Isso e' uso unico.
  await motoristasRepo.bumpTokenVersion(motorista.id);
  const fresh = await motoristasRepo.findById(motorista.id);

  const magicJwt = _signMagicJwt(fresh);
  const link = _buildLink(magicJwt);

  // Envio WhatsApp: fire-and-forget, sempre devolve resultado pro admin.
  let whatsappResult = { status: "skipped", url: null, erro: null };
  try {
    const result = await sendWhatsapp({
      telefone: fresh.telefone,
      mensagem: _buildWhatsappMessage(fresh, link),
    });
    whatsappResult = {
      status: result.status,
      url: result.url || null,
      erro: result.erro || null,
    };
  } catch (err) {
    logger.warn(
      { err: err?.message, motoristaId: fresh.id },
      "motorista.magic_link.whatsapp_failed",
    );
    whatsappResult = {
      status: "error",
      url: null,
      erro: err?.message || "Falha ao enviar WhatsApp",
    };
  }

  logger.info(
    {
      motoristaId: fresh.id,
      whatsappStatus: whatsappResult.status,
    },
    "motorista.magic_link.issued",
  );

  return {
    link,
    telefone: fresh.telefone,
    whatsapp: whatsappResult,
    sent: true,
  };
}

/**
 * Consome magic-link e devolve sessao.
 *
 * Uso unico real: token_version foi bumpada no requestMagicLink.
 * Quando consumimos, bumpamos DE NOVO -> qualquer outro magic-link
 * gerado em paralelo + qualquer sessao anterior viram invalidos.
 */
async function consumeMagicLink({ token }) {
  if (!token || typeof token !== "string") {
    throw new AppError("Link invalido.", ERROR_CODES.VALIDATION_ERROR, 400);
  }
  const payload = _verifyJwt(token, SCOPE_MAGIC);
  if (!payload) {
    throw new AppError(
      "Link invalido ou expirado.",
      ERROR_CODES.UNAUTHORIZED,
      401,
    );
  }
  const motorista = await motoristasRepo.findById(payload.sub);
  if (!motorista || !motorista.ativo) {
    throw new AppError("Conta invalida.", ERROR_CODES.UNAUTHORIZED, 401);
  }
  if (motorista.token_version !== payload.v) {
    // Outro magic-link foi gerado depois deste, ou ja foi consumido.
    throw new AppError(
      "Link invalido ou ja utilizado. Solicite um novo.",
      ERROR_CODES.UNAUTHORIZED,
      401,
    );
  }

  // Bump token_version pra invalidar (a) este mesmo link em re-uso e
  // (b) eventuais sessoes antigas. Sessao nova abaixo carrega a nova
  // version, que vira o token_version vigente.
  await motoristasRepo.bumpTokenVersion(motorista.id);
  await motoristasRepo.touchLogin(motorista.id);
  const fresh = await motoristasRepo.findById(motorista.id);

  const sessionJwt = _signSessionJwt(fresh);
  logger.info({ motoristaId: fresh.id }, "motorista.auth.login");

  return {
    motorista: _sanitize(fresh),
    jwt: sessionJwt,
    cookie: {
      name: "motoristaToken",
      value: sessionJwt,
      maxAgeSeconds: SESSION_TTL_HOURS * 3600,
    },
  };
}

/**
 * Valida cookie de sessao. Usado pelo middleware verifyMotorista.
 * Retorna null em qualquer falha (middleware decide HTTP).
 */
async function verifyMotoristaToken(jwtToken) {
  const payload = _verifyJwt(jwtToken, SCOPE_SESSION);
  if (!payload) return null;
  const motorista = await motoristasRepo.findById(payload.sub);
  if (!motorista || !motorista.ativo) return null;
  if (motorista.token_version !== payload.v) return null;
  return _sanitize(motorista);
}

function _sanitize(motorista) {
  return {
    id: motorista.id,
    nome: motorista.nome,
    telefone: motorista.telefone,
    email: motorista.email,
    veiculo_padrao: motorista.veiculo_padrao,
  };
}

module.exports = {
  requestMagicLink,
  consumeMagicLink,
  verifyMotoristaToken,
  SCOPE_MAGIC,
  SCOPE_SESSION,
  MAGIC_TTL_MIN,
  SESSION_TTL_HOURS,
};
