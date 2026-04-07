"use strict";

module.exports = {
  async up(queryInterface) {
    // Insert the mercado_cafe_manage permission
    await queryInterface.sequelize.query(`
      INSERT INTO admin_permissions (chave, grupo, descricao)
      VALUES ('mercado_cafe_manage', 'mercado_cafe', 'Gerenciar corretoras e solicitações do Mercado do Café')
      ON DUPLICATE KEY UPDATE descricao = VALUES(descricao)
    `);

    // Grant permission to super-admin role (is_system=1)
    await queryInterface.sequelize.query(`
      INSERT IGNORE INTO admin_role_permissions (role_id, permission_id)
      SELECT r.id, p.id
      FROM admin_roles r, admin_permissions p
      WHERE r.slug = 'super-admin' AND p.chave = 'mercado_cafe_manage'
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      DELETE rp FROM admin_role_permissions rp
      INNER JOIN admin_permissions p ON rp.permission_id = p.id
      WHERE p.chave = 'mercado_cafe_manage'
    `);
    await queryInterface.sequelize.query(`
      DELETE FROM admin_permissions WHERE chave = 'mercado_cafe_manage'
    `);
  },
};
