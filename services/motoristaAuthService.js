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
//      -> NAO bumpa token_version (garante que sessao ativa do motorista
//         continue valida quando admin gera novo link — comum no auto-send
//         do rotasService). Multiplos magic-links coexistem ate um ser
//         consumido ou expirar (8h).
//   2. Motorista clica → frontend chama
//      consumeMagicLink({ token })
//      -> valida JWT (scope='motorista_magic') + bate token_version
//      -> bumpa token_version → invalida (a) o proprio link em re-uso,
//         (b) qualquer outro magic-link emitido em paralelo, (c) sessoes
//         anteriores deste motorista (so 1 dispositivo logado por vez)
//      -> emite JWT de sessao (kind='motorista_session', TTL 4h)
//   3. Cookie motoristaToken usado pelo middleware verifyMotorista
//
// JWT_SECRET compartilhado (mesmo dos outros contextos).

const jwt = require("jsonwebtoken");
const AppError = require("../errors/AppError");
const ERROR_CODES = require("../constants/ErrorCodes");
const motoristasRepo = require("../repositories/motoristasRepository");
const { normalizePhoneBR } = require("../lib/waLink");
const { sendWhatsapp, getProvider: getWhatsappProvider } = require("./whatsapp");
const logger = require("../lib/logger");

const SCOPE_MAGIC = "motorista_magic";
const SCOPE_SESSION = "motorista_session";
// Default 8h (480min) — cobre o turno completo do motorista. Antes era
// 15min, mas com o auto-envio de link na transicao rascunho->pronta
// (rotasService) o admin atribui rota cedo e motorista pode entrar
// horas depois. Override via env pra ambientes sensiveis a seguranca.
const MAGIC_TTL_MIN = Number(process.env.MOTORISTA_MAGIC_TTL_MIN) || 480;
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

/**
 * Formata o TTL do link em hh/min de forma humana.
 *   480 -> "8 horas"
 *   60  -> "1 hora"
 *   90  -> "1h30min"
 *   15  -> "15 minutos"
 */
function _formatTtl(minutos) {
  const m = Math.max(1, Math.round(Number(minutos) || 0));
  if (m % 60 === 0) {
    const h = m / 60;
    return h === 1 ? "1 hora" : `${h} horas`;
  }
  if (m < 60) return `${m} minutos`;
  const h = Math.floor(m / 60);
  const rem = m - h * 60;
  return `${h}h${rem.toString().padStart(2, "0")}min`;
}

function _buildWhatsappMessage(motorista, link) {
  const nome = motorista.nome?.split(/\s+/)[0] || "motorista";
  return (
    `Ola ${nome}! Seu acesso ao painel de entregas Kavita esta pronto.\n\n` +
    `Acesse pelo link (valido por ${_formatTtl(MAGIC_TTL_MIN)}):\n${link}\n\n` +
    `Se nao foi voce que pediu, ignore esta mensagem.`
  );
}

/**
 * Gera magic-link e tenta enviar via WhatsApp.
 *
 * NAO bumpa token_version — sessao ativa do motorista permanece valida
 * apos a emissao de um novo link (essencial pro auto-send do rotasService
 * nao deslogar motorista no meio do turno). O bump acontece apenas no
 * consumeMagicLink, que ainda garante:
 *   - uso unico real do link (re-consumo do mesmo token falha)
 *   - sessoes anteriores cessam quando outro magic-link e' consumido
 *
 * @param {{telefone?: string, motoristaId?: number}} input
 *   - se telefone: usa pra achar motorista pelo numero
 *   - se motoristaId: usa direto (admin clicando "enviar link" no painel)
 * @returns {Promise<{
 *   link: string|null,
 *   telefone: string,
 *   whatsapp: { provider: string, status: string, url: string|null, erro: string|null },
 *   delivered: boolean,   // true SO se a mensagem foi efetivamente entregue
 *   sent: boolean,        // true se chegou a tentar (false em telefone desconhecido)
 * }>}
 *   link sempre presente (admin pode copiar manualmente) — exceto quando
 *   sent=false (telefone nao cadastrado).
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
        whatsapp: {
          provider: getWhatsappProvider(),
          status: "skipped",
          url: null,
          erro: "Motorista nao cadastrado",
        },
        delivered: false,
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

  const magicJwt = _signMagicJwt(motorista);
  const link = _buildLink(magicJwt);
  const provider = getWhatsappProvider();

  // Envio WhatsApp: erro NAO falha o request (admin pode copiar o link).
  let whatsappResult = { provider, status: "skipped", url: null, erro: null };
  try {
    const result = await sendWhatsapp({
      telefone: motorista.telefone,
      mensagem: _buildWhatsappMessage(motorista, link),
    });
    whatsappResult = {
      provider: result.provider || provider,
      status: result.status,
      url: result.url || null,
      erro: result.erro || null,
    };
  } catch (err) {
    logger.warn(
      { err: err?.message, motoristaId: motorista.id },
      "motorista.magic_link.whatsapp_failed",
    );
    whatsappResult = {
      provider,
      status: "error",
      url: null,
      erro: err?.message || "Falha ao enviar WhatsApp",
    };
  }

  // delivered=true SO em entrega real pela API. manual_pending = link
  // gerado mas nao entregue (admin precisa clicar wa.me); skipped/error
  // tambem nao sao entrega.
  const delivered = whatsappResult.status === "sent";

  logger.info(
    {
      motoristaId: motorista.id,
      provider: whatsappResult.provider,
      whatsappStatus: whatsappResult.status,
      delivered,
    },
    "motorista.magic_link.issued",
  );

  return {
    link,
    telefone: motorista.telefone,
    whatsapp: whatsappResult,
    delivered,
    sent: true,
  };
}

/**
 * Consome magic-link e devolve sessao.
 *
 * Uso unico: bumpamos token_version aqui (e somente aqui). Apos esse
 * bump, qualquer outro magic-link emitido com a versao antiga rejeita,
 * e qualquer sessao anterior do mesmo motorista expira (somente 1
 * dispositivo logado por vez).
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
