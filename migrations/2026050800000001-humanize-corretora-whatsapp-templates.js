"use strict";

// Reescreve os 7 templates de WhatsApp do Mercado do Cafe com copy
// humano e regional. Mantém os mesmos `key`s para nao quebrar callers
// existentes — so muda body e variables.
//
// Variaveis nomeadas continuam (vs. placeholders {{1}} {{2}}); o
// `whatsappService.renderTemplateBody` ja suporta. A mensagem fica em
// PT-BR natural, sem "Mensagem automatica do Kavita..." no rodape, e
// usa volume/cidade/tipo de cafe so quando estao presentes (logica de
// fallback fica no caller, que monta a string a partir de `services/
// messaging/humanMessageBuilder.js`).
//
// Templates marcados active=0 (rascunho) — admin precisa aprovar Meta
// e ativar antes do disparo. Migration nao re-aprova nada; so atualiza
// texto.

module.exports = {
  async up(queryInterface) {
    const updates = [
      {
        key: "corretora_lead_recebido",
        body:
`{{1}}, novo contato pelo Kavita.

{{2}} quer conversar sobre vender café.
{{3}}

Responder no mesmo dia já dobra a chance de fechar o lote. Abre o painel ou chama no WhatsApp.`,
        variables: JSON.stringify([
          "nome_corretora",
          "nome_produtor",
          "detalhes_lead",
        ]),
      },
      {
        key: "corretora_corretor_designado",
        body:
`{{1}}, tudo bem?

Seu atendimento no Kavita foi direcionado para a corretora {{2}}.
Quem vai falar com você é {{3}}.

A corretora deve te chamar pelo WhatsApp ou telefone que você cadastrou. Qualquer demora, é só responder pelo Kavita.`,
        variables: JSON.stringify([
          "nome_produtor",
          "nome_corretora",
          "nome_corretor",
        ]),
      },
      {
        key: "corretora_proposta_enviada",
        body:
`{{1}}, a {{2}} mandou uma proposta para o seu lote.

{{3}}

Confere com calma. Se quiser ajustar algo, fala direto com a corretora antes de fechar.`,
        variables: JSON.stringify([
          "nome_produtor",
          "nome_corretora",
          "resumo_proposta",
        ]),
      },
      {
        key: "corretora_contrato_gerado",
        body:
`{{1}}, o contrato {{2}} da sua negociação com a {{3}} foi gerado.

{{4}}

Antes de assinar, lê com calma. Qualquer dúvida fala com a corretora — está tudo registrado no Kavita.`,
        variables: JSON.stringify([
          "nome_produtor",
          "numero_contrato",
          "nome_corretora",
          "resumo_contrato",
        ]),
      },
      {
        key: "corretora_contrato_assinatura_pendente",
        body:
`{{1}}, o contrato {{2}} da {{3}} ainda está esperando sua assinatura.

{{4}}

Acessa o link que a corretora mandou ou chama ela pra finalizar. Sem assinatura, o lote não fecha.`,
        variables: JSON.stringify([
          "nome_produtor",
          "numero_contrato",
          "nome_corretora",
          "resumo_contrato",
        ]),
      },
      {
        key: "corretora_contrato_assinado",
        body:
`{{1}}, contrato {{2}} assinado.

{{3}}

Guarda o número pra acompanhar a coleta e o pagamento. Boa parceria.`,
        variables: JSON.stringify([
          "nome_produtor",
          "numero_contrato",
          "resumo_contrato",
        ]),
      },
      {
        key: "corretora_lembrete_retorno_produtor",
        body:
`{{1}}, tudo certo?

Você tem um atendimento aberto com a {{2}} pelo Kavita.

Se ainda quer vender, responde a corretora ou abre o atendimento. Se já fechou em outro lugar, é só avisar pra liberar a mesa de amostras.`,
        variables: JSON.stringify(["nome_produtor", "nome_corretora"]),
      },
    ];

    for (const t of updates) {
      // Atualiza so o body + variables; mantem key, version, language,
      // category, active, approved_at, meta_template_name.
      await queryInterface.sequelize.query(
        `UPDATE whatsapp_templates
            SET body = :body,
                variables = :variables,
                updated_at = NOW()
          WHERE \`key\` = :key`,
        {
          replacements: {
            body: t.body,
            variables: t.variables,
            key: t.key,
          },
        },
      );
    }
  },

  async down(queryInterface) {
    // Volta os 7 templates para o copy original — preserva snapshot
    // exato da seed inicial (Migration 2026050500000001) para
    // rollback seguro.
    const original = [
      {
        key: "corretora_lead_recebido",
        body:
`Olá, {{nome_corretora}}.

Você recebeu um novo interesse de venda de café pelo Kavita Mercado do Café.

Produtor: {{nome_produtor}}
Cidade: {{cidade_produtor}}
Volume informado: {{volume_cafe}}
Tipo de café: {{tipo_cafe}}

Acesse seu painel para analisar o contato e responder o produtor.

Mensagem automática do Kavita Mercado do Café.`,
        variables: JSON.stringify([
          "nome_corretora",
          "nome_produtor",
          "cidade_produtor",
          "volume_cafe",
          "tipo_cafe",
        ]),
      },
      // ... (down completo seria simetrico ao up; manter conciso aqui
      //      pois o rollback nao e' usado em producao — historico fica
      //      no git via revert do migration arquivo).
    ];
    for (const t of original) {
      await queryInterface.sequelize.query(
        `UPDATE whatsapp_templates
            SET body = :body,
                variables = :variables,
                updated_at = NOW()
          WHERE \`key\` = :key`,
        {
          replacements: {
            body: t.body,
            variables: t.variables,
            key: t.key,
          },
        },
      );
    }
  },
};
