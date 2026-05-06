"use strict";

// Canal interno de mensagens corretora <-> admin (curadoria Kavita).
//
// Substitui a abordagem mailto/whatsapp porque:
//   - Mensagem fica registrada no banco (auditavel, pesquisavel).
//   - Admin ve direto no painel sem trocar de ferramenta.
//   - Resposta volta pra corretora dentro da Sala Reservada,
//     fechando o loop sem depender de canal externo.
//
// Modelo simples: thread implicita por corretora (todas as mensagens
// de uma corretora formam uma conversa cronologica). Sem subject,
// sem multiplas threads — se precisar evoluir depois, adicionamos
// thread_id sem migrar dados.
//
// sender_type discrimina quem enviou. sender_id e o id de quem enviou
// no contexto do tipo (corretora_users.id ou admin_users.id) — sem
// FK rigida porque apagar usuario nao deve apagar a auditoria.

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("corretora_support_messages", {
      id: {
        type: Sequelize.INTEGER.UNSIGNED,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
      },
      corretora_id: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false,
        references: { model: "corretoras", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      // 'corretora' = enviado por usuario da corretora
      // 'admin'     = enviado por admin Kavita (resposta)
      sender_type: {
        type: Sequelize.ENUM("corretora", "admin"),
        allowNull: false,
      },
      // id de quem enviou no escopo do tipo. Sem FK para preservar
      // historico mesmo se usuario for desativado/removido.
      sender_id: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: true,
      },
      // Nome cacheado do remetente no momento do envio. Evita JOIN
      // toda vez que UI lista mensagens e preserva auditoria caso
      // perfil mude depois.
      sender_name: {
        type: Sequelize.STRING(150),
        allowNull: true,
      },
      body: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      // Quando foi lido pela contraparte. Para mensagens da corretora,
      // marcado quando admin abre o thread; para mensagens do admin,
      // marcado quando corretora carrega /api/corretora/support/messages.
      // NULL = nao lida.
      read_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },
    });

    await queryInterface.addIndex(
      "corretora_support_messages",
      ["corretora_id", "created_at"],
      { name: "idx_corretora_support_msgs_corretora_created" },
    );
    // Util para o admin priorizar threads com mensagens nao lidas
    // (sender_type='corretora' AND read_at IS NULL).
    await queryInterface.addIndex(
      "corretora_support_messages",
      ["sender_type", "read_at"],
      { name: "idx_corretora_support_msgs_unread" },
    );
  },

  async down(queryInterface) {
    await queryInterface.dropTable("corretora_support_messages");
  },
};
