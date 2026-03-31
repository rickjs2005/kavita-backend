# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Onboarding rápido para dev novo

> Leia esta seção antes de qualquer outra coisa. Ela responde as 10 dúvidas que qualquer novo desenvolvedor terá nos primeiros dias.

### Primeiros 30 minutos

1. `cp .env.example .env` e preencha as vars obrigatórias (ver seção "Variáveis de ambiente obrigatórias" abaixo)
2. `npm install`
3. `npm run db:migrate` + `npm run db:test:reset`
4. `npm run dev` — servidor sobe em `http://localhost:5000`
5. `http://localhost:5000/docs` — Swagger com todos os endpoints documentados
6. Leia `routes/index.js` — é o mapa de todas as rotas do sistema

### Onde colocar código novo

```
Nova feature completa:
  routes/{contexto}/               ← rota magra, só wiring (NUNCA em _legacy/)
  schemas/{domínio}Schemas.js      ← validação Zod
  controllers/{domínio}Controller.js ← extrai dados de req, delega ao service
  services/{domínio}Service.js     ← lógica de negócio
  repositories/{domínio}Repository.js ← queries SQL

Nova rota num módulo legado (está em routes/*/‌_legacy/):
  → migrar o arquivo inteiro para o padrão moderno na mesma PR
  → mover o arquivo migrado de _legacy/ para routes/{contexto}/
  → nunca adicionar SQL inline em arquivo legado

Bug num módulo legado (urgente):
  → corrigir o bug primeiro
  → criar schema Zod para a rota afetada na mesma PR
  → abrir issue para migração completa do arquivo
```

### Regra sobre qual pasta de rota usar

| Natureza | Pasta | Middleware aplicado pelo index.js |
|---|---|---|
| Entrada de sessão (login/logout/register) | `routes/auth/` | nenhum (sem CSRF) |
| Operações do painel admin | `routes/admin/` | `verifyAdmin + validateCSRF` |
| Operações do usuário logado | `routes/ecommerce/` ou `routes/auth/` | `authenticateToken + validateCSRF` |
| Acesso público sem auth | `routes/public/` | nenhum |
| Utilitários de infraestrutura | `routes/utils/` | nenhum |

### Dúvidas frequentes

**Q: `adminLogin.js` está em `routes/auth/`, não em `routes/admin/`. Por quê?**
A: Login é ponto de entrada de sessão — sem `verifyAdmin`. Tudo em `routes/admin/` é protegido pelo middleware. Manter login em `auth/` deixa o contrato claro.

**Q: Qual a diferença entre `productRepository.js` e `produtosRepository.js`?**
A: Domínios diferentes. `productRepository.js` = leitura pública (listagem, busca, sem mutações). `produtosRepository.js` = CRUD admin completo (insert, update, delete, imagens). O cabeçalho de cada arquivo explica.

**Q: Qual a diferença entre `cartRepository.js` e `cartsRepository.js`?**
A: Contextos diferentes. `cartRepository.js` = carrinho ativo do usuário (ecommerce). `cartsRepository.js` = carrinhos abandonados para o painel admin. Não são duplicatas.

**Q: `verifyAdmin` ou `authenticateToken`?**
A: `verifyAdmin` para rotas do painel admin (cookie `adminToken`, 2h). `authenticateToken` para rotas de usuário final (cookie `auth_token`, 7d). São contextos de autenticação completamente independentes. `verifyUser` e `requireRole` foram removidos.

**Q: `lib/response.js` ou `res.json()`?**
A: Sempre `lib/response.js` em código novo: `response.ok(res, data)`, `response.created(res, data)`, `response.paginated(res, {...})`. `res.json()` direto só existe em módulos legados em migração.

**Q: Encontrei `{ success: true }` em algumas respostas em vez de `{ ok: true }`. Qual o padrão?**
A: `{ ok: true }` é o contrato oficial. `{ success: true }` é um contrato divergente que ainda existe em `cart.js` e `shipping.js` — o frontend já depende desse formato, então **não altere sem alinhar com o frontend**. Código novo nunca usa `success` como chave — apenas `ok`. Ver seção "Contratos divergentes em módulos não-legados" abaixo.

**Q: `AppError` ou `res.status(4xx).json()`?**
A: Sempre `next(new AppError(message, ERROR_CODES.XXX, status))`. O `errorHandler` global em `server.js` processa tudo. Nunca `res.status(4xx).json()` inline em código novo.

