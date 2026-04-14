# Auditoria da SaaS Kavita — 2026-04-14

Auditoria completa do sistema Kavita (e-commerce base + Mercado do Café)
consolidando três eixos: Segurança, Arquitetura/Qualidade, DB/Observabilidade/Deploy.

> Metodologia: inspeção estática do código em
> `C:\Users\rickj\kavita\kavita-backend` e `C:\Users\rickj\kavita\kavita-frontend`,
> três agentes em paralelo. Não inclui pen-test, load test nem revisão de infra cloud.

---

## Sumário executivo

Sistema **robusto e bem arquitetado** para um MVP → early-stage SaaS. Padrão de
camadas respeitado em 100% dos módulos auditados, segurança em profundidade
(3 contextos de auth isolados, CSRF double-submit, SQL parametrizado em 100%
das queries, HMAC timing-safe, upload com magic bytes). O que falta é o
próximo estágio: **disciplina operacional** (backup, retry/DLQ, cache) e
**higiene de dependências** (CVEs abertos, `any` no frontend).

### Placar por severidade

| Severidade | Achados | Destaques |
|---|---|---|
| 🔴 Crítico | 3 | Backup MySQL ausente · CVEs em `axios/flatted/next` · 530 `any` no frontend |
| 🟠 Alto | 2 | Transações ausentes em invite/assign-plan · Rate limit faltando em `/unsubscribe` |
| 🟡 Médio | 7 | Índice `created_at` · Pool 10 conexões · Cache de métricas · etc. |
| 🟢 Baixo | 4 | `docker-compose.yml` ausente · SameSite=lax · ESLint/Prettier backend · etc. |

### Top 5 ações — fazer esta semana
1. **Implementar e documentar backup do MySQL** (script + cron + restore testado).
2. **`npm audit fix`** + remover `axios` não usado do frontend.
3. **Rate limit** em `/api/public/email/unsubscribe` e `/resubscribe`.
4. **Envolver em `withTransaction`**: invite de equipe, assign de plano, moderação + audit log.
5. **Índice em `corretora_leads(created_at)`** — dashboard começa a sofrer em 30-90 dias.

---

## 1. Segurança

### 1.1 Pontos fortes (nada a fazer)
- **3 contextos JWT isolados** (admin 2h, corretora 7d, producer 30d) com `HttpOnly`, `Secure` em produção, `SameSite=lax`.
- **`token_version`** em todos os contextos permite revogação de sessão sem deletar registro.
- **CSRF double-submit** timing-safe (`csrfProtection.js:50-59`), aplicado em **todas** as rotas autenticadas. Webhook Mercado Pago isento intencionalmente (usa `validateMPSignature` HMAC-SHA256).
- **SQL injection — zero achados.** 100% das queries parametrizadas com `?`.
- **Upload seguro:** magic bytes + MIME whitelist + sanitize de filename contra path traversal (`utils/fileValidation.js`).
- **Helmet + CSP + HSTS** configurados (`config/helmet.js:20-43`).
- **CPF criptografado em repouso** + `cpf_hash` para lookups (LGPD).
- **HMAC timing-safe** em `lib/corretoraLeadTokens.js` (24 chars / 144 bits) e `lib/unsubscribeTokens.js` (32 chars / 192 bits).
- **CORS restritivo** por whitelist (`config/cors.js:34-48`), sem wildcard.
- **Secrets validados no boot** (`config/env.js`) — produção derruba se faltar `JWT_SECRET`, `MP_WEBHOOK_SECRET`, `CPF_ENCRYPTION_KEY`.

### 1.2 Achados

#### 🟠 ALTO — Rate limit ausente em `/api/public/email/*`
- `routes/public/publicEmail.js:34, 50` — `GET /unsubscribe` e `POST /resubscribe` protegidos só pelo token HMAC.
- Risco: brute force no token (viável com ≥2^144 iterações — impraticável, mas queima CPU do servidor) + amplificação de enumeração.
- **Correção:** aplicar rate limiter existente (5 req/IP/hora é suficiente).

