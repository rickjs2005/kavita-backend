// middleware/verifyAdmin.js
const jwt = require("jsonwebtoken");
const pool = require("../config/pool");
const AppError = require("../errors/AppError");
const ERROR_CODES = require("../constants/ErrorCodes");
const redis = require("../lib/redis");

const SECRET_KEY = process.env.JWT_SECRET;

// Permission cache TTL: 60 s — curto o suficiente para que mudanças de role
// propaguem rapidamente sem sacrificar a redução de queries ao banco.
const PERM_CACHE_TTL_SEC = 60;

function permCacheKey(adminId, tokenVersion) {
  return `admin:perm:${adminId}:${tokenVersion}`;
}

/**
 * Busca o admin no banco (incluindo role_id via admin_roles).
 */
async function findAdminById(adminId) {
  const [rows] = await pool.query(
    `
      SELECT
        a.id,
        a.nome,
        a.email,
        a.role,
        a.ativo,
        a.tokenVersion,
        r.id AS role_id
      FROM admins a
      LEFT JOIN admin_roles r
        ON r.slug = a.role
      WHERE a.id = ?
    `,
    [adminId]
  );

  return rows[0] || null;
}

/**
 * Carrega as permissões do admin com base no role.
 * Usa cache Redis quando disponível (TTL: 60 s).
 */
async function getAdminPermissions(adminId, tokenVersion) {
  if (!adminId) return [];

  const cacheKey = permCacheKey(adminId, tokenVersion ?? 0);

  // Tenta ler do cache Redis
  if (redis.ready) {
    try {
      const cached = await redis.client.get(cacheKey);
      if (cached !== null) {
        return JSON.parse(cached);
      }
    } catch {
      // Cache miss — segue para o banco
    }
  }

  const [rows] = await pool.query(
    `
      SELECT DISTINCT p.chave
      FROM admins a
      JOIN admin_roles r
        ON r.slug = a.role
      JOIN admin_role_permissions rp
        ON rp.role_id = r.id
      JOIN admin_permissions p
        ON p.id = rp.permission_id
      WHERE a.id = ?
    `,
    [adminId]
  );

  const permissions = rows.map((r) => r.chave);

  // Armazena no Redis (fire-and-forget — não derruba o request se falhar)
  if (redis.ready) {
    redis.client
      .set(cacheKey, JSON.stringify(permissions), "EX", PERM_CACHE_TTL_SEC)
      .catch(() => {});
  }

  return permissions;
}

/**
 * Middleware de autenticação/autorização do admin.
 */
async function verifyAdmin(req, _res, next) {
  if (!SECRET_KEY) {
    console.error("JWT_SECRET não definido no .env");
    return next(
      new AppError(
        "Erro de configuração de autenticação.",
        ERROR_CODES.SERVER_ERROR,
        500
      )
    );
  }

  let token = null;

  // Cookie HttpOnly only — Bearer tokens are not accepted
  if (req.cookies?.adminToken) {
    token = req.cookies.adminToken;
  }

  if (!token) {
    return next(
      new AppError(
        "Token não fornecido.",
        ERROR_CODES.AUTH_ERROR,
        401
      )
    );
  }

  let decoded;
  try {
    decoded = jwt.verify(token, SECRET_KEY);
  } catch (err) {
    console.warn("verifyAdmin: token inválido:", err.message);
    return next(
      new AppError(
        "Token inválido ou expirado.",
        ERROR_CODES.AUTH_ERROR,
        401
      )
    );
  }

  try {
    const admin = await findAdminById(decoded.id);

    if (!admin) {
      return next(
        new AppError(
          "Admin não encontrado.",
          ERROR_CODES.AUTH_ERROR,
          401
        )
      );
    }

    if (typeof admin.ativo !== "undefined" && admin.ativo === 0) {
      return next(
        new AppError(
          "Admin inativo.",
          ERROR_CODES.AUTH_ERROR,
          401
        )
      );
    }

    // Validate tokenVersion for logout revocation support.
    // Tratar null como 0 — sem esse fallback, admins pré-migração com
    // tokenVersion NULL no banco ignoram a verificação de revogação.
    const dbVersion = admin.tokenVersion ?? 0;
    const jwtVersion = decoded.tokenVersion ?? 0;
    if (jwtVersion !== dbVersion) {
      return next(
        new AppError(
          "Sessão inválida. Faça login novamente.",
          ERROR_CODES.AUTH_ERROR,
          401
        )
      );
    }

    const dbPermissions = await getAdminPermissions(admin.id, dbVersion);

    req.admin = {
      id: admin.id,
      email: admin.email,
      nome: admin.nome,
      role: admin.role,
      role_id: admin.role_id ?? null,
      // Permissões SEMPRE vêm do banco (ou cache Redis) — nunca do JWT.
      permissions: Array.isArray(dbPermissions) ? dbPermissions : [],
    };

    return next();
  } catch (err) {
    console.error("Erro ao validar admin no banco:", err.message);
    return next(
      new AppError(
        "Erro ao validar admin no banco.",
        ERROR_CODES.SERVER_ERROR,
        500
      )
    );
  }
}

module.exports = verifyAdmin;
