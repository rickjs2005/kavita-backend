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

### Fase 2 — Proxima

- [ ] `server.js` startup — 12 calls → `logger.info` + remover emojis
- [ ] `middleware/verifyAdmin.js` — 3 calls
- [ ] `middleware/validateMPSignature.js` — 4 calls
- [ ] Adicionar handlers `uncaughtException`/`unhandledRejection`

### Fase 3 — Por modulo

- [ ] Controllers criticos: auth (5), payment (4), checkout (2), drones (30+)
- [ ] Services criticos: checkoutService (7), comunicacaoService (8), orderService (2)

### Fase 4 — Completa

- [ ] Jobs e workers: climaSyncJob (9), bootstrap/workers (8)
- [ ] Demais services e controllers restantes
