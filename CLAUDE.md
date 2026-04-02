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
  routes/{contexto}/                 ← rota magra, só wiring
  schemas/{domínio}Schemas.js        ← validação Zod
  controllers/{domínio}Controller.js ← extrai dados de req, delega ao service
  services/{domínio}Service.js       ← lógica de negócio
  repositories/{domínio}Repository.js ← queries SQL
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

**Q: Qual a diferença entre `productPublicRepository.js` e `productAdminRepository.js`?**
A: Contextos diferentes. `productPublicRepository.js` = leitura pública (listagem, busca, sem mutações). `productAdminRepository.js` = CRUD admin completo (insert, update, delete, imagens). O cabeçalho de cada arquivo indica o par.

**Q: Qual a diferença entre `cartRepository.js` e `abandonedCartsRepository.js`?**
A: Contextos diferentes. `cartRepository.js` = carrinho ativo do usuário (ecommerce). `abandonedCartsRepository.js` = carrinhos abandonados para o painel admin.

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

Obrigatórias em produção (ausência gera erro em prod, warn em dev):

```
MP_WEBHOOK_SECRET     — sem isso o webhook rejeita pagamentos (401)
CPF_ENCRYPTION_KEY    — sem isso CPFs ficam em plaintext (risco LGPD)
```

Opcionais relevantes: `PORT` (padrão 5000), `DB_PORT` (padrão 3306), `ALLOWED_ORIGINS` (CSV de origens CORS além de localhost).

Para storage de mídia: `MEDIA_STORAGE_DRIVER` (`disk` padrão | `s3` | `gcs`). Se omitido, usa disco local.

### Deploy de CPF encryption (LGPD)

O código e a migration já existem. Para ativar em produção:

```bash
# Opção 1: script automatizado (backup + migration + verificação)
chmod +x scripts/deploy-cpf-encryption.sh
./scripts/deploy-cpf-encryption.sh

# Opção 2: manual
export CPF_ENCRYPTION_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")
# Salvar a chave no .env de produção ANTES de continuar
npm run db:migrate
# Verificar: SELECT id, LEFT(cpf,40), LEFT(cpf_hash,20) FROM usuarios LIMIT 5
```

**Sem `CPF_ENCRYPTION_KEY`:** encrypt/decrypt são no-op (plaintext). Compatível com dev local.
**Com chave:** AES-256-GCM + HMAC-SHA256 para busca indexada. Detalhes: `utils/cpfCrypto.js`.
**Perder a chave = perder acesso aos CPFs.** Guarde em vault ou secrets manager.

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

### Migração `_legacy/` — concluída (2026-04)

Todos os arquivos legados que existiam em subpastas `_legacy/` foram migrados para o padrão moderno.
Não existem mais diretórios `_legacy/` em nenhuma pasta de rotas.

Referências canônicas: `routes/admin/adminDrones.js`, `routes/admin/adminCarts.js`.

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
| Produtos (admin) | `routes/admin/adminProdutos.js` | `controllers/produtosController.js` | `services/produtosAdminService.js` | `repositories/productAdminRepository.js` |
| Produtos (público) | `routes/public/publicProducts.js` | `controllers/publicProductsController.js` | `services/productService.js` | `repositories/productPublicRepository.js` |
| Config (admin) | `routes/admin/adminConfig.js` | `controllers/configController.js` | `services/configAdminService.js` | `repositories/configRepository.js` |
| Pedidos (admin) | `routes/admin/adminPedidos.js` | `controllers/adminOrdersController.js` | `services/orderService.js` | `repositories/orderRepository.js` |
| Carts (admin) | `routes/admin/adminCarts.js` | `controllers/cartsController.js` | `services/cartsAdminService.js` | `repositories/abandonedCartsRepository.js` |
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
| Perfil usuário | `routes/auth/userProfile.js` | `controllers/userProfileController.js` | `services/userProfileService.js` | `repositories/userRepository.js` |
| Stats (admin) | `routes/admin/adminStats.js` | `controllers/statsController.js` | — | `repositories/statsRepository.js` |
| Relatórios (admin) | `routes/admin/adminRelatorios.js` | `controllers/relatoriosController.js` | — | `repositories/relatoriosRepository.js` |
| Cupons (admin) | `routes/admin/adminCupons.js` | `controllers/cuponsController.js` | — | `repositories/cuponsRepository.js` |
| Avaliações (público) | `routes/public/publicProdutos.js` | `controllers/avaliacoesController.js` | `services/avaliacoesService.js` | `repositories/avaliacoesRepository.js` |
| Promoções (admin) | `routes/admin/adminMarketingPromocoes.js` | `controllers/promocoesAdminController.js` | — | `repositories/promocoesAdminRepository.js` |

### Módulo híbrido — modernização parcial

Arquivos com problemas arquiteturais ou de contrato residuais.
Ao tocar: corrija apenas o problema em questão — não ampliar o padrão antigo.

