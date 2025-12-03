const jwt = require("jsonwebtoken");
const pool = require("../config/pool");

const SECRET_KEY = process.env.JWT_SECRET;
if (!SECRET_KEY) {
  throw new Error("❌ JWT_SECRET não definido no .env");
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
 * Middleware de autenticação/autorizarção para rotas admin.
 *
 * - Lê o token (Authorization: Bearer ou cookie adminToken)
 * - Decodifica o JWT => decoded (id, email, role, role_id, permissions)
 * - Revalida o admin no banco (existência e ativo)
 * - Recalcula permissões atuais
 * - Injeta req.admin com:
 *    { id, email, nome, role, role_id, permissions, ...payloadDoToken }
 */
async function verifyAdmin(req, res, next) {
  const authHeader = req.headers.authorization || "";
  let token = null;

  if (authHeader.startsWith("Bearer ")) {
    token = authHeader.slice(7);
  }

  // fallback: cookie
  if (!token && req.cookies?.adminToken) {
    token = req.cookies.adminToken;
  }

  if (!token) {
    return res.status(401).json({ message: "Token não fornecido" });
  }

  let decoded;
  try {
    decoded = jwt.verify(token, SECRET_KEY); // { id, email, role, role_id?, permissions? }
  } catch (err) {
    console.warn("verifyAdmin: token inválido:", err.message);
    return res.status(401).json({ message: "Token inválido ou expirado" });
  }

  try {
    // Revalida o admin no banco e garante dados frescos
    const admin = await findAdminById(decoded.id);

    if (!admin) {
      return res.status(401).json({ message: "Admin não encontrado." });
    }

    // Se a coluna ativo existir e for 0, bloqueia
    if (typeof admin.ativo !== "undefined" && admin.ativo === 0) {
      return res.status(401).json({ message: "Admin inativo." });
    }

    // Permissões "oficiais" vindas do banco
    const dbPermissions = await getAdminPermissions(admin.id);

    // Começa pelo payload do token (como você descreveu)
    const baseFromToken = { ...decoded };

    // Monta o objeto final do admin na request
    req.admin = {
      // tudo que estava no token vem primeiro
      ...baseFromToken,

      // mas garantimos dados frescos do banco (override)
      id: admin.id,
      email: admin.email,
      nome: admin.nome,
      role: admin.role,
      role_id:
        admin.role_id != null
          ? admin.role_id
          : baseFromToken.role_id ?? null,

      // permissões oficiais do banco têm prioridade;
      // se der algum problema, usa as do token como fallback
      permissions:
        (dbPermissions && dbPermissions.length > 0
          ? dbPermissions
          : Array.isArray(baseFromToken.permissions)
          ? baseFromToken.permissions
          : []),
    };

    return next();
  } catch (err) {
    console.error("Erro ao validar admin no banco:", err.message);
    return res
      .status(500)
      .json({ message: "Erro ao validar admin no banco." });
  }
}

module.exports = verifyAdmin;
