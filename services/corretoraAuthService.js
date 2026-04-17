// services/corretoraAuthService.js
//
// Autenticação dos usuários de corretora (Mercado do Café Fase 2).
// Espelha authAdminService mas sem RBAC — o único papel é "corretora".
"use strict";

const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const AppError = require("../errors/AppError");
const ERROR_CODES = require("../constants/ErrorCodes");
const usersRepo = require("../repositories/corretoraUsersRepository");
const adminRepo = require("../repositories/corretorasAdminRepository");
const resetTokens = require("./passwordResetTokenService");
const mailService = require("./mailService");
const planService = require("./planService");
const logger = require("../lib/logger");
const { withTransaction } = require("../lib/withTransaction");

const BCRYPT_ROUNDS = 12;
const COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 dias
const JWT_EXPIRES_IN = "7d";

// TTL específico do convite de primeiro acesso: 7 dias.
// Bem maior que o do "esqueci minha senha" (1h) porque a corretora
// pode demorar alguns dias para abrir o e-mail e definir a senha.
const INVITE_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const RESET_TOKEN_SCOPE = "corretora_user";

function hashPassword(plain) {
  return bcrypt.hash(String(plain), BCRYPT_ROUNDS);
}

function verifyPassword(plain, hash) {
  return bcrypt.compare(String(plain), hash);
}

function generateToken(user) {
  const payload = {
    id: user.id,
    corretora_id: user.corretora_id,
    tokenVersion: user.token_version ?? 0,
    scope: "corretora",
  };
  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
  });
}

// TTL curto para impersonação — 30 minutos é suficiente para uma
// sessão de suporte e limita o raio se o cookie vazar.
const IMPERSONATION_JWT_EXPIRES_IN = "30m";
const IMPERSONATION_COOKIE_MAX_AGE_MS = 30 * 60 * 1000;

/**
 * Gera JWT de impersonação: admin agindo como usuário de corretora.
 * Carrega a claim `impersonation` com snapshot do admin — o middleware
 * propaga para req.corretoraUser.impersonation, permitindo:
 *   - exibir banner persistente "Você está como X" no painel
 *   - auditar ações tomadas durante a janela como impersonadas
 *   - bloquear a rota de impersonate-exit para sessões não-impersonadas
 * Importante: usa o tokenVersion REAL do user (não incrementa). Assim
 * a sessão original do corretora_user continua válida em paralelo e
 * não é invalidada quando o admin entra/sai.
 */
function generateImpersonationToken(user, { adminId, adminNome }) {
  const payload = {
    id: user.id,
    corretora_id: user.corretora_id,
    tokenVersion: user.token_version ?? 0,
    scope: "corretora",
    impersonation: {
      admin_id: adminId,
      admin_nome: adminNome || null,
      started_at: new Date().toISOString(),
    },
  };
  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: IMPERSONATION_JWT_EXPIRES_IN,
  });
}

async function findUserByEmail(email) {
  return usersRepo.findByEmail(email);
}

async function findUserById(id) {
  return usersRepo.findById(id);
}

async function updateLastLogin(id) {
  return usersRepo.updateLastLogin(id);
}

async function incrementTokenVersion(id) {
  return usersRepo.incrementTokenVersion(id);
}

/**
 * Detecta se um usuário está em estado "primeiro acesso pendente".
 * Single source of truth para essa checagem — usada no login e nas
 * respostas admin.
 */
function isPendingFirstAccess(user) {
  return !!user && (user.password_hash === null || user.password_hash === undefined);
}

/**
 * Fluxo de convite de primeiro acesso. Substitui o antigo
 * createFirstUserForCorretora (que exigia senha em texto).
 *
 * Comportamento:
 *
 *   - Corretora inexistente → 404
 *   - Corretora inativa → 400
 *   - Nenhum usuário ainda → cria um novo em estado pendente
 *     (password_hash NULL) + gera token + envia e-mail
 *   - Usuário existe e está pendente → atualiza nome/e-mail se
 *     mudaram + revoga tokens antigos + gera novo token + reenvia
 *     e-mail (fluxo "reenviar convite")
 *   - Usuário existe e já tem senha → 409 com guidance para usar
 *     o fluxo de reset de senha em vez de convite
 *
 * Regra atual: máximo 1 usuário por corretora. A tabela permite N.
 * Para suportar N, basta remover a restrição de unicidade por
 * corretora nesse service.
 */
