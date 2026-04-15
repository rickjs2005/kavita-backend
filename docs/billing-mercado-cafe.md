# Billing — Mercado do Café / Corretoras

Este documento registra o estado atual do billing do SaaS de corretoras e o que falta para automatização.

## Estado atual (2026-04-15)

- **Manual por admin:** planos são atribuídos via `POST /api/admin/monetization/assign` (controller `adminPlansController.assignPlanToCorretora`).
- **Transação:** a operação de atribuição agora usa `withTransaction` — cancelar subscription anterior e criar a nova é atômico.
- **Schema:** `plans`, `corretora_subscriptions`, `corretora_city_promotions` criados via migration `2026041400000009-create-monetization-tables.js`.
- **Webhook Mercado Pago para pedidos de e-commerce:** já existe e está **funcional** em `services/paymentWebhookService.js` (idempotência, transição segura de status, idempotência via `webhook_events`). **Não cobre assinaturas.**
- **Webhook Mercado Pago para assinaturas (planos das corretoras):** **NÃO implementado.** Há stub em `services/corretoraSubscriptionWebhookService.js` com guia de implementação.

## O que falta para automatizar

Ordem recomendada:

1. **Configurar no dashboard MP** um `preapproval_plan` por plano ativo (Pro/Premium). Salvar `preapproval_plan_id` em `plans.meta` (já existe coluna JSON).
2. **Fluxo de checkout** no painel da corretora:
   - Botão "Assinar Pro" gera um `preapproval` via API do MP (`POST /preapproval`) com `payer_email`, `back_url` e `reason` derivado do plano.
   - Persistir `preapproval_id` em `corretora_subscriptions.provider_subscription_id` com `provider='mercadopago'` e `status='trialing'` enquanto MP não confirma.
3. **Registrar webhook** em MP apontando para `POST /api/webhooks/mercado-pago/subscriptions` com tópicos `preapproval` + `authorized_payment`.
4. **Implementar `corretoraSubscriptionWebhookService.handleSubscriptionEvent`** seguindo o padrão do payment webhook:
   - Idempotência via `webhook_events_subscription` (UNIQUE(event_id), SELECT FOR UPDATE).
   - Buscar status real em `/preapproval/:id` (não confiar no payload).
   - Mapear status MP → domínio (`authorized→active`, `paused→past_due`, `cancelled→canceled`, `finished→expired`).
   - Guards contra transição insegura (`canceled → active` só se houver novo `preapproval_id`).
   - Aplicar mudança via `subscriptionsRepository.updateStatus` ou `planService.assignPlan` conforme o evento.
5. **Cron de reconciliação diária** que lista subscriptions `status IN ('active','past_due')` e confere contra `/preapproval/:id`. Remedia webhooks perdidos.
6. **Frontend:** badge "grace period" em `CurrentPlanBadge` quando `status='past_due'`; bloqueio de features premium quando `status='canceled'` ou `'expired'`.

## Pontos de atenção

- **Variável `MP_WEBHOOK_SECRET`** já é obrigatória em produção (vide `CLAUDE.md`). Reaproveitar para assinar/verificar o webhook de assinatura.
- Para QA, criar credenciais sandbox e testar o fluxo completo **antes** de trocar para prod.
- A transição `trialing → active` exige o primeiro `authorized_payment` confirmado.
- `corretora_subscriptions.meta` JSON é o lugar para guardar `preapproval_id`, `last_payment_id`, `last_event_at` para debug.

## Endpoints afetados (resumo)

| Método | Rota | Estado |
|---|---|---|
| `POST` | `/api/admin/monetization/assign` | ✅ Funcional (agora transacional) |
| `POST` | `/api/admin/monetization/plans` | ✅ Funcional |
| `PUT` | `/api/admin/monetization/plans/:id` | ✅ Funcional |
| `GET` | `/api/admin/monetization/plans` | ✅ Funcional |
| `GET` | `/api/corretora/plan` | ✅ Funcional (painel da corretora lê plano ativo) |
| `POST` | `/api/webhooks/mercado-pago/subscriptions` | 🟠 Stub (501 `NOT_IMPLEMENTED`) |
| `POST` | `/api/corretora/billing/checkout` | ❌ Não implementado (geração de preapproval) |

## Pendências priorizadas

1. Front: tela de planos pública + CTA "Assinar" no painel da corretora.
2. Back: endpoint de checkout que chama `POST /preapproval` na API MP.
3. Back: implementar o webhook real substituindo o stub.
4. Infra: cron de reconciliação diária.