#### 🟡 MÉDIO — `dangerouslySetInnerHTML` presente
- `src/components/products/DestaquesSection.tsx:196` — usado para injetar **CSS estático** (não conteúdo do usuário).
- Sem risco real de XSS, mas força `styleSrc: 'unsafe-inline'` no CSP.
- **Correção:** mover para `<style jsx>` ou CSS Module.

#### 🟢 BAIXO — `SameSite=lax` em cookie admin
- `controllers/authAdminController.js:23-25` — admin deveria ser `strict` (menor blast radius em CSRF cross-site).
- Sem impacto real hoje porque CSRF double-submit já bloqueia.

#### 🟡 MÉDIO — PII em logs de unsubscribe
- `routes/public/publicEmail.js:43` loga `{ email, scope }` no happy path.
- Intencional para auditoria, mas o email do produtor vira registro permanente nos logs.
- **Correção opcional:** hashear email ou logar só domínio para telemetria.

---

## 2. Arquitetura & Qualidade de código

### 2.1 Pontos fortes
- **Camadas respeitadas** — zero `pool.query` em rota/controller; zero `res.json(` bruto em controllers (exceto webhook MP, intencional).
- **`AppError` + `ERROR_CODES`** em 100+ ocorrências — contrato de erro uniforme.
- **`lib/response.js`** em todos os controllers.
- **Padrão de cron jobs** consistente (`register/stop/getState`) entre `climaSyncJob`, `cotacoesSyncJob`, `leadFollowupJob`.
- **Sem dead code relevante.** Zero `// legacy`, `// deprecated`, `// TODO remove` espalhados.
- **ESLint config flat** no frontend com `react-hooks`, `jsx-a11y`, plugin Next, regra `no-explicit-any: warn`.

### 2.2 Achados

#### 🔴 CRÍTICO — 530 `any`/`@ts-ignore` no frontend, 114 arquivos
- Concentração: `src/app/admin/configuracoes/page.tsx` (43 `as any` só neste arquivo).
- Outros hotspots: `PersonalInfoForm.tsx`, `ClimaForm.tsx`, forms dinâmicos.
- Impacto: refator arriscado (sem segurança de tipo), onboarding de novo dev sofre.
- **Correção faseada:** (a) enable `noImplicitAny` para detectar sangramento, (b) refatorar `configuracoes/page.tsx` com discriminated union, (c) meta: zerar em 90 dias.

#### 🔴 CRÍTICO — 7 CVEs em dependências (`npm audit`)
| Pacote | Severidade | CVE |
|---|---|---|
| `axios` | CRITICAL | GHSA-3p68-rc4w-qgx5 (SSRF via NO_PROXY) + GHSA-fvcv-3m26-pcqx (cloud metadata) |
| `flatted` (≤3.4.1) | HIGH | 2 CVEs (DoS, prototype pollution) |
| `minimatch` | HIGH | ReDoS |
| `picomatch` | HIGH | Method injection |
| `next` (9.5.0–15.5.14) | HIGH | 3 CVEs (smuggling, DoS, disk cache) |

**Correção:** `npm audit fix` em ambos os repos. Frontend: **remover `axios` do `package.json`** — já não é usado (migração para `apiClient` completa).

#### 🟠 ALTO — Webhook viola `response.ok`/`AppError`
- `controllers/paymentController.js:145, 158, 174` — `res.status(200).json({ ok: true })` direto.
- **Justificativa válida:** MP retoma webhook infinitamente em qualquer 4xx/5xx; retornar 200 de propósito.
- **Correção:** criar `response.webhookOk()` em `lib/response.js` para preservar a regra e deixar a intenção explícita.

#### 🟡 MÉDIO — Controllers gordos
- `controllers/dronesPublicController.js` (394 linhas) e `controllers/corretorasAdminController.js` (356 linhas) misturam delegação com formatting/transformação.
- Sem bug — mas dificulta manutenção.

