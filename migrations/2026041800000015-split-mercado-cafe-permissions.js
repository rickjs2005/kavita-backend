"use strict";

// Bloco 5 — granularidade da permissão do módulo Mercado do Café.
//
// Até hoje havia uma única permissão `mercado_cafe_manage` que cobria
// tudo: aprovar cadastro, moderar review, alterar plano, rodar
// broadcast, reconciliar webhook, ler auditoria. Um estagiário que
// ganhasse essa chave tinha poder financeiro.
//
// Esta migration cria 5 permissões granulares. `mercado_cafe_manage`
// continua existindo como super-permissão temporária (compat): quem
// tem manage é tratado como se tivesse todas as 5. Isso permite
// migrar chamadas de rota sem quebrar nenhum admin já provisionado.
//
// As novas permissões são todas concedidas automaticamente ao
// super-admin. Roles customizadas precisam ser revisadas à mão (há
// uma nota no final para ajudar o operador).

const NEW_PERMISSIONS = [
  {
    chave: "mercado_cafe_view",
    descricao:
      "Ver corretoras, submissões, reviews, planos e métricas (leitura).",
  },
  {
    chave: "mercado_cafe_approve",
    descricao:
      "Aprovar ou rejeitar submissões públicas de corretoras.",
  },
  {
    chave: "mercado_cafe_moderate",
    descricao:
      "Moderar reviews, notas internas e destaque regional.",
  },
  {
    chave: "mercado_cafe_plan_manage",
    descricao:
      "Editar planos, capabilities e executar broadcasts.",
  },
  {
    chave: "mercado_cafe_financial",
    descricao:
      "Atribuir planos a corretoras, reconciliar webhooks e retry de eventos.",
  },
];

module.exports = {
  async up(queryInterface) {
    for (const p of NEW_PERMISSIONS) {
      await queryInterface.sequelize.query(
        `INSERT INTO admin_permissions (chave, grupo, descricao)
         VALUES (?, 'mercado_cafe', ?)
         ON DUPLICATE KEY UPDATE descricao = VALUES(descricao)`,
        { replacements: [p.chave, p.descricao] },
      );

      // Concede a role super-admin — padrão do sistema.
      await queryInterface.sequelize.query(
        `INSERT IGNORE INTO admin_role_permissions (role_id, permission_id)
         SELECT r.id, p.id
           FROM admin_roles r, admin_permissions p
          WHERE r.slug = 'super-admin' AND p.chave = ?`,
        { replacements: [p.chave] },
      );
    }

    // Qualquer role que JÁ tinha `mercado_cafe_manage` recebe as 5
    // novas — preserva comportamento: admin que operava com manage
    // continua operando sem fricção, e pode ter a permissão afinada
    // individualmente depois.
    for (const p of NEW_PERMISSIONS) {
      await queryInterface.sequelize.query(
        `INSERT IGNORE INTO admin_role_permissions (role_id, permission_id)
         SELECT DISTINCT rp.role_id, np.id
           FROM admin_role_permissions rp
           JOIN admin_permissions cp ON cp.id = rp.permission_id
           JOIN admin_permissions np ON np.chave = ?
          WHERE cp.chave = 'mercado_cafe_manage'`,
        { replacements: [p.chave] },
      );
    }
  },

  async down(queryInterface) {
    for (const p of NEW_PERMISSIONS) {
      await queryInterface.sequelize.query(
        `DELETE rp FROM admin_role_permissions rp
          INNER JOIN admin_permissions pe ON rp.permission_id = pe.id
         WHERE pe.chave = ?`,
        { replacements: [p.chave] },
      );
      await queryInterface.sequelize.query(
        `DELETE FROM admin_permissions WHERE chave = ?`,
        { replacements: [p.chave] },
      );
    }
  },
};
