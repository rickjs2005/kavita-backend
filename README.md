# Kavita Backend

API REST do projeto Kavita. Node.js + Express, MySQL, autenticacao dupla por cookie HttpOnly, arquitetura em camadas.

---

## Índice

- [Visao geral](#visao-geral)
- [Stack](#stack)
- [Setup local](#setup-local)
- [Variaveis de ambiente](#variaveis-de-ambiente)
- [Estrutura de pastas](#estrutura-de-pastas)
- [Arquitetura](#arquitetura)
- [Modulos](#modulos)
- [Convencoes](#convencoes)
- [Contrato de resposta da API](#contrato-de-resposta-da-api)
- [Tratamento de erros](#tratamento-de-erros)
- [Autenticacao](#autenticacao)
- [Uploads e midia](#uploads-e-midia)
- [Testes](#testes)
- [Migrations e banco de dados](#migrations-e-banco-de-dados)
- [Como contribuir](#como-contribuir)
- [Padrao canonico](#padrao-canonico)
- [Documentacao complementar](#documentacao-complementar)

---

## Visao geral

Backend de uma plataforma de e-commerce e conteudo (drones, produtos, servicos, noticias). Expoe uma API REST sob `/api`, servida com Express. Autenticacao dupla: contexto admin e contexto de usuario final, ambos via cookie HttpOnly. Upload de midia centralizado com suporte a disco local, S3 e GCS.

Todos os modulos seguem o padrao moderno: rota magra -> controller -> service -> repository + Zod + `lib/response.js` + `AppError`.

---

## Stack

| Camada | Tecnologia |
|---|---|
| Runtime | Node.js (>=18) |
| Framework | Express 4.x |
| Banco de dados | MySQL 8 via `mysql2` raw pool |
| Validação | Zod 4 |
| Autenticação | JWT em cookie HttpOnly (`jsonwebtoken`) |
| Upload | Multer 2 via `mediaService` centralizado |
| Cache / Rate limit | Redis (`ioredis`) com fallback in-memory |
| Segurança | Helmet 8, CORS com credentials, CSRF double-submit cookie |
| Pagamentos | Mercado Pago SDK |
| Email | Nodemailer |
| Logging | Pino |
| Testes | Jest + Supertest |
| Migrations | Sequelize CLI (somente CLI — sem models ORM no código de aplicação) |
| Documentação API | Swagger UI em `/docs` |

> **Sobre Sequelize:** `sequelize` e `sequelize-cli` estão no projeto exclusivamente para gerenciar migrations via CLI (`npm run db:migrate`, `db:status`, `db:undo`). O código de aplicação **não usa models ORM** — todo acesso a dados é feito com `mysql2` raw pool (`config/pool.js`) através dos repositories em `repositories/`. Não há `Model.findAll()`, `Model.create()` ou qualquer instância Sequelize fora de `migrations/`. Se você está procurando models, eles não existem.

---

## Setup local

### Pré-requisitos

- Node.js >= 18
- MySQL 8 rodando localmente
- Redis (opcional — rate limiting degrada graciosamente sem ele)

### 1. Instalar dependências

```bash
npm install
```

### 2. Configurar variáveis de ambiente

```bash
cp .env.example .env
# editar .env com os valores do ambiente local
```

### 3. Criar e migrar o banco de dados

```bash
# Crie o banco manualmente no MySQL antes de executar:
# CREATE DATABASE kavita;
# CREATE DATABASE kavita_test;

npm run db:migrate
npm run db:test:reset   # reseta e migra o banco de teste
```

### 4. Rodar em desenvolvimento

```bash
npm run dev   # nodemon com hot-reload
```

O servidor sobe na porta `5000` por padrão (`PORT` pode ser sobrescrito via `.env`).

Endpoints disponíveis após start:
- `http://localhost:5000/api` — API principal
- `http://localhost:5000/docs` — Swagger UI
- `http://localhost:5000/health` — health check (DB + ambiente)
- `http://localhost:5000/uploads/*` — arquivos estáticos

---

## Variáveis de ambiente

O servidor **não sobe** se qualquer variável obrigatória estiver ausente. A validação ocorre em `config/env.js` no startup.

### Obrigatórias

```env
JWT_SECRET=           # segredo de assinatura JWT (use string longa e aleatória)
EMAIL_USER=           # usuário SMTP para envio de email
EMAIL_PASS=           # senha SMTP
APP_URL=              # URL base do frontend (ex: http://localhost:3000)
BACKEND_URL=          # URL base do backend (ex: http://localhost:5000)
DB_HOST=              # host do MySQL
DB_USER=              # usuário do MySQL
DB_PASSWORD=          # senha do MySQL
DB_NAME=              # nome do banco de dados
```

### Opcionais com default

```env
PORT=5000                    # porta do servidor
DB_PORT=3306                 # porta do MySQL
JWT_EXPIRATION=7d            # expiração do JWT de usuário
ALLOWED_ORIGINS=             # origens CORS adicionais (CSV, além de localhost)
MEDIA_STORAGE_DRIVER=disk    # driver de storage: disk | s3 | gcs
```

### Opcionais de produção

```env
REDIS_URL=                   # Redis para rate limiting e cache de permissões
MP_ACCESS_TOKEN=             # Mercado Pago access token
MP_WEBHOOK_SECRET=           # segredo para validação de webhooks do Mercado Pago
```

> **Atenção:** o `JWT_EXPIRATION` deve estar alinhado com o `maxAge` do cookie de usuário (7 dias). Se não estiver, o cookie persiste mas o JWT expira, causando 401 até novo login.

---

## Estrutura de pastas

```
kavita-backend/
│
├── server.js                  # Ponto de entrada. Ordem de middlewares é deliberada — não reordenar.
│
├── routes/
│   ├── index.js               # Agregador central. Todas as rotas são montadas aqui.
│   ├── admin/                 # Rotas do painel admin (protegidas por verifyAdmin + validateCSRF)
│   ├── public/                # Rotas públicas (sem autenticação)
│   ├── auth/                  # Login, registro, perfil, endereços de usuário
│   └── ecommerce/             # Carrinho, checkout, pedidos, pagamento, frete
│
├── controllers/               # Recebem req/res, delegam para service, retornam via lib/response.js
│   └── drones/                # Sub-domínio drones (controladores separados por responsabilidade)
│
├── services/                  # Lógica de negócio. Não conhecem req/res.
│   └── drones/                # Sub-domínio drones
│
├── repositories/              # Acesso a dados. Apenas queries MySQL2. Sem lógica de negócio.
│
├── middleware/
│   ├── verifyAdmin.js         # Autenticação admin (cookie adminToken)
│   ├── authenticateToken.js   # Autenticação de usuário (cookie auth_token)
│   ├── csrfProtection.js      # CSRF double-submit cookie
│   ├── validate.js            # Middleware de validação Zod (factory)
│   ├── requirePermission.js   # RBAC granular
│   ├── adaptiveRateLimiter.js # Rate limiting Redis-backed com fallback in-memory
│   └── errorHandler.js        # Handler global de erros (último middleware em server.js)
│
├── schemas/                   # Schemas Zod para validação de entrada por domínio
│
├── config/
│   ├── env.js                 # Validação de vars de ambiente no startup
│   ├── pool.js                # MySQL2 connection pool
│   ├── auth.js                # JWT sign/verify helpers
│   ├── cors.js                # Configuração de CORS
│   └── helmet.js              # Security headers (CSP, HSTS, etc.)
│
├── errors/
│   └── AppError.js            # Classe de erro padronizada da aplicação
│
├── constants/
│   └── ErrorCodes.js          # Códigos de erro canônicos (nunca use strings literais)
│
├── lib/
│   ├── index.js               # Barrel export: { logger, redis, response }
│   ├── response.js            # Helpers de resposta HTTP (ok, created, paginated, etc.)
│   ├── redis.js               # Cliente Redis
│   └── logger.js              # Logger Pino
│
├── test/                      # Testes (Jest)
│   ├── setup/                 # Configuração de ambiente de teste
│   ├── integration/           # Testes de integração (banco real)
│   ├── unit/                  # Testes unitários (dependências mockadas)
│   └── mocks/                 # Mocks reutilizáveis (pool, etc.)
│
├── migrations/                # Migrations Sequelize CLI
├── docs/                      # Swagger spec
└── scripts/                   # Utilitários de banco e schema
```

---

## Arquitetura

### Fluxo oficial (padrão moderno)

```
Request HTTP
    ↓
server.js (middlewares globais: CORS, Helmet, cookie-parser, rate limiter)
    ↓
routes/index.js (monta rotas + aplica verifyAdmin/validateCSRF conforme contexto)
    ↓
routes/admin/{domínio}.js ou routes/public/{domínio}.js
  - aplica middleware de validação Zod: validate(schema)
  - chama o controller
    ↓
controllers/{domínio}Controller.js
  - extrai dados de req (body, params, query, files)
  - chama o service
  - retorna com response.ok() / response.created() / response.paginated()
  - erros: next(new AppError(...))
    ↓
services/{domínio}Service.js
  - regras de negócio
  - orquestra repositories e outros serviços
  - lança AppError para erros esperados
    ↓
repositories/{domínio}Repository.js
  - queries MySQL2 raw pool
  - sem lógica de negócio
  - retorna dados brutos
    ↓
middleware/errorHandler.js (captura qualquer AppError ou erro não tratado)
    ↓
Response HTTP { ok: true/false, data?, code?, message?, meta? }
```

### Cross-cutting concerns

```
                        ┌─────────────────────────────────────────┐
                        │              server.js                  │
                        │  CORS → Helmet → requestLogger →        │
                        │  cookieParser → rateLimiter →            │
                        │  /api routes → errorHandler              │
                        └─────────────┬───────────────────────────┘
                                      │
              ┌───────────────────────┼───────────────────────┐
              │                       │                       │
     publicRoutes.js          authIndex.js            adminRoutes.js
     (sem auth)          (authenticateToken       (verifyAdmin +
                          + validateCSRF)          validateCSRF +
                                                  requirePermission)
              │                       │                       │
              └───────────┬───────────┴───────────┬───────────┘
                          │                       │
                   validate(zodSchema)      mediaService.upload
                          │                       │
                     Controller ──→ Service ──→ Repository
                          │                       │
                     response.ok()           pool.query()
                     response.created()
                     next(AppError)
```

### Roteamento centralizado

**Todas as rotas sao montadas em `routes/index.js`.** Nunca adicione `app.use()` diretamente em `server.js` para novas rotas.

O `loadRoute()` em `routes/index.js` envolve cada `require()` em try/catch:
- Em produção: falha de carregamento de módulo lança erro e impede o servidor de subir.
- Em desenvolvimento/CI: loga aviso e continua (permite subir parcialmente para debug).

### Ordem de middlewares em server.js

A ordem em `server.js` é deliberada e não deve ser alterada. O ponto crítico:

```
CORS /uploads (sem credentials)
→ Headers customizados /uploads (Cache-Control, ACAO: *)
→ CORS /api (com credentials)
→ Helmet (global) ← define Cross-Origin-Resource-Policy: same-origin
→ Middleware /uploads ← sobrescreve CORP para cross-origin (deve vir DEPOIS do Helmet)
→ express.json / cookieParser
→ express.static /uploads
→ Rate limiter
→ /api routes
→ errorHandler (último)
```

O Helmet 8 define `Cross-Origin-Resource-Policy: same-origin` por padrão. O override para `cross-origin` em `/uploads` precisa vir depois, senão assets de mídia não carregam em clientes cross-origin.

---

## Modulos

Todos os modulos seguem o padrao moderno. Historico de migracao (100% concluida, arquivado em 2026-04-22): [docs/history/migration-tracker.md](docs/history/migration-tracker.md).

| Dominio | Rota | Controller | Service | Repository |
|---|---|---|---|---|
| Auth admin | `routes/auth/adminLogin.js` | `controllers/admin/authAdminController.js` | `services/authAdminService.js` | — |
| Auth usuario | `routes/auth/login.js` | `controllers/authController.js` | — | `repositories/userRepository.js` |
| Perfil usuario | `routes/auth/userProfile.js` | `controllers/userProfileController.js` | `services/userProfileService.js` | `repositories/userRepository.js` |
| Enderecos | `routes/auth/userAddresses.js` | `controllers/userAddressController.js` | `services/userAddressService.js` | `repositories/addressRepository.js` |
| Drones (admin) | `routes/admin/adminDrones.js` | `controllers/drones/` | `services/drones/` | `repositories/dronesRepository.js` |
| Drones (publico) | `routes/public/publicDrones.js` | `controllers/dronesPublicController.js` | `services/dronesService.js` | `repositories/dronesRepository.js` |
| News (admin) | `routes/admin/adminNews.js` | `controllers/news/` | — | `repositories/postsRepository.js`, `climaRepository.js`, `cotacoesRepository.js` |
| News (publico) | `routes/public/publicNews.js` | `controllers/newsPublicController.js` | — | (mesmos repositories) |
| Produtos (admin) | `routes/admin/adminProdutos.js` | `controllers/produtosController.js` | `services/produtosAdminService.js` | `repositories/productAdminRepository.js` |
| Produtos (publico) | `routes/public/publicProducts.js` | `controllers/publicProductsController.js` | `services/productService.js` | `repositories/productPublicRepository.js` |
| Servicos (admin) | `routes/admin/adminServicos.js` | `controllers/servicosAdminController.js` | `services/servicosAdminService.js` | `repositories/servicosAdminRepository.js` |
| Servicos (publico) | `routes/public/publicServicos.js` | `controllers/servicosPublicController.js` | `services/servicosService.js` | `repositories/servicosRepository.js` |
| Config (admin) | `routes/admin/adminConfig.js` | `controllers/configController.js` | `services/configAdminService.js` | `repositories/configRepository.js` |
| Pedidos (admin) | `routes/admin/adminPedidos.js` | `controllers/adminOrdersController.js` | `services/orderService.js` | `repositories/orderRepository.js` |
| Pedidos (usuario) | `routes/ecommerce/pedidos.js` | `controllers/pedidosUserController.js` | — | `repositories/pedidosUserRepository.js` |
| Comunicacao (admin) | `routes/admin/adminComunicacao.js` | `controllers/comunicacaoController.js` | `services/comunicacaoService.js` | `repositories/comunicacaoRepository.js` |
| Zonas de frete | `routes/admin/adminShippingZones.js` | `controllers/shippingZonesController.js` | `services/shippingZonesService.js` | `repositories/shippingZonesRepository.js` |
| Carrinhos (admin) | `routes/admin/adminCarts.js` | `controllers/cartsController.js` | `services/cartsAdminService.js` | `repositories/abandonedCartsRepository.js` |
| Hero (admin) | `routes/admin/adminSiteHero.js` | `controllers/siteHeroController.js` | — | `repositories/heroRepository.js` |
| Hero slides | `routes/admin/adminHeroSlides.js` | `controllers/heroSlidesController.js` | — | `repositories/heroSlidesRepository.js` |
| Cart (usuario) | `routes/ecommerce/cart.js` | `controllers/cartController.js` | `services/cartService.js` | `repositories/cartRepository.js` |
| Checkout | `routes/ecommerce/checkout.js` | `controllers/checkoutController.js` | `services/checkoutService.js` | `repositories/checkoutRepository.js` |
| Payment | `routes/ecommerce/payment.js` | `controllers/paymentController.js` | `services/paymentService.js` | `repositories/paymentRepository.js` |
| Shipping | `routes/ecommerce/shipping.js` | `controllers/shippingController.js` | `services/shippingQuoteService.js` | `repositories/shippingRepository.js` |
| Favoritos | `routes/ecommerce/favorites.js` | `controllers/favoritesController.js` | `services/favoritesService.js` | `repositories/favoritesRepository.js` |
| Stats (admin) | `routes/admin/adminStats.js` | `controllers/statsController.js` | — | `repositories/statsRepository.js` |
| Relatorios (admin) | `routes/admin/adminRelatorios.js` | `controllers/relatoriosController.js` | — | `repositories/relatoriosRepository.js` |
| Cupons (admin) | `routes/admin/adminCupons.js` | `controllers/cuponsController.js` | — | `repositories/cuponsRepository.js` |
| Promocoes (admin) | `routes/admin/adminMarketingPromocoes.js` | `controllers/promocoesAdminController.js` | — | `repositories/promocoesAdminRepository.js` |
| Avaliacoes (publico) | `routes/public/publicAvaliacoes.js` | `controllers/avaliacoesController.js` | `services/avaliacoesService.js` | `repositories/avaliacoesRepository.js` |
| Admins (admin) | `routes/admin/adminAdmins.js` | `controllers/adminAdminsController.js` | — | `repositories/adminAdminsRepository.js` |
| Users (admin) | `routes/admin/adminUsers.js` | `controllers/adminUsersController.js` | — | `repositories/adminUsersRepository.js` |
| Permissions | `routes/admin/adminPermissions.js` | `controllers/permissionsController.js` | — | `repositories/permissionsRepository.js` |
| Roles (admin) | `routes/admin/adminRoles.js` | `controllers/rolesController.js` | `services/rolesAdminService.js` | `repositories/rolesRepository.js` |
| Logs (admin) | `routes/admin/adminLogs.js` | `controllers/logsController.js` | — | `repositories/logsRepository.js` |
| Categorias (admin) | `routes/admin/adminCategorias.js` | `controllers/categoriasController.js` | `services/categoriasAdminService.js` | `repositories/categoriasRepository.js` |
| Categorias (publico) | `routes/public/publicCategorias.js` | `controllers/categoriasPublicController.js` | — | `repositories/categoriasRepository.js` |
| Colaboradores | `routes/admin/adminColaboradores.js` | `controllers/colaboradoresController.js` | `services/colaboradoresAdminService.js` | `repositories/colaboradoresRepository.js` |
| Especialidades | `routes/admin/adminEspecialidades.js` | `controllers/especialidadesController.js` | — | `repositories/especialidadesRepository.js` |
| Solicitacoes | `routes/admin/adminSolicitacoesServicos.js` | `controllers/solicitacoesController.js` | — | `repositories/solicitacoesRepository.js` |
| Shop config (publico) | `routes/public/publicShopConfig.js` | `controllers/shopConfigPublicController.js` | — | `repositories/configRepository.js` |
| Corretoras (admin) | `routes/admin/adminCorretoras.js` | `controllers/corretorasAdminController.js` | `services/corretorasService.js` | `repositories/corretorasAdminRepository.js` |
| Corretoras (publico) | `routes/public/publicCorretoras.js` | `controllers/corretorasPublicController.js` | — | `repositories/corretorasPublicRepository.js` |

---

## Convencoes

| Camada | Padrão | Exemplos |
|---|---|---|
| Rotas admin | `admin{Domínio}.js` | `adminDrones.js`, `adminProdutos.js` |
| Rotas públicas | `public{Domínio}.js` | `publicDrones.js`, `publicProdutos.js` |
| Controllers | `{domínio}Controller.js` ou subdir `{domínio}/` | `checkoutController.js`, `drones/galleryController.js` |
| Services | `{domínio}Service.js` ou subdir `{domínio}/` | `cartService.js`, `drones/pageService.js` |
| Repositories | `{domínio}Repository.js` | `cartRepository.js`, `dronesRepository.js` |

**Idioma:** nomes de negócio existentes usam português (`pedidos`, `produtos`, `servicos`). Novos módulos de infraestrutura podem usar inglês (`auth`, `media`, `cache`).

**Middlewares de autenticação:**
- `authenticateToken` — padrão para rotas de usuário. Sempre use este.
- `verifyAdmin` — rotas admin.
- `verifyUser` — **removido**. Era alias de `authenticateToken`.
- `requireRole` — **removido**. Era código morto.

---

## Contrato de resposta da API

Toda resposta da API segue este formato. Nunca use `res.json()` cru em código novo.

### Sucesso

```json
{ "ok": true, "data": { ... } }
{ "ok": true, "data": { ... }, "message": "Criado com sucesso." }
{ "ok": true, "data": [...], "meta": { "total": 40, "page": 1, "limit": 10, "pages": 4 } }
```

HTTP 204 (no body) para DELETE e PATCH/PUT sem retorno relevante.

### Erro

```json
{ "ok": false, "code": "NOT_FOUND", "message": "Produto não encontrado." }
{ "ok": false, "code": "VALIDATION_ERROR", "message": "Dados inválidos.", "details": [{ "field": "price", "message": "Obrigatório." }] }
```

### Helpers em `lib/response.js`

```js
const { response } = require("../lib");

response.ok(res, data);                             // 200
response.created(res, data);                        // 201
response.noContent(res);                            // 204
response.paginated(res, { items, total, page, limit }); // 200 + meta
response.badRequest(res, message, details);         // 400 (preferir AppError)
```

### Mapeamento HTTP -> codigo de erro

| HTTP | `ERROR_CODES` | Quando usar |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Schema Zod falhou ou parâmetro inválido |
| 401 | `AUTH_ERROR` | Credenciais inválidas, token inválido |
| 401 | `UNAUTHORIZED` | Sem token / sem autenticação |
| 403 | `FORBIDDEN` | Autenticado mas sem permissão |
| 404 | `NOT_FOUND` | Recurso não encontrado |
| 409 | `CONFLICT` | Recurso já existe ou estado incompatível |
| 429 | `RATE_LIMIT` | Rate limit excedido |
| 500 | `SERVER_ERROR` | Erro interno não previsto |

---

## Tratamento de erros

### AppError

Use `AppError` para qualquer erro esperado. O `errorHandler` global processa tudo.

```js
const AppError = require("../errors/AppError");
const { ERROR_CODES } = require("../constants/ErrorCodes");

// Em controllers e services:
throw new AppError("Produto não encontrado.", ERROR_CODES.NOT_FOUND, 404);
throw new AppError("Dados inválidos.", ERROR_CODES.VALIDATION_ERROR, 400, { fields });

// Em rotas e controllers com next:
return next(new AppError("Sem permissão.", ERROR_CODES.FORBIDDEN, 403));
```

**Assinatura:** `new AppError(message, code, status, details?)`

Nunca use strings literais para o código (`"NOT_FOUND"` etc.) — sempre use as constantes de `constants/ErrorCodes.js`.

### errorHandler global

Montado como último middleware em `server.js`. Processa:
- Instâncias de `AppError` → usa `status` e `code` da instância
- Erros de pool MySQL (`POOL_ENQUEUELIMIT`) → 503
- Qualquer outro erro → 500 com mensagem genérica em produção

Erros 500+ nunca expõem stack trace em produção.

---

## Autenticação

O sistema tem **quatro contextos de autenticação completamente independentes**. Cada um tem cookie HttpOnly próprio, middleware dedicado e endpoint de login distinto. Os cookies podem coexistir no mesmo browser (um admin pode estar impersonando uma corretora, por exemplo).

| Contexto | Cookie | Validade JWT | Middleware | Login |
|---|---|---|---|---|
| Admin | `adminToken` (HttpOnly) | 2h | `verifyAdmin` | `POST /api/admin/login` |
| Usuário da loja | `auth_token` (HttpOnly) | 7d (ver nota abaixo) | `authenticateToken` | `POST /api/login` |
| Corretora | cookie próprio (HttpOnly) | definido no service | `verifyCorretora` | `POST /api/corretora/login` ou magic-link |
| Produtor | cookie próprio (HttpOnly) | definido no service | `verifyProducer` | magic-link (`POST /api/public/produtor/magic-link` + `GET /api/produtor/verify/:token`) |

### Fluxo admin

1. `POST /api/admin/login` → valida credenciais → assina JWT → define cookie `adminToken`
2. Rotas admin aplicam `verifyAdmin` + `validateCSRF`
3. `verifyAdmin` valida JWT, busca admin no banco, verifica `tokenVersion` (suporte a revogação de sessão), carrega permissões granulares (cache Redis 60s)
4. `req.admin` fica disponível: `{ id, email, nome, role, role_id, permissions }`
5. `POST /api/admin/logout` → incrementa `tokenVersion` no banco (invalida todos os tokens ativos) → limpa cookie

### Fluxo usuário da loja

1. `POST /api/login` → valida credenciais → assina JWT → define cookie `auth_token`
2. Rotas protegidas de usuário aplicam `authenticateToken` + `validateCSRF`
3. `authenticateToken` valida JWT, busca usuário no banco, verifica `tokenVersion`
4. `req.user` fica disponível: `{ id, nome, email, role }`

### Fluxo corretora

1. `POST /api/corretora/login` (senha) **ou** `POST /api/corretora/magic-link` (e-mail)
2. `verifyCorretora` popula `req.corretoraUser` + `req.corretora`
3. TOTP opcional via `/api/corretora/totp/*`
4. Impersonação: admin pode entrar no painel via `POST /api/admin/corretoras/:id/impersonate`; sair via `POST /api/corretora/exit-impersonation` (só limpa o cookie de corretora, `adminToken` permanece)

### Fluxo produtor (magic-link, sem senha)

1. Produtor informa e-mail → `POST /api/public/produtor/magic-link` (Turnstile + rate limit)
2. Backend envia link assinado (HMAC + TTL curto)
3. Produtor clica → frontend chama `GET /api/produtor/verify/:token` → cookie emitido
4. `verifyProducer` popula `req.producer` em rotas privadas do painel produtor
5. LGPD: `POST /api/producer/data-request`, `POST /api/producer/data-deletion`

### CSRF

Double-submit cookie:
- Frontend obtém token em `GET /api/csrf-token`
- Cookie `csrf_token` é definido (`httpOnly: false` — legível por JS)
- Toda mutação (POST/PUT/PATCH/DELETE) deve enviar o token no header `x-csrf-token`
- `validateCSRF` é no-op para GET/HEAD/OPTIONS

### Nota sobre JWT_EXPIRATION

O `.env` padrão define `JWT_EXPIRATION=7d` para usuários. Se você alterar para um valor menor sem ajustar o `maxAge` do cookie (também 7d em `routes/auth/login.js`), o cookie persiste mas o JWT expira — causando 401 intermitente. Mantenha os dois alinhados.

---

## Uploads e mídia

Todo upload de arquivo passa obrigatoriamente por `services/mediaService.js`. Não use `fs.writeFile` direto nem multer sem `persistMedia`.

### Fluxo padrão

```js
const mediaService = require("../services/mediaService");

// 1. Multer como middleware na rota
router.post("/", mediaService.upload.array("imagens", 5), controller.create);

// 2. No controller/service, persistir após validação
const saved = await mediaService.persistMedia(req.files, { folder: "produtos" });
// saved = [{ path: "/uploads/produtos/arquivo.webp", key: "/abs/path/arquivo.webp" }]

// 3. Armazenar saved[n].path no banco
// 4. Em caso de erro antes de salvar no banco:
await mediaService.enqueueOrphanCleanup(saved);

// 5. Em DELETE:
await mediaService.removeMedia(targets).catch(logger.error);
```

### Pastas em uso

`products/`, `colaboradores/`, `services/`, `drones/`, `hero/`, `news/`, `logos/`

### Storage drivers

Configurado via `MEDIA_STORAGE_DRIVER`:
- `disk` (padrão) — arquivos em `uploads/` local
- `s3` — AWS S3
- `gcs` — Google Cloud Storage

### Paths

| O que é | Formato |
|---|---|
| Salvo no banco | `/uploads/{folder}/{filename}` |
| Arquivo físico (disk) | `{cwd}/uploads/{folder}/{filename}` |
| URL pública | `{BACKEND_URL}/uploads/{folder}/{filename}` |

Antes de corrigir qualquer bug relacionado a imagem, mapeie esses três pontos. A maioria dos bugs de imagem é desalinhamento entre eles.

---

## Testes

```bash
npm test                    # todos os testes (unit + integration), sequencial
npm run test:unit           # apenas test/unit/
npm run test:int            # apenas test/integration/
npm run test:cov            # todos com relatório de cobertura

# Arquivo único:
npx cross-env NODE_ENV=test node ./node_modules/jest/bin/jest.js --runInBand test/integration/adminDrones.int.test.js
```

### Estrutura

```
test/
├── setup/
│   ├── env.setup.js        # define vars mínimas para NODE_ENV=test
│   └── jest.setup.js       # hooks e config Jest
├── integration/            # testes de integração (banco real de teste)
├── unit/                   # testes unitários (dependências mockadas)
├── mocks/
│   └── pool.mock.js        # makeMockPool / makeMockConn reutilizáveis
└── testUtils.js            # makeTestApp, helpers de setup
```

### Antes de rodar testes de integração pela primeira vez

```bash
npm run db:test:reset
```

Isso limpa e re-migra o banco `kavita_test`. Necessário somente na primeira vez ou após mudanças de schema.

### Padrão de teste de integração

Os testes de integração usam `jest.resetModules()` + mocks injetados para isolar dependências de banco e middleware. Ver `test/testUtils.js` para os helpers `makeTestApp()` e `makeMockConn()`.

---

## Migrations e banco de dados

```bash
npm run db:migrate           # aplica migrations pendentes (ambiente development)
npm run db:status            # mostra status de cada migration
npm run db:undo              # reverte última migration
npm run db:test:reset        # limpa + re-migra banco de teste
npm run db:test:migrate      # aplica migrations pendentes no banco de teste
```

### Por que Sequelize está no projeto se não há models?

O `sequelize` e `sequelize-cli` são dependências exclusivamente para gerenciar migrations via CLI. O código de aplicação (rotas, services, repositories) usa apenas `mysql2` raw pool (`config/pool.js`). Não há models Sequelize no código de aplicação e não deve haver — o projeto usa queries SQL diretas por design.

O `.sequelizerc` na raiz configura os caminhos usados pelo CLI.

---

## Como contribuir

### Regras para qualquer arquivo novo ou modificado

1. **Respostas** -> sempre `lib/response.js`. Nunca `res.json()` cru.
2. **Erros** -> sempre `next(new AppError(message, ERROR_CODES.XXX, status))`. Nunca `res.status(4xx).json()` inline.
3. **Validacao** -> schema Zod em `schemas/` + middleware `validate(schema)`. Nunca `if (!campo)` inline.
4. **Banco** -> repository separado. Nunca `pool.query()` em rota ou controller.
5. **Codigos de erro** -> constantes de `constants/ErrorCodes.js`. Nunca strings literais.

### Referencia de implementacao

| Camada | Arquivo referência |
|--------|--------------------|
| Rota admin | `routes/admin/adminDrones.js` |
| Rota ecommerce | `routes/ecommerce/checkout.js` |
| Controller CRUD | `controllers/adminOrdersController.js` |
| Service transacional | `services/checkoutService.js` |
| Repository | `repositories/checkoutRepository.js` |
| Schema Zod | `schemas/checkoutSchemas.js` |

---

## Padrao canonico

### Rota (magra)

```js
const express = require("express");
const router = express.Router();
const { validate } = require("../../middleware/validate");
const { CriarProdutoSchema } = require("../../schemas/requests");
const controller = require("../../controllers/produtosController");
const mediaService = require("../../services/mediaService");

router.get("/", controller.list);
router.post("/", mediaService.upload.single("imagem"), validate(CriarProdutoSchema), controller.create);

module.exports = router;
```

### Controller

```js
const AppError = require("../errors/AppError");
const { ERROR_CODES } = require("../constants/ErrorCodes");
const { response } = require("../lib");
const service = require("../services/produtosService");

const list = async (req, res, next) => {
  try {
    const data = await service.listar(req.query);
    return response.ok(res, data);
  } catch (err) {
    return next(err instanceof AppError ? err : new AppError(err.message, ERROR_CODES.SERVER_ERROR, 500));
  }
};

const create = async (req, res, next) => {
  try {
    const created = await service.criar(req.body, req.file);
    return response.created(res, created);
  } catch (err) {
    return next(err instanceof AppError ? err : new AppError(err.message, ERROR_CODES.SERVER_ERROR, 500));
  }
};

module.exports = { list, create };
```

### Service

```js
const AppError = require("../errors/AppError");
const { ERROR_CODES } = require("../constants/ErrorCodes");
const repository = require("../repositories/productAdminRepository");

async function listar(query) {
  return repository.findAll(query);
}

async function criar(data, file) {
  const existing = await repository.findByNome(data.nome);
  if (existing) throw new AppError("Produto já existe.", ERROR_CODES.CONFLICT, 409);
  return repository.create(data);
}

module.exports = { listar, criar };
```

### Repository

```js
const pool = require("../config/pool");

async function findAll({ page = 1, limit = 20 } = {}) {
  const offset = (page - 1) * limit;
  const [rows] = await pool.query("SELECT * FROM produtos LIMIT ? OFFSET ?", [limit, offset]);
  const [[{ total }]] = await pool.query("SELECT COUNT(*) AS total FROM produtos");
  return { items: rows, total };
}

async function findByNome(nome) {
  const [[row]] = await pool.query("SELECT id FROM produtos WHERE nome = ? LIMIT 1", [nome]);
  return row ?? null;
}

async function create(data) {
  const [result] = await pool.query("INSERT INTO produtos SET ?", [data]);
  return { id: result.insertId, ...data };
}

module.exports = { findAll, findByNome, create };
```

### Schema Zod

```js
const { z } = require("zod");

const CriarProdutoSchema = z.object({
  nome: z.string().min(1),
  preco: z.coerce.number().positive(),
  categoria_id: z.coerce.number().int().positive(),
});

function formatZodErrors(zodError) {
  return zodError.errors.map((e) => ({ field: e.path.join("."), message: e.message }));
}

module.exports = { CriarProdutoSchema, formatZodErrors };
```

---

## Documentacao complementar

### Caminho de leitura recomendado para dev novo

1. Este README (visao geral, setup, arquitetura, convencoes)
2. [docs/flows.md](docs/flows.md) — fluxos criticos (checkout, pagamento, webhook, cancelamento)
3. [docs/decisions.md](docs/decisions.md) — por que as coisas sao como sao (ADRs)
4. [docs/api-response.md](docs/api-response.md) — contrato de resposta da API
5. [BACKEND_SECURITY_ALIGNMENT.md](BACKEND_SECURITY_ALIGNMENT.md) — controles de seguranca

### Referencia completa

| Documento | Conteudo |
|-----------|---------|
| [docs/flows.md](docs/flows.md) | Checkout, pagamento, webhook, cancelamento — sequencias, protecoes, request/response |
| [docs/runbook.md](docs/runbook.md) | Operacao em producao — diagnostico, deploy, seguranca operacional |
| [docs/api-response.md](docs/api-response.md) | Contrato de resposta da API, helpers, exemplos |
| [docs/decisions.md](docs/decisions.md) | ADRs — decisoes arquiteturais com contexto e consequencias |
| [docs/observability.md](docs/observability.md) | Health check, estado do logging, lacunas e roadmap |
| [docs/history/migration-tracker.md](docs/history/migration-tracker.md) | Historico da migracao arquitetural (100% concluida — arquivado 2026-04-22) |
| [docs/history/swagger-plan.md](docs/history/swagger-plan.md) | Inventario de cobertura Swagger (plano cumprido — specs vivas em docs/swagger/, arquivado 2026-04-22) |
| [BACKEND_SECURITY_ALIGNMENT.md](BACKEND_SECURITY_ALIGNMENT.md) | Controles de seguranca, cobertura e lacunas |
| [CLAUDE.md](CLAUDE.md) | Instrucoes operacionais para IA/agentes |
