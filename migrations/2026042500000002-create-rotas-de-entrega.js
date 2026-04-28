"use strict";

// Modulo Rotas de Entrega — Fase 1 backend (marketplace).
//
// Migration consolidada (uma so' transacao logica, mas roda passo-a-passo
// pra ser idempotente em caso de re-run):
//
//   1. ALTER pedidos          — colunas geo opcionais + observacao_entrega
//   2. ALTER pedido_ocorrencias — expande ENUM tipo
//   3. CREATE motoristas
//   4. CREATE rotas
//   5. CREATE rota_paradas
//   6. CREATE pedido_posicoes_motorista
//   7. CREATE motorista_idempotency_keys
//   8. SEED admin_permissions   — rotas.view/moderate, motoristas.view/moderate
//
// Tudo aditivo: pedidos antigos seguem funcionando com NULLs nas colunas
// novas. ENUM expandido nao remove valor existente. Permissions usam
// ON DUPLICATE KEY UPDATE pra serem idempotentes.

async function addColumnIfMissing(queryInterface, table, column, spec) {
  const desc = await queryInterface.describeTable(table);
  if (!desc[column]) {
    await queryInterface.addColumn(table, column, spec);
  }
}

async function tableExists(queryInterface, table) {
  try {
    await queryInterface.describeTable(table);
    return true;
  } catch {
    return false;
  }
}

const NEW_PERMISSIONS = [
  { chave: "rotas.view",        grupo: "rotas",       descricao: "Visualizar rotas de entrega" },
  { chave: "rotas.moderate",    grupo: "rotas",       descricao: "Criar, editar e operar rotas de entrega" },
  { chave: "motoristas.view",   grupo: "motoristas",  descricao: "Visualizar motoristas" },
  { chave: "motoristas.moderate", grupo: "motoristas", descricao: "Cadastrar, editar e desativar motoristas" },
];

