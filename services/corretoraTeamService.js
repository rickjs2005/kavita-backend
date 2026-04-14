// services/corretoraTeamService.js
//
// Gestão de equipe dentro da corretora: convite de novos usuários,
// mudança de role, desativação. Reuso do fluxo de convite já
// existente (password_reset_tokens scope corretora_user).
"use strict";

const AppError = require("../errors/AppError");
const ERROR_CODES = require("../constants/ErrorCodes");
const usersRepo = require("../repositories/corretoraUsersRepository");
const tokenService = require("./passwordResetTokenService");
const adminCorretorasRepo = require("../repositories/corretorasAdminRepository");
const mailService = require("./mailService");
const { ROLES } = require("../lib/corretoraPermissions");
const logger = require("../lib/logger");

const INVITE_TTL_DAYS = 7;

/** Lista toda a equipe da corretora do usuário autenticado. */
async function listTeam(corretoraId) {
  return usersRepo.listTeamByCorretoraId(corretoraId);
}

/**
 * Convida um novo usuário para a equipe. Cria user pendente (sem
 * senha) e envia e-mail com link de primeiro acesso.
 */
async function inviteMember({ corretoraId, nome, email, role, invitedBy }) {
  if (!ROLES.includes(role)) {
    throw new AppError(
      "Role inválida.",
      ERROR_CODES.VALIDATION_ERROR,
      400,
    );
  }

  const normalizedEmail = String(email).trim().toLowerCase();

  // Evita duplicata por e-mail (unique no DB, mas retorna mensagem boa).
  const existing = await usersRepo.findByEmail(normalizedEmail);
  if (existing) {
    throw new AppError(
      existing.corretora_id === corretoraId
        ? "Este e-mail já faz parte da equipe."
        : "Este e-mail já está vinculado a outra corretora.",
      ERROR_CODES.CONFLICT,
      409,
    );
  }

  const userId = await usersRepo.createPending({
    corretora_id: corretoraId,
    nome: String(nome).trim(),
    email: normalizedEmail,
    role,
  });

  // Token de primeiro acesso (mesmo scope do fluxo do admin).
  const token = tokenService.generateToken();
  const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);
  await tokenService.storeToken(userId, token, expiresAt, "corretora_user");

  const corretora = await adminCorretorasRepo.findById(corretoraId);
  await sendTeamInviteEmail({
    email: normalizedEmail,
    nome,
    corretoraNome: corretora?.name ?? "sua corretora",
    role,
    token,
  });

  logger.info(
    {
      corretoraId,
      invitedUserId: userId,
      invitedBy,
      role,
    },
    "corretora.team.invited",
  );

  return { id: userId, email: normalizedEmail, role };
}

async function changeRole({ corretoraId, userId, newRole, actorId }) {
  if (!ROLES.includes(newRole)) {
    throw new AppError("Role inválida.", ERROR_CODES.VALIDATION_ERROR, 400);
  }

  const target = await usersRepo.findByIdInCorretora(userId, corretoraId);
  if (!target) {
    throw new AppError("Usuário não encontrado.", ERROR_CODES.NOT_FOUND, 404);
  }

  // Guard — não rebaixar o último owner ativo.
  if (target.role === "owner" && newRole !== "owner") {
    const owners = await usersRepo.countOwnersByCorretoraId(corretoraId);
    if (owners <= 1) {
      throw new AppError(
        "Não é possível rebaixar o último dono da corretora.",
        ERROR_CODES.CONFLICT,
        409,
      );
    }
  }

  const affected = await usersRepo.updateRole(userId, corretoraId, newRole);
  if (affected === 0) {
    throw new AppError(
      "Nada para atualizar.",
      ERROR_CODES.VALIDATION_ERROR,
      400,
    );
  }

  logger.info(
    {
      corretoraId,
      targetUserId: userId,
      fromRole: target.role,
      toRole: newRole,
      actorId,
    },
    "corretora.team.role_changed",
  );

  return { id: userId, role: newRole };
}

async function removeMember({ corretoraId, userId, actorId }) {
  if (userId === actorId) {
    throw new AppError(
      "Você não pode remover a si mesmo.",
      ERROR_CODES.CONFLICT,
      409,
    );
  }

  const target = await usersRepo.findByIdInCorretora(userId, corretoraId);
  if (!target) {
    throw new AppError("Usuário não encontrado.", ERROR_CODES.NOT_FOUND, 404);
  }

  // Guard — nunca remover o último owner ativo.
  if (target.role === "owner") {
    const owners = await usersRepo.countOwnersByCorretoraId(corretoraId);
    if (owners <= 1) {
      throw new AppError(
        "Não é possível remover o último dono da corretora.",
        ERROR_CODES.CONFLICT,
        409,
      );
    }
  }

  const affected = await usersRepo.deactivate(userId, corretoraId);
  if (affected === 0) {
    throw new AppError(
      "Erro ao remover usuário.",
      ERROR_CODES.SERVER_ERROR,
      500,
    );
  }

  logger.info(
    { corretoraId, removedUserId: userId, actorId },
    "corretora.team.removed",
  );

  return { id: userId };
}

// ─── Email ──────────────────────────────────────────────────────────────────

const ROLE_LABELS = {
  owner: "Dono(a)",
  manager: "Gerente",
  sales: "Comercial",
  viewer: "Visualização",
};

async function sendTeamInviteEmail({ email, nome, corretoraNome, role, token }) {
  const appUrl = process.env.APP_URL?.replace(/\/$/, "") || "";
  const link = `${appUrl}/painel/corretora/primeiro-acesso?token=${token}`;
  const roleLabel = ROLE_LABELS[role] ?? role;

  const subject = `Você foi convidado para a equipe da ${corretoraNome} no Kavita`;
  const html = `
    <div style="font-family: system-ui, -apple-system, sans-serif; max-width: 560px;">
      <h2 style="color:#b45309;margin:0 0 12px;">☕ Convite de equipe · Kavita</h2>
      <p>Olá ${escapeHtml(nome)},</p>
      <p>Você foi convidado(a) para fazer parte da equipe da
         <strong>${escapeHtml(corretoraNome)}</strong> no Mercado do Café
         com o perfil de <strong>${escapeHtml(roleLabel)}</strong>.</p>
      <p>Para ativar sua conta, defina sua senha no link abaixo:</p>
      <p>
        <a href="${link}" style="display:inline-block;background:#b45309;color:white;
                  padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:600;">
          Ativar minha conta
        </a>
      </p>
      <p style="color:#71717a;font-size:12px;">
        O link expira em ${INVITE_TTL_DAYS} dias. Se não reconhece este convite,
        pode ignorar este e-mail.
      </p>
      <p style="color:#71717a;font-size:12px;margin-top:24px;">Kavita · Mercado do Café</p>
    </div>
  `;
  const text = [
    `Convite de equipe — ${corretoraNome}`,
    ``,
    `Você foi convidado para a equipe com perfil: ${roleLabel}.`,
    `Ativar conta: ${link}`,
    `O link expira em ${INVITE_TTL_DAYS} dias.`,
  ].join("\n");

  await mailService.sendTransactionalEmail(email, subject, html, text);
}

function escapeHtml(str) {
  if (str == null) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

module.exports = {
  listTeam,
  inviteMember,
  changeRole,
  removeMember,
};
