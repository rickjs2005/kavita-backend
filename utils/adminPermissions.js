const pool = require("../config/pool");

/**
 * Retorna um array de strings com as permissões do admin
 * ex: ['produtos.ver', 'produtos.editar', 'pedidos.ver']
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

module.exports = {
  getAdminPermissions,
};
