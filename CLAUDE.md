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
A: `{ ok: true }` é o contrato oficial. `{ success: true }` é um contrato divergente congelado por dependência de frontend — não altere sem alinhar com o frontend. Código novo nunca usa `success` como chave, apenas `ok`. Para o inventário completo dos 3 formatos ativos e o plano de convergência, ver § **Contratos de resposta — mapa completo** abaixo.

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

Existem 3 formatos de resposta em produção simultânea — resultado de migração incremental, não de intenção de design. Ver § **Contratos de resposta — mapa completo** para o inventário completo, o mapa por arquivo e o plano de convergência.

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
    adminServicos.js        ← moderno
    adminComunicacao.js     ← moderno
    _legacy/
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
| Produtos (público) | `routes/public/publicProducts.js` | `controllers/publicProductsController.js` | `services/productService.js` | `repositories/productRepository.js` |
| Config (admin) | `routes/admin/adminConfig.js` | `controllers/configController.js` | `services/configAdminService.js` | `repositories/configRepository.js` |
| Pedidos (admin) | `routes/admin/adminPedidos.js` | `controllers/adminOrdersController.js` | `services/orderService.js` | `repositories/orderRepository.js` |
| Carts (admin) | `routes/admin/adminCarts.js` | `controllers/cartsController.js` | `services/cartsAdminService.js` | `repositories/cartsRepository.js` |
| Serviços (admin) | `routes/admin/adminServicos.js` | `controllers/servicosAdminController.js` | `services/servicosAdminService.js` | `repositories/servicosAdminRepository.js` |
| Zonas de frete (admin) | `routes/admin/adminShippingZones.js` | `controllers/shippingZonesController.js` | `services/shippingZonesService.js` | `repositories/shippingZonesRepository.js` |
| Comunicação (admin) | `routes/admin/adminComunicacao.js` | `controllers/comunicacaoController.js` | `services/comunicacaoService.js` | `repositories/comunicacaoRepository.js` |
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
| `controllers/paymentController.js` | `res.json()` cru nos 4 endpoints CRUD de métodos — pendente migração para `lib/response.js` alinhada com frontend |
| `routes/ecommerce/cart.js` | Contrato `success: true` divergente — handlers já em `controllers/cartController.js`, pendente apenas migração de resposta para `lib/response.js` |
| `controllers/shippingController.js` | Contrato `success: true` divergente — pendente migração para `lib/response.js` alinhada com frontend |
| `routes/public/publicProducts.js` | `GET /api/products/:id` retorna bare object `{ ...product, images }` — pendente migração para `response.ok(res, data)` alinhada com frontend |

### Módulos legados — exceção temporária

Todos têm o cabeçalho `ARQUIVO LEGADO` no próprio código e estão em subpastas `_legacy/`.
Usam `pool.query()` direto na rota, validação inline (`if (!campo)`) e `res.json()` sem helper.

**Regra de toque:** ao modificar qualquer arquivo `_legacy/`, migrar o arquivo completo na mesma PR,
ou documentar na PR description por que não foi feito e abrir issue de acompanhamento.
Nunca adicionar novas rotas em arquivos `_legacy/`. Roadmap detalhado: `docs/migration-tracker.md`.

| Arquivo | Linhas | Prioridade | Janela |
|---------|--------|-----------|--------|
| `routes/auth/_legacy/userProfile.js` | 288 | média | Q3 2026 |
| `routes/ecommerce/_legacy/pedidos.js` | 181 | média | Q3 2026 |
| `routes/admin/_legacy/adminUsers.js` | 183 | média | Q3 2026 |
| `routes/admin/_legacy/adminAdmins.js` | 258 | média | Q3 2026 |
| `routes/admin/_legacy/adminSolicitacoesServicos.js` | 166 | média | Q3 2026 |
| `routes/admin/_legacy/adminStats.js` | 313 | média | Q3 2026 |
| `routes/admin/_legacy/adminRelatorios.js` | 282 | média | Q3 2026 |
| `routes/admin/_legacy/adminEspecialidades.js` | 82 | baixa | Q4 2026 |
| `routes/admin/_legacy/adminPermissions.js` | 197 | baixa | Q4 2026 |
| `routes/admin/_legacy/adminLogs.js` | 255 | baixa | Q4 2026 |
| `routes/admin/_legacy/adminCupons.js` | 337 | baixa | Q4 2026 |
| `routes/admin/_legacy/adminMarketingPromocoes.js` | 394 | baixa | Q4 2026 |
| `routes/public/_legacy/publicShopConfig.js` | 182 | baixa | Q4 2026 |
| `routes/public/_legacy/publicProdutos.js` | 354 | baixa | Q4 2026 |

