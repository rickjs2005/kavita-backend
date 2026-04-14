# Backend — Mercado do Café

Documentação do backend do módulo Mercado do Café (marketplace de corretoras
de café verde da Zona da Mata Mineira).

> Escopo: apenas o módulo Mercado do Café. Para convenções gerais do
> backend, veja [../CLAUDE.md](../CLAUDE.md) e [../README.md](../README.md).

---

## 1. Visão geral

### Em termos técnicos
- **Stack**: Node.js + Express, MySQL 8 via `mysql2` pool (`config/pool.js`).
- **Validação**: Zod (`schemas/corretora*Schemas.js`).
- **Migrations**: Sequelize CLI (sem uso de ORM em runtime).
- **Padrão arquitetural**: Routes → Controllers → Services → Repositories.
- **Respostas**: sempre `lib/response.js` (`response.ok/created`) — nunca `res.json()` cru.
- **Erros**: `AppError` + `ERROR_CODES` + `errorHandler`.
- **Autenticação**: 3 contextos JWT independentes em cookies HttpOnly
  (admin 2h, corretora 7d, produtor 30d via magic link).
- **Observabilidade**: `logger` (pino-like) com eventos estruturados
  (`corretora.lead.created`, `producer.magic_link.sent`, `admin.audit.*`).

### Na prática
O backend expõe uma API REST que:
- Recebe leads de produtores (público, protegido por Turnstile + rate limit).
- Gere as corretoras, seu catálogo de leads, reviews, equipe e assinatura de plano.
- Permite que admins aprovem/moderem corretoras, reviews e atribuam planos.
- Oferece auth passwordless (magic link por email) para o produtor rural.

Tudo persiste em MySQL; nada roda em memória entre requests.

---

## 2. Estrutura de pastas relevante

```
kavita-backend/
├── routes/
│   ├── public/
│   │   ├── corretorasPublic.js           # /api/public/corretoras/*
│   │   ├── producerAuth.js               # /api/public/produtor/magic-link, consume-token
│   │   └── producerMe.js                 # /api/public/produtor/me/*
│   ├── corretora/
│   │   ├── corretoraAuth.js              # login/register/logout da corretora
│   │   ├── corretoraLeads.js             # inbox/detalhe/status
│   │   ├── corretoraProfile.js           # perfil + foto + horário + tipos de café
│   │   ├── corretoraTeam.js              # convites, roles, remover
│   │   ├── corretoraReviews.js           # reviews recebidas
│   │   ├── corretoraNotifications.js     # sino
│   │   └── corretoraSubscription.js      # plano atual
│   └── admin/
│       ├── adminCorretoras.js            # moderação de corretoras + reviews
│       ├── adminPlans.js                 # CRUD de planos + assign
│       └── adminAudit.js                 # leitura de audit log
│
├── controllers/
│   ├── public/corretorasPublicController.js
│   ├── corretora/*Controller.js
│   └── admin/adminCorretorasController.js, adminPlansController.js, adminAuditController.js
│
├── services/
│   ├── corretoraAuthService.js           # JWT + register + email verify
│   ├── corretoraLeadsService.js          # cria lead, SLA, notifica, broadcast
│   ├── corretoraReviewsService.js        # cria + modera
│   ├── corretoraTeamService.js           # invite/role/remove com guards
│   ├── corretoraNotificationsService.js  # lista + mark-read
│   ├── producerAuthService.js            # magic link (email), welcome email
│   ├── planService.js                    # capabilities, requirePlanCapability, assign
│   └── adminAuditService.js              # record() fire-and-forget
│
├── repositories/
│   ├── corretoraRepository.js
│   ├── corretoraLeadsRepository.js
│   ├── corretoraUsersRepository.js       # multi-user com role ENUM
│   ├── corretoraReviewsRepository.js
│   ├── corretoraNotificationsRepository.js
│   ├── corretoraSubscriptionsRepository.js
│   ├── plansRepository.js
│   ├── producerAccountsRepository.js
│   ├── producerFavoritesRepository.js
│   └── adminAuditLogsRepository.js
│
├── middleware/
│   ├── verifyAdmin.js
│   ├── verifyCorretora.js                # JWT de corretora + carrega role
│   ├── verifyProducer.js                 # JWT do produtor
│   ├── requireCapability.js              # checagem por role (owner/manager/sales/viewer)
│   ├── requirePlanCapability.js          # checagem por plano (leads_export, etc.)
│   └── csrfProtection.js
│
├── lib/
│   ├── corretoraPermissions.js           # matriz de capabilities por role
│   ├── corretoraLeadTokens.js            # HMAC-SHA256 para "lote vendido"
│   ├── phoneNormalize.js                 # normaliza telefone p/ broadcast
│   ├── corregosEspeciais.js              # lista curada de córregos premium
│   └── response.js, logger.js, ...
│
├── schemas/
│   └── corretora*Schemas.js              # Zod para todos os endpoints
│
└── migrations/
    └── 2026041400000001..10_*.js         # evolução do módulo
```