#### 🟡 MÉDIO — Testes do Mercado do Café incompletos
Existem 75 unit tests + 41 integration tests no backend, mas **faltam** cobertura específica para:
- `corretoraLeadsService` (SLA, broadcast)
- `corretoraTeamService` (capabilities matrix, guard último owner)
- `corretoraReviewsService.moderateReview` (audit log)
- `producerAuthService` (magic link consume + welcome email first login)
- `leadFollowupService` (idempotência, suppressão, quiet hours)

#### 🟢 BAIXO — Backend sem ESLint config próprio, sem Prettier
- Script `npm run lint` existe mas config é implícito.
- Frontend tem config flat completa.
- Recomendação: alinhar backend com a mesma rigor.

---

## 3. Banco de dados, Observabilidade & Deploy

### 3.1 Pontos fortes
- **Migrations disciplinadas** (numeração `YYYYMMDDHH0000NN`, 100% reversíveis, sem edições pós-commit).
- **FKs com `ON DELETE` explícito** em todas as tabelas do Mercado do Café.
- **11 tabelas do módulo** bem normalizadas, com uso correto de UNIQUE composto para idempotência (`corretora_lead_followups`, `email_suppressions`, `producer_favorites`).
- **Health check** `/health` checando DB + Redis opcional (`server.js:134-150`).
- **Graceful shutdown** completo — SIGTERM/SIGINT, 30s timeout, encerra pool, Redis, cron jobs (`bootstrap/shutdown.js:20-64`).
- **Dockerfile multi-stage** com non-root user (UID 1001), `STOPSIGNAL SIGTERM`, healthcheck.
- **CI/CD** (GitHub Actions): lint + migrate + test + build + `npm audit` nível crítico, em ambos os repos.
- **Env obrigatórias** validadas no boot (`config/env.js:3-21`).
- **`lib/withTransaction.js`** disponível e usado em `cartService`, `orderService`, `paymentWebhookService`, `checkoutService`.
- **Pino** em prod, `Sentry` opt-in via `SENTRY_DSN`.

### 3.2 Achados

#### 🔴 CRÍTICO — Backup do MySQL não documentado
Nenhum script em `scripts/`, `bin/` ou referência em `README.md`/`docs/`.
SaaS em produção sem backup documentado é risco inaceitável.
**Correção mínima:**
1. Script `scripts/db/backup.sh` com `mysqldump --single-transaction --routines --triggers` + upload para S3/R2.
2. Cron dedicado (6h em 6h).
3. **Teste de restore** trimestral (sem restore testado, não há backup).
4. Documentar em `docs/runbook.md`.

#### 🟠 ALTO — Transações ausentes em operações multi-tabela críticas
Estas operações fazem N writes sem `withTransaction`:
- **Invite de equipe** (`corretoraTeamService.invite`) — `INSERT corretora_users` + envio de email via token. Se email falha, user órfão.
- **Assign de plano** (`planService.assignPlan`) — `INSERT/UPDATE corretora_subscriptions` + `admin_audit_logs`. Falha parcial deixa audit vazio ou sub inconsistente.
- **Moderação de review** (`corretoraReviewsService.moderateReview`) — `UPDATE corretora_reviews` + `admin_audit_logs`.

**Correção:** envolver cada uma em `withTransaction(async (tx) => { ... })`, passando o handle para repos.

#### 🟡 MÉDIO — Faltam índices em `created_at` para queries de dashboard
- `repositories/corretorasMetricsRepository.js:17-48` faz `WHERE created_at >= ? AND created_at < ?` em `corretora_leads` sem índice em `created_at` isolado.
- `idx_leads_corretora_response(corretora_id, first_response_at)` existe mas não cobre query sem `corretora_id`.
- **Correção:** migration `ADD INDEX idx_leads_created_at (created_at)` em `corretora_leads` e `corretora_reviews`.

