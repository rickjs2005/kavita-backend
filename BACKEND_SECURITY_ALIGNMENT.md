# Security Reference — kavita-backend

> Controles de seguranca ativos, cobertura e lacunas conhecidas.
> Para decisoes arquiteturais detalhadas, consulte [docs/decisions.md](docs/decisions.md) (ADR-003 a ADR-005).
> Para operacao e resposta a incidentes, consulte [docs/runbook.md](docs/runbook.md).
> Para compliance LGPD completo, consulte [docs/compliance/](docs/compliance/).
>
> _Ultima atualizacao: 2026-04-22 — revisao pos-Fase 10 (KYC, LGPD 2.0, contratos, ticker)._

---

## Autenticacao — quatro contextos isolados

Cada contexto tem cookie HttpOnly proprio e middleware distinto. Os cookies nao se cruzam — um admin pode estar impersonando uma corretora e os dois cookies convivem.

| Contexto | Cookie | Validade | Middleware | Login |
|----------|--------|----------|------------|-------|
| **Usuario da loja** | `auth_token` | 7 dias | `authenticateToken` | `POST /api/login` |
| **Admin** | `adminToken` | 2 horas | `verifyAdmin` | `POST /api/admin/login` |
| **Corretora** | cookie proprio | definido no service | `verifyCorretora` | `POST /api/corretora/login` ou magic-link |
| **Produtor** | cookie proprio | definido no service | `verifyProducer` | magic-link (sem senha) |

### Proteções comuns

| Controle | Implementacao | Arquivo |
|----------|--------------|---------|
| JWT em cookie HttpOnly | Cookies HttpOnly, `SameSite=Lax`, `Secure` em prod | helpers em services de auth |
| Revogacao de sessao via `tokenVersion` | Incrementar no banco invalida todos os tokens | Coluna `tokenVersion` em `admins` e `usuarios` |
| MFA (admin) | TOTP via `speakeasy` — desafio com `challengeId` e rate limit | `controllers/admin/authAdminController.js` |
| MFA (corretora) | TOTP opcional | `services/corretoraTotpService.js`, rota `/api/corretora/totp/*` |
| Account lockout | Bloqueio progressivo apos tentativas falhas | `security/accountLockout.js` |
| Permissoes do banco, nunca do JWT | `verifyAdmin` carrega permissoes do banco/cache em cada request | `middleware/verifyAdmin.js` |
| Magic-link HMAC | Token assinado + expiracao curta (~15 min) | `services/producerAuthService.js`, `services/corretoraAuthService.js` |
| Validacao de env critico em producao | Servidor nao sobe sem `JWT_SECRET`, `DB_*`, `MP_WEBHOOK_SECRET`, `CPF_ENCRYPTION_KEY` | `config/env.js` |

### Contextos removidos
`verifyUser` e `requireRole` foram removidos em 2026-03. Em seu lugar: `authenticateToken` (usuario generico) + `requirePermission(key)` (admin com RBAC).

---

## CSRF

| Controle | Implementacao | Arquivo |
|----------|--------------|---------|
| Double-submit cookie | Token em cookie `csrf_token` (`httpOnly: false`) + header `x-csrf-token` | `middleware/csrfProtection.js` |
| Timing-safe comparison | `crypto.timingSafeEqual()` | idem |
| GET/HEAD/OPTIONS isentos | Metodos seguros nao exigem CSRF | idem |
| Aplicado em | `/api/admin/*`, `/api/ecommerce/*`, `/api/corretora/*` (mutation), `/api/producer/*` (mutation) | mounts em `routes/adminRoutes.js`, `routes/ecommerceRoutes.js`, `routes/corretoraPanelRoutes.js`, `routes/producerRoutes.js` |
| Isento | webhooks (`/api/webhooks/*`), `/api/login` e `/api/admin/login` (CSRF e emitido **depois** do login) | routers de `public/` e `auth/` |

---

## RBAC (admin)

### Modelo
- Tabelas: `admins`, `admin_roles`, `admin_permissions`, `admin_role_permissions`
- Role `master` bypassa todas as verificacoes individuais
- Permissoes sao carregadas do banco a cada request, nunca do JWT

### Middleware granular

`middleware/requirePermission.js` — verificacao por chave. Uso: `requirePermission("chave.acao")`.

### Rotas com permissao aplicada hoje