### Onde um desenvolvedor novo vai se confundir

Armadilhas ativas (não resolvidas por organização — exigem migração futura):

1. **`routes/ecommerce/payment.js`** — parece moderno (importa paymentService), mas ainda tem
   `pool.query()` direto em 2 handlers. Não use como referência de como misturar padrões.

2. **`routes/admin/adminPedidos.js`** — migração concluída em 2026-04. Controller em `controllers/adminOrdersController.js`, schemas em `schemas/ordersSchemas.js`. Contrato de resposta mudou para `{ ok: true, data }` — requer atualização no admin frontend para leitura dos GETs. Ver header do controller para detalhes.

3. **`routes/public/_legacy/publicProdutos.js`** vs **`routes/public/publicProducts.js`** — dois arquivos.
   `publicProducts.js` é o moderno. `publicProdutos.js` está em `_legacy/` e será removido. Nunca adicione
   endpoints em `publicProdutos.js`.

4. **`services/news/newsHelpers.js`** — exporta utilitários de domínio (`toInt`, `nowSql`, `normalizeSlug`, etc.)
   que são legítimos e reutilizados por vários controllers de news. **Não** exporta helpers de resposta
   HTTP — esses foram removidos. Para respostas, sempre usar `lib/response.js` + `AppError`.

5. **`routes/ecommerce/cart.js` e `routes/ecommerce/shipping.js`** — parecem modernos (usam service/repository,
   sem SQL inline), mas retornam `{ success: true }` em vez de `{ ok: true }`. O frontend depende dessa forma.
   Ao escrever testes para essas rotas, não asserte `ok: true` — asserte `success: true`. Não copie esse
   padrão em código novo.

6. **`controllers/publicProductsController.js`** — `listProducts` e `searchProducts` migrados para `response.paginated` (2026-04-02). Apenas `getProductById` mantém bare object — pendente coordenação de frontend separada.

Armadilhas já resolvidas (registradas aqui para histórico):

- `routes/admin/adminLogin.js` foi movido para `routes/auth/adminLogin.js` — login é auth, não operação admin
- `routes/auth/users.js` → `routes/auth/userAccount.js` → `routes/auth/userRegister.js` — migrado para padrão moderno em 2026-04 (Zod, controller, sem express-validator)
- `routes/public/publicAvaliacaoColaborador.js` → `routes/public/publicServicosAvaliacoes.js` — alinhado ao domínio (arquivo já deletado em 2026-04, endpoints absorvidos por `publicServicos.js` moderno)
- `routes/uploadsCheckRoutes.js` → `routes/utils/uploadsCheck.js` — segue convenção de subpastas
- `controllers/cartsController.js`, `configController.js`, `produtosController.js` — são modernos e referência válida
- `services/notificationService.js` foi **deletado** — era stub que não enviava nada. Canal real de notificação: `workers/abandonedCartNotificationsWorker.js` → `services/mailService.sendTransactionalEmail()`. WhatsApp ainda não implementado (sem provedor definido).
- Templates de comunicação (email e WhatsApp) foram extraídos para `templates/email/` e `templates/whatsapp/` — cada arquivo exporta uma função `(pedido) => { subject, html }` ou `(pedido) => string`. Consumidores: `services/comunicacaoService.js` (via `emailTemplates`/`whatsappTemplates`). A migração de `adminComunicacao.js` para o padrão moderno foi concluída em 2026-04-02.

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

### Quando usar controller dedicado

**Regra:** arquivos de rota são wiring puro. A lógica vai para `controllers/`.

**Controller obrigatório quando qualquer uma dessas condições for verdadeira:**
- O arquivo define **2 ou mais handlers de rota**
- O handler tem **mais de 15 linhas efetivas** (excluindo JSDoc/Swagger)
- O handler contém lógica de negócio, validação adicional ou montagem de resposta