---

## 3. Padrão arquitetural (como tudo se conecta)

```
Request
  │
  ▼
middleware (auth, csrf, rate limit, validate Zod)
  │
  ▼
route (wiring apenas)          ──► import controller
  │
  ▼
controller (extrai req → chama service → response.ok/created)
  │
  ▼
service (regra de negócio: lead qualificado, SLA, broadcast, capabilities)
  │
  ▼
repository (SQL cru via pool.query)
  │
  ▼
MySQL
```

Regras invioláveis:
- `res.json()` e `pool.query()` **nunca** aparecem em rotas/controllers.
- Toda falha vira `throw new AppError(...)` — o `errorHandler` formata.
- Efeitos colaterais lentos (email, notificação, audit) usam `.catch()`
  fire-and-forget para não bloquear a resposta.

---

## 4. Tabelas do banco

Ver [tabelas-mercado-cafe.md](tabelas-mercado-cafe.md) para DDL e colunas completas.

Resumo:

| Tabela | Função |
|---|---|
| `corretoras` | Entidade pública — nome, cidade, foto, horário, cidades atendidas, tipos de café, featured |
| `corretora_users` | Conta de login (multi-user) com role ENUM owner/manager/sales/viewer |
| `corretora_leads` | Leads enviados pelos produtores (com objetivo, tipo_cafe, volume, canal) |
| `corretora_lead_events` | Histórico de mudança de status + SLA |
| `corretora_reviews` | Avaliações pós-contato (moderadas) |
| `corretora_notifications` | Sino in-panel (novo lead, review, broadcast) |
| `corretora_notification_reads` | Read receipts por user |
| `corretora_subscriptions` | Assinatura de plano (billing prep) |
| `corretora_city_promotions` | Destaques regionais pagos |
| `plans` | Catálogo de planos (Free/Pro/Premium) com `capabilities` JSON |
| `producer_accounts` | Conta passwordless do produtor |
| `producer_favorites` | Corretoras favoritas |
| `producer_alert_subscriptions` | Alertas por cidade/tipo café |
| `password_reset_tokens` | Reutilizada via `scope` (scope="producer_magic") |
| `admin_audit_logs` | Ações sensíveis do admin (snapshot de nome + meta JSON) |

---

## 5. Endpoints principais

Ver [endpoints-mercado-cafe.md](endpoints-mercado-cafe.md) para lista completa.

Resumo por contexto:

### Público (sem auth)
- `GET  /api/public/corretoras` — lista filtrável (cidade, tipo_cafe, featured)
- `GET  /api/public/corretoras/:slug` — detalhe + reviews aprovadas
- `POST /api/public/corretoras/:slug/leads` — cria lead (Turnstile + rate limit)
- `POST /api/public/corretoras/:slug/reviews` — cria review (moderada)
- `POST /api/public/corretoras/lote-vendido/:token` — broadcast HMAC
- `POST /api/public/produtor/magic-link` — envia email
- `POST /api/public/produtor/consume-token` — troca token por JWT

### Produtor logado
- `GET  /api/public/produtor/me` — dados + histórico
- `PATCH /api/public/produtor/me` — atualiza perfil (telefone normaliza)
- `GET/POST/DELETE /api/public/produtor/me/favorites`
- `GET/POST/DELETE /api/public/produtor/me/alerts`

### Corretora logada (`verifyCorretora + validateCSRF + requireCapability`)
- `GET/PATCH /api/corretora/me`
- `POST /api/corretora/me/foto`
- `GET  /api/corretora/leads?status=&q=`
- `PATCH /api/corretora/leads/:id/status` — `requireCapability("leads.manage")`
- `GET  /api/corretora/leads/export.csv` — `requirePlanCapability("leads_export")`
- `GET/POST/DELETE /api/corretora/team` — `requireCapability("team.manage")`
- `GET  /api/corretora/reviews`
- `GET/PATCH /api/corretora/notifications`
- `GET  /api/corretora/subscription`

### Admin (`verifyAdmin + validateCSRF`)
- `GET/PATCH /api/admin/mercado-do-cafe/corretoras`
- `PATCH /api/admin/mercado-do-cafe/corretoras/:id/approve|reject|feature`
- `GET/PATCH /api/admin/mercado-do-cafe/reviews`
- `GET/POST /api/admin/monetization/plans`
- `POST /api/admin/monetization/assign`
- `GET /api/admin/audit`

---

## 6. Regras de negócio implementadas

### 6.1 Lead qualificado
Não é um form genérico. Campos obrigatórios:
- `objetivo` (vender/conhecer/cotação)
- `tipo_cafe` (natural/cereja descascado/cereja natural/verde)
- `volume_range` (sacas)
- `canal_preferido` (whatsapp/telefone/email)

**Motivo**: reduzir ruído para a corretora e melhorar taxa de conversão.