| Rota | Permissao |
|------|-----------|
| `/admin/relatorios/*` | `relatorios.ver` |
| `/admin/config`, `/admin/shop-config/upload` | `config.editar` |
| `/admin/users` | `usuarios.ver` |
| `/admin/pedidos` | `pedidos.ver` |
| `/admin/mercado-do-cafe` | `mercado_cafe_view` |
| `/admin/mercado-do-cafe/metrics` | `mercado_cafe_view` |
| `/admin/monetization/*` (planos) | `mercado_cafe_view` (+ `mercado_cafe_plan_manage` em acoes sensiveis) |
| `/admin/mercado-do-cafe/kyc` | `mercado_cafe_view` (+ gate KYC nas mutacoes) |
| `/api/corretora/leads/*` | `mercado_cafe_leads.gerenciar` (no painel da corretora) |

### Super-permissao legada
`mercado_cafe_manage` ainda libera tudo em `/admin/mercado-do-cafe/*` — split granular definido em migration `2026041800000015-split-mercado-cafe-permissions.js`.

### Gap conhecido
Modulos admin sem `requirePermission`: `adminProdutos`, `adminCategorias`, `adminCupons`, `adminDrones`, `adminNews`, `adminSiteHero`, `adminHeroSlides`, `adminColaboradores`, `adminServicos`, `adminCarts`. Todos continuam protegidos por `verifyAdmin` + `validateCSRF`, mas sem gate granular — qualquer admin autenticado tem acesso.

---

## Webhooks externos

| Webhook | Validacao | Arquivo |
|---------|-----------|---------|
| Mercado Pago / Asaas | `middleware/validateMPSignature.js` (HMAC `MP_WEBHOOK_SECRET`) | `routes/public/webhookAsaas.js` + `paymentWebhookService.js` |
| ClickSign (contratos) | HMAC via `CLICKSIGN_HMAC_SECRET` | `routes/public/webhookClicksign.js` + `public/webhookClicksignController.js` |
| Em producao sem `MP_WEBHOOK_SECRET` | Servidor rejeita startup | `config/env.js` |

Todos os webhooks gravam em `webhook_events` para auditoria + retry.

---

## KYC / AML (Fase 10.2)

Entregue em 2026-04-21 para o Mercado do Café. Bloqueia emissao de contratos por corretora nao verificada.

| Componente | Arquivo | O que faz |
|-----------|---------|-----------|
| Service | `services/corretoraKycService.js` (298L) | FSM: `pending → in_review → {verified | rejected}`; valida CNPJ, QSA, risk_score |
| Provider resolver | `services/kyc/kycProviderResolver.js` | Seleciona mock ou real via env |
| Mock adapter | `services/kyc/kycMockAdapter.js` | Fixtures determinísticas para dev/test |
| Real adapter | `services/kyc/kycBigdatacorpAdapter.js` | Integracao BigDataCorp |
| Admin API | `/api/admin/mercado-do-cafe/kyc`, `POST /:id/verify`, `POST /:id/reject` | `controllers/corretoraKycAdminController.js` |
| Corretora API | `GET /api/corretora/kyc-status` | `controllers/corretoraPanel/kycStatusController.js` |
| Tabela | `corretora_kyc` (cnpj, qsa, risk_score, provider, provider_response_raw) | migration `2026042000000006-create-corretora-kyc.js` |
| Tests | 59/59 unit + 3 smokes | `test/unit/services/corretoraKycService.unit.test.js` |

### Gate de contrato
Service `contratoService.create()` verifica `corretora_kyc.status === "verified"` antes de gerar PDF. Se nao verificado: `400 { code: "KYC_REQUIRED" }`.

---

## Contratos digitais (Fase 10.1)

| Componente | Arquivo |
|-----------|---------|
| Service principal | `services/contratoService.js` (610L) — gera PDF com Puppeteer + SHA-256 + QR token |
| Signer adapter | `services/contratoSignerService.js` + `services/contratos/clicksignAdapter.js` |
| Admin API | `/api/admin/contratos` (em producao exige `CONTRATO_SIGNER_PROVIDER=clicksign`; dev aceita `stub`) |
| Corretora API | `/api/corretora/contratos`, `POST /:id/assinar` |
| Produtor API | `/api/producer/contratos` (listagem) |
| Verificacao publica via QR | `GET /api/public/verificar-contrato/:token` — confere hash SHA-256 do PDF |
| Tabela | `contratos` (hash, qr_token, signed_pdf_url, status, lead_id) |

### Proteções
- PDF impresso tem **QR Code + ultimos 8 chars do hash SHA-256** no rodape.
- Webhook ClickSign valida HMAC antes de atualizar status.
- Mudancas de status gravadas em `admin_audit_logs` e `subscription_events`.

---

## LGPD 2.0 (Fase 10.3)