#### 🟡 MÉDIO — Pool com `connectionLimit: 10`
- `config/pool.js:L4-20` — conservador. Sob carga com múltiplas corretoras + dashboard + webhooks concorrentes, fila estoura rápido.
- **Correção:** 20–30 em produção via env `DB_CONNECTION_LIMIT`.

#### 🟡 MÉDIO — Dashboard de métricas sem cache
- `corretorasMetricsService.getDashboard` roda 6 queries a cada request. Para admin (poucos users), OK. Mas COUNTs em 90 dias já é caro.
- **Correção:** cache Redis de 5 min com chave `metrics:dashboard:{range}`. TTL curto mantém dados quase realtime.

#### 🟡 MÉDIO — Sem correlation/request ID no logger
- Nenhum middleware injeta `req.id` no contexto do logger.
- Debug de incidentes fica manual (grep por timestamp).
- **Correção:** `express-request-id` + `logger.child({ reqId })` no middleware inicial.

#### 🟡 MÉDIO — Eventos de negócio críticos sem log estruturado
- `plan.assigned` — **não emite log** (`planService.assignPlan`).
- `magic.link.sent` — só loga em falha, não em sucesso.
- `review.moderated` — idem.
- **Correção:** emitir `logger.info({ ... }, "plan.assigned")` em cada.

#### 🟡 MÉDIO — `leadFollowupJob` sem retry/DLQ
- Se `mailService.sendTransactionalEmail` falha, grava `error_at` e segue.
- Não há job de retry para esses erros — lead fica sem follow-up permanentemente.
- **Correção:** job separado que periodicamente reprocessa rows com `error_at IS NOT NULL AND sent_at IS NULL AND error_at > NOW() - INTERVAL 3 DAY`, com máximo de 3 tentativas.

#### 🟢 BAIXO — `docker-compose.yml` ausente na raiz
- Dockerfiles existem, mas desenvolvimento local requer setup manual (MySQL, Redis, backend, frontend).
- **Correção:** `docker-compose.yml` com MySQL 8, Redis 7, backend e frontend linkados. Acelera onboarding.

#### 🟢 BAIXO — Sem `/ready` (apenas `/health`)
- Ambos estão fundidos em `/health`. Kubernetes/load balancer ganham flexibilidade quando `liveness` e `readiness` são separados (readiness pode falhar durante migrations sem matar o pod).

---

## 4. Produto & Monetização (contexto SaaS)

> Análise baseada em código + docs do módulo Mercado do Café. Não é auditoria de UX.

### 4.1 Pronto
- Captura qualificada de leads (4 campos obrigatórios + Turnstile + rate limit).
- Auth passwordless do produtor (retention sem fricção).
- Multi-user com 4 roles + guards (último owner).
- Audit log com snapshot resistente a deleção.
- Follow-up automatizado com unsubscribe one-click (CAN-SPAM compliance).
- Dashboard admin com KPIs + SLA p50/p90 + deltas vs período anterior.

### 4.2 Faltante crítico para cobrar
- **Webhook Mercado Pago não plugado.** Schema `corretora_subscriptions` tem `provider`, `provider_subscription_id`, `provider_status`, mas nenhuma rota receiver. Hoje tudo é admin manual.
- **Sem rotina de expiração.** Quando `current_period_end_at` vence, nada acontece — corretora continua com capabilities do plano pago.
- **Sem página pública de preços** do Mercado do Café (`/pricing` existe para e-commerce base, não para corretoras).
- **Sem autosserviço de upgrade/downgrade** — corretora não consegue trocar de plano sozinha.

### 4.3 Observabilidade de negócio
- **Sem dashboard de negócio para o fundador** (MRR, churn, ativação, conversão lead→review).
- **Sem funil de ativação** instrumentado (magic link enviado → consumido → primeiro lead → primeira review).
- **Sem alertas** de anomalia (queda brusca de leads, SLA degradando, supressão em massa).

---

## 5. Matriz de risco consolidada

