"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    // ─── corretoras (approved & published) ─────────────────────────────
    await queryInterface.createTable("corretoras", {
      id: {
        type: Sequelize.INTEGER.UNSIGNED,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
      },
      name: {
        type: Sequelize.STRING(200),
        allowNull: false,
      },
      slug: {
        type: Sequelize.STRING(220),
        allowNull: false,
      },
      contact_name: {
        type: Sequelize.STRING(150),
        allowNull: false,
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      logo_path: {
        type: Sequelize.STRING(500),
        allowNull: true,
      },
      city: {
        type: Sequelize.STRING(100),
        allowNull: false,
      },
      state: {
        type: Sequelize.CHAR(2),
        allowNull: false,
        defaultValue: "MG",
      },
      region: {
        type: Sequelize.STRING(100),
        allowNull: true,
      },
      phone: {
        type: Sequelize.STRING(20),
        allowNull: true,
      },
      whatsapp: {
        type: Sequelize.STRING(20),
        allowNull: true,
      },
      email: {
        type: Sequelize.STRING(200),
        allowNull: true,
      },
      website: {
        type: Sequelize.STRING(500),
        allowNull: true,
      },
      instagram: {
        type: Sequelize.STRING(200),
        allowNull: true,
      },
      facebook: {
        type: Sequelize.STRING(500),
        allowNull: true,
      },
      status: {
        type: Sequelize.ENUM("active", "inactive"),
        allowNull: false,
        defaultValue: "active",
      },
      is_featured: {
        type: Sequelize.TINYINT(1),
        allowNull: false,
        defaultValue: 0,
      },
      sort_order: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      submission_id: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: true,
      },
      created_by: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: true,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: true,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: true,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP"),
      },
    });

    await queryInterface.addIndex("corretoras", ["slug"], {
      name: "idx_corretoras_slug",
      unique: true,
    });
    await queryInterface.addIndex("corretoras", ["status"], {
      name: "idx_corretoras_status",
    });
    await queryInterface.addIndex("corretoras", ["city"], {
      name: "idx_corretoras_city",
    });
    await queryInterface.addIndex("corretoras", ["is_featured", "sort_order"], {
      name: "idx_corretoras_featured",
    });

    // ─── corretora_submissions (public signup pending moderation) ───────
    await queryInterface.createTable("corretora_submissions", {
      id: {
        type: Sequelize.INTEGER.UNSIGNED,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
      },
      name: {
        type: Sequelize.STRING(200),
        allowNull: false,
      },
      contact_name: {
        type: Sequelize.STRING(150),
        allowNull: false,
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      logo_path: {
        type: Sequelize.STRING(500),
        allowNull: true,
      },
      city: {
        type: Sequelize.STRING(100),
        allowNull: false,
      },
      state: {
        type: Sequelize.CHAR(2),
        allowNull: false,
        defaultValue: "MG",
      },
      region: {
        type: Sequelize.STRING(100),
        allowNull: true,
      },
      phone: {
        type: Sequelize.STRING(20),
        allowNull: true,
      },
      whatsapp: {
        type: Sequelize.STRING(20),
        allowNull: true,
      },
      email: {
        type: Sequelize.STRING(200),
        allowNull: true,
      },
      website: {
        type: Sequelize.STRING(500),
        allowNull: true,
      },
      instagram: {
        type: Sequelize.STRING(200),
        allowNull: true,
      },
      facebook: {
        type: Sequelize.STRING(500),
        allowNull: true,
      },
      status: {
        type: Sequelize.ENUM("pending", "approved", "rejected"),
        allowNull: false,
        defaultValue: "pending",
      },
      reviewed_by: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: true,
      },
      reviewed_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      rejection_reason: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      corretora_id: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: true,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: true,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: true,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP"),
      },
    });

    await queryInterface.addIndex("corretora_submissions", ["status"], {
      name: "idx_submissions_status",
    });
    await queryInterface.addIndex("corretora_submissions", ["created_at"], {
      name: "idx_submissions_created",
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("corretora_submissions");
    await queryInterface.dropTable("corretoras");
  },
};
