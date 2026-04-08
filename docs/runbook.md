# Runbook — kavita-backend

> Guia operacional para diagnostico, manutencao e resposta a incidentes.
> Para setup local, consulte o [README.md](../README.md#setup-local).

---

## Health check

```
GET /health
```

Resposta:

```json
{
  "status": "ok | degraded | error",
  "ts": "2026-04-08T12:00:00.000Z",
  "env": "production",
  "uptime": 3600,
  "checks": {
    "database": { "status": "ok", "latency_ms": 4 },
    "redis":    { "status": "ok", "latency_ms": 1 },
    "storage":  { "status": "ok", "path": "/uploads" }
  }
}
```

| Status geral | Condicao | HTTP |
|-------------|----------|------|
| `ok` | Database + Redis + storage OK | 200 |
| `degraded` | Database OK, Redis ou storage com problema | 200 |
| `error` | Database inacessivel | 503 |

Redis e storage sao non-critical (app tem fallback). Banco e o unico bloqueador real.

---

## Diagnosticando erro 500

1. Verificar logs do processo (stdout em Docker, PM2, ou systemd)
2. Erros 500 sao logados via `logger.error()` no `errorHandler.js` com:
   - `err` (stack trace)
   - `status`, `code`, `url`, `method`, `requestId`
3. Se Sentry estiver configurado (`SENTRY_DSN`), erros 500 sao capturados automaticamente
4. Em desenvolvimento, o stack trace completo aparece na resposta. Em producao, mensagem generica.

**Causa comum:** erro nao tratado em service/repository que nao e instancia de `AppError`.

---

## Diagnosticando problemas de banco

**Sintomas:** 503 no health check, erros de conexao nos logs, `POOL_ENQUEUELIMIT`.

1. Verificar se MySQL esta rodando: `mysql -h $DB_HOST -u $DB_USER -p$DB_PASSWORD -e "SELECT 1"`
2. Verificar se o pool esta esgotado: procurar `POOL_ENQUEUELIMIT` nos logs
   - Pool config: 10 conexoes, fila de 100 (`config/pool.js`)
   - Se fila cheia, retorna 503 automaticamente
3. Verificar latencia no health check: `checks.database.latency_ms`
4. Verificar migrations: `npm run db:status`

**Mitigacao rapida:** reiniciar o processo libera conexoes do pool.

---

## Diagnosticando problemas de Redis

**Sintomas:** health check mostra `"redis": { "status": "error" }`, rate limiting inoperante.

1. Redis e **opcional** — app funciona sem ele com fallback in-memory
2. Sem Redis: rate limiting nao e compartilhado entre instancias
3. Sem Redis: cache de permissoes admin nao funciona (busca no banco a cada request)
4. Verificar conexao: `redis-cli -u $REDIS_URL ping`

**Impacto de Redis down:** degradacao, nao indisponibilidade. App continua respondendo.

---

## Diagnosticando problemas de autenticacao

### Cookies

| Contexto | Cookie | Validade | HttpOnly |
|----------|--------|----------|----------|
| Admin | `adminToken` | 2h | Sim |
| Usuario | `auth_token` | 7d | Sim |
| CSRF | `csrf_token` | 2h | Nao (JS legivel) |

### Problemas comuns

| Sintoma | Causa provavel | Solucao |
|---------|---------------|---------|
| 401 em rota admin | Token expirado (2h) ou `tokenVersion` incrementado | Admin refaz login |
| 401 em rota usuario | Token expirado (7d) ou `tokenVersion` incrementado | Usuario refaz login |
| 403 em mutacao | CSRF token ausente ou expirado | Frontend renova via `GET /api/csrf-token` |
| 403 em rota admin | Permissao insuficiente (RBAC) | Verificar `admin_role_permissions` no banco |

### Revogacao de sessao

Incrementar `tokenVersion` no banco invalida todos os tokens ativos imediatamente:

```sql
-- Revogar sessao de um admin
UPDATE admins SET tokenVersion = tokenVersion + 1 WHERE id = ?;

-- Revogar sessao de um usuario
UPDATE usuarios SET tokenVersion = tokenVersion + 1 WHERE id = ?;
```

---

## Diagnosticando problemas de pagamento

### Webhook nao chega

1. Verificar se `MP_WEBHOOK_SECRET` esta configurado (sem ele, webhook retorna 401)
2. Verificar se a URL de webhook esta registrada no dashboard do Mercado Pago
3. Verificar tabela `webhook_events`: `SELECT * FROM webhook_events ORDER BY created_at DESC LIMIT 10`
4. Se o evento existe com `processed_at = NULL`, foi recebido mas falhou no processamento

### Pagamento nao atualiza status

1. Verificar tabela `webhook_events` para o event_id
2. Se `processed_at` existe, o webhook foi processado — verificar `result` para o status aplicado
3. Se `result` contem `blocked:`, uma transicao de status foi bloqueada (ex: `pago→falhou`)
4. Verificar status real na API do MP: acessar dashboard Mercado Pago

### Estoque nao foi restaurado apos falha

1. Verificar `status_pagamento` do pedido: se `falhou`, `restoreStockOnFailure` deveria ter executado
2. Verificar se houve double-restore bloqueado pelo guard SQL
3. Query de verificacao: `SELECT p.id, p.quantity FROM products p JOIN pedidos_produtos pp ON pp.produto_id = p.id WHERE pp.pedido_id = ?`

---

## Diagnosticando problemas de upload

1. Verificar se diretorio `/uploads` existe e tem permissao de escrita
2. Health check mostra status do storage: `checks.storage`
3. Verificar MIME type: apenas JPEG, PNG, WEBP, GIF permitidos (SVG bloqueado)
4. Limite: 5MB por arquivo, maximo 10 arquivos por request
5. Storage driver configurado via `MEDIA_STORAGE_DRIVER` (disk/s3/gcs)

### Imagem nao aparece no frontend

Mapear os 3 pontos:
- Banco: `/uploads/{folder}/{filename}`
- Disco: `{cwd}/uploads/{folder}/{filename}`
- URL publica: `{BACKEND_URL}/uploads/{folder}/{filename}`

Se algum esta desalinhado, esse e o bug.

---

## Seguranca operacional

### Rotacao de JWT_SECRET

1. Gerar novo secret: `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"`
2. Atualizar `JWT_SECRET` no `.env` de producao
3. Reiniciar o servidor
4. **Impacto:** todos os tokens existentes sao invalidados. Todos os usuarios/admins precisam refazer login.

### Rotacao de CPF_ENCRYPTION_KEY

**CUIDADO:** perder a chave = perder acesso aos CPFs criptografados.

1. Gerar nova chave: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`
2. **NAO substituir diretamente** — CPFs existentes estao criptografados com a chave antiga
3. Implementar migracao de re-criptografia antes de rotacionar
4. Guardar chave em vault ou secrets manager

### Variaveis criticas em producao

| Variavel | Impacto se ausente |
|----------|-------------------|
| `MP_WEBHOOK_SECRET` | Webhook rejeita pagamentos (401) |
| `CPF_ENCRYPTION_KEY` | CPFs ficam em plaintext (risco LGPD) |
| `JWT_SECRET` | Tokens nao podem ser assinados (servidor nao sobe) |
| `SENTRY_DSN` | Erros nao sao capturados (degradacao silenciosa) |

---

## Deploy

### Docker

```bash
docker build -t kavita-backend .
docker run -d --name kavita \
  --env-file .env \
  -p 5000:5000 \
  -v kavita-uploads:/app/uploads \
  kavita-backend
```

O Dockerfile usa multi-stage build com usuario nao-root e health check embutido.

### Checklist pos-deploy

1. [ ] Health check retorna `"status": "ok"`: `curl http://localhost:5000/health`
2. [ ] Migrations aplicadas: `npm run db:status`
3. [ ] Redis conectado (se configurado): health check mostra `redis.status: "ok"`
4. [ ] Upload funcional: verificar `checks.storage.status` no health check
5. [ ] Webhook acessivel: verificar URL registrada no Mercado Pago
6. [ ] Sentry capturando: verificar dashboard Sentry apos deploy

### Graceful shutdown

O servidor trata SIGTERM/SIGINT (`bootstrap/shutdown.js`):
1. Para cron jobs (clima sync, cotacoes sync)
2. Fecha servidor HTTP (para de aceitar novas conexoes)
3. Fecha pool MySQL
4. Timeout de 30s para force-exit

---

## Limitacoes operacionais atuais

| Limitacao | Impacto | Mitigacao |
|-----------|---------|-----------|
| ~220 `console.log` em vez de logger Pino | Logs sem estrutura JSON em producao, sem requestId | `lib/logger.js` e `middleware/requestLogger.js` existem mas nao sao usados em todos os arquivos |
| Sem handlers de `uncaughtException`/`unhandledRejection` | Crash sem logging estruturado | Adicionar em `server.js` |
| Swagger desabilitado em producao | Sem referencia de API interativa em prod | Gerar spec estatica ou habilitar com auth |
| Sem retry queue para emails | Email pode ser perdido silenciosamente | `checkoutNotificationService` e fire-and-forget |
| Rate limiting in-memory sem Redis | Nao compartilhado entre instancias | Configurar Redis para ambientes multi-instancia |

---

## Background jobs

| Job | Frequencia | Arquivo | Configuravel |
|-----|-----------|---------|-------------|
| Clima sync | Cron (DB config ou env) | `jobs/climaSyncJob.js` | Sim — `CLIMA_SYNC_ENABLED`, tabela config |
| Cotacoes sync | Cron (DB config ou env) | `jobs/cotacoesSyncJob.js` | Sim — tabela config |
| Abandoned cart notifications | Worker dedicado | `workers/abandonedCartNotificationsWorker.js` | `DISABLE_NOTIFICATIONS=true` desabilita |

Jobs sao carregados opcionalmente em `bootstrap/workers.js` — falha nao impede o servidor de subir.