| Arquivo | Problema residual |
|---------|------------------|
| `controllers/paymentController.js` | `res.json()` cru nos 4 endpoints CRUD de métodos — pendente migração para `lib/response.js` alinhada com frontend |
| `routes/ecommerce/cart.js` | Contrato `success: true` divergente — handlers já em `controllers/cartController.js`, pendente apenas migração de resposta para `lib/response.js` |
| `controllers/shippingController.js` | Contrato `success: true` divergente — pendente migração para `lib/response.js` alinhada com frontend |
| `routes/public/publicProducts.js` | `GET /api/products/:id` retorna bare object `{ ...product, images }` — pendente migração para `response.ok(res, data)` alinhada com frontend |

### Módulos legados — migração concluída

Todos os módulos legados foram migrados para o padrão moderno em 2026-04.
Não existem mais arquivos com o banner `ARQUIVO LEGADO` no código.

### Classificação de módulos — qual arquivo usar como modelo

Ao iniciar um módulo novo ou procurar referência de implementação, use esta classificação:

#### Referências canônicas — copie desses

Para cada camada, o(s) módulo(s) abaixo representam o padrão oficial mais completo e atualizado:

| Camada | Módulo referência | Por que este |
|--------|------------------|-------------|
| Rota magra (admin) | `routes/admin/adminDrones.js` | Wiring puro, middleware via mount(), Zod validate, upload com multer |
| Rota magra (ecommerce) | `routes/ecommerce/checkout.js` | Auth + CSRF por rota, recalcShipping middleware |
| Rota magra (público) | `routes/public/publicDrones.js` | Sem auth, paginação, upload público (comentários) |
| Controller (CRUD admin) | `controllers/adminOrdersController.js` | response.ok/created, AppError, formatação no controller |
| Controller (público) | `controllers/favoritesController.js` | response.ok/created/noContent, AppError, conciso |
| Service (transação) | `services/checkoutService.js` | Advisory lock, transação ACID, reserveStock, fire-and-forget |
| Service (CRUD) | `services/comunicacaoService.js` | Lógica de negócio + templates, sem req/res |
| Repository | `repositories/checkoutRepository.js` | Queries parametrizadas, suporte a conn (transação) |
| Schema Zod | `schemas/checkoutSchemas.js` | Transformações, normalização, coerção, mensagens pt-BR |

> **Regra:** se o módulo referência tem um padrão que seu código novo não tem, pergunte por quê antes de omitir.

#### Módulos congelados — NÃO copie desses

Estes arquivos são modernos na estrutura (controller, service, repository), mas têm **contratos de resposta divergentes** congelados por dependência de frontend. O header de cada arquivo documenta o shape exato.

| Arquivo | Shape congelado | Motivo |
|---------|----------------|--------|
| `controllers/cartController.js` | `{ success: true, ... }` + bare GET + `STOCK_LIMIT` 409 | Frontend cart |
| `controllers/shippingController.js` | `{ success: true, ...quote }` | Frontend checkout |
| `routes/ecommerce/payment.js` | Mount híbrido (admin em ecommerce) | Webhook sem cookie |
| `routes/ecommerce/cart.js` | Contrato `success: true` via cartController | Frontend cart |
| `routes/ecommerce/shipping.js` | Contrato `success: true` via shippingController | Frontend checkout |

> **Regra:** ao tocar esses arquivos, preserve o contrato exato. Para migrar: coordenar com frontend, abrir issue, só então alterar.

#### Módulos legados — migração concluída (2026-04)

Todos os módulos que estavam em `routes/*/_legacy/` foram migrados para o padrão moderno.
Não existem mais diretórios `_legacy/`.

### Onde um desenvolvedor novo vai se confundir

Armadilhas ativas (não resolvidas por organização — exigem migração futura):

1. **`routes/ecommerce/payment.js`** — rota magra e moderna (35 linhas, puro wiring), mas monta
   rotas admin (`/admin/payment-methods`) dentro do contexto ecommerce em vez de `adminRoutes.js`.
   O controller (`paymentController.js`) usa `response.ok/created/noContent` (Formato A).
   A rota está correta, apenas o mount é híbrido.

2. **`routes/admin/adminPedidos.js`** — migração concluída em 2026-04. Controller em `controllers/adminOrdersController.js`, schemas em `schemas/ordersSchemas.js`. Contrato de resposta mudou para `{ ok: true, data }` — requer atualização no admin frontend para leitura dos GETs. Ver header do controller para detalhes.

3. **`routes/public/publicProdutos.js`** vs **`routes/public/publicProducts.js`** — dois arquivos com domínios distintos.
   `publicProducts.js` = catálogo de produtos (listagem, busca, detalhe).
   `publicProdutos.js` = avaliações de produtos + quick search legado. Ambos são modernos (migrado em 2026-04).

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
| Produtos | `productPublicRepository.js` | Público/ecommerce | Leitura + busca, sem mutações |
| Produtos | `productAdminRepository.js` | Admin | CRUD completo + imagens |
| Carrinho | `cartRepository.js` | Usuário logado | Carrinho ativo (aberto), checkout |
| Carrinho | `abandonedCartsRepository.js` | Admin/painel | Carrinhos abandonados, notificações |

