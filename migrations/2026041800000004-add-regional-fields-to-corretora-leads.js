"use strict";

// Fase 2 — campos regionais adicionais no lead público.
//
// Captura sinais que a corretora regional da Zona da Mata precisa
// para qualificar o contato sem precisar abrir WhatsApp no escuro:
//   - possui_amostra: logística de buscar/receber café
//   - possui_laudo: se já há classificação formal (SCA/cooperativa)
//   - bebida_percebida: estimativa do produtor (sem auth SCA)
//   - preco_esperado_saca: balizamento comercial
//   - urgencia: priorização na fila da corretora
//   - observacoes: texto livre extra, separado de `mensagem` pra não
//     sobrescrever o campo original (mensagem é "fale com a corretora";
//     observacoes é "detalhes técnicos do lote")
//   - consentimento_contato: trilho LGPD — produtor autoriza o contato
//
// Todos allowNull=true: formulário público deve aceitar lead mínimo
// (nome + telefone + consentimento), os demais são qualificadores.

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("corretora_leads", "possui_amostra", {
      type: Sequelize.ENUM("sim", "nao", "vou_colher"),
      allowNull: true,
    });
    await queryInterface.addColumn("corretora_leads", "possui_laudo", {
      type: Sequelize.ENUM("sim", "nao"),
      allowNull: true,
    });
    await queryInterface.addColumn("corretora_leads", "bebida_percebida", {
      type: Sequelize.ENUM("especial", "dura", "riada", "rio", "mole", "nao_sei"),
      allowNull: true,
    });
    await queryInterface.addColumn("corretora_leads", "preco_esperado_saca", {
      type: Sequelize.DECIMAL(10, 2),
      allowNull: true,
    });
    await queryInterface.addColumn("corretora_leads", "urgencia", {
      type: Sequelize.ENUM("hoje", "semana", "mes", "sem_pressa"),
      allowNull: true,
    });
    await queryInterface.addColumn("corretora_leads", "observacoes", {
      type: Sequelize.TEXT,
      allowNull: true,
    });
    await queryInterface.addColumn("corretora_leads", "consentimento_contato", {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("corretora_leads", "possui_amostra");
    await queryInterface.removeColumn("corretora_leads", "possui_laudo");
    await queryInterface.removeColumn("corretora_leads", "bebida_percebida");
    await queryInterface.removeColumn("corretora_leads", "preco_esperado_saca");
    await queryInterface.removeColumn("corretora_leads", "urgencia");
    await queryInterface.removeColumn("corretora_leads", "observacoes");
    await queryInterface.removeColumn("corretora_leads", "consentimento_contato");
  },
};