Entregue em 2026-04-20. Documentacao completa em [docs/compliance/](docs/compliance/).

| Controle | Arquivo |
|----------|---------|
| Mapa de dados (PII por tabela) | `docs/compliance/mapa-de-dados.md` |
| Bases legais (art. 7º) | `docs/compliance/bases-legais.md` |
| Retencao de dados | `docs/compliance/retencao.md` |
| Direitos dos titulares (art. 18) | `docs/compliance/direitos-dos-titulares.md` |
| RIPD (relatorio de impacto) | `docs/compliance/ripd.md` |
| Resposta a incidentes | `docs/compliance/incidentes-seguranca.md` |
| CPF criptografado em repouso | `CPF_ENCRYPTION_KEY` obrigatorio em prod; coluna `cpf_hash` para busca sem decriptar | migration `2026040200000001-encrypt-cpf-add-cpf-hash.js` |
| Canal DPO publico | `POST /api/public/privacidade/contato` | `controllers/public/publicPrivacyContactController.js` |
| Unsubscribe HMAC | `POST /api/public/email/unsubscribe` (token HMAC sem auth) | `lib/unsubscribeTokens.js`, `repositories/emailSuppressionsRepository.js` |
| Produtor — solicitacoes LGPD | `POST /api/producer/data-request`, `POST /api/producer/data-deletion` | `services/producerPrivacyService.js` (322L), tabela `privacy_requests` |
| Retencao configuravel | `PRIVACY_DELETION_GRACE_DAYS` env | |

---

## Auditoria e logs admin

Dois sistemas convivem:

| Sistema | Status | Arquivo |
|---------|--------|---------|
| `admin_logs` (legacy) | Mantido para compatibilidade | `repositories/logsRepository.js`, `services/adminLogs.js` |
| `admin_audit_logs` (novo, Fase 10) | Padrao para acoes sensiveis pos-Fase 10 | `services/adminAuditService.js`, `repositories/adminAuditLogsRepository.js` |

### Registra em `admin_audit_logs` hoje
- Acoes em corretoras: `corretora.approved`, `corretora.rejected`, `corretora.status_changed`, `corretora.featured_changed`
- Reviews: `review.moderated`
- Planos: `plan.assigned`, `plan.canceled`
- Promocoes por cidade: `city_promotion.created`, `city_promotion.deactivated`
- Time: `team.invited`
- Carrinhos (novo 2026-04-22): `carrinhos.scan` manual
- KYC: `kyc.verified`, `kyc.rejected`
- Contratos: `contrato.created`, `contrato.sent`, `contrato.signed`
- Impersonacao: `corretora.impersonate_start`, `corretora.impersonate_exit`

### Gap
Modulos que ainda logam so em `admin_logs` (via `logAdmin()`): produtos, categorias, cupons, hero, drones, news. Plano eh migrar progressivamente em proximas sprints.

### Helper `diffFields`
`adminAuditService.diffFields(before, after, [campos])` — gera `{ before, after, changed_fields }` so com os campos que mudaram. Truncate automatico de valores > 500 chars.

---

## Upload e midia

| Controle | Implementacao | Arquivo |
|----------|--------------|---------|
| Whitelist MIME | JPEG, PNG, WEBP, GIF. SVG bloqueado | `services/mediaService.js` |
| Limites de tamanho | 5 MB/arquivo, max 10 arquivos | idem (multer config) |
| Magic bytes validation | Disponivel (aplicada em `adminServicos` e `adminConfigUpload`) | `utils/fileValidation.js` |
| Videos | Apenas MP4, WEBM, OGG | `services/mediaService.js` |
| Storage adapter | Disco local / S3 / GCS via adapter pattern | `services/media/storageAdapter.js` |
| Cleanup de orfaos | `mediaService.enqueueOrphanCleanup()` e `removeMedia()` | `services/media/mediaCleanup.js` |

### Gap
Magic bytes validation ainda nao esta aplicada em todos os endpoints de upload — apenas `adminServicos` e `adminConfigUpload` usam. Modulos sem: news, drones, hero, produtos.

---

## Sanitizacao XSS

| Controle | Implementacao | Arquivo |
|----------|--------------|---------|
| `stripHtml` | Remove todas as tags HTML | `utils/sanitize.js` |
| `sanitizeRichText` | Remove vetores perigosos, preserva formatacao | `utils/sanitize.js` (usa `sanitize-html`) |
| `sanitizeText` | stripHtml + truncagem por comprimento | `utils/sanitize.js` |

Aplicado em: avaliacoes, news (title/excerpt/content), perfil de usuario, notas de lead, reviews de corretora.

