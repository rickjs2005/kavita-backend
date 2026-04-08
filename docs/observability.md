# Observabilidade — kavita-backend

> Estado atual da infraestrutura de health check, logging e monitoramento.
>
> _Ultima atualizacao: 2026-04-08_

---

## 1. Health check

**Endpoint:** `GET /health` — sem autenticacao, sem rate limit.

```json
{
  "status": "ok | degraded | error",
  "ts": "ISO timestamp",
  "env": "production",
  "uptime": 3600,
  "checks": {
    "database": { "status": "ok", "latency_ms": 4 },
    "redis":    { "status": "ok | disabled | error", "latency_ms": 1 },
    "storage":  { "status": "ok", "path": "/uploads" }
  }
}
```

- Database down → 503 `error`
- Redis/storage com problema → 200 `degraded`
- Tudo OK → 200 `ok`

Redis e opcional (app tem fallback in-memory). Docker HEALTHCHECK usa este endpoint.

---

## 2. Logging — estado atual

### Infraestrutura disponivel

| Componente | Status | Arquivo |
|-----------|--------|---------|
| Logger Pino (JSON em prod, pretty em dev) | Instalado e configurado | `lib/logger.js` |
| Request logger (requestId por request) | Ativo em `server.js` | `middleware/requestLogger.js` |
| `req.log` com requestId automatico | Disponivel em todos os handlers | via `requestLogger` |

### Onde o logger Pino ja e usado

| Arquivo | Uso |
|---------|-----|
| `middleware/errorHandler.js` | `logger.error` (5xx) e `logger.warn` (4xx) com requestId |
| `lib/redis.js` | `logger.info` e `logger.warn` para eventos de conexao |
| `controllers/authController.js` | Erros de login/register/logout/reset |
| `controllers/admin/authAdminController.js` | Erros de login admin/MFA/logout |
| `controllers/paymentController.js` | Erros de payment start/webhook |
| `controllers/checkoutController.js` | Erros de checkout/preview |
| `services/checkoutService.js` | Pipeline de checkout (erros e side effects) |
| `services/orderService.js` | Notificacoes de pedido |
| `services/paymentWebhookService.js` | Status transitions e erros MP API |
| `middleware/validateMPSignature.js` | Validacao de assinatura webhook |
| `middleware/verifyAdmin.js` | Validacao de token admin |
| `server.js` | Startup, CORS, rate limiter, uploads debug |
| `bootstrap/shutdown.js` | Graceful shutdown (HTTP, MySQL, Redis) |
| `bootstrap/workers.js` | Startup de workers e jobs |
| `jobs/climaSyncJob.js` | Lifecycle do sync de clima |
| `workers/abandonedCartNotificationsWorker.js` | Erros e startup do worker |

### Onde ainda usa console.log/error/warn

~220 chamadas `console.*` em ~60 arquivos. Os piores ofensores:

| Arquivo | Chamadas |
|---------|----------|
| `server.js` | 12 (startup, com emojis) |
| `controllers/news/adminClimaController.js` | 11 |
| `jobs/climaSyncJob.js` | 9 |
| `controllers/news/adminCotacoesController.js` | 9 |
| `controllers/dronesPublicController.js` | 8 |
| `controllers/newsPublicController.js` | 8 |
| `controllers/drones/galleryController.js` | 8 |
| `services/comunicacaoService.js` | 8 |
| `bootstrap/workers.js` | 8 |

### Impacto real em producao

- Logs de `console.*` nao tem JSON estruturado, requestId ou nivel formatado
- Nao sao capturados por Datadog, CloudWatch, Loki ou qualquer log aggregator que espera JSON
- Emojis no startup (`server.js`) quebram parsers JSON
- Erros de controller sao logados como texto livre, sem correlacao com a request

### Pattern de migracao

```js
// ANTES (nao estruturado)
console.error("[modulo] erro:", e);

// DEPOIS (estruturado, com requestId automatico via req.log)
req.log.error({ err: e }, "modulo: descricao");

// Ou fora de handler Express:
const logger = require("../lib/logger");
logger.error({ err: e }, "modulo: descricao");
```

**Regra para `err`:** sempre passar como `{ err: e }` — Pino serializa `message`, `stack`, `code` automaticamente.

---

## 3. Error tracking (Sentry)

| Aspecto | Estado |
|---------|--------|
| Integracao | `lib/sentry.js` — opt-in via `SENTRY_DSN` |
| Captura | Erros 5xx no `errorHandler.js` + webhook errors no `paymentController.js` |
| Sem SENTRY_DSN | Todas as funcoes sao no-op (nao quebra) |
| Sem @sentry/node | Graceful fallback (log warning no startup) |

---

## 4. Lacunas

| Lacuna | Impacto | Prioridade |
|--------|---------|-----------|
| ~220 console.* sem logger | Logs nao estruturados em prod | Media |
| Sem `uncaughtException`/`unhandledRejection` handlers | Crash sem logging | Alta |
| Emojis em logs de startup | Quebram parsers JSON | Baixa |
| Nenhum alerta/dashboard configurado | Incidentes dependem de investigacao manual | Media |
| Sem metricas de application performance | Latencia de endpoints nao monitorada | Baixa |

---

## 5. Roadmap de migracao

### Fase 1 — Concluida

- [x] `middleware/errorHandler.js` → `logger.error/warn`
- [x] `lib/redis.js` → `logger.info/warn`

### Fase 2 — Concluida

- [x] `server.js` startup — 12 calls migrados + emojis removidos
- [x] `middleware/verifyAdmin.js` — 3 calls
- [x] `middleware/validateMPSignature.js` — 4 calls
- [x] Handlers `uncaughtException`/`unhandledRejection` adicionados
- [x] `controllers/authController.js` — 5 calls
- [x] `controllers/admin/authAdminController.js` — 4 calls
- [x] `controllers/paymentController.js` — 4 calls
- [x] `controllers/checkoutController.js` — 2 calls
- [x] `services/checkoutService.js` — 7 calls
- [x] `services/orderService.js` — 2 calls
- [x] `services/paymentWebhookService.js` — 3 calls
- [x] `bootstrap/shutdown.js` — 8 calls
- [x] `bootstrap/workers.js` — 8 calls
- [x] `jobs/climaSyncJob.js` — 9 calls
- [x] `workers/abandonedCartNotificationsWorker.js` — 3 calls

### Fase 3 — Proxima

- [ ] Controllers de conteudo: drones (30+), news (24), heroSlides (3)
- [ ] Services de conteudo: comunicacaoService (8), colaboradoresAdminService (3)
- [ ] Demais controllers e services restantes (~20 arquivos, ~50 calls)
