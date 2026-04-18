# Asaas staging — checklist de ativação

Fluxo criado nas ETAPAS 1 e 3 está **pronto no código** mas precisa de credenciais Asaas + deploy em staging pra ser validado end-to-end. Este doc é o script pra sair de "código pronto" pra "MRR rastreável".

**Tempo estimado:** 45–60min se tudo der certo.

---

## 1. Criar conta sandbox Asaas

1. Acessar https://sandbox.asaas.com
2. Criar conta PJ (use dados da Kavita; sandbox não cobra de verdade)
3. Pegar `API_KEY` em **Configurações → Integrações → API Key**
4. Configurar **Webhook** em **Configurações → Integrações → Webhooks**:
   - URL: `https://STAGING_BACKEND/api/webhooks/asaas`
   - Eventos: `PAYMENT_CONFIRMED`, `PAYMENT_OVERDUE`, `PAYMENT_REFUNDED`, `SUBSCRIPTION_CANCELED`
   - Token de autenticação: gera um random de 64 chars e guarda em `.env` do backend como `ASAAS_WEBHOOK_TOKEN`

---

## 2. Env vars de staging (backend)

```env
CORRETORA_PAYMENT_PROVIDER=asaas
ASAAS_API_KEY=<api_key_do_sandbox>
ASAAS_API_URL=https://sandbox.asaas.com/api/v3
ASAAS_WEBHOOK_TOKEN=<mesmo_token_configurado_no_webhook>
```

---

## 3. Smoke test — provider ativo

```bash
curl -s https://STAGING_BACKEND/api/public/features | jq
# Esperado: { "ok": true, "data": { "sms_active": ..., "cotacao_active": ... } }
```

Se `paymentService.isGatewayActive()` continuar `false`, checar logs:
- `ASAAS_API_KEY` não-vazia?
- `CORRETORA_PAYMENT_PROVIDER=asaas`?

---

## 4. Teste fim-a-fim do checkout

### a) Corretora clica "Assinar agora"
1. Criar corretora teste em staging (via admin: aprovar submission OU inserir direto)
2. Login dela → `/painel/corretora/planos` → botão "Assinar agora" no PRO
3. Frontend chama `POST /api/corretora/plan/checkout`
4. **Esperado**: backend retorna `{ gateway_available: true, checkout_url: "https://sandbox.asaas.com/checkout/..." }`
5. Nova aba abre com página real do Asaas

### b) Subscription local marcada como pending_checkout

```sql
SELECT id, provider, provider_status, pending_checkout_url, pending_checkout_at
FROM corretora_subscriptions
WHERE corretora_id = <id>;
```

**Esperado**: `provider='asaas'`, `provider_status='pending_checkout'`, URL gravada.

### c) Corretora fecha a aba sem pagar → reabrir link
1. Volta em `/planos` → deve ver banner âmbar **"Pagamento pendente · Reabrir link"**
2. Click em "Reabrir link" → mesma URL do Asaas abre
3. Pagar no sandbox (usar cartão teste da Asaas: `5184 0505 0505 0505`)

### d) Webhook `PAYMENT_CONFIRMED` chega

Logs do backend devem mostrar:
```
corretora.payment.webhook.received provider=asaas event_id=<x>
webhook_events.inserted id=<y>
asaas.domain.event_applied type=payment_confirmed subscription=<z>
```

### e) Subscription fica active + pending zerado

```sql
-- status='active', provider_status='active',
-- pending_checkout_url=NULL, pending_checkout_at=NULL
```

### f) Corretora recarrega `/painel/corretora/planos`
- Banner "Pagamento pendente" some
- Plano atual = PRO · **Ativa**
- Capabilities novas liberadas

---

## 5. Teste de falha de webhook + retry manual

### a) Forçar falha
Disparar um pagamento no sandbox com handler com erro proposital (ex: erro transitório no banco).

Logs:
```
asaas.webhook.domain_apply_failed webhookEventId=<x>
```

Coluna `webhook_events.processing_error` ganha a mensagem de erro.

### b) Reverter código + testar retry admin
1. Restaurar handler.
2. Admin em `/admin/mercado-do-cafe/reconciliacao` → filtro "Com erro"
3. Evento aparece com badge vermelho "erro"
4. Click em **"↻ Retry"** → confirm nativo
5. Backend re-deriva o domainEvent + re-aplica o handler
6. `processing_error=NULL`, `processed_at=NOW()`

---

## 6. Teste de `PAYMENT_OVERDUE`

1. No sandbox Asaas, simular fatura vencida
2. Webhook → `payment_overdue`
3. Subscription local: `status='past_due'`, `provider_status='overdue'`

---

## 7. Checklist final

- [ ] Backend logado no startup sem erros de adapter Asaas
- [ ] `GET /api/public/features` retorna payload
- [ ] `POST /plan/checkout` gera checkout_url real
- [ ] `pending_checkout_url` é persistido
- [ ] Banner "Pagamento pendente" aparece e reabre link
- [ ] Webhook `PAYMENT_CONFIRMED` ativa subscription automaticamente
- [ ] Webhook falhando aparece na reconciliação admin com erro
- [ ] Retry manual resolve o erro
- [ ] Webhook `PAYMENT_OVERDUE` muda status

Se **qualquer item falhar**, pare e me mande o log específico — infra está pronta; ajuste é pontual.

---

## Limites conhecidos (não bloqueia venda agora)

- **Cancelamento remoto não automatizado** — admin precisa cancelar no Asaas direto quando arquiva corretora. Fix: chamar `paymentService.cancelRemoteSubscription` no `cancelCorretoraSubscription`.
- **Sem `checkout_url` expirável** — Asaas normalmente expira o link em 7 dias, mas nosso banner não sabe. Fix futuro: TTL configurável + cron limpa pendentes stale.
