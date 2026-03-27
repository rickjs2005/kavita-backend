# Observabilidade — kavita-backend

> Health check e structured logging. Estado atual, gaps e plano de execução.
>
> _Última atualização: 2026-03-27_

---

## 1. Estado atual

### Health check (`GET /health`)

```json
{ "status": "ok", "ts": "2026-03-27T...", "env": "production" }
```

Verifica apenas: `SELECT 1` no MySQL pool. Se falhar → 503. Nada mais.

**Não cobre:** Redis, diretório de uploads, latência, uptime.

### Logging

O projeto tem uma infra de logging completa e configurada:

| Componente | Status |
|-----------|--------|
| `lib/logger.js` (Pino, JSON em prod, pretty em dev) | ✅ existe |
| `middleware/requestLogger.js` (attach `req.log` com requestId) | ✅ existe |
| Uso nos controllers, services, routes, middleware | ❌ zero |

**Resultado prático:** ~200 `console.log/error/warn` espalhados em 67 arquivos produzem texto não-estruturado. Em produção, logs não têm requestId, nível JSON, nem são capturáveis por Datadog/CloudWatch/Loki.

---

## 2. Gaps

### Health check

| O que falta | Impacto |
|-------------|---------|
| Status Redis | Rate limiter degradado passa invisível |
| Status storage (`/uploads`) | Upload falha silenciosamente se disco cheio/permissão |
| Latência do banco | Lentidão de pool não é visível |
| Uptime da aplicação | Restart não detectável por monitoring externo |
| Status geral (`degraded` vs `error`) | Load balancer precisa distinguir "ok", "parcialmente degradado" e "crítico" |

### Logging

| O que falta | Impacto |
|-------------|---------|
| `errorHandler.js` não usa logger | Erros 500 são os mais críticos — são os primeiros que o time olha em prod |
| `lib/redis.js` não usa logger | Evento de desconexão do Redis some sem requestId ou nível estruturado |
| Controllers e services usam `console.error` | Sem correlação de requestId; não capturável por log aggregators |
| Emojis em console.info de startup | Quebram parsers JSON em ambientes que capturam stdout |

---

## 3. Proposta técnica

### 3.1 Health check expandido

**HTTP:** `GET /health` — sem autenticação, sem rate limit (já é assim)

**Resposta:**

```json
{
  "status": "ok | degraded | error",
  "ts": "2026-03-27T12:00:00.000Z",
  "env": "production",
  "uptime": 3600,
  "checks": {
    "database": { "status": "ok", "latency_ms": 4 },
    "redis":    { "status": "ok", "latency_ms": 1 },
    "storage":  { "status": "ok", "path": "/uploads" }
  }
}
```

**Lógica de status:**

| Condição | `status` geral | HTTP |
|----------|---------------|------|
| database ok, redis ok, storage ok | `ok` | 200 |
| database ok, redis ou storage com problema | `degraded` | 200 |
| database inacessível | `error` | 503 |

> **Racional:** Redis e storage são non-critical (app tem fallback in-memory para Redis).
> Banco é o único bloqueador real — 503 só quando ele cair.

**Redis desabilitado** (sem `REDIS_URL`/`REDIS_HOST`):
```json
"redis": { "status": "disabled" }
```

### 3.2 Migração de logging — estratégia incremental

**Fase 1 — Infraestrutura (implementado neste commit):**
- `middleware/errorHandler.js` — 2 console calls → `logger.error/warn`
- `lib/redis.js` — 3 console calls → `logger.info/warn`

Esses dois arquivos são os mais visíveis em produção: o errorHandler processa 100% dos erros e o Redis afeta rate limiting.

**Fase 2 — Server startup (próximo sprint):**
- `server.js` — 10 console calls de startup → `logger.info`
- Remover emojis (quebram parsers de log)

**Fase 3 — Controllers (por módulo, junto com migração arquitetural):**
- Migrar junto com cada módulo ao passar de legado → moderno
- Pattern: `console.error("[modulo] operação error:", e)` → `logger.error({ err: e }, "[modulo] operação")`
- 14 arquivos de controller, ~60 chamadas

**Fase 4 — Services e routes (mais extenso):**
- 11 services, 35 routes
- ~140 chamadas restantes

### 3.3 Pattern canônico de logging

```js
// IMPORT — em qualquer arquivo fora de lib/
const logger = require("../lib/logger");   // ajuste o caminho relativo

// ERRO COM OBJETO DE ERRO
logger.error({ err: e, userId: req.user?.id }, "checkout: falha ao criar pedido");

// WARN COM CONTEXTO
logger.warn({ ip: req.ip, endpoint: req.path }, "rate limit: threshold atingido");

// INFO DE CICLO DE VIDA
logger.info({ port: PORT, env: process.env.NODE_ENV }, "servidor iniciado");

// NÃO FAZER (perde estrutura em JSON)
logger.error(`[modulo] erro: ${e.message}`);   // string pura — não use
console.error("erro:", e);                     // bypassa logger completamente
```

**Regra para `err`:** sempre passar o objeto Error como `{ err: e }` — o Pino serializa
`err.message`, `err.stack`, `err.code` automaticamente como campos separados.

---

## 4. Arquivos afetados

### Fase 1 (implementado)

| Arquivo | Tipo de mudança | Console calls removidas |
|---------|----------------|------------------------|
| `server.js` | Expansão do `/health` | 0 (só adição) |
| `middleware/errorHandler.js` | Import logger + substituição | 2 |
| `lib/redis.js` | Import logger + substituição | 3 |

### Fase 2–4 (backlog)

| Arquivo | Calls | Prioridade |
|---------|-------|-----------|
| `server.js` (startup) | 10 | P2 |
| `middleware/verifyAdmin.js` | 3 | P2 |
| `middleware/validateMPSignature.js` | 4 | P2 |
| `services/mediaService.js` | 20+ | P3 |
| `services/checkoutService.js` | 7 | P3 |
| `services/comunicacaoService.js` | 11 | P3 |
| `controllers/authController.js` | 5 | P3 |
| `controllers/admin/authAdminController.js` | 7 | P3 |
| `controllers/drones/*` | ~30 | P4 (migrar junto com arch) |
| `routes/admin/adminServicos.js` | 8 | P4 (migrar junto com arch) |
| `routes/public/publicServicos.js` | 8 | P4 (migrar junto com arch) |
| _...demais routes/services_ | ~100 | P4 |

---

## 5. Riscos

| Risco | Mitigação |
|-------|-----------|
| `redis.client.ping()` bloquear o health check se Redis travar | ioredis tem `connectTimeout: 3000` + `enableOfflineQueue: false` → rejeita imediatamente se desconectado |
| Health check 503 disparar falso alarme em ferramenta de monitoring que usa Redis no status | Redis retorna `degraded`, não `error`. HTTP 200 mesmo se Redis cair — só banco gera 503 |
| Logger em redis.js criar dependência circular via lib/index.js | redis.js importa `./logger` diretamente, não via lib/index.js |
| Substituição gradual de console → logs duplicados em transição | Cada arquivo é migrado de uma vez — nunca parcialmente |
| Pino `pretty` em produção overhead | `lib/logger.js` já configura pretty somente quando `NODE_ENV !== 'production'` |
