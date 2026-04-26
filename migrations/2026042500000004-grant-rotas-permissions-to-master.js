"use strict";
// Hotfix Fase 5 — grant das permissions de rotas/motoristas pra role 'master'.
//
// A migration original (2026042500000002) inseriu grant pra slug
// 'super-admin' por engano — slug correto no schema atual e' 'master'
// (ver middleware/requirePermission.js: SUPERUSER_ROLES = Set(['master'])).
//
// Resultado: NENHUM admin recebia grant explicito das 4 permissions
// novas. Funcionava acidentalmente para role='master' por causa do
// bypass automatico do SUPERUSER_ROLES — mas qualquer outro role
// (gerente, suporte, etc.) ficava bloqueado mesmo com a intencao
// original de dar acesso ao master.
//
// Esta migration faz o grant correto: master + tambem gerente, ja
// que motoristas/rotas sao operacao de negocio (nao financeiro nem
// administracao do sistema).
//
// Idempotente via INSERT IGNORE.

const NEW_PERMISSIONS = [
  "rotas.view",
  "rotas.moderate",
  "motoristas.view",
  "motoristas.moderate",
];
const ROLES_QUE_RECEBEM = ["master", "gerente"];

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(
      `INSERT IGNORE INTO admin_role_permissions (role_id, permission_id)
       SELECT r.id, p.id
         FROM admin_roles r
         CROSS JOIN admin_permissions p
        WHERE r.slug IN (:roles)
          AND p.chave IN (:perms)`,
      { replacements: { roles: ROLES_QUE_RECEBEM, perms: NEW_PERMISSIONS } },
    );
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      `DELETE rp FROM admin_role_permissions rp
        INNER JOIN admin_permissions p ON rp.permission_id = p.id
        INNER JOIN admin_roles r ON rp.role_id = r.id
        WHERE r.slug IN (:roles)
          AND p.chave IN (:perms)`,
      { replacements: { roles: ROLES_QUE_RECEBEM, perms: NEW_PERMISSIONS } },
    );
  },
};