Regra para novos pares: nomear com sufixo de contexto (`Public`, `Admin`) ou prefixo descritivo (`abandoned`). Documentar o par no header de ambos os arquivos.

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

### Decisão rápida (leia isto primeiro)

```
Escrevendo código NOVO?
  → Formato A. Sempre. Sem exceção.
  → Sucesso: response.ok(res, data)  ou  response.created / .paginated / .noContent
  → Erro:    next(new AppError(msg, ERROR_CODES.XXX, status))

Tocando cartController, shippingController ou paymentController?
  → NÃO mude o formato de resposta.
  → Esses arquivos têm contrato CONGELADO — o header do arquivo explica o shape exato.
  → Para migrar: abra issue, coordene com frontend, só então altere.

Na dúvida sobre qual formato um endpoint usa?
  → Consulte o "Mapa por arquivo" abaixo.
```

### Os três formatos em produção

O projeto tem **3 formatos de resposta simultaneamente ativos**. Isso é resultado de migração incremental — não é intenção de design. O objetivo de longo prazo é convergir tudo para o Formato A.

| # | Formato de sucesso | Formato de erro | Status | Onde |
|---|---|---|---|---|
| **A — oficial** | `{ ok: true, data?, message?, meta? }` | `{ ok: false, code, message, details? }` | Use sempre em código novo | Todos os módulos modernos |
| **B — congelado** | `{ success: true, ... }` | A (via AppError) | Frontend depende — não altere sem alinhar | `cartController` (mutações), `shippingController` |
| **C — congelado** | Bare object (`{ carrinho_id }`, `{ methods }`, etc.) | variável | Frontend depende — não altere sem alinhar | `cartController` (GET), `paymentController`, `publicProductsController` (getById) |

### Mapa por arquivo — contratos congelados

Apenas os controllers que **divergem** do padrão A estão listados aqui. Todos os outros usam formato A.

| Controller | Endpoint | Formato sucesso | Formato erro | Bloqueador |
|-----------|----------|----------------|--------------|-----------|
| `cartController.js` | `GET /api/cart` | C: `{ carrinho_id, items }` | — | Frontend cart |
| `cartController.js` | `POST/PATCH/DELETE /api/cart*` | B: `{ success: true, message, ... }` | C: `{ code: "STOCK_LIMIT", ... }` no 409 | Frontend cart |
| `shippingController.js` | `GET /api/shipping/quote` | B: `{ success: true, cep, price, ... }` | A (via AppError) ✅ | Frontend checkout |
| `paymentController.js` | `GET /methods`, CRUD admin | C: `{ methods }` / `{ method }` | A (via AppError) ✅ | Frontend admin + checkout |
| `paymentController.js` | `POST /start` | C: bare result do service | A ✅ | Frontend checkout |
| `publicProductsController.js` | `GET /api/products/:id` | C: `{ ...product, images }` bare | `{ message }` | Frontend público |

> **Nota:** `authController.js` já usa formato A em todos os handlers (migrado para `response.ok()` em 2026-04). Não é mais divergente.

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
// Formato A — módulos modernos (adminOrdersController, drones, news, auth, ...)
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

Ao migrar cart, shipping ou payment: a mudança de formato **quebra o cliente** — coordenar frontend antes de mergar.

### Histórico de arquivos já migrados para Formato A

- `controllers/drones/` — 2026-03
- `controllers/news/adminClimaController.js` — 2026-03
- `controllers/news/adminCotacoesController.js` — 2026-03
- `controllers/adminOrdersController.js` — 2026-04 (contrato mudou de bare array para `{ ok, data }` — requer atualização no admin frontend para os GETs)
- `controllers/publicProductsController.js` (listProducts + searchProducts) — 2026-04-02 (`response.paginated`; `getProductById` pendente)
- `controllers/authController.js` — 2026-04 (todos os handlers já usam `response.ok()`)
- `controllers/userProfileController.js` — 2026-04 (migrado de `routes/auth/_legacy/userProfile.js`)
- `controllers/statsController.js` — 2026-04 (migrado de `routes/admin/_legacy/adminStats.js`)
- `controllers/relatoriosController.js` — 2026-04 (migrado de `routes/admin/_legacy/adminRelatorios.js`)
- `controllers/cuponsController.js` — 2026-04 (migrado de `routes/admin/_legacy/adminCupons.js`)
- `controllers/avaliacoesController.js` — 2026-04 (migrado de `routes/public/_legacy/publicProdutos.js`)
- `controllers/promocoesAdminController.js` — 2026-04 (migrado de `routes/admin/_legacy/adminMarketingPromocoes.js`)
