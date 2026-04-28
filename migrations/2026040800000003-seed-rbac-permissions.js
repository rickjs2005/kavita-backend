"use strict";

/**
 * Seed required permissions for role-based access control.
 *
 * These permissions are already referenced by requirePermission() in routes
 * but were missing from the database, causing 403 for non-master admins.
 *
 * Idempotent: ON DUPLICATE KEY UPDATE + INSERT IGNORE.
 */

const PERMISSIONS = [
  { chave: "pedidos.ver",     grupo: "pedidos",    descricao: "Visualizar pedidos" },
  { chave: "relatorios.ver",  grupo: "relatorios", descricao: "Visualizar relatorios" },
  { chave: "config.editar",   grupo: "config",     descricao: "Editar configuracoes da loja" },
  { chave: "usuarios.ver",    grupo: "usuarios",   descricao: "Visualizar usuarios do sistema" },
  { chave: "roles_manage",    grupo: "sistema",    descricao: "Gerenciar roles e permissoes" },
];

module.exports = {
  async up(queryInterface) {
    // 1. Insert permissions (idempotent via ON DUPLICATE KEY UPDATE)
    for (const perm of PERMISSIONS) {
      await queryInterface.sequelize.query(
        `INSERT INTO admin_permissions (chave, grupo, descricao)
         VALUES (:chave, :grupo, :descricao)
         ON DUPLICATE KEY UPDATE descricao = VALUES(descricao)`,
        { replacements: perm }
      );
    }

    // 2. Grant all permissions to the "super-admin" role (if it exists)
    //    INSERT IGNORE prevents duplicates if already linked.
    const chaves = PERMISSIONS.map((p) => p.chave);
    await queryInterface.sequelize.query(
      `INSERT IGNORE INTO admin_role_permissions (role_id, permission_id)
       SELECT r.id, p.id
       FROM admin_roles r
       CROSS JOIN admin_permissions p
       WHERE r.slug = 'super-admin'
         AND p.chave IN (:chaves)`,
      { replacements: { chaves } }
    );
  },

  async down(queryInterface) {
    const chaves = PERMISSIONS.map((p) => p.chave);

    // Remove role-permission links first (FK constraint)
    await queryInterface.sequelize.query(
      `DELETE rp FROM admin_role_permissions rp
       INNER JOIN admin_permissions p ON rp.permission_id = p.id
       WHERE p.chave IN (:chaves)`,
      { replacements: { chaves } }
    );

    // Remove permissions
    await queryInterface.sequelize.query(
      "DELETE FROM admin_permissions WHERE chave IN (:chaves)",
      { replacements: { chaves } }
    );
  },
};