module.exports = {
  async up(queryInterface, Sequelize) {
    // ---- 1. ALTER pedidos ------------------------------------------------
    await addColumnIfMissing(queryInterface, "pedidos", "tipo_endereco", {
      type: Sequelize.ENUM("urbano", "rural"),
      allowNull: true,
      defaultValue: null,
    });
    await addColumnIfMissing(queryInterface, "pedidos", "endereco_latitude", {
      type: Sequelize.DECIMAL(10, 7),
      allowNull: true,
      defaultValue: null,
    });
    await addColumnIfMissing(queryInterface, "pedidos", "endereco_longitude", {
      type: Sequelize.DECIMAL(10, 7),
      allowNull: true,
      defaultValue: null,
    });
    await addColumnIfMissing(queryInterface, "pedidos", "observacao_entrega", {
      type: Sequelize.TEXT,
      allowNull: true,
      defaultValue: null,
    });

    // ---- 2. ALTER pedido_ocorrencias (expandir ENUM tipo) ----------------
    // MODIFY COLUMN preserva os valores existentes (endereco_incorreto)
    // e acrescenta os 5 novos. Raw SQL porque queryInterface.changeColumn
    // com ENUM em MySQL e' instavel (recria a coluna).
    await queryInterface.sequelize.query(`
      ALTER TABLE pedido_ocorrencias
        MODIFY COLUMN tipo ENUM(
          'endereco_incorreto',
          'cliente_ausente',
          'estrada_intransitavel',
          'pagamento_pendente_na_entrega',
          'produto_avariado',
          'outro_motivo'
        ) NOT NULL
    `);

    // ---- 3. CREATE motoristas --------------------------------------------
    if (!(await tableExists(queryInterface, "motoristas"))) {
      await queryInterface.createTable("motoristas", {
        id: {
          type: Sequelize.INTEGER.UNSIGNED,
          primaryKey: true,
          autoIncrement: true,
          allowNull: false,
        },
        nome: { type: Sequelize.STRING(120), allowNull: false },
        telefone: { type: Sequelize.STRING(20), allowNull: false },
        email: { type: Sequelize.STRING(160), allowNull: true },
        veiculo_padrao: { type: Sequelize.STRING(60), allowNull: true },
        ativo: {
          type: Sequelize.TINYINT(1),
          allowNull: false,
          defaultValue: 1,
        },
        ultimo_login_em: { type: Sequelize.DATE, allowNull: true },
        token_version: {
          type: Sequelize.INTEGER.UNSIGNED,
          allowNull: false,
          defaultValue: 0,
        },
        created_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
        },
        updated_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal("CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP"),
        },
      });
      await queryInterface.addIndex("motoristas", ["telefone"], {
        name: "uq_motoristas_telefone",
        unique: true,
      });
      await queryInterface.addIndex("motoristas", ["ativo"], {
        name: "idx_motoristas_ativo",
      });
    }

    // ---- 4. CREATE rotas -------------------------------------------------
    if (!(await tableExists(queryInterface, "rotas"))) {
      await queryInterface.createTable("rotas", {
        id: {
          type: Sequelize.INTEGER.UNSIGNED,
          primaryKey: true,
          autoIncrement: true,
          allowNull: false,
        },
        data_programada: { type: Sequelize.DATEONLY, allowNull: false },
        motorista_id: {
          type: Sequelize.INTEGER.UNSIGNED,
          allowNull: true,
          references: { model: "motoristas", key: "id" },
          onUpdate: "CASCADE",
          onDelete: "SET NULL",
        },
        veiculo: { type: Sequelize.STRING(60), allowNull: true },
        regiao_label: { type: Sequelize.STRING(120), allowNull: true },
        status: {
          type: Sequelize.ENUM(
            "rascunho",
            "pronta",
            "em_rota",
            "finalizada",
            "cancelada",
          ),
          allowNull: false,
          defaultValue: "rascunho",
        },
        observacoes: { type: Sequelize.TEXT, allowNull: true },
        created_by_admin_id: { type: Sequelize.INTEGER, allowNull: true },
        iniciada_em: { type: Sequelize.DATE, allowNull: true },
        finalizada_em: { type: Sequelize.DATE, allowNull: true },
        total_paradas: {
          type: Sequelize.INTEGER.UNSIGNED,
          allowNull: false,
          defaultValue: 0,
        },
        total_entregues: {
          type: Sequelize.INTEGER.UNSIGNED,
          allowNull: false,
          defaultValue: 0,
        },
        tempo_total_minutos: {
          type: Sequelize.INTEGER.UNSIGNED,
          allowNull: true,
        },
        km_estimado: { type: Sequelize.DECIMAL(8, 2), allowNull: true },
        km_real: { type: Sequelize.DECIMAL(8, 2), allowNull: true },
        created_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
        },
        updated_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal("CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP"),
        },
      });
      await queryInterface.addIndex("rotas", ["data_programada", "status"], {
        name: "idx_rotas_data_status",
      });
      await queryInterface.addIndex("rotas", ["motorista_id"], {
        name: "idx_rotas_motorista",
      });
    }

    // ---- 5. CREATE rota_paradas ------------------------------------------
    if (!(await tableExists(queryInterface, "rota_paradas"))) {
      await queryInterface.createTable("rota_paradas", {
        id: {
          type: Sequelize.INTEGER.UNSIGNED,
          primaryKey: true,
          autoIncrement: true,
          allowNull: false,
        },
        rota_id: {
          type: Sequelize.INTEGER.UNSIGNED,
          allowNull: false,
          references: { model: "rotas", key: "id" },
          onUpdate: "CASCADE",
          onDelete: "CASCADE",
        },
        pedido_id: {
          // pedidos.id e' INT signed (legado); espelha tipo pra FK funcionar.
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: "pedidos", key: "id" },
          onUpdate: "CASCADE",
          onDelete: "CASCADE",
        },
        ordem: {
          type: Sequelize.SMALLINT.UNSIGNED,
          allowNull: false,
        },
        status: {
          type: Sequelize.ENUM(
            "pendente",
            "em_andamento",
            "entregue",
            "problema",
            "reagendado",
          ),
          allowNull: false,
          defaultValue: "pendente",
        },
        entregue_em: { type: Sequelize.DATE, allowNull: true },
        observacao_motorista: { type: Sequelize.TEXT, allowNull: true },
        ocorrencia_id: {
          type: Sequelize.INTEGER.UNSIGNED,
          allowNull: true,
          // Sem FK formal: pedido_ocorrencias.id e' INT (nao UNSIGNED)
          // em algumas instalacoes legadas; deixar como referencia logica
          // pra evitar incompat. Service garante a existencia.
        },
        created_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
        },
        updated_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal("CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP"),
        },
      });
      await queryInterface.addIndex("rota_paradas", ["rota_id", "pedido_id"], {
        name: "uq_rota_pedido",
        unique: true,
      });
      await queryInterface.addIndex("rota_paradas", ["rota_id", "ordem"], {
        name: "idx_rota_ordem",
      });
      await queryInterface.addIndex("rota_paradas", ["pedido_id"], {
        name: "idx_paradas_pedido",
      });
    }

    // ---- 6. CREATE pedido_posicoes_motorista -----------------------------
    if (!(await tableExists(queryInterface, "pedido_posicoes_motorista"))) {
      await queryInterface.createTable("pedido_posicoes_motorista", {
        id: {
          type: Sequelize.INTEGER.UNSIGNED,
          primaryKey: true,
          autoIncrement: true,
          allowNull: false,
        },
        pedido_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: "pedidos", key: "id" },
          onUpdate: "CASCADE",
          onDelete: "CASCADE",
        },
        parada_id: {
          type: Sequelize.INTEGER.UNSIGNED,
          allowNull: true,
        },
        motorista_id: {
          type: Sequelize.INTEGER.UNSIGNED,
          allowNull: false,
          references: { model: "motoristas", key: "id" },
          onUpdate: "CASCADE",
          onDelete: "CASCADE",
        },
        latitude: { type: Sequelize.DECIMAL(10, 7), allowNull: false },
        longitude: { type: Sequelize.DECIMAL(10, 7), allowNull: false },
        origem: {
          type: Sequelize.ENUM(
            "fixacao_motorista",
            "correcao_admin",
            "geocoding",
          ),
          allowNull: false,
          defaultValue: "fixacao_motorista",
        },
        created_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
        },
      });
      await queryInterface.addIndex(
        "pedido_posicoes_motorista",
        ["pedido_id", "created_at"],
        { name: "idx_pos_pedido_created" },
      );
    }

    // ---- 7. CREATE motorista_idempotency_keys ----------------------------
    if (!(await tableExists(queryInterface, "motorista_idempotency_keys"))) {
      await queryInterface.createTable("motorista_idempotency_keys", {
        id: {
          type: Sequelize.INTEGER.UNSIGNED,
          primaryKey: true,
          autoIncrement: true,
          allowNull: false,
        },
        idempotency_key: {
          type: Sequelize.CHAR(36),
          allowNull: false,
        },
        motorista_id: {
          type: Sequelize.INTEGER.UNSIGNED,
          allowNull: false,
          references: { model: "motoristas", key: "id" },
          onUpdate: "CASCADE",
          onDelete: "CASCADE",
        },
        endpoint: { type: Sequelize.STRING(100), allowNull: false },
        response_status: {
          type: Sequelize.SMALLINT.UNSIGNED,
          allowNull: false,
        },
        created_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
        },
      });
      await queryInterface.addIndex(
        "motorista_idempotency_keys",
        ["idempotency_key"],
        { name: "uq_idem_key", unique: true },
      );
      await queryInterface.addIndex(
        "motorista_idempotency_keys",
        ["motorista_id", "created_at"],
        { name: "idx_motorista_recent" },
      );
    }

    // ---- 8. SEED admin_permissions ---------------------------------------
    for (const perm of NEW_PERMISSIONS) {
      await queryInterface.sequelize.query(
        `INSERT INTO admin_permissions (chave, grupo, descricao)
         VALUES (:chave, :grupo, :descricao)
         ON DUPLICATE KEY UPDATE descricao = VALUES(descricao)`,
        { replacements: perm },
      );
    }
    // Concede para super-admin (mesmo padrao das outras seeds)
    const chaves = NEW_PERMISSIONS.map((p) => p.chave);
    await queryInterface.sequelize.query(
      `INSERT IGNORE INTO admin_role_permissions (role_id, permission_id)
       SELECT r.id, p.id
         FROM admin_roles r
         CROSS JOIN admin_permissions p
        WHERE r.slug = 'super-admin'
          AND p.chave IN (:chaves)`,
      { replacements: { chaves } },
    );
  },

  async down(queryInterface) {
    // Down e' deliberadamente parcial: nao apaga colunas (dados podem
    // estar populados). So' remove as tabelas novas + permissions.
    const chaves = NEW_PERMISSIONS.map((p) => p.chave);
    await queryInterface.sequelize.query(
      `DELETE rp FROM admin_role_permissions rp
        INNER JOIN admin_permissions p ON rp.permission_id = p.id
        WHERE p.chave IN (:chaves)`,
      { replacements: { chaves } },
    );
    await queryInterface.sequelize.query(
      "DELETE FROM admin_permissions WHERE chave IN (:chaves)",
      { replacements: { chaves } },
    );

    if (await tableExists(queryInterface, "motorista_idempotency_keys")) {
      await queryInterface.dropTable("motorista_idempotency_keys");
    }
    if (await tableExists(queryInterface, "pedido_posicoes_motorista")) {
      await queryInterface.dropTable("pedido_posicoes_motorista");
    }
    if (await tableExists(queryInterface, "rota_paradas")) {
      await queryInterface.dropTable("rota_paradas");
    }
    if (await tableExists(queryInterface, "rotas")) {
      await queryInterface.dropTable("rotas");
    }
    if (await tableExists(queryInterface, "motoristas")) {
      await queryInterface.dropTable("motoristas");
    }
  },
};
