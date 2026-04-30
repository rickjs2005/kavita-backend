"use strict";

// F1.6 — migration one-shot que CRIPTOGRAFA mfa_secrets existentes
// que ainda estão em plaintext (formato base32 puro), para o novo
// formato cryptoVault v1:<iv>:<tag>:<ct>.
//
// Pré-requisito: MFA_ENCRYPTION_KEY definida no ambiente onde a
// migration roda. Se ausente, falha rápido com mensagem clara —
// não silently leaves plaintext.
//
// Idempotente: re-executar não re-criptografa um valor já em v1:.
// O loop ignora valores que já começam com "v1:".
//
// Down: NÃO descriptografa de volta — manter um caminho de
// "downgrade" facilita ataque. Se for preciso reverter, gerar
// nova migration que zera mfa_secret e força re-enrollment dos
// admins afetados.

module.exports = {
  async up(queryInterface) {
    // Não usamos addColumn — coluna já existe há sprints. Só atualizamos dados.
    if (!process.env.MFA_ENCRYPTION_KEY) {
      throw new Error(
        "MFA_ENCRYPTION_KEY ausente — migration F1.6 não pode rodar sem a key. " +
          "Defina a env e rode novamente: migration é idempotente."
      );
    }

    // Importamos o vault aqui dentro (após o gate do env) para que o
    // loader do sequelize-cli não falhe carregando esta migration em
    // outros ambientes onde a key ainda não foi setada.
    const cryptoVault = require("../lib/cryptoVault");

    const sql = "SELECT id, mfa_secret FROM admins WHERE mfa_secret IS NOT NULL";
    const [rows] = await queryInterface.sequelize.query(sql);

    let migrated = 0;
    let skipped = 0;
    for (const row of rows) {
      if (cryptoVault.isEncrypted(row.mfa_secret)) {
        skipped += 1;
        continue;
      }
      const enc = cryptoVault.encryptString(row.mfa_secret);
      await queryInterface.sequelize.query(
        "UPDATE admins SET mfa_secret = :enc WHERE id = :id",
        { replacements: { enc, id: row.id } }
      );
      migrated += 1;
    }

    // Log estruturado pra rastreio operacional. console.log porque
    // sequelize-cli já redireciona; logger não está disponível neste
    // contexto sem requires colaterais.
    console.log(JSON.stringify({
      migration: "F1.6-encrypt-existing-mfa-secrets",
      total_rows_with_secret: rows.length,
      migrated,
      skipped_already_v1: skipped,
    }));
  },

  async down() {
    // Sem rollback — não descriptografamos de volta para plaintext.
    // Se precisar reverter, faça em outra migration que zera e força
    // re-enrollment.
  },
};