async function inviteCorretoraUser(corretoraId, { nome, email }, { adminId } = {}) {
  // Pré-checagens (leituras) fora da transação
  const corretora = await adminRepo.findById(corretoraId);
  if (!corretora) {
    throw new AppError("Corretora não encontrada.", ERROR_CODES.NOT_FOUND, 404);
  }
  if (corretora.status !== "active") {
    throw new AppError(
      "Apenas corretoras ativas podem receber convite.",
      ERROR_CODES.VALIDATION_ERROR,
      400
    );
  }

  const token = resetTokens.generateToken();
  const expiresAt = new Date(Date.now() + INVITE_TOKEN_TTL_MS);

  // Transação: (criar/atualizar user pendente) + (revogar tokens anteriores)
  // + (gravar novo token) precisam ser atômicos. Se o INSERT do token
  // falhar após o INSERT do user, rollback deixa base limpa em vez de
  // user órfão sem token.
  const txResult = await withTransaction(async (conn) => {
    const existingForCorretora = await usersRepo.findByCorretoraId(
      corretoraId,
      conn
    );

    let userId;
    let resent = false;

    if (existingForCorretora) {
      if (!isPendingFirstAccess(existingForCorretora)) {
        throw new AppError(
          "Esta corretora já possui conta ativa. Use 'Resetar senha' para enviar um link de redefinição.",
          ERROR_CODES.CONFLICT,
          409
        );
      }

      if (existingForCorretora.email !== email) {
        const emailOwner = await usersRepo.findByEmail(email, conn);
        if (emailOwner && emailOwner.id !== existingForCorretora.id) {
          throw new AppError(
            "Já existe um usuário com este e-mail.",
            ERROR_CODES.CONFLICT,
            409
          );
        }
      }

      if (
        existingForCorretora.email !== email ||
        existingForCorretora.nome !== nome
      ) {
        await usersRepo.updateContactFields(
          existingForCorretora.id,
          { nome, email },
          conn
        );
      }

      userId = existingForCorretora.id;
      resent = true;
    } else {
      const emailOwner = await usersRepo.findByEmail(email, conn);
      if (emailOwner) {
        throw new AppError(
          "Já existe um usuário com este e-mail.",
          ERROR_CODES.CONFLICT,
          409
        );
      }
      // Harmoniza com a checagem do painel da corretora (enforceUserLimit
      // em routes/corretoraPanel/corretoraTeam.js). Antes desta sprint, o
      // admin podia estourar o max_users que o painel já respeitava.
      // countByCorretoraId roda no pool (não recebe conn); a janela de
      // race para dois admins convidarem simultaneamente é aceitável —
      // cenário raríssimo e divergência máxima é +1 acima do limite.
      const planCtx = await planService.getPlanContext(corretoraId);
      const maxUsers = planCtx.capabilities.max_users ?? 1;
      const currentCount = await usersRepo.countByCorretoraId(corretoraId);
      if (currentCount + 1 > maxUsers) {
        throw new AppError(
          `O plano atual (${planCtx.plan.name}) permite até ${maxUsers} usuário${maxUsers > 1 ? "s" : ""}. Faça upgrade antes de convidar mais membros.`,
          ERROR_CODES.FORBIDDEN,
          403,
          { capability: "max_users", current: currentCount, max: maxUsers },
        );
      }
      userId = await usersRepo.createPending(
        { corretora_id: corretoraId, nome, email },
        conn
      );
    }

    await resetTokens.revokeAllForUser(userId, RESET_TOKEN_SCOPE, conn);
    await resetTokens.storeToken(
      userId,
      token,
      expiresAt,
      RESET_TOKEN_SCOPE,
      conn
    );

    return { userId, resent };
  });

  // Envio de email FORA da transação — email não pode ser desfeito.
  try {
    await mailService.sendCorretoraInviteEmail(email, token, corretora.name);
  } catch (err) {
    logger.error(
      { err, corretoraId, userId: txResult.userId, email },
      "corretora.invite.email_failed"
    );
    throw new AppError(
      "Não foi possível enviar o e-mail de convite agora. Tente novamente em instantes.",
      ERROR_CODES.SERVER_ERROR,
      503
    );
  }

  logger.info(
    {
      adminId: adminId ?? null,
      corretoraId,
      userId: txResult.userId,
      email,
      resent: txResult.resent,
    },
    "corretora.invite.sent"
  );

  return {
    id: txResult.userId,
    corretora_id: corretoraId,
    nome,
    email,
    resent: txResult.resent,
    status: "invite_sent",
  };
}

module.exports = {
  hashPassword,
  verifyPassword,
  generateToken,
  generateImpersonationToken,
  IMPERSONATION_COOKIE_MAX_AGE_MS,
  findUserByEmail,
  findUserById,
  updateLastLogin,
  incrementTokenVersion,
  inviteCorretoraUser,
  isPendingFirstAccess,
  COOKIE_MAX_AGE_MS,
};
