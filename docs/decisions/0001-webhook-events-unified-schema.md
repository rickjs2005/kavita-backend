# ADR-0001 — `webhook_events` schema unificado multi-provider

**Status:** Aceito · Aplicado em `fix/sprint0-checkout-webhook-race` · 2026-04-27

**Sprint:** Sprint 0 do go-live · Bug 1 (race condition checkout vs webhook MP)

> Este ADR usa um arquivo dedicado em `docs/decisions/` em vez de uma seção em
> `docs/decisions.md` (que é o padrão histórico do projeto) porque vai ser
> referenciado por commits e código em vários lugares — facilita link direto.
> Outros ADRs grandes podem migrar gradualmente para essa pasta.

---

## Contexto

Duas migrations criam a tabela `webhook_events` com schemas incompatíveis:

| Migration | Data | Schema |
|---|---|---|
| `2026022420502108-create-webhook-events-table.js` | 2026-02-24 | `event_id`, `signature`, `status` ENUM, `processed_at`, `updated_at` (single-provider, MP-only) |
| `2026041800000002-create-webhook-events.js` | 2026-04-18 | `DROP TABLE IF EXISTS` + `provider`, `provider_event_id`, `event_type`, `processing_error`, `retry_count` (multi-provider) |

A segunda **dropa e recria** a tabela. Em qualquer ambiente onde as migrations
rodam em ordem cronológica (verificado em `kavita` dev e em
`kavita_migrations_test` após `db:test:reset`), o schema vivente é o **multi-provider**.

`repositories/paymentRepository.js` foi escrito para o schema **antigo** e
seguiu fazendo queries em colunas que **não existem mais** na tabela:
- `WHERE event_id = ?` → coluna inexistente (existe `provider_event_id`)
- `SELECT status` → coluna inexistente (existem `processed_at` + `processing_error`)
- `SET signature = ?, updated_at = NOW()` → colunas inexistentes

**Webhook MP em produção falharia com `ER_BAD_FIELD_ERROR` no primeiro evento real.**
Mascarado em CI/dev porque todos os testes de webhook mockam o repository — nenhum
teste batia em MySQL real.

A descoberta veio durante a investigação do Bug 1 (Sprint 0 — race condition
checkout vs webhook), com `DESCRIBE webhook_events` direto no banco dev.

## Schema vivente (verdade no banco)

```
COLUNAS                                  ÍNDICES
─────────────────────────                ──────────────────────────────────
id                int unsigned PK        PRIMARY (id)
provider          varchar(20) NOT NULL   uq_webhook_provider_event
provider_event_id varchar(100) NOT NULL    (provider, provider_event_id) UNIQUE
event_type        varchar(60) NOT NULL   idx_webhook_unprocessed
payload           json NULL                (processed_at, provider)
processed_at      datetime NULL          idx_webhook_event_type
processing_error  text NULL                (event_type, created_at)
retry_count       int unsigned DEFAULT 0
created_at        datetime DEFAULT NOW()
```

Verificado em 2026-04-27 em:
- `kavita` (dev local)
- `kavita_migrations_test` (após `npm run db:test:reset` — banco virgem)

Como ainda não há staging/prod provisionados, qualquer ambiente futuro nascido
via Dockerfile entrypoint (`npm run db:migrate:prod`) terá o mesmo schema —
não há possibilidade de divergência entre ambientes.

## Decisão

**Migrar `paymentRepository.js` para usar o schema multi-provider vivente.**

- `provider = 'mercadopago'` hardcoded em todas as queries do MP (constante
  `MP_PROVIDER`, não exportada).
- `provider_event_id` em vez de `event_id` (semântica preservada — assinatura
  dos métodos públicos não mudou).
- `processed_at IS NULL` é o sinal de "não processado" (substitui o `status`
  ENUM `'received'`).
- `processing_error` armazena o resultado/marker do processamento (NULL em
  sucesso normal).
- `retry_count` incrementado em re-deliveries (visibilidade operacional).
- `signature` HMAC do header passa a ser embutida no JSON `payload` em
  `_meta.signature` — preserva auditoria sem exigir nova migration.

Repositórios de outros providers (Asaas, ClickSign) já estavam corretos no
schema vivente.

## Alternativas descartadas

### Caminho 2 — Tabelas separadas por provider

`webhook_events_mp` (schema antigo) + `webhook_events_asaas` (schema novo).

**Por que não:** duplica infra de auditoria, dificulta reconciliação cross-provider
no futuro, fragmenta dashboards de operação. A tese arquitetural da migration
de 2026-04-18 (uma tabela única para todos os providers) é correta — a falha
foi não atualizar `paymentRepository` na mesma sprint.

### Caminho 3 — Reverter a migration nova

Criar migration que reverte `2026041800000002` e restaura `event_id`/`signature`/`status`.

**Por que não:** Asaas e ClickSign já dependem de `provider`, `provider_event_id`,
`processing_error`, `retry_count`. Ajustar todos para o schema antigo seria
maior do que migrar o `paymentRepository` (caminho 1). Além disso, o schema
multi-provider é semanticamente melhor (retry_count nativo, processing_error
explícito, suporte a N providers).

## Convenção de markers em `processing_error`

Para distinguir parqueamento intencional de erro real (lição da Sprint 0):