**Q: Sequelize está instalado. Devo usar models ORM?**
A: Não. Sequelize existe só para migrations via CLI (`npm run db:migrate`). Todo acesso a dados usa `mysql2` raw pool via `repositories/`. Não há models Sequelize no código de aplicação.

**Q: Qual o arquivo de referência para implementar um módulo novo?**
A: `routes/admin/adminDrones.js` + `controllers/drones/` + `services/drones/` + `repositories/dronesRepository.js`. É o módulo mais completo e mais atual. Use como template.

**Q: Encontrei um arquivo com SQL direto na rota. É o padrão?**
A: Não. É legado em migração. O arquivo tem um banner `ARQUIVO LEGADO` no topo. Não copie esse padrão. Ao tocar o arquivo, migre-o para o padrão moderno.

**Q: Dois arquivos para o mesmo domínio de produtos: `publicProdutos.js` e `publicProducts.js`. Qual usar?**
A: `publicProducts.js` é o moderno. `publicProdutos.js` é legado (avaliações de produtos via SQL inline) e será removido. Nunca adicione endpoints em `publicProdutos.js`.

---

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

**Contratos divergentes em módulos não-legados**

Os arquivos abaixo estão fora de `_legacy/` e têm arquitetura moderna (service/repository), mas *ainda não* usam `lib/response.js`. O frontend conhece exatamente esses formatos — **não altere a forma da resposta sem alinhar com o frontend**.

| Arquivo | Endpoint | Formato atual | Delta do padrão |
|---------|----------|---------------|-----------------|
| `routes/ecommerce/cart.js` | `GET /api/cart` | `{ carrinho_id, items }` | sem `ok`, sem wrapper `data` |
| `routes/ecommerce/cart.js` | `POST/PUT /api/cart/items`, `DELETE /api/cart[/items]` | `{ success: true, message, ... }` | `success` ≠ `ok` |
| `routes/ecommerce/cart.js` | `409` (stock limit) | `{ code: "STOCK_LIMIT", message, max, current, requested }` | sem `ok: false` |
| `routes/ecommerce/shipping.js` | `GET /api/shipping/quote` | `{ success: true, cep, price, prazo_dias, ... }` | `success` ≠ `ok` |
| `routes/public/publicProducts.js` | `GET /api/products`, `/search` | `result` direto (bare) | sem `ok`, sem `data` |
| `routes/public/publicProducts.js` | erros | `{ message }` | sem `ok: false`, sem `code` |
| `routes/utils/uploadsCheck.js` | `GET /uploads/check/*` (util interno) | `{ ok: false, error: "..." }` | usa `error` em vez de `message` |

> **Regra prática:** ao chamar um desses endpoints em testes de integração, não asserte `ok: true` — asserte o campo real (`success`, `carrinho_id`, etc.). Ao *migrar* o endpoint, lembrar de atualizar o frontend antes ou em conjunto.

**Regra de negação:**

Todo arquivo **novo ou modificado** deve:
1. Usar `lib/response.js` para respostas de sucesso — nunca `res.json({ ... })` cru
2. Usar `next(new AppError(...))` para erros — nunca `res.status(4xx).json(...)` inline
3. Qualquer `res.status(NNN).json(...)` que ainda existir em código legado DEVE incluir `ok: false, code: ERROR_CODES.XXX`
4. Nunca usar `{ error: "msg" }` como chave — sempre `{ message: "msg" }`

### Testes

- Setup de ambiente: `test/setup/env.setup.js` (define vars mínimas para NODE_ENV=test)
- Testes de integração usam banco real — rodar `npm run db:test:reset` antes da primeira execução
- Cobertura coletada de: `routes/**`, `controllers/**`, `services/**`, `repositories/**`, `middleware/**`, `schemas/**`, `server.js`

## Estado arquitetural dos módulos

O projeto está em migração arquitetural ativa. **Todo arquivo novo ou modificado deve seguir o padrão moderno.**

### Convenção `_legacy/`

Arquivos legados ficam em subpastas `_legacy/` dentro do diretório de rotas correspondente:

```
routes/
  admin/
    adminDrones.js          ← moderno (referência canônica)
    adminCarts.js           ← moderno (referência canônica)
    _legacy/
      adminComunicacao.js   ← legado (SQL inline, sem repository)
      adminServicos.js      ← legado
      ...
  public/
    publicProducts.js       ← moderno
    publicDrones.js         ← moderno
    _legacy/
      publicServicos.js     ← legado
      ...
  auth/
    adminLogin.js           ← moderno
    userAddresses.js        ← moderno
    _legacy/
      userProfile.js        ← legado
      ...
  ecommerce/
    cart.js                 ← moderno
    checkout.js             ← moderno
    _legacy/
      pedidos.js            ← legado
      ...
```

