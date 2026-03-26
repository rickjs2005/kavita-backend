# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Desenvolvimento
npm run dev          # nodemon server.js (hot-reload)
npm start            # node server.js (produção)

# Testes (diretório: teste/, não test/)
npm test             # todos os testes, sequencial
npm run test:unit    # apenas teste/unit/
npm run test:int     # apenas teste/integration/
npm run test:cov     # todos com cobertura

# Rodar um único arquivo de teste
npx cross-env NODE_ENV=test node ./node_modules/jest/bin/jest.js --runInBand teste/integration/adminDrones.int.test.js

# Lint
npm run lint

# Banco de dados
npm run db:migrate         # aplica migrations (ambiente default)
npm run db:test:reset      # limpa e re-migra o banco de teste
npm run db:test:migrate    # só migra o banco de teste
npm run db:status          # mostra status das migrations
```

## Variáveis de ambiente obrigatórias

O servidor não sobe se alguma dessas estiver ausente (`config/env.js` lança erro):

```
JWT_SECRET, EMAIL_USER, EMAIL_PASS, APP_URL, BACKEND_URL,
DB_HOST, DB_USER, DB_PASSWORD, DB_NAME
```

Opcionais relevantes: `PORT` (padrão 5000), `DB_PORT` (padrão 3306), `ALLOWED_ORIGINS` (CSV de origens CORS além de localhost).

Para storage de mídia: `MEDIA_STORAGE_DRIVER` (`disk` padrão | `s3` | `gcs`). Se omitido, usa disco local.

## Arquitetura

### Ponto de entrada e middleware (server.js)

A ordem dos middlewares em `server.js` é deliberada e não deve ser reordenada:

```
CORS /uploads (sem credentials)
→ Custom headers /uploads (ACAO: *, Cache-Control)
→ CORS /api (com credentials)
→ Helmet (global) ← seta Cross-Origin-Resource-Policy: same-origin
→ CORP override /uploads ← sobrescreve para cross-origin (linha ~194)
→ express.json / cookieParser
→ express.static /uploads  ← serve arquivos com CORP: cross-origin
→ Rate limiter
→ /api routes
```

O Helmet 8.x seta `Cross-Origin-Resource-Policy: same-origin` por default. O middleware específico para `/uploads` que o sobrescreve para `cross-origin` deve permanecer **depois do Helmet e antes do express.static**.

### Roteamento centralizado

Todas as rotas são montadas em `routes/index.js` sob o prefixo `/api`. **Nunca adicionar `app.use()` diretamente em `server.js` para novas rotas.** O arquivo usa um helper `loadRoute(path, module)` com try/catch — falhas de carregamento logam erro mas não travam o servidor.

Convenção de proteção:
- Rotas admin: `verifyAdmin + validateCSRF`
- Rotas autenticadas de usuário: `authenticateToken + validateCSRF`
- O `validateCSRF` é no-op para GET/HEAD/OPTIONS — só valida mutações

### Banco de dados

O código da aplicação usa **MySQL2 raw pool** (`config/pool.js`) diretamente com `pool.query()` e `pool.getConnection()`. O Sequelize está presente **apenas para migrações via CLI** (`sequelize-cli`), configurado em `.sequelizerc`. Não há models Sequelize no código de rotas.

### Upload de mídia (services/mediaService.js)

Fluxo obrigatório para qualquer novo módulo com upload:

1. `upload = mediaService.upload` — instância multer (salva temp em `uploads/`)
2. `mediaService.persistMedia(req.files, { folder: "nome-do-modulo" })` — move para `uploads/nome-do-modulo/`, retorna `[{ path: "/uploads/nome-do-modulo/arquivo", key: "/abs/path" }]`
3. Armazena `result[n].path` no banco (ex: `/uploads/produtos/img.webp`)
4. Para cleanup em erros: `mediaService.enqueueOrphanCleanup(targets)`
5. Para remoção após DELETE: `mediaService.removeMedia(targets).catch(...)`

**`mediaService.cleanupMedia` não existe** — a função correta é `removeMedia` ou `enqueueOrphanCleanup`.

Antes de qualquer correção envolvendo imagens, mapear os três pontos:
- Caminho salvo no banco
- Caminho físico no disco (`uploads/{folder}/{filename}`)
- URL pública final (`/uploads/{folder}/{filename}`)

Pastas em uso: `products/`, `colaboradores/`, `services/`, `drones/`, `hero/`, `news/`, `logos/`.

### Autenticação

Dois contextos independentes de auth, ambos via cookie HttpOnly:

| Contexto | Cookie | Validade | Middleware |
|----------|--------|----------|------------|
| Admin | `adminToken` | 2h | `verifyAdmin` |
| Usuário | `auth_token` | 7d | `authenticateToken` |

CSRF: double-submit cookie. Frontend obtém token em `GET /api/csrf-token`, envia em toda mutação no header `x-csrf-token` (deve coincidir com cookie `csrf_token`). O token é readable por JS (`httpOnly: false`).

`verifyAdmin` valida também `tokenVersion` para suporte a logout com revogação de sessão.

### Tratamento de erros

Erros padronizados via `errors/AppError.js`. O handler global (`middleware/errorHandler.js`) está montado como último middleware em `server.js`. Controllers e rotas devem chamar `next(new AppError(...))` para erros esperados, ou simplesmente deixar erros síncronos/async propagar.

**Assinatura única de `AppError` (Phase 1 — 2026-03):**

```js
// CORRETO
throw new AppError(message, code, status, details?)
throw new AppError("Produto não encontrado.", ERROR_CODES.NOT_FOUND, 404);
throw new AppError("Dados inválidos.", ERROR_CODES.VALIDATION_ERROR, 400, { fields });