**Inline permitido apenas nos dois casos abaixo:**
1. `routes/utils/` — utilitários de infraestrutura pura, sem domain service (ex: `uploadsCheck.js`)
2. Arquivo exclusivo de upload com **único handler multer**, sem lógica de negócio além do pipe de arquivo

**Fora desses dois casos, inline é proibido em código novo ou modificado.**

Arquivos modernos que ainda violam a regra (pendentes de extração — não tocar sem extrair):

| Arquivo | Violação | Controller a criar |
|---|---|---|
| `routes/admin/adminNewsUpload.js` | 1 handler inline de ~31 linhas com lógica de negócio | `controllers/news/adminNewsUploadController.js` |

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

**Pares de repositórios com domínio compartilhado**

Alguns domínios têm dois arquivos de repository com nomes similares — um por contexto (público vs. admin, usuário vs. painel). O critério de separação é sempre o contexto de uso, não o domínio de negócio. Cada arquivo documenta no próprio header o par e o motivo da separação.

| Par | Arquivo | Contexto | Critério |
|-----|---------|----------|---------|
| Produtos | `productRepository.js` | Público/ecommerce | Leitura + busca, sem mutações |
| Produtos | `produtosRepository.js` | Admin | CRUD completo + imagens |
| Carrinho | `cartRepository.js` | Usuário logado | Carrinho ativo (aberto), checkout |
| Carrinho | `cartsRepository.js` | Admin/painel | Carrinhos abandonados, notificações |

Regra para novos pares: se um domínio precisar de um segundo repository, nomear o arquivo de admin com sufixo descritivo ou prefixo de contexto (ex: `pedidosAdminRepository.js`) e documentar o par no header de ambos os arquivos.

### Estilo de export em controllers

**Padrão oficial: `module.exports = { fn1, fn2, ... }` no final do arquivo.**

```js
// CORRETO — padrão oficial
const listOrders = async (req, res, next) => { ... };
const getOrderById = async (req, res, next) => { ... };
module.exports = { listOrders, getOrderById };

// PROIBIDO em código novo ou modificado
exports.listOrders = async (req, res, next) => { ... };
```

Motivo: `module.exports = { }` torna o conjunto de exports explícito e visível no final do arquivo, facilita leitura e é o estilo usado em 100% dos controllers criados recentemente (drones, news, adminOrders, checkout, publicProducts, authAdmin).

**Controllers já no padrão oficial:** todos em `controllers/drones/`, `controllers/news/`, `controllers/admin/`, e ainda `adminOrdersController`, `checkoutController`, `publicProductsController`, `dronesPublicController`, `cartController`, `paymentController`, `shippingController`, `cartsController`.

**Controllers ainda usando `exports.fn` — migrar ao tocar:**

| Arquivo | Handlers |
|---------|---------|
| `controllers/siteHeroController.js` | getHero, updateHero |
| `controllers/produtosController.js` | vários |
| `controllers/configController.js` | vários |
| `controllers/categoriasController.js` | vários |
| `controllers/rolesController.js` | vários |
| `controllers/colaboradoresController.js` | vários |
| `controllers/userAddressController.js` | vários |
| `controllers/newsPublicController.js` | vários |
| `controllers/servicosPublicController.js` | vários |
| `controllers/promocoesPublicController.js` | vários |

Regra: ao abrir qualquer desses arquivos por outra razão, converter o export na mesma PR — é uma mudança mecânica de 1–2 minutos sem risco funcional.

### Middleware de autenticação

- **`authenticateToken`** — padrão para rotas de usuário. **Sempre use este**.
- `verifyAdmin` — rotas admin.
- `verifyUser` — **removido**. Era alias de `authenticateToken`; não existe mais.
- `requireRole` — **removido**. Era código morto; usar `verifyAdmin` que já valida papel.

### Validação

| Local | Sistema | Quando usar |
|-------|---------|-------------|
| `schemas/` | **Zod** | Todos os módulos novos e refatorados — padrão único |
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

## Módulos de e-commerce — estrutura canônica

Os quatro módulos de e-commerce (`cart`, `checkout`, `payment`, `shipping`) são a referência de como novos módulos de usuário final devem ser organizados. Esta seção consolida a convenção e documenta explicitamente os desvios conhecidos de cada módulo.

