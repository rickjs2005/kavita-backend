# Política de Retenção — Kavita

Prazos de guarda de cada categoria de dado pessoal. Fonte de verdade
única para jobs de purge, cron de anonimização e resposta a pedidos
de exclusão.

> **Regra geral:** retemos enquanto há finalidade ativa ou obrigação
> legal. Fora dessas janelas, anonimizamos ou removemos. Na dúvida,
> anonimizar é sempre mais seguro que preservar.

---

## Por categoria

### Conta de usuário/produtor ativa
- **Prazo:** enquanto ativa (último login < 12 meses para produtor,
  < 24 meses para usuário da loja com compra associada).
- **Ação após:** email de reativação. Se sem resposta em 30 dias,
  `status_conta = 'inativa'` e remove de mailings.

### Conta excluída a pedido do titular
- **Prazo de janela de arrependimento:** 30 dias (configurável em
  `PRIVACY_DELETION_GRACE_DAYS`).
- **Ação após:** anonimização — nome → "Titular removido", email →
  hash SHA-256 + sufixo `@anon.kavita`, telefone → NULL, CPF → NULL.
- **O que fica preservado:** `pedidos` (obrigação fiscal), `audit`
  administrativo (obrigação probatória). `corretora_leads` criado
  pelo titular: anonimizar nome/telefone/email, preservar
  classificação técnica do café (não é PII).

### Pedido e nota fiscal
- **Prazo:** 5 anos após emissão da nota (CTN art. 173).
- **Ação após:** anonimizar campos de identificação do comprador
  preservando valor e produto (analytics internas).

### Lead de corretora
- **Status "new"/"contacted":** vida útil do negócio.
- **Status "closed"/"lost":** 24 meses então anonimizar PII do
  produtor (preservando ficha técnica se `closed = deal_won`, para
  histórico comercial da corretora).

### Log de autenticação (`last_login_ip`, `source_ip`, `user_agent`)
- **Prazo:** 90 dias rolling.
- **Ação:** job periódico (futuro) apaga esses campos após janela.

### Webhook events (payloads de terceiros)
- **Prazo:** 90 dias após `processed_at`.
- **Ação:** `processing_error` pode ficar 180 dias para
  investigação, mas o payload é truncado após 90.

### Tokens (reset, magic link)
- **Prazo:** TTL de 30 minutos.
- **Ação:** job existente (`tokenService`) remove expirados. Não
  precisa de novo cron.

### Email suppressions (bounces, unsubscribes)
- **Prazo:** indefinido enquanto o email estiver ativo no mundo.
- **Razão:** se o titular pediu para não receber, respeitamos sempre.

### Contato público (`mensagens_contato`)
- **Prazo padrão:** 24 meses após `status = 'resolved'`.
- **Exceção:** mensagens marcadas com `assunto` LGPD/privacidade
  ficam **indefinidamente** para auditoria da ANPD (direito art. 18
  é cumprido e registrado).

### Solicitações de privacidade (`privacy_requests`)
- **Prazo:** 5 anos após `processed_at`.
- **Razão:** ANPD pode fiscalizar nossa política de resposta.

---

## Jobs de retenção a implementar (roadmap)

- [ ] `jobs/anonimizeLeadsJob` — mensal, anonimiza `corretora_leads`
      com status closed/lost > 24 meses.
- [ ] `jobs/purgeWebhookPayloadsJob` — diário, trunca payloads > 90d.
- [ ] `jobs/reactivationEmailJob` — mensal, envia reativação a
      produtores 12m inativos, marca inativa após 30d de silêncio.
- [ ] `jobs/executeScheduledDeletionsJob` — diário, executa
      anonimização de `privacy_requests` com status `pending` e
      `scheduled_purge_at` vencido.

Nenhum desses está ativo na Fase 10.3 — apenas o fluxo manual via
admin e o status `pending_deletion` está implementado. Os crons
entram conforme demanda real (cliente pedir, ANPD fiscalizar).

---

## Conflito: pedido de exclusão × obrigação fiscal

Quando o titular pede exclusão mas possui pedidos dentro do prazo
fiscal de 5 anos:
- **Resposta ao titular:** `status = 'retained'` com motivo
  "Seus dados estão parcialmente retidos por obrigação legal
  tributária (Art. 16 I LGPD) por até 5 anos após seu último
  pedido. Demais dados (perfil, endereços não vinculados, alertas)
  foram anonimizados."
- **Ação técnica:** anonimizamos conta + contato, mantemos
  `pedidos.endereco` (texto livre que já fez parte da NF).
- **Registro:** criamos linha em `privacy_requests` com a razão
  detalhada para futura auditoria.
