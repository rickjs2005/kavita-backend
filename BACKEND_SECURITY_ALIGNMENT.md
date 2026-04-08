# Backend Security Alignment

> Registro de auditoria de seguranca e estado atual das protecoes do backend.
>
> _Ultima atualizacao: 2026-04-08_

---

## 1. Protecoes ativas

### Upload seguro (`services/mediaService.js`)

- Whitelist explicita de MIME types: JPEG, PNG, WEBP, GIF
- SVG bloqueado (vetor de XSS)
- Limites multer: 5MB por arquivo, maximo 10 arquivos
- Videos: apenas MP4, WEBM, OGG (campos `heroVideo` e `media`)
- Magic bytes validation disponivel em `utils/fileValidation.js`

### Sanitizacao XSS (`utils/sanitize.js`)

- `stripHtml(str)` — remove todas as tags HTML
- `escapeHtml(str)` — escapa entidades HTML
- `sanitizeRichText(str)` — remove vetores perigosos mantendo formatacao basica (usa `sanitize-html`)
- `sanitizeText(str, maxLen)` — stripHtml + truncagem

Aplicado em: avaliacoes, news (title/excerpt/content), perfil de usuario.

### Validacao de entrada

- Zod schemas em `schemas/` para todas as rotas com body
- Middleware `validate.js` aplica schemas como middleware de rota
- Validacao de comprimento nos campos de perfil de usuario

### Autenticacao e autorizacao

- JWT em cookie HttpOnly com contextos separados (admin 2h, usuario 7d)
- CSRF double-submit cookie com `crypto.timingSafeEqual()`
- `tokenVersion` para revogacao real de sessao
- `requirePermission` com bypass para role `master`
- Permissoes carregadas do banco/Redis em cada request (nunca do JWT)

### Rate limiting

- Global: `middleware/adaptiveRateLimiter.js` com Redis + fallback in-memory
- Especifico: login, admin login, MFA, forgot-password, reset-password, logout, comentarios drones
- Account lockout via `security/accountLockout.js`

### Error handling

- `middleware/errorHandler.js` nunca vaza stack trace em producao
- Logging estruturado via Pino + captura Sentry para 5xx

### Permissoes aplicadas

| Rota | Permissao |
|------|-----------|
| `/admin/relatorios` | `relatorios.ver` |
| `/admin/config` | `config.editar` |
| `/admin/shop-config/upload` | `config.editar` |
| `/admin/users` | `usuarios.ver` |
| `/admin/pedidos` | `pedidos.ver` |

---

## 2. Pendencias

### Backend

- [ ] Semear permissoes no banco (`relatorios.ver`, `config.editar`, `usuarios.ver`, `pedidos.ver`) e vincular aos roles
- [ ] Expandir magic bytes validation para todos os modulos com upload (atualmente so adminServicos e adminConfigUpload usam)
- [ ] Expandir `requirePermission` para demais modulos admin (categorias, drones, news, cupons)

### Frontend

- [ ] Tratar `403 Permissao insuficiente` em areas admin para admins nao-master
- [ ] Tratar `400` com `errors[]` em forgot-password e reset-password
- [ ] Confirmar compatibilidade do rich text apos sanitizacao no editor de noticias

### Decisoes de produto

- [ ] GIF: manter ou bloquear? (mantido na whitelist por ora)
- [ ] Audit log expandido: quais acoes admin devem gerar log auditavel?
- [ ] Avaliacoes publicas: requer login ou manter anonimo?

---

## 3. Checklist de seguranca

### Concluido

- [x] Upload: whitelist MIME explicita + SVG bloqueado
- [x] Upload: limites de tamanho no multer
- [x] Sanitizacao XSS em comentarios, noticias e perfil
- [x] `sanitize-html` instalado e em uso
- [x] Bypass master em `requirePermission`
- [x] Schema validation Zod em todas as rotas com body
- [x] `requirePermission` em rotas sensiveis (relatorios, config, users, pedidos)
- [x] Error handler: sem stack trace em producao
- [x] CSRF double-submit cookie
- [x] JWT HttpOnly com contextos separados
- [x] Rate limiting global + especifico
- [x] `tokenVersion` para revogacao de sessao

### Pendente

- [ ] Semear permissoes no banco
- [ ] Magic bytes validation em todos os uploads
- [ ] Audit log expandido
- [ ] `requirePermission` em mais modulos admin