---

## Validacao de entrada

| Controle | Implementacao | Arquivo |
|----------|--------------|---------|
| Zod schemas | Todas as rotas com body (POST/PUT/PATCH) | `schemas/*.js` |
| Middleware de validacao | Factory `validate(schema)` | `middleware/validate.js` |
| Coerção de query (GET) | Zod preprocess — ex.: `z.coerce.number()` | exemplo em `schemas/cartsSchemas.js` |

---

## Rate limiting

| Controle | Implementacao | Arquivo |
|----------|--------------|---------|
| Global | Adaptive rate limiter com Redis + fallback in-memory | `middleware/adaptiveRateLimiter.js` |
| Especifico por endpoint | Login, admin login, MFA, forgot-password, reset-password, logout, formularios publicos (lead, contato) | Aplicado nas rotas |
| Bot protection | Cloudflare Turnstile invisible em forms publicos (lead, contato) | `middleware/verifyTurnstile.js` |
| Comentarios drones | Throttle (1 por 5s por IP) | `middleware/dronesCommentThrottle.js` |

---

## Error handling

| Controle | Implementacao | Arquivo |
|----------|--------------|---------|
| Contrato de resposta | `{ ok: false, code, message, details? }` via `errorHandler` | `middleware/errorHandler.js`, `lib/response.js` |
| Sem stack trace em producao | Mensagem generica para 5xx | idem |
| Logging estruturado | Pino com requestId para erros; `lib/logger.js` | `middleware/requestLogger.js` |
| Sentry | Captura automatica de 5xx (opcional via `SENTRY_DSN`) | `lib/sentry.js` |
| Codigos de erro canonicos | `constants/ErrorCodes.js` — nunca strings literais | |

---

## Mercado do Café (Fase 10) — visao consolidada

| Componente | Status | Arquivo |
|-----------|--------|---------|
| Corretoras (publico + admin) | ✅ | `services/corretorasService.js` (787L) |
| Leads (funil, SLA, notas, eventos) | ✅ | `services/corretoraLeadsService.js` (1182L) |
| Reviews (moderacao + reply) | ✅ | `services/corretoraReviewsService.js` |
| Contratos digitais | ✅ (Fase 10.1) | `services/contratoService.js` |
| KYC/AML com gate | ✅ (Fase 10.2) | `services/corretoraKycService.js` |
| LGPD 2.0 | ✅ (Fase 10.3) | `services/producerPrivacyService.js`, `docs/compliance/` |
| Ticker CEPEA + ICE "C" | ✅ (Fase 10.4) | `services/marketQuotesService.js`, job `marketQuotesSyncJob` |
| Planos (capabilities) | ✅ schema + atribuicao | `services/planService.js` (508L) |
| Billing (webhook Asaas) | ⚠️ **parcial** — webhook existe mas atribuicao final de plano e manual | `services/corretoraSubscriptionWebhookService.js` |
| CSV export de leads | ✅ | `routes/corretoraPanel/corretoraLeads.js` |
| Auditoria granular | ✅ em acoes sensiveis via `admin_audit_logs` | `services/adminAuditService.js` |

---

## Jobs e workers

| Job/Worker | Arquivo | O que faz |
|-----------|---------|-----------|
| `climaSyncJob` | `jobs/climaSyncJob.js` | Sync Open-Meteo (precipitacao) 2x/dia |
| `cotacoesSyncJob` | `jobs/cotacoesSyncJob.js` | CEPEA scraping + ICE API |
| `leadFollowupJob` | `jobs/leadFollowupJob.js` | Emails de followup para leads com SLA vencido |
| `trialReminderJob` | `jobs/trialReminderJob.js` | Lembrete de trial para corretoras |
| `marketQuotesSyncJob` | `jobs/marketQuotesSyncJob.js` | Ticker CEPEA + ICE "C" (Fase 10.4) |
| `abandonedCartsScanJob` | `jobs/abandonedCartsScanJob.js` | **Novo 2026-04-22** — promove carrinhos abertos antigos a `carrinhos_abandonados` |
| `abandonedCartNotificationsWorker` | `workers/abandonedCartNotificationsWorker.js` | Envia e-mails da fila (`GET_LOCK` global) |

Todos usam `lib/logger.js` (Pino). Em `NODE_ENV=test` os jobs **nao iniciam** automaticamente.

---

## Riscos: resolvidos / parciais / pendentes

