"use strict";

/**
 * Migration: Encrypt CPF at rest + add cpf_hash for indexed lookups.
 *
 * Steps:
 *   1. Widen cpf column (VARCHAR(14) → VARCHAR(100)) to hold AES-256-GCM ciphertext
 *   2. Add cpf_hash column (VARCHAR(64)) for HMAC-SHA256 indexed lookups
 *   3. Encrypt existing plaintext CPFs and populate cpf_hash
 *   4. Drop old UNIQUE index on cpf, create new UNIQUE index on cpf_hash
 *
 * Rollback:
 *   1. Drop cpf_hash column + index
 *   2. Decrypt cpf back to plaintext
 *   3. Restore cpf to VARCHAR(14) + UNIQUE index
 *
 * IMPORTANT: Requires CPF_ENCRYPTION_KEY env var to be set before running.
 * Without it, encrypt/decrypt are no-op (plaintext preserved).
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    const crypto = require("crypto");

    // --- Step 1: Widen cpf column ---
    await queryInterface.changeColumn("usuarios", "cpf", {
      type: Sequelize.STRING(100),
      allowNull: true,
    });

    // --- Step 2: Add cpf_hash column ---
    await queryInterface.addColumn("usuarios", "cpf_hash", {
      type: Sequelize.STRING(64),
      allowNull: true,
    });

    // --- Step 3: Encrypt existing CPFs ---
    const keyRaw = process.env.CPF_ENCRYPTION_KEY;
    if (keyRaw) {
      const key = crypto.createHash("sha256").update(keyRaw).digest();

      // Fetch all users with plaintext CPF
      const [rows] = await queryInterface.sequelize.query(
        "SELECT id, cpf FROM usuarios WHERE cpf IS NOT NULL AND cpf != ''"
      );

      for (const row of rows) {
        const plaintext = String(row.cpf).replace(/\D/g, "");
        if (!plaintext) continue;

        // Skip if already encrypted (contains colons)
        if (String(row.cpf).includes(":")) continue;

        // Encrypt
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
        let encrypted = cipher.update(plaintext, "utf8", "hex");
        encrypted += cipher.final("hex");
        const authTag = cipher.getAuthTag().toString("hex");
        const encryptedCpf = `${iv.toString("hex")}:${authTag}:${encrypted}`;

        // Hash
        const cpfHash = crypto.createHmac("sha256", key).update(plaintext).digest("hex");

        await queryInterface.sequelize.query(
          "UPDATE usuarios SET cpf = ?, cpf_hash = ? WHERE id = ?",
          { replacements: [encryptedCpf, cpfHash, row.id] }
        );
      }
    } else {
      console.warn(
        "⚠️  CPF_ENCRYPTION_KEY not set — CPFs left as plaintext. " +
        "Set the key and re-run migration to encrypt."
      );
      // Populate cpf_hash with raw digits as fallback (matches cpfCrypto.js no-key behavior)
      await queryInterface.sequelize.query(
        "UPDATE usuarios SET cpf_hash = REPLACE(REPLACE(REPLACE(cpf, '.', ''), '-', ''), ' ', '') WHERE cpf IS NOT NULL AND cpf != ''"
      );
    }

    // --- Step 4: Replace indexes ---
    try {
      await queryInterface.removeIndex("usuarios", "usuarios_cpf_unique");
    } catch {
      // Index may not exist or have a different name
      try {
        await queryInterface.removeIndex("usuarios", "cpf");
      } catch {
        // ignore — proceed to create new index
      }
    }

    await queryInterface.addIndex("usuarios", ["cpf_hash"], {
      unique: true,
      name: "usuarios_cpf_hash_unique",
    });
  },

  async down(queryInterface, Sequelize) {
    const crypto = require("crypto");

    // --- Decrypt CPFs back to plaintext ---
    const keyRaw = process.env.CPF_ENCRYPTION_KEY;
    if (keyRaw) {
      const key = crypto.createHash("sha256").update(keyRaw).digest();

      const [rows] = await queryInterface.sequelize.query(
        "SELECT id, cpf FROM usuarios WHERE cpf IS NOT NULL AND cpf LIKE '%:%'"
      );

      for (const row of rows) {
        const parts = String(row.cpf).split(":");
        if (parts.length !== 3) continue;

        try {
          const iv = Buffer.from(parts[0], "hex");
          const authTag = Buffer.from(parts[1], "hex");
          const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
          decipher.setAuthTag(authTag);
          let decrypted = decipher.update(parts[2], "hex", "utf8");
          decrypted += decipher.final("utf8");

          await queryInterface.sequelize.query(
            "UPDATE usuarios SET cpf = ? WHERE id = ?",
            { replacements: [decrypted, row.id] }
          );
        } catch {
          console.error(`Failed to decrypt CPF for user ${row.id} — skipping`);
        }
      }
    }

    // --- Remove cpf_hash ---
    try {
      await queryInterface.removeIndex("usuarios", "usuarios_cpf_hash_unique");
    } catch { /* ignore */ }

    await queryInterface.removeColumn("usuarios", "cpf_hash");

    // --- Restore cpf column size ---
    await queryInterface.changeColumn("usuarios", "cpf", {
      type: Sequelize.STRING(14),
      allowNull: true,
    });

    // --- Restore UNIQUE index on cpf ---
    await queryInterface.addIndex("usuarios", ["cpf"], {
      unique: true,
      name: "usuarios_cpf_unique",
    });
  },
};