| Valor | Significado | Retentar? |
|---|---|---|
| `NULL` | Processado com sucesso | — |
| `IGNORED:<reason>` | Descartado intencionalmente (sem dados úteis) | Não |
| `BLOCKED:<from>-><to>` | Transição de status rejeitada pelo guard | Não |
| `PARKED:<reason>:<context>` | Aguarda condição externa, retenta no futuro | **Sim** |

**Marker canônico de pedido órfão:**
`PARKED:PENDING_ORDER_MATCH:pedidoId=<id>`

Constantes em `constants/ErrorCodes.js`:
```javascript
PARKED_PREFIX: "PARKED:",
PENDING_ORDER_MATCH: "PENDING_ORDER_MATCH",
```

**Dashboards de erro devem filtrar:**
```sql
WHERE processing_error NOT LIKE 'IGNORED:%'
  AND processing_error NOT LIKE 'BLOCKED:%'
  AND processing_error NOT LIKE 'PARKED:%'
```

## Convenção de redação de signature em logs

A assinatura HMAC é embutida em `payload._meta.signature` (não em `_signature`
direto). Pino redact configurado em `lib/logger.js` cobre os paths:

```javascript
"_meta.signature",
"*._meta.signature",
"*.*._meta.signature",
"payload._signature",  // legacy/typo defense
```

Censor: `"[redacted]"` (alinha com `lib/sentry.js`).

Qualquer campo sensível futuro deve seguir a convenção `_meta.<nome>` para
herdar redação automaticamente sem alterar config.

## Aviso operacional para go-live

**Antes do primeiro deploy de staging/prod**, o operador deve rodar:

```sql
DESCRIBE webhook_events;
```

E confirmar que o schema vivente é o multi-provider (colunas: `provider`,
`provider_event_id`, `event_type`, `payload`, `processed_at`,
`processing_error`, `retry_count`, `created_at`).

Se por algum motivo o schema for diferente (ex.: ambiente onde alguém rodou
migrations em ordem não-cronológica, ou só rodou a primeira), **não subir** —
investigar antes. Adicionar este check ao deploy checklist (`docs/deploy-checklist.md`).

## Consequências

### Positivas
- Webhook MP funciona contra schema real (antes falharia em runtime)
- Convenção `PARKED:*` permite job de retry futuro pegar eventos órfãos
  (ex.: `repo.findParkedPendingOrderMatch()`)
- Auditoria de signature preservada via `_meta.signature` no JSON payload
- Pino redact protege HMAC contra vazamento em logs estruturados

### Negativas
- A primeira migration (`2026022420502108`) ficou como código-zumbi: roda mas
  é imediatamente sobrescrita pela segunda. Confunde leitores novos.
- Adiciona convenção (markers `PARKED:`/`IGNORED:`/`BLOCKED:`) que precisa
  ser documentada e consistente em outros providers que adotarem o padrão.

## TODOs pós-go-live

- [ ] **Marcar `2026022420502108-create-webhook-events-table.js` como obsoleta**
  ou removê-la. Sugestão: comentário no topo + manter para preservar histórico
  da migration chain. Decisão de remover só após confirmar que não há ambiente
  legado dependendo dela.
- [ ] **Squash de migrations** em algum momento futuro (após PMF, com base
  estável de schema). Reduz superfície de pegadinhas como esta.
- [ ] **Adicionar testes de integração real para Asaas e ClickSign**. Toda
  integração externa (gateway, contratos, KYC, mailer) precisa ter pelo menos
  1 teste contra MySQL real — é a lição aprendida deste incidente. Mocks unit
  não pegam mismatches entre repository SQL e schema vivente.
- [ ] **Implementar job de retry** para eventos `PARKED:PENDING_ORDER_MATCH`.
  Helper de listagem já existe (`repo.findParkedPendingOrderMatch(limit)`);
  falta o cron + lógica de retry com backoff. Plano: rodar a cada 1h, max 24
  retries, depois mover para fila de DLQ manual.
- [ ] **17 testes unit pré-existentes falhando** em `checkout*`, `csrf`,
  `env`, `orderRepository`, `statsController`, `promocoesPublicController`,
  `produtosAdminService` — não são causados por esta sprint (provado via
  `git stash` baseline em 2026-04-27), mas precisam ser triados separadamente.
- [ ] **Migrar outros ADRs antigos** de `docs/decisions.md` para arquivos
  individuais em `docs/decisions/` se ficar muito longo — opcional, baixa
  prioridade.

## Referências

### Commits desta sprint
- `21b7ef9` — refactor(payment): aligns webhook_events queries with multi-provider schema (Etapa A)
- `b5d4779` — fix(payment): parks orphan webhook events instead of silently failing (Etapa B)
- `306eaa6` — test(payment): adds integration test against real MySQL + updates unit mocks (Etapa C)

### Arquivos-chave
- `repositories/paymentRepository.js` (camada principal migrada)
- `services/paymentWebhookService.js` (caminho de parqueamento)
- `lib/logger.js` (redact paths)
- `lib/sentry.js` (`captureMessage` estendida com `tags`/`extra`)
- `constants/ErrorCodes.js` (markers canônicos)
- `test/integration/checkout-webhook-race.int.test.js` (smoke contra MySQL real)
- `migrations/2026022420502108-create-webhook-events-table.js` (legacy)
- `migrations/2026041800000002-create-webhook-events.js` (vivente)
