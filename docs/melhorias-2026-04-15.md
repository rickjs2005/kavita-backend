# Melhorias do módulo Mercado do Café — 2026-04-15

Registro operacional das mudanças feitas após a auditoria de 2026-04-14/15. Foco: consistência transacional, segurança e pontos de operação que estavam apenas no admin.

## Resumo das mudanças

### Operacional / infraestrutura
- **Backup MySQL automatizado** (`kavita-backend/scripts/db/backup.sh`) — mysqldump consistente (`--single-transaction`), compactado em `.sql.gz`, retenção configurável por `KEEP_DAYS`.
- **Restore assistido** (`kavita-backend/scripts/db/restore.sh`) — exige `CONFIRM=yes`, faz snapshot automático antes de sobrescrever.
- **Doc operacional** (`docs/backup-restore.md`) — agendamento via cron, teste de restore trimestral, checklist.

### Performance
- **Novos índices** em `corretora_leads` (`idx_corretora_leads_created_at`, `idx_corretora_leads_status_created_at`) — migration `2026041500000003-add-indexes-corretora-leads.js`. Dashboard regional e KPI "leads pendurados" passam a usar índice em vez de full scan.

### Segurança
- **Rate limit** em `GET /api/public/email/unsubscribe` e `POST /api/public/email/resubscribe` (`createAdaptiveRateLimiter` por IP). HMAC continua sendo a barreira principal; rate limit é defesa em profundidade contra amplificação.
- **Rate limit** em `POST /api/public/corretoras/submit` — impede flood de submissões pendentes e abuso do upload de logo.

### Consistência transacional
As operações críticas abaixo passaram a rodar dentro de `withTransaction` — eliminam estados parciais em caso de falha no meio da operação.

| Operação | Service | O que ficou atômico |
|---|---|---|
| Aprovar submissão | `corretorasService.approveSubmission` | INSERT corretora + UPDATE submission + INSERT user (condicional) |
| Rejeitar submissão | `corretorasService.rejectSubmission` | UPDATE submission + limpeza do password_hash |
| Convidar usuário | `corretoraAuthService.inviteCorretoraUser` | INSERT/UPDATE user pendente + revoke tokens antigos + INSERT token novo |
| Atribuir plano | `planService.assignPlan` | Cancel subscription ativa + INSERT nova |
| Moderar review | `corretoraReviewsService.moderateReview` | Re-read FOR UPDATE + UPDATE status (race-safe) |

Envio de e-mail foi movido para **fora** da transação em todos os casos acima: e-mails não podem ser desfeitos por rollback. Se o e-mail falhar, a operação já está persistida e logamos warn.

Os repositórios afetados (`corretorasAdminRepository`, `corretoraUsersRepository`, `corretoraReviewsRepository`, `subscriptionsRepository`, `plansRepository`, `passwordResetTokenService`) passaram a aceitar um parâmetro `conn` opcional (default `pool`). Chamadas antigas sem `conn` continuam funcionando — mudança 100% backward-compatible.

### Admin — UI de Planos
- Nova aba **"Planos"** em `/admin/mercado-do-cafe` (`MercadoCafeTabs`).
- Componente `src/components/admin/mercado-do-cafe/planos/PlansAdmin.tsx` com:
  - Listagem dos planos existentes.
  - Criação e edição inline com capabilities (`max_users`, `leads_export`, `regional_highlight`, `advanced_reports`).
  - Flags `is_public` e `is_active`.
- Consome endpoints já existentes: `GET/POST/PUT /api/admin/monetization/plans[/ :id]`.

### Painel da corretora — uso vs limite do plano
- `GET /api/corretora/plan` agora retorna `usage: { users: { used, limit } }` além do contexto existente.
- `CurrentPlanBadge` mostra chip `3/5` (ou `3/5` em vermelho quando no limite) e usa `title` com explicação.

### UX pública
- Form de lead (`LeadContactForm`) exibe mensagem `aria-live` "Verificação de segurança em andamento…" enquanto o Turnstile não retorna token — o usuário entende por que o botão está desabilitado.

### Billing — Mercado Pago (assinaturas)
- Criado `services/corretoraSubscriptionWebhookService.js` como **stub explícito** (lança `501 NOT_IMPLEMENTED`). Documenta passo-a-passo para ativar no `docs/billing-mercado-cafe.md`.
- O webhook MP para pedidos (checkout de e-commerce) continua intacto e funcional.
- Integração real de preapproval e webhook de assinatura **não foi implementada** — depende de credenciais MP sandbox/prod e configuração de `preapproval_plan` no dashboard MP. Ver `docs/billing-mercado-cafe.md` para a especificação completa.