// PROIBIDO — convenção legada removida
throw new AppError("msg", 404, "NOT_FOUND"); // ← não use (number como 2º arg)
```

Use sempre as constantes de `constants/ErrorCodes.js` ou strings literais como 2º argumento.

### Testes

- Setup de ambiente: `teste/setup/env.setup.js` (define vars mínimas para NODE_ENV=test)
- Testes de integração usam banco real — rodar `npm run db:test:reset` antes da primeira execução
- Cobertura coletada de: `routes/**`, `controllers/**`, `services/**`, `server.js`

## Regras do projeto

- Nunca alterar rotas sem verificar `routes/index.js`
- Sempre preservar compatibilidade com o frontend existente
- Antes de sugerir correções, mapear: caminho no banco → disco → URL pública
- Ao responder sobre um bug: causa raiz → arquivos afetados → patch exato → como testar
- Priorizar correções pequenas e reversíveis
- Uploads seguem a convenção centralizada do `mediaService` — nunca usar `fs.writeFile` direto ou multer sem passar por `persistMedia`

## Convenções (Phase 9 — fixadas em 2025-03)

### Nomenclatura de arquivos

| Camada | Padrão | Exemplos |
|--------|--------|---------|
| Rotas admin | `admin{Domínio}.js` | `adminDrones.js`, `adminProdutos.js` |
| Rotas públicas | `public{Domínio}.js` | `publicDrones.js`, `publicProdutos.js` |
| Controllers | `{domínio}Controller.js` ou subdir `{domínio}/` | `checkoutController.js`, `drones/galleryController.js` |
| Services | `{domínio}Service.js` ou subdir `{domínio}/` | `cartService.js`, `drones/pageService.js` |
| Repositories | `{domínio}Repository.js` | `cartRepository.js`, `orderRepository.js` |

Domínios usam **português** para nomes de negócio existentes (pedidos, produtos, servicos).
Novos módulos de infraestrutura podem usar inglês (auth, media, cache).

### Middleware de autenticação

- **`authenticateToken`** — padrão para rotas de usuário. **Sempre use este**.
- `verifyAdmin` — rotas admin.
- `verifyUser` — **removido**. Era alias de `authenticateToken`; não existe mais.
- `requireRole` — **removido**. Era código morto; usar `verifyAdmin` que já valida papel.

### Validação

| Local | Sistema | Quando usar |
|-------|---------|-------------|
| `schemas/` | **Zod** | Todos os módulos novos e refatorados |
| `validators/authValidator.js` | express-validator | Rotas de auth **apenas** (legado, não estender) |
| Inline `if (!campo)...` em rota | — | **Proibido** em código novo |

Use `middleware/validate.js` para aplicar schemas Zod como middleware de rota.

**Formato único de erro de validação Zod (Phase 1 — 2026-03):**

```js
// CORRETO — { field, message } em todos os módulos
formatZodErrors(zodError)    // schemas/requests.js
formatDronesErrors(zodError) // schemas/dronesSchemas.js — mesmo formato agora

// Ambos retornam: [{ field: "campo", message: "descrição do erro" }]
```

Não use `{ field, reason }` — campo `reason` foi removido de todos os formatters.

### Resposta da API

Helper oficial: `lib/response.js` (exportado por `lib/index.js`).

```js
const { response } = require("../lib");
response.ok(res, data);
response.created(res, data);
response.paginated(res, { items, total, page, limit });
response.badRequest(res, message, details);
```

**Regra:** Todo código novo obrigatoriamente usa `lib/response.js`. Módulos legados ainda usam `res.json(...)` direto — migrar progressivamente ao tocar o arquivo.
