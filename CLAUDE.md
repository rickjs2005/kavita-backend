# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Desenvolvimento
npm run dev          # nodemon server.js (hot-reload)
npm start            # node server.js (produção)

# Testes
npm test             # todos os testes, sequencial
npm run test:unit    # apenas test/unit/
npm run test:int     # apenas test/integration/
npm run test:cov     # todos com cobertura

# Rodar um único arquivo de teste
npx cross-env NODE_ENV=test node ./node_modules/jest/bin/jest.js --runInBand test/integration/adminDrones.int.test.js

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

Use sempre as constantes de `constants/ErrorCodes.js`. Nunca use strings literais (ex: `"INTERNAL_ERROR"`, `"INVALID_INPUT"`) — esses aliases foram removidos.

**Contrato oficial de resposta (Phase 1 — 2026-03):**

```
Sucesso  → { ok: true, data?, message?, meta? }           via lib/response.js
Erro     → { ok: false, code, message, details? }         via errorHandler (AppError)
```

Mapeamento de códigos de erro HTTP → `ERROR_CODES`:

| HTTP | Código canônico | Quando usar |
|------|----------------|-------------|
| 400 | `VALIDATION_ERROR` | Falha de schema Zod ou parâmetro inválido |
| 401 | `AUTH_ERROR` | Credenciais inválidas, token inválido |
| 401 | `UNAUTHORIZED` | Usuário não autenticado (sem token) |
| 403 | `FORBIDDEN` | Autenticado mas sem permissão |
| 404 | `NOT_FOUND` | Recurso não encontrado |
| 409 | `CONFLICT` | Recurso já existe ou estado incompatível |
| 429 | `RATE_LIMIT` | Rate limit excedido |
| 500 | `SERVER_ERROR` | Erro interno não previsto |

**Regra de negação:**

Todo arquivo **novo ou modificado** deve:
1. Usar `lib/response.js` para respostas de sucesso — nunca `res.json({ ... })` cru
2. Usar `next(new AppError(...))` para erros — nunca `res.status(4xx).json(...)` inline
3. Qualquer `res.status(NNN).json(...)` que ainda existir em código legado DEVE incluir `ok: false, code: ERROR_CODES.XXX`
4. Nunca usar `{ error: "msg" }` como chave — sempre `{ message: "msg" }`

### Testes

- Setup de ambiente: `test/setup/env.setup.js` (define vars mínimas para NODE_ENV=test)
- Testes de integração usam banco real — rodar `npm run db:test:reset` antes da primeira execução
- Cobertura coletada de: `routes/**`, `controllers/**`, `services/**`, `server.js`

## Estado arquitetural dos módulos

O projeto está em migração arquitetural ativa. **Todo arquivo novo ou modificado deve seguir o padrão moderno.**

> **Para desenvolvedores novos:** os arquivos marcados com `ARQUIVO LEGADO` no cabeçalho
> **não representam o padrão do projeto**. Leia um módulo moderno primeiro.
> Referências canônicas: `routes/admin/adminDrones.js`, `routes/admin/adminCarts.js`.

### Módulos modernos — padrão oficial

Rota magra → controller → service → repository, Zod em `schemas/`, `lib/response.js`, `AppError`.

| Domínio | Rota | Controller | Service | Repository |
|---------|------|-----------|---------|------------|
| Auth admin | `routes/admin/adminLogin.js` | `controllers/admin/authAdminController.js` | `services/authAdminService.js` | — |
| Drones (admin) | `routes/admin/adminDrones.js` | `controllers/drones/` | `services/drones/` | `repositories/dronesRepository.js` |
| Drones (público) | `routes/public/publicDrones.js` | `controllers/dronesPublicController.js` | `services/dronesService.js` | `repositories/dronesRepository.js` |
| News (admin) | `routes/admin/adminNews.js` | `controllers/news/` | — | `repositories/postsRepository.js` |
| News (público) | `routes/public/publicNews.js` | `controllers/newsPublicController.js` | — | `repositories/postsRepository.js` |
| Site Hero (admin) | `routes/admin/adminSiteHero.js` | `controllers/siteHeroController.js` | — | `repositories/heroRepository.js` |
| Site Hero (público) | `routes/public/publicSiteHero.js` | `controllers/siteHeroController.js` | — | `repositories/heroRepository.js` |
| Produtos (admin) | `routes/admin/adminProdutos.js` | `controllers/produtosController.js` | `services/produtosAdminService.js` | `repositories/produtosRepository.js` |
| Produtos (público) | `routes/public/publicProducts.js` | — | `services/productService.js` | `repositories/productRepository.js` |
| Config (admin) | `routes/admin/adminConfig.js` | `controllers/configController.js` | `services/configAdminService.js` | `repositories/configRepository.js` |
| Carts (admin) | `routes/admin/adminCarts.js` | `controllers/cartsController.js` | `services/cartsAdminService.js` | `repositories/cartsRepository.js` |
| Cart (usuário) | `routes/ecommerce/cart.js` | — | `services/cartService.js` | `repositories/cartRepository.js` |
| Checkout | `routes/ecommerce/checkout.js` | `controllers/checkoutController.js` | `services/checkoutService.js` | `repositories/checkoutRepository.js` |
| Shipping | `routes/ecommerce/shipping.js` | — | `services/shippingQuoteService.js` | — |
| Auth usuário | `routes/auth/login.js` | `controllers/authController.js` | — | `repositories/userRepository.js` |
| Clima (news) | — | `controllers/news/adminClimaController.js` | — | `repositories/climaRepository.js` |
| Cotações (news) | — | `controllers/news/adminCotacoesController.js` | — | `repositories/cotacoesRepository.js` |

