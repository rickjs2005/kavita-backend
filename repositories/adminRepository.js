// repositories/adminRepository.js
//
// Acesso a dados da tabela `admins` e tabelas relacionadas.
// Usado por: services/authAdminService.js
//
// Convenção: funções retornam null quando não encontrado (findBy*),
// ou void/undefined para mutations (update*, increment*).
// Erros de query propagam sem tratamento — o service decide a política.

const pool = require("../config/pool");

/**
 * Busca admin pelo email, incluindo role_id e campos de MFA.
 * Usado no fluxo de login.
 */
async function findAdminByEmail(email) {
  const [rows] = await pool.query(
    `SELECT
       a.id,
       a.nome,
       a.email,
       a.senha,
       a.role,
       a.ativo,
       a.mfa_secret,
       a.mfa_active,
       a.tokenVersion,
       r.id AS role_id
     FROM admins a
     LEFT JOIN admin_roles r ON r.slug = a.role
     WHERE a.email = ?`,
    [email]
  );
  return rows[0] ?? null;
}

/**
 * Busca admin pelo ID.
 * Usado no middleware verifyAdmin e no fluxo pós-MFA.
 */
async function findAdminById(id) {
  const [rows] = await pool.query(
    `SELECT
       a.id,
       a.nome,
       a.email,
       a.role,
       a.ativo,
       a.tokenVersion,
       r.id AS role_id
     FROM admins a
     LEFT JOIN admin_roles r ON r.slug = a.role
     WHERE a.id = ?`,
    [id]
  );
  return rows[0] ?? null;
}

/**
 * Retorna a lista de chaves de permissão do admin.
 * Chamado por authAdminService.getAdminPermissions após cache miss no Redis.
 */
async function findAdminPermissions(adminId) {
  const [rows] = await pool.query(
    `SELECT DISTINCT p.chave
     FROM admins a
     JOIN admin_roles r ON r.slug = a.role
     JOIN admin_role_permissions rp ON rp.role_id = r.id
     JOIN admin_permissions p ON p.id = rp.permission_id
     WHERE a.id = ?`,
    [adminId]
  );
  return rows.map((r) => r.chave);
}

/**
 * Atualiza o timestamp de último login do admin.
 * Chamado como fire-and-forget — erros tratados no service.
 */
async function updateLastLogin(adminId) {
  await pool.query(
    "UPDATE admins SET ultimo_login = NOW() WHERE id = ?",
    [adminId]
  );
}

/**
 * Incrementa o tokenVersion do admin, invalidando todos os tokens ativos.
 * Chamado no logout.
 */
async function incrementTokenVersion(adminId) {
  await pool.query(
    "UPDATE admins SET tokenVersion = COALESCE(tokenVersion, 0) + 1 WHERE id = ?",
    [adminId]
  );
}

/* ---- F1 — 2FA admin -------------------------------------------------- */

/**
 * Busca admin por id incluindo campos de MFA. Diferente de findAdminById,
 * retorna mfa_secret e mfa_active (sensíveis — usar apenas no fluxo de
 * setup/confirm/disable do TOTP).
 */
async function findAdminWithMfaById(adminId) {
  const [rows] = await pool.query(
    `SELECT id, nome, email, role, ativo, mfa_secret, mfa_active, tokenVersion
       FROM admins
      WHERE id = ?`,
    [adminId]
  );
  return rows[0] ?? null;
}

/**
 * Atualiza o secret TOTP do admin. mfa_active permanece 0 — só vira 1
 * em enableMfa após confirmação do primeiro código.
 */
async function setMfaSecret(adminId, secretBase32) {
  await pool.query(
    "UPDATE admins SET mfa_secret = ?, mfa_active = 0 WHERE id = ?",
    [secretBase32, adminId]
  );
}

/**
 * Liga 2FA. Pré-condição: mfa_secret populado e código confirmado pelo
 * service. Não toca tokenVersion — a sessão atual permanece válida.
 */
async function enableMfa(adminId) {
  await pool.query(
    "UPDATE admins SET mfa_active = 1 WHERE id = ?",
    [adminId]
  );
}

/**
 * Desliga 2FA — limpa secret + zera flag. Caller (service) também deve
 * apagar backup codes e bumpar tokenVersion.
 */
async function disableMfa(adminId) {
  await pool.query(
    "UPDATE admins SET mfa_secret = NULL, mfa_active = 0 WHERE id = ?",
    [adminId]
  );
}

module.exports = {
  findAdminByEmail,
  findAdminById,
  findAdminPermissions,
  updateLastLogin,
  incrementTokenVersion,
  // F1 — 2FA admin
  findAdminWithMfaById,
  setMfaSecret,
  enableMfa,
  disableMfa,
};