**Regra:** ao terminar a migração de um arquivo legado, mover de `_legacy/` para `routes/{contexto}/` e atualizar `routes/index.js`.

> **Para desenvolvedores novos:** arquivos em `_legacy/` **não representam o padrão do projeto**.
> Leia um módulo moderno primeiro.
> Referências canônicas: `routes/admin/adminDrones.js`, `routes/admin/adminCarts.js`.

### Módulos modernos — padrão oficial

Rota magra → controller → service → repository, Zod em `schemas/`, `lib/response.js`, `AppError`.

| Domínio | Rota | Controller | Service | Repository |
|---------|------|-----------|---------|------------|
| Auth admin | `routes/auth/adminLogin.js` | `controllers/admin/authAdminController.js` | `services/authAdminService.js` | — |
| Drones (admin) | `routes/admin/adminDrones.js` | `controllers/drones/` | `services/drones/` | `repositories/dronesRepository.js` |
| Drones (público) | `routes/public/publicDrones.js` | `controllers/dronesPublicController.js` | `services/dronesService.js` | `repositories/dronesRepository.js` |
| News (admin) | `routes/admin/adminNews.js` | `controllers/news/` (clima, cotações, posts) | — | `repositories/postsRepository.js`, `climaRepository.js`, `cotacoesRepository.js` |
| News (público) | `routes/public/publicNews.js` | `controllers/newsPublicController.js` | — | `repositories/postsRepository.js`, `climaRepository.js`, `cotacoesRepository.js` |
| Site Hero (admin) | `routes/admin/adminSiteHero.js` | `controllers/siteHeroController.js` | — | `repositories/heroRepository.js` |
| Site Hero (público) | `routes/public/publicSiteHero.js` | `controllers/siteHeroController.js` | — | `repositories/heroRepository.js` |
| Produtos (admin) | `routes/admin/adminProdutos.js` | `controllers/produtosController.js` | `services/produtosAdminService.js` | `repositories/produtosRepository.js` |
| Produtos (público) | `routes/public/publicProducts.js` | — | `services/productService.js` | `repositories/productRepository.js` |
| Config (admin) | `routes/admin/adminConfig.js` | `controllers/configController.js` | `services/configAdminService.js` | `repositories/configRepository.js` |
| Carts (admin) | `routes/admin/adminCarts.js` | `controllers/cartsController.js` | `services/cartsAdminService.js` | `repositories/cartsRepository.js` |
| Cart (usuário) | `routes/ecommerce/cart.js` | `controllers/cartController.js` | `services/cartService.js` | `repositories/cartRepository.js` |
| Checkout | `routes/ecommerce/checkout.js` | `controllers/checkoutController.js` | `services/checkoutService.js` | `repositories/checkoutRepository.js` |
| Pagamento | `routes/ecommerce/payment.js` | `controllers/paymentController.js` | `services/paymentService.js`, `services/paymentWebhookService.js` | — |
| Shipping | `routes/ecommerce/shipping.js` | `controllers/shippingController.js` | `services/shippingQuoteService.js` | `repositories/shippingRepository.js` |
| Auth usuário | `routes/auth/login.js` | `controllers/authController.js` | — | `repositories/userRepository.js` |
| Clima (news) | — | `controllers/news/adminClimaController.js` | — | `repositories/climaRepository.js` |
| Cotações (news) | — | `controllers/news/adminCotacoesController.js` | — | `repositories/cotacoesRepository.js` |
| Posts (news) | — | `controllers/news/adminPostsController.js` | — | `repositories/postsRepository.js` |

### Módulo híbrido — modernização parcial

Arquivos fora de `_legacy/` com problemas arquiteturais ou de contrato residuais.
Ao tocar: corrija apenas o problema em questão — não ampliar o padrão antigo.

| Arquivo | Problema residual |
|---------|------------------|
| `controllers/paymentController.js` | `pool.getConnection()` em `startPayment` e `handleWebhook` — dívida do `paymentService` que recebe `conn` como parâmetro; resolver ao refatorar o service |
| `routes/auth/authRoutes.js` | Validators do express-validator legado em vez de Zod |
| `routes/admin/_legacy/adminPedidos.js` | Usa `orderService` mas `res.json()` cru — no meio de migração |
| `routes/ecommerce/cart.js` | Contrato `success: true` divergente — handlers já em `controllers/cartController.js`, pendente apenas migração de resposta para `lib/response.js` |
| `controllers/shippingController.js` | Contrato `success: true` divergente — pendente migração para `lib/response.js` alinhada com frontend |
| `routes/public/publicProducts.js` | `res.json(result)` bare + erros `{ message }` sem `ok`/`code` |

