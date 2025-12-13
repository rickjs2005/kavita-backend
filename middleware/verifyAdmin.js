// middleware/verifyAdmin.js
const jwt = require("jsonwebtoken");
const pool = require("../config/pool");
const AppError = require("../errors/AppError");
const ERROR_CODES = require("../constants/ErrorCodes");

const SECRET_KEY = process.env.JWT_SECRET;

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
 */
async function getAdminPermissions(adminId) {
  if (!adminId) return [];

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

  return rows.map((r) => r.chave);
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

  // 1) Cookie HttpOnly (prioridade)
  if (req.cookies?.adminToken) {
    token = req.cookies.adminToken;
  }

  // 2) Fallback: Authorization header
  if (!token) {
    const authHeader =
      req.headers.authorization || req.headers["authorization"];
    if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
      token = authHeader.slice(7);
    }
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

    const dbPermissions = await getAdminPermissions(admin.id);

    const baseFromToken = { ...decoded };

    req.admin = {
      ...baseFromToken,
      id: admin.id,
      email: admin.email,
      nome: admin.nome,
      role: admin.role,
      role_id:
        admin.role_id != null
          ? admin.role_id
          : baseFromToken.role_id ?? null,
      permissions:
        dbPermissions && dbPermissions.length > 0
          ? dbPermissions
          : Array.isArray(baseFromToken.permissions)
          ? baseFromToken.permissions
          : [],
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