### Módulo híbrido — modernização parcial

Usa service para a maioria das operações, mas ainda contém `pool.query()` direto em alguns handlers.
Ao tocar esses arquivos: use sempre `service/repository`, nunca adicione novas queries diretas.

| Arquivo | Problema residual |
|---------|------------------|
| `routes/ecommerce/payment.js` | 2 handlers com `pool.query()` direto para métodos de pagamento admin |
| `routes/auth/authRoutes.js` | Usa `AuthController` mas validators do express-validator legado |
| `routes/admin/adminPedidos.js` | Usa `orderService` mas `res.json()` cru sem `lib/response.js` |

### Módulos legados — exceção temporária

Todos têm o cabeçalho `ARQUIVO LEGADO` no próprio código. Usam `pool.query()` direto na rota,
validação inline (`if (!campo)`) e `res.json()` sem helper.
**Nunca ampliar o padrão antigo. Ao tocar: migrar para o padrão moderno.**

| Arquivo | Linhas | Problema principal |
|---------|--------|--------------------|
| `routes/admin/adminComunicacao.js` | 462 | SQL inline, sem repository |
| `routes/admin/adminRoles.js` | 488 | SQL inline, sem repository |
| `routes/admin/adminServicos.js` | 421 | SQL inline, sem repository |
| `routes/admin/adminMarketingPromocoes.js` | 394 | SQL inline, sem repository |
| `routes/admin/adminCupons.js` | 337 | SQL inline, sem repository |
| `routes/admin/adminShippingZones.js` | 322 | SQL inline, sem repository |
| `routes/admin/adminStats.js` | 313 | SQL inline, sem repository |
| `routes/admin/adminRelatorios.js` | 282 | SQL inline, sem repository |
| `routes/admin/adminColaboradores.js` | 281 | SQL inline, sem repository |
| `routes/admin/adminAdmins.js` | 258 | SQL inline, sem repository |
| `routes/admin/adminLogs.js` | 255 | SQL inline, sem repository |
| `routes/admin/adminCategorias.js` | 301 | SQL inline, sem repository |
| `routes/admin/adminPermissions.js` | 197 | SQL inline, sem repository |
| `routes/admin/adminSolicitacoesServicos.js` | 166 | SQL inline, sem repository |
| `routes/admin/adminConfigUpload.js` | 143 | pool/db direto, sem service |
| `routes/admin/adminEspecialidades.js` | 82 | SQL inline, sem repository |
| `routes/admin/adminUsers.js` | 183 | SQL inline, sem repository |
| `routes/auth/userAddresses.js` | 575 | SQL inline, sem repository |
| `routes/auth/userProfile.js` | 272 | SQL inline, sem repository |
| `routes/auth/users.js` | — | SQL inline, sem repository |
| `routes/ecommerce/pedidos.js` | 181 | SQL inline direto no route |
| `routes/ecommerce/favorites.js` | 146 | SQL inline, sem repository |
| `routes/public/publicServicos.js` | 421 | SQL inline, sem repository |
| `routes/public/publicProdutos.js` | — | SQL inline (duplicata de publicProducts) |
| `routes/public/publicAvaliacaoColaborador.js` | 144 | SQL inline, sem repository |
| `routes/public/publicShopConfig.js` | 182 | pool direto, sem service |
| `routes/public/publicCategorias.js` | — | SQL inline, sem repository |
| `routes/public/publicProductById.js` | — | SQL inline, sem repository |
| `routes/public/publicPromocoes.js` | — | SQL inline, sem repository |

### Onde um desenvolvedor novo vai se confundir

Estes são os arquivos onde a dualidade de padrão causa mais confusão:

1. **`routes/ecommerce/payment.js`** — parece moderno (importa paymentService), mas ainda tem
   `pool.query()` direto. Não use como referência de como misturar padrões.

2. **`routes/admin/adminPedidos.js`** — tem o banner LEGADO e usa `orderService`, mas ainda usa
   `res.json()` cru. Está no meio de uma migração. Não copie a estrutura das rotas.

3. **`routes/public/publicProdutos.js`** vs **`routes/public/publicProducts.js`** — dois arquivos
   para o mesmo domínio. `publicProducts.js` é o moderno. `publicProdutos.js` é legado e será removido.

4. **`controllers/cartsController.js`**, **`controllers/configController.js`**, **`controllers/produtosController.js`** —
   existem e são modernos, mas as rotas antigas (adminCarts, adminConfig, adminProdutos) no CLAUDE.md
   antigo estavam listadas como legado. Elas já foram migradas — são referência válida.

### Regra de ouro para código novo ou modificado

Qualquer arquivo **novo** ou **tocado** durante uma tarefa deve obrigatoriamente:

1. Usar `lib/response.js` para respostas (`response.ok`, `response.created`, etc.) — nunca `res.json()` cru
2. Usar `AppError` + `ERROR_CODES` para erros — nunca `res.status(4xx).json(...)` inline
3. Ter schema Zod em `schemas/` para toda rota mutation (POST/PUT/PATCH/DELETE com body)
4. Não ter `pool.query()` no arquivo de rota — usar repository
5. Não ter validação manual com `if (!campo)` — usar `middleware/validate.js` com schema Zod

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