### As 5 camadas obrigatórias

| Camada | Arquivo | Responsabilidade | O que NÃO vai aqui |
|--------|---------|-----------------|-------------------|
| Route | `routes/ecommerce/{módulo}.js` | Wiring: imports, middleware chain, `router.METHOD()` | Nenhuma lógica — apenas conectar peças |
| Controller | `controllers/{módulo}Controller.js` | Extrair `req`, guard de auth, delegar ao service, responder com `lib/response.js` | SQL, regra de negócio, chamadas HTTP externas |
| Service | `services/{módulo}Service.js` | Regra de negócio, orquestração entre repositories | `req`/`res`, SQL direto |
| Repository | `repositories/{módulo}Repository.js` | SQL e acesso ao pool | Lógica de negócio |
| Middleware | `middleware/{concern}.js` | Concerns transversais: auth, CSRF, validação Zod, recalcShipping | Regra de negócio de domínio |

### Mapa de arquivos dos 4 módulos

| Módulo | Route | Controller | Service | Repository | Middleware dedicado |
|--------|-------|-----------|---------|------------|-------------------|
| Cart | `routes/ecommerce/cart.js` | `controllers/cartController.js` | `services/cartService.js` | `repositories/cartRepository.js` | — |
| Checkout | `routes/ecommerce/checkout.js` | `controllers/checkoutController.js` | `services/checkoutService.js` | `repositories/checkoutRepository.js` | `middleware/recalcShipping.js` |
| Payment | `routes/ecommerce/payment.js` | `controllers/paymentController.js` | `services/paymentService.js`, `services/paymentWebhookService.js` | `repositories/paymentRepository.js` | `middleware/validateMPSignature.js` |
| Shipping | `routes/ecommerce/shipping.js` | `controllers/shippingController.js` | `services/shippingQuoteService.js` | `repositories/shippingRepository.js` | — |

### Desvios conhecidos — não copiar, não ampliar

Estes desvios estão congelados por dependência de frontend. Cada um tem motivo documentado. Novos módulos não devem replicar nenhum deles.

| Módulo | Desvio | Motivo do congelamento |
|--------|--------|----------------------|
| **Cart** | `res.json({ success: true })` em mutações | Frontend usa `success` — alinhar antes de migrar |
| **Cart** | `GET /api/cart` retorna `{ carrinho_id, items }` sem `ok`/`data` | Mesmo motivo |
| **Cart** | `409` retorna `{ code: "STOCK_LIMIT", ... }` sem `ok: false` | Mesmo motivo |
| **Shipping** | `res.json({ success: true, ...quote })` | Frontend usa `success` — alinhar antes de migrar |
| **Payment** | `res.json({ methods })` / `res.json({ method })` nos endpoints CRUD | Frontend (admin e checkout) usa esse shape — alinhar antes de migrar |
| **Checkout** | `isFormaPagamentoValida()` inline no controller | Guarda secundária deliberada — protege o controller se o middleware Zod for bypassado em testes |

### Template para novo módulo de e-commerce

```
1. schemas/{domínio}Schemas.js     ← schemas Zod para toda mutation
2. repositories/{domínio}Repository.js ← só SQL via pool
3. services/{domínio}Service.js    ← só regra de negócio
4. controllers/{domínio}Controller.js  ← extrai req, delega, responde com lib/response.js
5. routes/ecommerce/{domínio}.js   ← só wiring, registro em routes/index.js
6. middleware/{concern}.js         ← apenas se houver concern transversal real
```

Proibições absolutas para código novo:
- SQL em controller ou route
- `req`/`res` em service ou repository
- `res.json()` cru — usar sempre `lib/response.js`
- `{ success: true }` como chave — usar `{ ok: true }` via `response.ok()`

## Contratos de resposta — mapa completo

Esta seção é a referência canônica sobre formatos de resposta. As menções em outras partes do documento apontam para aqui.

### Os três formatos em produção

O projeto tem **3 formatos de resposta simultaneamente ativos**. Isso é resultado de migração incremental — não é intenção de design. O objetivo de longo prazo é convergir tudo para o Formato A.