### Módulos legados — exceção temporária

Todos têm o cabeçalho `ARQUIVO LEGADO` no próprio código e estão em subpastas `_legacy/`.
Usam `pool.query()` direto na rota, validação inline (`if (!campo)`) e `res.json()` sem helper.
**Nunca ampliar o padrão antigo. Ao migrar: mover de `_legacy/` para `routes/{contexto}/` e atualizar `routes/index.js`.**

| Arquivo | Linhas | Problema principal |
|---------|--------|--------------------|
| `routes/admin/_legacy/adminComunicacao.js` | 462 | SQL inline, sem repository |
| `routes/admin/_legacy/adminServicos.js` | 421 | SQL inline, sem repository |
| `routes/admin/_legacy/adminMarketingPromocoes.js` | 394 | SQL inline, sem repository |
| `routes/admin/_legacy/adminCupons.js` | 337 | SQL inline, sem repository |
| `routes/admin/_legacy/adminShippingZones.js` | 322 | SQL inline, sem repository |
| `routes/admin/_legacy/adminStats.js` | 313 | SQL inline, sem repository |
| `routes/admin/_legacy/adminRelatorios.js` | 282 | SQL inline, sem repository |
| `routes/admin/_legacy/adminAdmins.js` | 258 | SQL inline, sem repository |
| `routes/admin/_legacy/adminLogs.js` | 255 | SQL inline, sem repository |
| `routes/admin/_legacy/adminPermissions.js` | 197 | SQL inline, sem repository |
| `routes/admin/_legacy/adminUsers.js` | 183 | SQL inline, sem repository |
| `routes/admin/_legacy/adminSolicitacoesServicos.js` | 166 | SQL inline, sem repository |
| `routes/admin/_legacy/adminConfigUpload.js` | 143 | pool/db direto, sem service |
| `routes/admin/_legacy/adminEspecialidades.js` | 82 | SQL inline, sem repository |
| `routes/auth/_legacy/userProfile.js` | 272 | SQL inline, sem repository |
| `routes/auth/_legacy/userAccount.js` | — | SQL inline, sem repository |
| `routes/ecommerce/_legacy/pedidos.js` | 181 | SQL inline direto no route |
| `routes/ecommerce/_legacy/favorites.js` | 146 | SQL inline, sem repository |
| `routes/public/_legacy/publicServicos.js` | 421 | SQL inline, sem repository |
| `routes/public/_legacy/publicProdutos.js` | — | SQL inline (legado de publicProducts) |
| `routes/public/_legacy/publicServicosAvaliacoes.js` | 144 | SQL inline, sem repository |
| `routes/public/_legacy/publicShopConfig.js` | 182 | pool direto, sem service |
| `routes/public/_legacy/publicCategorias.js` | — | SQL inline, sem repository |
| `routes/public/_legacy/publicProductById.js` | — | SQL inline, sem repository |
| `routes/public/_legacy/publicPromocoes.js` | — | SQL inline, sem repository |

### Onde um desenvolvedor novo vai se confundir

Armadilhas ativas (não resolvidas por organização — exigem migração futura):

1. **`routes/ecommerce/payment.js`** — parece moderno (importa paymentService), mas ainda tem
   `pool.query()` direto em 2 handlers. Não use como referência de como misturar padrões.

2. **`routes/admin/_legacy/adminPedidos.js`** — tem o banner LEGADO e usa `orderService`, mas ainda usa
   `res.json()` cru. Está no meio de uma migração. Não copie a estrutura das rotas.

3. **`routes/public/_legacy/publicProdutos.js`** vs **`routes/public/publicProducts.js`** — dois arquivos.
   `publicProducts.js` é o moderno. `publicProdutos.js` está em `_legacy/` e será removido. Nunca adicione
   endpoints em `publicProdutos.js`.

4. **`services/news/helpers.js`** — exporta utilitários de domínio (`toInt`, `nowSql`, `normalizeSlug`, etc.)
   que são legítimos e reutilizados por vários controllers de news. **Não** exporta helpers de resposta
   HTTP — esses foram removidos. Para respostas, sempre usar `lib/response.js` + `AppError`.