### 6.2 SLA de primeiro contato
Ao mudar status do lead pela primeira vez (de `new` → qualquer outro),
`corretoraLeadsService` grava `first_response_at` e calcula
`first_response_seconds`. Usado para métricas no painel e ranking futuro.

### 6.3 Reviews moderadas
Toda review entra com `status="pending"`. Admin aprova/rejeita.
Apenas `status="approved"` aparecem na página pública da corretora.

### 6.4 Multi-user por corretora
Uma corretora pode ter vários `corretora_users`. Roles:

| Role | Pode ver leads | Pode mudar status | Pode convidar | Pode editar perfil |
|---|---|---|---|---|
| owner | ✅ | ✅ | ✅ | ✅ |
| manager | ✅ | ✅ | ✅ | ✅ |
| sales | ✅ | ✅ | ❌ | ❌ |
| viewer | ✅ | ❌ | ❌ | ❌ |

Matriz completa em `lib/corretoraPermissions.js`. Checado via
`requireCapability(...)` por rota.

**Guards**:
- Não permite remover o último owner.
- Não permite rebaixar o último owner a não-owner.

### 6.5 Capabilities por plano
`plans.capabilities` é JSON livre. Exemplo:
```json
{ "leads_export": true, "max_users": 5, "featured_slots": 1 }
```
Middleware `requirePlanCapability("leads_export")` lê o plano via
`planService.getPlanContext(corretoraId)` e libera/bloqueia. Se a corretora
não tem assinatura ativa → aplica plano Free seguro.

### 6.6 Broadcast de "lote vendido"
Quando produtor marca um lead como "lote vendido" (via link HMAC no email),
o service:
1. Valida o token HMAC-SHA256 (`lib/corretoraLeadTokens.js`, timing-safe).
2. Normaliza o telefone (`lib/phoneNormalize.js`).
3. Busca todas as corretoras que receberam lead desse mesmo telefone nos últimos N dias.
4. Cria uma `corretora_notification` para cada uma ("este produtor vendeu para outro lote").

**Motivo**: evitar que várias corretoras persigam o mesmo produtor já atendido.

### 6.7 Audit log
`adminAuditService.record({ adminId, adminNome, action, targetType, targetId, meta, ip })`
é chamado em ações sensíveis:
- `corretora.approved|rejected|status_changed|featured_changed`
- `review.moderated`
- `plan.assigned`

Sempre fire-and-forget (`.catch()` só loga) — nunca bloqueia a ação.

### 6.8 Magic link do produtor
Fluxo em `services/producerAuthService.js`:
1. `POST /magic-link { email }` → cria conta se não existe + envia email com token.
2. Token é persistido em `password_reset_tokens` com `scope="producer_magic"` (TTL 30 min, uso único).
3. `POST /consume-token { token }` → valida + emite JWT 30d em cookie HttpOnly.
4. No primeiro login (`!user.last_login_at`), dispara email de boas-vindas.

Resposta sempre igual (`{ sent: true }`) para evitar enumeration de email.

---

## 7. Segurança

| Camada | Mecanismo |
|---|---|
| Auth admin | `verifyAdmin` (JWT 2h em `adminToken`) |
| Auth corretora | `verifyCorretora` (JWT 7d em `authToken`) |
| Auth produtor | `verifyProducer` (JWT 30d em `producerToken`) |
| CSRF | Double-submit cookie + header `x-csrf-token` (em todas as rotas autenticadas) |
| Rate limit público | `leadsRateLimiter` (IP + slug) em `/leads` e `/reviews` |
| Captcha | Turnstile validado em `corretoraLeadsService.create` |
| HMAC | `lib/corretoraLeadTokens.js` (SHA-256, 24 chars, timing-safe) |
| Token version | `corretora_users.token_version` permite invalidar todos os JWTs de um user |
| Capabilities | `requireCapability` (role) + `requirePlanCapability` (plano) |

---

## 8. Pontos fortes

- Camadas respeitadas — todos os módulos do mercado seguem o padrão
  Routes→Controllers→Services→Repositories sem desvios.
- Nada de ORM — queries SQL explícitas em repositories, fácil de auditar.
- Auth isolada por contexto — zero chance de admin virar corretora por acidente.
- Audit log com snapshot de `admin_nome` (sobrevive a deleção do admin).
- Fire-and-forget disciplinado em email/notificação/audit.

## 9. Débitos técnicos conhecidos

- **Notificações não são realtime** — frontend faz polling 60s (com pausa em background).
- **Billing passivo** — schema pronto (`provider`, `provider_subscription_id`, `provider_status`), mas webhook do Mercado Pago ainda não plugado.
- **Paginação do audit log** retorna só `page`/`limit` crus (sem `meta.pages`); frontend mostra paginação básica.
- **Testes de integração** cobrem auth e leads, mas capability matrix e broadcast ainda dependem de smoke manual.
