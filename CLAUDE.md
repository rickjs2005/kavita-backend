# CLAUDE.md

Instrucoes operacionais para IA/agentes ao trabalhar neste repositorio.
Para documentacao completa do projeto, consulte o [README.md](README.md).

---

## Comandos

```bash
npm run dev              # desenvolvimento com hot-reload
npm test                 # todos os testes
npm run test:unit        # apenas unitarios
npm run test:int         # apenas integracao
npm run test:cov         # com cobertura
npm run lint             # lint
npm run db:migrate       # aplica migrations
npm run db:test:reset    # limpa e re-migra banco de teste

# Teste unico:
npx cross-env NODE_ENV=test node ./node_modules/jest/bin/jest.js --runInBand test/integration/adminDrones.int.test.js
```

---

## Onde colocar codigo novo

```
routes/{contexto}/                 <- rota magra, so wiring
schemas/{dominio}Schemas.js        <- validacao Zod
controllers/{dominio}Controller.js <- extrai dados de req, delega ao service
services/{dominio}Service.js       <- logica de negocio
repositories/{dominio}Repository.js <- queries SQL
```

### Qual pasta de rota usar

| Natureza | Pasta | Middleware |
|---|---|---|
| Login/logout/register | `routes/auth/` | nenhum (sem CSRF) |
| Painel admin | `routes/admin/` | `verifyAdmin + validateCSRF` |
| Usuario logado | `routes/ecommerce/` ou `routes/auth/` | `authenticateToken + validateCSRF` |
| Publico sem auth | `routes/public/` | nenhum |
| Infra/utilitarios | `routes/utils/` | nenhum |

---

## Regras obrigatorias para codigo novo ou modificado

1. **Respostas** -> `lib/response.js` (`response.ok`, `response.created`, etc.). Nunca `res.json()` cru.
2. **Erros** -> `next(new AppError(msg, ERROR_CODES.XXX, status))`. Nunca `res.status(4xx).json()`.
3. **Validacao** -> schema Zod em `schemas/` + `middleware/validate.js`. Nunca `if (!campo)`.
4. **Banco** -> repository. Nunca `pool.query()` em rota ou controller.
5. **Codigos de erro** -> constantes de `constants/ErrorCodes.js`. Nunca strings literais.
6. **Exports** -> `module.exports = { fn1, fn2 }` no final do controller.

### Assinatura do AppError

```js
// CORRETO
throw new AppError(message, ERROR_CODES.XXX, status, details?)

// EXEMPLOS
throw new AppError("Nao encontrado.", ERROR_CODES.NOT_FOUND, 404);
throw new AppError("Dados invalidos.", ERROR_CODES.VALIDATION_ERROR, 400, { fields });
```

### Contrato de resposta

```
Sucesso  -> { ok: true, data?, message?, meta? }     via lib/response.js
Erro     -> { ok: false, code, message, details? }    via errorHandler (AppError)
```

---

## Arquitetura

### Fluxo

```
Request -> server.js (middlewares) -> routes/index.js -> rota -> controller -> service -> repository -> Response
```

### Banco de dados

MySQL2 raw pool (`config/pool.js`). Sequelize existe **apenas para migrations via CLI**. Nao ha models ORM no codigo de aplicacao.

### Autenticacao

| Contexto | Cookie | Validade | Middleware |
|----------|--------|----------|------------|
| Admin | `adminToken` | 2h | `verifyAdmin` |
| Usuario | `auth_token` | 7d | `authenticateToken` |

`verifyUser` e `requireRole` foram removidos.

### CSRF

Double-submit cookie. Frontend obtem token em `GET /api/csrf-token`, envia no header `x-csrf-token`.

### Upload

Sempre via `services/mediaService.js`. Nunca `fs.writeFile` direto.

```js
// 1. Middleware multer na rota
mediaService.upload.array("imagens", 5)
// 2. Persistir no controller/service
mediaService.persistMedia(req.files, { folder: "nome" })
// 3. Cleanup em erro
mediaService.enqueueOrphanCleanup(targets)
// 4. Remocao em DELETE
mediaService.removeMedia(targets)
```

`cleanupMedia` nao existe — usar `removeMedia` ou `enqueueOrphanCleanup`.

---

## Middleware em server.js

A ordem e deliberada e nao deve ser reordenada:

```
CORS /uploads -> CORS /api -> Helmet -> CORP override /uploads -> express.json -> express.static -> Rate limiter -> /api routes -> errorHandler
```

O Helmet 8 seta `Cross-Origin-Resource-Policy: same-origin` por default. O override para `/uploads` deve vir **depois do Helmet**.

---

## Variaveis de ambiente obrigatorias

O servidor nao sobe sem: `JWT_SECRET`, `EMAIL_USER`, `EMAIL_PASS`, `APP_URL`, `BACKEND_URL`, `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`.

Em producao: `MP_WEBHOOK_SECRET` (webhook rejeita pagamentos), `CPF_ENCRYPTION_KEY` (LGPD).

---

## Referencias canonicas para implementacao

| Camada | Arquivo |
|--------|---------|
| Rota admin | `routes/admin/adminDrones.js` |
| Rota ecommerce | `routes/ecommerce/checkout.js` |
| Controller CRUD | `controllers/adminOrdersController.js` |
| Controller publico | `controllers/favoritesController.js` |
| Service transacional | `services/checkoutService.js` |
| Service CRUD | `services/comunicacaoService.js` |
| Repository | `repositories/checkoutRepository.js` |
| Schema Zod | `schemas/checkoutSchemas.js` |

---

## Duvidas frequentes

**Sequelize esta instalado. Devo usar models ORM?**
Nao. So para migrations via CLI.

**`lib/response.js` ou `res.json()`?**
Sempre `lib/response.js`.

**`AppError` ou `res.status(4xx).json()`?**
Sempre `AppError`.

**`verifyAdmin` ou `authenticateToken`?**
`verifyAdmin` para admin (cookie `adminToken`). `authenticateToken` para usuario (cookie `auth_token`).

**Onde esta a documentacao completa?**
No [README.md](README.md) e nos documentos em [docs/](docs/).