| # | Achado | Severidade | Módulo | Esforço |
|---|---|---|---|---|
| 1 | Backup MySQL ausente | 🔴 | Infra | M |
| 2 | CVEs npm (axios/flatted/next/…) | 🔴 | Deps | S |
| 3 | 530 `any` no frontend | 🔴 | FE quality | L |
| 4 | Transações em invite/assign/review | 🟠 | Backend | M |
| 5 | Rate limit em `/email/*` | 🟠 | Security | S |
| 6 | Webhook MP / billing ativo | 🟠 | Produto | L |
| 7 | Índice em `created_at` | 🟡 | DB perf | S |
| 8 | Pool 10 → 20–30 | 🟡 | DB infra | S |
| 9 | Cache Redis em metrics | 🟡 | Performance | S |
| 10 | Correlation ID + eventos críticos | 🟡 | Observability | M |
| 11 | `leadFollowupJob` sem retry | 🟡 | Reliability | S |
| 12 | Testes Mercado do Café | 🟡 | QA | L |
| 13 | Controllers gordos | 🟡 | Code health | M |
| 14 | `dangerouslySetInnerHTML` CSS | 🟡 | Security hygiene | S |
| 15 | `docker-compose.yml` raiz | 🟢 | DX | S |
| 16 | SameSite=strict admin | 🟢 | Hardening | S |
| 17 | Dashboard de MRR/churn | 🟢 | Produto | M |

**Esforço:** S=horas · M=dias · L=semanas

---

## 6. Plano de ação recomendado (90 dias)

### Sprint 1 — Disciplina operacional (semana 1)
- [ ] Script de backup + restore testado
- [ ] `npm audit fix` nos dois repos
- [ ] Remover `axios` do frontend
- [ ] Rate limit em `/email/*`
- [ ] Índice `created_at` em `corretora_leads` e `corretora_reviews`
- [ ] Correlation ID middleware

### Sprint 2 — Robustez (semanas 2-3)
- [ ] `withTransaction` em invite, assign plan, moderate review
- [ ] Retry/DLQ em `leadFollowupJob`
- [ ] Cache Redis em `corretorasMetricsService`
- [ ] Aumentar pool para 20–30 em produção
- [ ] Logs estruturados em `plan.assigned`, `magic.link.sent`, `review.moderated`

### Sprint 3 — Billing (semanas 4-5)
- [ ] Webhook receiver Mercado Pago
- [ ] Job diário de expiração de assinaturas
- [ ] Página pública de preços `/mercado-do-cafe/planos`
- [ ] Fluxo de autosserviço (upgrade/downgrade)

### Sprint 4 — Qualidade (semanas 6-8)
- [ ] Cobertura de testes Mercado do Café (capabilities, broadcast, magic link, reviews, follow-up)
- [ ] Redução de `any` no frontend (meta: -60%)
- [ ] Backend ESLint config explícito + Prettier
- [ ] Dashboard de MRR/churn/ativação para fundador
- [ ] Alertas de anomalia (via Sentry ou dedicado)

### Sprint 5 — Polish (semanas 9-12)
- [ ] Refatorar controllers gordos
- [ ] `docker-compose.yml` para DX local
- [ ] Remover `dangerouslySetInnerHTML` de CSS
- [ ] SameSite=strict em admin
- [ ] `/ready` separado de `/health`

---

## 7. Conclusão

Kavita está numa posição **acima da média** para uma SaaS desse estágio:
arquitetura séria, segurança sem achados críticos de vulnerabilidade,
migrations disciplinadas, CI/CD completo.

Os gaps são todos de **operação e monetização**, não de fundação técnica:
- Backup/restore é o único bloqueante real para escalar.
- Billing ativo é o que destrava receita.
- CVEs de deps são housekeeping, não design flaw.
- Testes do Mercado do Café são débito consciente do MVP.

Executando as Sprints 1-3 (5 semanas) o sistema sai de "MVP sólido" para
"SaaS production-ready". Sprint 4-5 é o que diferencia de "production-ready"
para "operação madura com analytics de negócio".