| # | Formato de sucesso | Formato de erro | Status |
|---|---|---|---|
| **A — oficial** | `{ ok: true, data?, message?, meta? }` | `{ ok: false, code, message, details? }` | Use sempre em código novo |
| **B — congelado** | `{ success: true, ... }` | A (via AppError) | Frontend depende — não altere sem alinhar |
| **C — congelado** | Bare object (`{ carrinho_id }`, `{ methods }`, etc.) | variável | Frontend depende — não altere sem alinhar |

### Mapa por arquivo

| Arquivo | Endpoints | Formato sucesso | Formato erro | Bloqueador de migração |
|---------|-----------|----------------|--------------|----------------------|
| `controllers/cartController.js` | `GET /api/cart` | C: `{ carrinho_id, items }` | — | Frontend cart |
| `controllers/cartController.js` | `POST/PUT/DELETE /api/cart*` | B: `{ success: true, message, ... }` | C: `{ code: "STOCK_LIMIT", ... }` no 409 | Frontend cart |
| `controllers/shippingController.js` | `GET /api/shipping/quote` | B: `{ success: true, cep, price, ... }` | A | Frontend checkout |
| `controllers/paymentController.js` | `GET /api/payment/methods` e CRUD admin | C: `{ methods }` / `{ method }` | A | Frontend admin e checkout |
| `controllers/publicProductsController.js` | `GET /api/products/:id` | C: `{ ...product, images }` bare | `{ message }` | Frontend público |
| `controllers/authController.js` | 1 handler | res.json híbrido | A | Baixo — pode migrar isolado |
| `routes/utils/uploadsCheck.js` | `GET /uploads/check/*` | — | `{ ok: false, error }` ¹ | Utilitário interno |
| Todos os outros modernos | — | A | A | — já no padrão |

¹ Usa `error` em vez de `message` — único caso; utilitário interno sem cliente externo.

### Regra para código novo

```
Novo handler?
  sucesso → response.ok(res, data)           // nunca res.json()
  erro    → next(new AppError(...))          // nunca res.status(4xx).json()

Tocando arquivo com formato B ou C?
  → preserve o formato exato (não "atualize" sem coordenar com o frontend)
  → o header do controller documenta o shape congelado
```

### Como asserts de teste diferem por módulo

```js
// Formato A — módulos modernos (adminOrdersController, drones, news, ...)
expect(res.body.ok).toBe(true);
expect(res.body.data).toBeDefined();

// Formato B — cart (mutações) e shipping
expect(res.body.success).toBe(true);

// Formato C — cart (GET), payment methods
expect(res.body.carrinho_id).toBeDefined();   // GET /api/cart
expect(res.body.methods).toBeDefined();        // GET /api/payment/methods

// Erro congelado — cart 409
expect(res.status).toBe(409);
expect(res.body.code).toBe("STOCK_LIMIT");
expect(res.body.max).toBeDefined();
```

### Plano de convergência

Migração incremental, não em lote. Tocar apenas ao ter outra razão para abrir o arquivo — e nesse caso, avaliar se a migração de formato cabe na mesma PR.

| Arquivo | Pré-condição obrigatória | Prioridade |
|---------|--------------------------|-----------|
| `controllers/cartController.js` | Alinhamento frontend: `success → ok`, `carrinho_id → data` | Alta |
| `controllers/shippingController.js` | Alinhamento frontend checkout | Média |
| `controllers/paymentController.js` | Alinhamento frontend admin e checkout | Média |
| `controllers/publicProductsController.js` | `getProductById` bare object → `response.ok(res, data)` | Baixa |
| `controllers/authController.js` | Nenhuma — pode migrar isolado | Baixa |

Ao migrar cart, shipping ou payment: a mudança de formato **quebra o cliente** — coordenar frontend antes de mergar.

### Histórico de arquivos já migrados para Formato A

- `controllers/drones/` — 2026-03
- `controllers/news/adminClimaController.js` — 2026-03
- `controllers/news/adminCotacoesController.js` — 2026-03
- `controllers/adminOrdersController.js` — 2026-04 (contrato mudou de bare array para `{ ok, data }` — requer atualização no admin frontend para os GETs)
- `controllers/publicProductsController.js` (listProducts + searchProducts) — 2026-04-02 (`response.paginated`; `getProductById` pendente)
