# Security Reference — kavita-backend

> Controles de seguranca ativos, cobertura e lacunas conhecidas.
> Para decisoes arquiteturais detalhadas, consulte [docs/decisions.md](docs/decisions.md) (ADR-003 a ADR-005).
> Para operacao e resposta a incidentes, consulte [docs/runbook.md](docs/runbook.md).
>
> _Ultima atualizacao: 2026-04-08_

---

## Autenticacao

| Controle | Implementacao | Arquivo |
|----------|--------------|---------|
| JWT em cookie HttpOnly | Dois contextos isolados: admin (2h) e usuario (7d) | `middleware/verifyAdmin.js`, `middleware/authenticateToken.js` |
| Revogacao de sessao | `tokenVersion` — incrementar no banco invalida todos os tokens | Coluna `tokenVersion` em `admins` e `usuarios` |
| MFA (admin) | TOTP via speakeasy — desafio com `challengeId` e rate limit | `controllers/admin/authAdminController.js` |
| Account lockout | Bloqueio progressivo apos tentativas falhas | `security/accountLockout.js` |
| Permissoes do banco, nunca do JWT | `verifyAdmin` carrega permissoes do banco/cache em cada request | `middleware/verifyAdmin.js` linhas 96-101 |

## CSRF

| Controle | Implementacao | Arquivo |
|----------|--------------|---------|
| Double-submit cookie | Token em cookie (`httpOnly: false`) + header `x-csrf-token` | `middleware/csrfProtection.js` |
| Timing-safe comparison | `crypto.timingSafeEqual()` | `middleware/csrfProtection.js` |
| GET/HEAD/OPTIONS isentos | Metodos seguros nao exigem CSRF | `middleware/csrfProtection.js` |

## RBAC

| Controle | Implementacao | Arquivo |
|----------|--------------|---------|
| `requirePermission` middleware | Verifica permissao granular por rota | `middleware/requirePermission.js` |
| Bypass para role `master` | Superuser nao precisa de permissao individual | `middleware/requirePermission.js` |

Rotas com permissao aplicada:

| Rota | Permissao |
|------|-----------|
| `/admin/relatorios` | `relatorios.ver` |
| `/admin/config` | `config.editar` |
| `/admin/shop-config/upload` | `config.editar` |
| `/admin/users` | `usuarios.ver` |
| `/admin/pedidos` | `pedidos.ver` |

## Upload e midia

| Controle | Implementacao | Arquivo |
|----------|--------------|---------|
| Whitelist MIME | JPEG, PNG, WEBP, GIF. SVG bloqueado | `services/mediaService.js` |
| Limites de tamanho | 5MB/arquivo, max 10 arquivos | `services/mediaService.js` (multer config) |
| Magic bytes validation | Validacao pos-upload disponivel | `utils/fileValidation.js` |
| Videos | Apenas MP4, WEBM, OGG | `services/mediaService.js` |

## Sanitizacao XSS

| Controle | Implementacao | Arquivo |
|----------|--------------|---------|
| `stripHtml` | Remove todas as tags HTML | `utils/sanitize.js` |
| `sanitizeRichText` | Remove vetores perigosos, preserva formatacao | `utils/sanitize.js` (usa `sanitize-html`) |
| `sanitizeText` | stripHtml + truncagem por comprimento | `utils/sanitize.js` |

Aplicado em: avaliacoes, news (title/excerpt/content), perfil de usuario.

## Validacao de entrada

| Controle | Implementacao | Arquivo |
|----------|--------------|---------|
| Zod schemas | Todas as rotas com body (POST/PUT/PATCH) | `schemas/*.js` |
| Middleware de validacao | Factory `validate(schema)` | `middleware/validate.js` |

## Rate limiting

| Controle | Implementacao | Arquivo |
|----------|--------------|---------|
| Global | Adaptive rate limiter com Redis + fallback in-memory | `middleware/adaptiveRateLimiter.js` |
| Especifico por endpoint | Login, admin login, MFA, forgot-password, reset-password, logout, comentarios | Aplicado nas rotas |

## Error handling

| Controle | Implementacao | Arquivo |
|----------|--------------|---------|
| Sem stack trace em producao | Mensagem generica para 5xx | `middleware/errorHandler.js` |
| Logging estruturado | Pino com requestId para erros | `middleware/errorHandler.js` |
| Sentry | Captura automatica de 5xx (opcional via `SENTRY_DSN`) | `lib/sentry.js` |

---

## Lacunas conhecidas

| Lacuna | Impacto | Prioridade |
|--------|---------|-----------|
| Magic bytes validation nao aplicada em todos os uploads | Apenas adminServicos e adminConfigUpload usam | Media |
| `requirePermission` nao expandido para todos os modulos | Categorias, drones, news, cupons sem permissao granular | Media |
| Audit log incompleto | `admin_logs` existe mas nem todos os endpoints chamam `logAdmin()` | Baixa |