### Testes
Três novas suítes unitárias cobrindo os fluxos transacionais:
- `test/unit/services/corretorasService.unit.test.js` — approveSubmission (idempotência, estados, com/sem senha, colisão de email) + rejectSubmission.
- `test/unit/services/planService.unit.test.js` — getPlanContext (fallback Free), hasCapability (bool + limite numérico), assignPlan (guard de plano inativo, ciclo mensal/anual).
- `test/unit/services/corretoraReviewsService.unit.test.js` — moderateReview (404, 409, approve, reject com motivo, race de 0 rows).

Resultado local: **21/21 passaram**.

## Endpoints afetados

| Método | Rota | Mudança |
|---|---|---|
| `GET` | `/api/public/email/unsubscribe` | + rate limit |
| `POST` | `/api/public/email/resubscribe` | + rate limit |
| `POST` | `/api/public/corretoras/submit` | + rate limit |
| `POST` | `/api/admin/mercado-do-cafe/submissions/:id/approve` | agora transacional |
| `POST` | `/api/admin/mercado-do-cafe/submissions/:id/reject` | agora transacional |
| `POST` | `/api/admin/mercado-do-cafe/corretoras/:id/users/invite` | agora transacional |
| `POST` | `/api/admin/monetization/assign` | agora transacional |
| `POST` | `/api/admin/mercado-do-cafe/reviews/:id/moderate` | agora transacional + race-safe |
| `GET` | `/api/corretora/plan` | + `usage.users` |

## Decisões técnicas

1. **Backward-compatible repo signature.** Adotado parâmetro `conn = pool` em vez de criar repos `*Tx`. Reduz superfície de mudança e mantém chamadas existentes idênticas.
2. **E-mails fora da transação.** Gerado por callers **após** o commit. Uma falha de SMTP pós-commit é logada (`warn`) e não reverte o estado já persistido.
3. **Idempotência em approveSubmission.** Pre-check fora da transação + re-check dentro; em caso de race (outra aprovação concorrente), a função se re-chama recursivamente e retorna estado idempotente.
4. **Stub de webhook de assinatura.** Preferido sobre "silenciar" a integração — `501 NOT_IMPLEMENTED` deixa explícito para ops/devs que ainda não há automação de billing.
5. **Rate limit antes do upload.** Em `POST /submit`, o RL vem antes do multer — caso o IP esteja bloqueado, economiza I/O de disco.

## Pendências (débito técnico restante)

- **Webhook real Mercado Pago** para assinaturas — spec em `docs/billing-mercado-cafe.md`.
- **Tela de checkout** no painel da corretora (gerar preapproval).
- **Cron de reconciliação** de subscriptions.
- **SSE/WebSocket** para notificações (hoje polling 60s).
- **`npm audit fix`** + ajustes de dependência — não executado aqui para não quebrar builds sem validação humana.
- **PITR** (binlog) e cópia off-site automática dos backups.

## Arquivos alterados

**Backend:**
- `scripts/db/backup.sh` (novo)
- `scripts/db/restore.sh` (novo)
- `migrations/2026041500000003-add-indexes-corretora-leads.js` (novo)
- `services/corretorasService.js`
- `services/corretoraAuthService.js`
- `services/planService.js`
- `services/corretoraReviewsService.js`
- `services/corretoraSubscriptionWebhookService.js` (novo, stub)
- `services/passwordResetTokenService.js` (conn opcional)
- `repositories/corretorasAdminRepository.js` (conn opcional)
- `repositories/corretoraUsersRepository.js` (conn opcional)
- `repositories/corretoraReviewsRepository.js` (conn opcional)
- `repositories/subscriptionsRepository.js` (conn opcional)
- `repositories/plansRepository.js` (conn opcional)
- `routes/public/publicEmail.js` (+ rate limit)
- `routes/public/publicCorretoras.js` (+ rate limit no submit)
- `controllers/corretoraPanel/planCorretoraController.js` (+ usage)
- `docs/backup-restore.md` (novo)
- `docs/billing-mercado-cafe.md` (novo)
- `docs/melhorias-2026-04-15.md` (este arquivo)
- `test/unit/services/corretorasService.unit.test.js` (novo)
- `test/unit/services/planService.unit.test.js` (novo)
- `test/unit/services/corretoraReviewsService.unit.test.js` (novo)

**Frontend:**
- `src/components/admin/mercado-do-cafe/MercadoCafeTabs.tsx` (+ aba Planos)
- `src/components/admin/mercado-do-cafe/planos/PlansAdmin.tsx` (novo)
- `src/app/admin/mercado-do-cafe/page.tsx` (monta aba Planos)
- `src/components/painel-corretora/CurrentPlanBadge.tsx` (+ uso/limite)
- `src/components/mercado-do-cafe/LeadContactForm.tsx` (+ hint Turnstile)