5. **`routes/ecommerce/cart.js` e `routes/ecommerce/shipping.js`** — parecem modernos (usam service/repository,
   sem SQL inline), mas retornam `{ success: true }` em vez de `{ ok: true }`. O frontend depende dessa forma.
   Ao escrever testes para essas rotas, não asserte `ok: true` — asserte `success: true`. Não copie esse
   padrão em código novo.

6. **`routes/public/publicProducts.js`** — retorna o objeto bruto do service sem wrapper (`ok`, `data`),
   e erros sem `code`. É um módulo moderno em estrutura (usa `productService`) mas legado em contrato.
   Tratado como "híbrido", não como referência de código novo.

7. **`services/notificationService.js`** — parece um serviço de notificação completo, mas é um **stub**.
   Nenhuma das funções envia mensagem real: ambas apenas fazem `console.log`.
   O arquivo **não é importado por nenhum módulo** — o worker de carrinho abandonado usa `mailService.js`
   diretamente. Não use `notificationService` como referência de integração e não o importe sem antes
   implementar o provedor real (WhatsApp, SendGrid, etc.).

Armadilhas já resolvidas (registradas aqui para histórico):

- `routes/admin/adminLogin.js` foi movido para `routes/auth/adminLogin.js` — login é auth, não operação admin
- `routes/auth/users.js` foi renomeado para `routes/auth/userAccount.js` — desambiguar de `adminUsers.js`
- `routes/public/publicAvaliacaoColaborador.js` → `routes/public/publicServicosAvaliacoes.js` — alinhado ao domínio
- `routes/uploadsCheckRoutes.js` → `routes/utils/uploadsCheck.js` — segue convenção de subpastas
- `controllers/cartsController.js`, `configController.js`, `produtosController.js` — são modernos e referência válida

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

Não use `{ field, reason }` — campo `reason` foi removido de todos os formatters e das `details` manuais de `AppError`. Use sempre `{ field, message }` para descrever erros de campo.

### Resposta da API

Helper oficial: `lib/response.js` (exportado por `lib/index.js`).

```js
const { response } = require("../lib");
response.ok(res, data);                           // 200, sem meta
response.ok(res, data, null, meta);              // 200, com meta (ex: provider info, took_ms)
response.ok(res, data, "mensagem");              // 200, com message
response.created(res, data);                     // 201
response.noContent(res);                         // 204
response.paginated(res, { items, total, page, limit }); // 200 + meta de paginação
response.badRequest(res, message, details);      // 400 (preferir next(AppError) em controllers)
```

**Quando usar `meta`:** endpoints que retornam dados + contexto da operação em paralelo — sync de providers externos (clima, cotações), endpoints de busca com parâmetros, operações em batch com resumo. O `meta` nunca substitui `data` — é contexto adicional sobre *como* o resultado foi obtido.

**Regra:** Todo código novo obrigatoriamente usa `lib/response.js`. Módulos legados ainda usam `res.json(...)` direto — migrar progressivamente ao tocar o arquivo.

## Migração de contrato de resposta — fila de próximos arquivos

Arquivos modernos já migrados (Phase 1 — 2026-03):
- `controllers/drones/` — todos usam `response.*` + `next(AppError)`
- `controllers/news/adminClimaController.js` — migrado
- `controllers/news/adminCotacoesController.js` — migrado

Próximos a migrar (prioridade decrescente):

| Arquivo | Problema | Impacto | Observação |
|---------|----------|---------|------------|
| `controllers/cartController.js` | `success: true` + `res.json()` bare | Alto — módulo de alto tráfego | Handlers já extraídos da rota; migrar resposta para `lib/response.js` e alinhar com frontend |
| `routes/public/publicProducts.js` | bare result + erros sem `ok`/`code` | Alto — listagem pública de produtos | Verificar contrato com o frontend |
| `controllers/shippingController.js` | `success: true` no quote | Médio — uma rota GET | Handler já extraído; migrar resposta para `lib/response.js` e alinhar com frontend |
| `routes/ecommerce/payment.js` | `res.json()` + `pool.query()` direto | Médio — dois problemas simultâneos | Resolver SQL e contrato juntos |
| `routes/auth/authRoutes.js` | express-validator legado + res.json | Médio — legado de validação | — |
| `routes/admin/_legacy/adminPedidos.js` | `res.json()` cru sem helper | Baixo — já em `_legacy/` | — |
| `controllers/authController.js` | `res.status(200).json(...)` em 1 handler | Baixo — módulo isolado | — |

Não migrar em lote — tocar apenas ao ter outra razão para abrir o arquivo.
Ao migrar `cart.js` ou `publicProducts.js`: coordenar com o frontend — a mudança de formato **quebra o cliente**.