### ✅ Resolvidos (pos-Fase 10)
- JWT em cookie HttpOnly com `tokenVersion` (sessoes invalidaveis)
- CSRF double-submit com timing-safe comparison
- RBAC granular em rotas sensiveis
- CPF criptografado em repouso com `cpf_hash` para busca
- Webhook Mercado Pago rejeita sem `MP_WEBHOOK_SECRET`
- Webhook ClickSign valida HMAC
- Turnstile em forms publicos
- Magic-link do produtor com HMAC + TTL curto
- KYC/AML com FSM e gate de contrato
- LGPD 2.0: mapa de dados, bases legais, retencao, canal DPO, unsubscribe HMAC
- `admin_audit_logs` com snapshot + diff em acoes sensiveis
- Contratos com SHA-256 + QR para verificacao publica

### ⚠️ Parciais
- **RBAC** nao cobre todos os modulos admin (catalogo, news, drones, hero, cupons, carrinhos). Protegidos por `verifyAdmin` + CSRF, mas sem gate granular.
- **Magic bytes validation** aplicada so em `adminServicos` e `adminConfigUpload`.
- **Audit log** — modulos legados ainda gravam so em `admin_logs`; migracao para `admin_audit_logs` em andamento.
- **Paginacao em listagens admin** — varias retornam tudo (ex.: `GET /admin/carrinhos`, `GET /admin/audit`). Risco de performance com crescimento.
- **Billing automatico** — webhook Asaas existe mas atribuicao efetiva de plano para corretora eh manual no admin.
- **Notificacoes em tempo real** — corretora faz polling 60s em `/api/corretora/notifications`. SSE/WebSocket eh roadmap.

### ❌ Pendentes
- **Lock global multi-processo no scan** — `abandonedCartsScanJob` usa flag in-memory. Se subir PM2 cluster, dois scans podem rodar simultaneamente (SQL e idempotente, nao duplica, mas dobra carga). Plano: `GET_LOCK` MySQL.
- **SBOM / dependency scanning** — nao ha CI configurado para auditar vulnerabilidades.
- **Secret rotation** — `JWT_SECRET`, `MP_WEBHOOK_SECRET`, `CLICKSIGN_HMAC_SECRET` nunca foram rotacionados em prod. Procedimento documentado mas sem automacao.
- **Grafana/alertas** — observabilidade basica via Pino/Sentry; sem dashboard de SLA/latencia/taxa de erro por modulo.
- **Testes de integracao do broadcast "lote vendido"** — so smoke manual.
- **Compliance docs** tem `incidents/` vazia — primeiro registro quando houver.

---

## Checklist de hardening proximos (roadmap)

| Item | Prioridade | Esforco estimado |
|------|------------|------------------|
| Expandir `requirePermission` para catalogo e news | P1 | 1-2 dias (migration + wiring) |
| Migrar resto de `admin_logs` → `admin_audit_logs` | P2 | 2-3 dias |
| `GET_LOCK` no `abandonedCartsScanJob` para multi-processo | P2 | 1 dia |
| Magic bytes em todos os uploads | P2 | 1-2 dias |
| Paginacao em listagens admin (audit, carrinhos, logs) | P1 | 2-3 dias |
| Atribuicao automatica de plano via webhook Asaas | P1 | 1-2 dias |
| Dashboard Grafana (SLA, volume leads, taxa aprovacao reviews) | P2 | 3-5 dias |
| SSE/WebSocket para notificacoes de corretora | P2 | 3-5 dias |
| Integration test do broadcast "lote vendido" | P2 | 1 dia |
| SBOM + `npm audit` no CI | P2 | 1 dia |

---

## Referencias cruzadas

- [README.md](README.md) — setup, stack, arquitetura
- [CLAUDE.md](CLAUDE.md) — regras operacionais, refs canônicas
- [docs/flows.md](docs/flows.md) — fluxos criticos de checkout, pagamento, webhook
- [docs/decisions.md](docs/decisions.md) — ADRs
- [docs/runbook.md](docs/runbook.md) — operacao em producao
- [docs/roadmap-fase-10-entregue.md](docs/roadmap-fase-10-entregue.md) — consolidacao da Fase 10
- [docs/compliance/](docs/compliance/) — LGPD 2.0 completo
- [docs/swagger/](docs/swagger/) — specs OpenAPI por modulo

---

## Historico de revisoes

| Data | Resumo |
|------|--------|
| 2026-04-22 | Revisao pos-Fase 10: adiciona 4 contextos de auth, KYC, LGPD 2.0, contratos, ticker, audit log novo, novos jobs; separa riscos em resolvidos/parciais/pendentes |
| 2026-04-08 | Versao original: JWT, CSRF, RBAC, upload, XSS, rate limit, error handling, lacunas iniciais |
