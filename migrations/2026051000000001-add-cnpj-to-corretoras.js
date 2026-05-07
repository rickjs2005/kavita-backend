"use strict";

// Adiciona campo cnpj na tabela corretoras + denormaliza alguns
// snapshots curtos do KYC pra acesso rápido. Migration backwards-
// compatible: corretoras existentes ficam com cnpj NULL e kyc_status
// preservado (Fase 10.2 ja' marcou todas como 'verified').
//
// Por que denormalizar:
//   - cnpj precisa ser UNIQUE — nao da' pra fazer index UNIQUE em
//     corretora_kyc.cnpj porque a tabela permite snapshot historico
//     futuro. Em corretoras, e' UNIQUE strict (1 CNPJ = 1 conta).
//   - filtros admin "buscar por CNPJ" ficam triviais sem JOIN.
//   - card publico exibir "CNPJ verificado" e' barato (1 query).
//   - corretora_kyc continua sendo o snapshot OFICIAL (com qsa,
//     endereco, raw_response). Aqui guardamos so' o minimo.
//
// Sincronizacao:
//   - quando admin/corretora dispara verifyCnpj, kycService grava
//     em corretora_kyc E atualiza corretoras.cnpj/razao_social/
//     nome_fantasia/cnpj_verified_at em transacao.

module.exports = {
  async up(queryInterface, Sequelize) {
    // CNPJ normalizado (14 digitos sem mascara). UNIQUE pra evitar
    // duas contas para a mesma empresa. Nullable pra preservar
    // corretoras antigas grandfathered.
    await queryInterface.addColumn("corretoras", "cnpj", {
      type: Sequelize.CHAR(14),
      allowNull: true,
    });

    await queryInterface.addColumn("corretoras", "razao_social", {
      type: Sequelize.STRING(255),
      allowNull: true,
    });

    await queryInterface.addColumn("corretoras", "nome_fantasia", {
      type: Sequelize.STRING(255),
      allowNull: true,
    });

    await queryInterface.addColumn("corretoras", "cnpj_verified_at", {
      type: Sequelize.DATE,
      allowNull: true,
    });

    // Status enxuto pra UI (corretora_kyc.provider + verified_at sao'
    // mais ricos, mas ler 'verified' direto e' mais rapido).
    //   not_informed: nunca foi setado
    //   pending:      corretora informou, mas verificacao falhou ou
    //                 ainda nao rodou (admin pode reapertar)
    //   verified:     consulta retornou ATIVA com sucesso
    //   invalid:      provider devolveu CNPJ invalido / nao existe
    //   error:        falha tecnica na consulta (timeout/api off)
    await queryInterface.addColumn(
      "corretoras",
      "cnpj_verification_status",
      {
        type: Sequelize.ENUM(
          "not_informed",
          "pending",
          "verified",
          "invalid",
          "error",
        ),
        allowNull: false,
        defaultValue: "not_informed",
      },
    );

    // Index UNIQUE com WHERE cnpj IS NOT NULL nao e' suportado em
    // MySQL 5.7. Workaround: index UNIQUE simples permite multiplos
    // NULLs (comportamento padrao MySQL — diferente de Postgres).
    // Validamos NO BACKEND que CNPJ esta normalizado (so digitos)
    // antes de gravar — assim nunca temos string vazia conflitando.
    await queryInterface.sequelize.query(
      "CREATE UNIQUE INDEX uq_corretoras_cnpj ON corretoras(cnpj)",
    );

    // Backfill: corretoras grandfathered com kyc_status='verified'
    // permanecem assim. Se ja existe corretora_kyc com cnpj para
    // alguma delas, copia para a coluna nova.
    await queryInterface.sequelize.query(
      `UPDATE corretoras c
         INNER JOIN corretora_kyc k ON k.corretora_id = c.id
            SET c.cnpj = k.cnpj,
                c.razao_social = k.razao_social,
                c.cnpj_verified_at = k.verified_at,
                c.cnpj_verification_status = CASE
                  WHEN k.verified_at IS NOT NULL THEN 'verified'
                  ELSE 'pending'
                END
          WHERE k.cnpj IS NOT NULL
            AND c.cnpj IS NULL`,
    );
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      "DROP INDEX uq_corretoras_cnpj ON corretoras",
    );
    await queryInterface.removeColumn("corretoras", "cnpj_verification_status");
    await queryInterface.removeColumn("corretoras", "cnpj_verified_at");
    await queryInterface.removeColumn("corretoras", "nome_fantasia");
    await queryInterface.removeColumn("corretoras", "razao_social");
    await queryInterface.removeColumn("corretoras", "cnpj");
  },
};
