# Migration Tracker — kavita-backend

> **Ultima atualizacao:** 2026-04-02 (4)

---

## Como usar este documento

1. **Antes de tocar qualquer arquivo em `_legacy/`** — leia a ficha do arquivo abaixo.
2. A ficha diz o risco, a complexidade e exatamente o que criar ao migrar.
3. Se nao vai migrar na mesma PR, siga o protocolo da secao "Regra de toque".

---

## Regra de toque — protocolo obrigatorio

> **Ao tocar qualquer arquivo em `_legacy/`, na mesma PR:**
>
> 1. **Migrar o arquivo completo** para o padrao moderno
>    (rota magra -> controller -> service -> repository + Zod + `lib/response.js` + `AppError`), **ou**
>
> 2. **Justificar na PR description** por que a migracao nao foi feita:
>    - Qual o bloqueador concreto
>    - Abrir issue com titulo `[legacy] migrar {arquivo}` e linkar na PR
>    - A PR so passa review com a justificativa escrita
>
> **Excecoes aceitas:**
> - Hotfix de producao urgente (incidente ativo) — pode corrigir sem migrar,
>   mas deve abrir issue de migracao no mesmo dia.
>
> **Proibicoes absolutas:**
> - Nunca adicionar novas rotas em arquivos `_legacy/`
> - Nunca copiar padroes de `_legacy/` para codigo novo
> - Nunca usar `res.json()` direto, `pool.query()` na rota ou validacao `if (!campo)` em codigo novo

---

## Inventario completo — 13 arquivos legacy ativos

### Legenda

| Simbolo | Significado |
|---------|-------------|
| Risco **ALTO** | Dados sensiveis, RBAC, side-effects financeiros, ou logica de negocio critica inline |
| Risco **MEDIO** | Mutacoes (CRUD) com validacao manual, queries complexas |
| Risco **BAIXO** | Somente leitura, sem mutacoes, sem dados sensiveis |
| Complexidade **Alta** | Muitas queries, logica de negocio, transacoes, side-effects |
| Complexidade **Media** | CRUD padrao com validacao manual |
| Complexidade **Baixa** | 1-2 endpoints simples, read-only |

---

## Q3 2026 — Media prioridade (julho-setembro)

Arquivos que serao tocados com mais frequencia ou que tem risco de manutencao alto.

---

### 1. `routes/admin/_legacy/adminUsers.js`

| Campo | Valor |
|-------|-------|
| **Dominio** | Sistema — gestao de usuarios |
| **Linhas** | 183 |
| **Endpoints** | `GET /` (lista usuarios), `PUT /:id/block`, `DELETE /:id` |
| **Risco** | **ALTO** — GET expoe CPF em plaintext de todos os usuarios; DELETE remove conta permanentemente |
| **Complexidade de migracao** | Media |
| **Contrato atual** | Bare array no GET, `{ message }` em mutacoes — sem `ok:true/false` |
| **Validacao** | Inline manual (`if (!id)`) |
| **SQL inline** | Sim — 3 queries diretas |
| **Testes** | Nenhum |
| **Bloqueador** | Nenhum |
| **Falta criar** | `adminUsersRepository`, `adminUsersController`, schema Zod para `PUT /:id/block` |
| **Acao ao tocar** | Migrar completo. Ao migrar: nao retornar CPF no GET sem mascaramento. |

---

### 2. `routes/admin/_legacy/adminAdmins.js`

| Campo | Valor |
|-------|-------|
| **Dominio** | Sistema — gestao de administradores |
| **Linhas** | 258 |
| **Endpoints** | `GET /`, `POST /`, `PUT /:id`, `DELETE /:id` |
| **Risco** | **ALTO** — cria/remove contas admin com bcrypt, altera roles; protegido por `requirePermission("admins_manage")` |
| **Complexidade de migracao** | Media |
| **Contrato atual** | Bare object no POST (201), `{ message }` em PUT/DELETE; erro com `ok:false` parcial |
| **Validacao** | Inline manual (`if (!nome \|\| !email \|\| !senha \|\| !role)`) |
| **SQL inline** | Sim — 7 queries + bcrypt.hash |
| **Testes** | `test/integration/adminAdmins.int.test.js` existe |
| **Dependencias** | `bcrypt`, `logAdminAction` (services/adminLogs) |
| **Bloqueador** | Nenhum |
| **Falta criar** | `adminAdminsRepository`, `adminAdminsController`, `adminAdminsSchemas.js` (Zod) |
| **Acao ao tocar** | Migrar completo. Manter `logAdminAction` e `requirePermission`. |

---

### 3. `routes/admin/_legacy/adminSolicitacoesServicos.js`

| Campo | Valor |
|-------|-------|
| **Dominio** | Servicos — solicitacoes de servico |
| **Linhas** | 166 |
| **Endpoints** | `GET /solicitacoes`, `PATCH /solicitacoes/:id/status` |
| **Risco** | **MEDIO** — PATCH tem side-effect: incrementa `total_servicos` no colaborador ao marcar "concluido" |
| **Complexidade de migracao** | Baixa |
| **Contrato atual** | Bare array no GET, `{ message }` no PATCH — sem `ok:true/false` |
| **Validacao** | Inline (`if (!["novo","em_contato","concluido","cancelado"].includes(status))`) |
| **SQL inline** | Sim — 3 queries (SELECT JOIN, UPDATE, UPDATE JOIN) |
| **Testes** | Nenhum |
| **Bloqueador** | Nenhum (adminServicos ja migrado) |
| **Falta criar** | `solicitacoesRepository`, `solicitacoesController`, schema Zod para PATCH |
| **Acao ao tocar** | Migrar completo. Side-effect do PATCH (counter) deve ir para um service. |

---

### 4. `routes/admin/_legacy/adminStats.js`

| Campo | Valor |
|-------|-------|
| **Dominio** | Analytics — dashboard admin |
| **Linhas** | 313 |
| **Endpoints** | `GET /resumo` (6 queries!), `GET /vendas`, `GET /produtos-mais-vendidos`, `GET /alertas` |
| **Risco** | **MEDIO** — read-only, mas `/resumo` faz 6 queries sequenciais (N+1 potencial) |
| **Complexidade de migracao** | Alta — muitas queries analiticas, logica de preenchimento de dias vazios em `/vendas` |
| **Contrato atual** | Objetos customizados variados sem padrao (`{ totalProdutos, ... }`, `{ rangeDays, points }`, bare array) |
| **Validacao** | Inline (range/limit com Math.min/max) |
| **SQL inline** | Sim — 9 queries |
| **Testes** | Nenhum |
| **Bloqueador** | Nenhum |
| **Falta criar** | `statsRepository` (todas as queries analiticas), `statsController` |
| **Acao ao tocar** | Migrar completo. Considerar consolidar /resumo em 1-2 queries com subqueries. |

---

### 5. `routes/admin/_legacy/adminRelatorios.js`

| Campo | Valor |
|-------|-------|
| **Dominio** | Analytics — relatorios |
| **Linhas** | 282 |
| **Endpoints** | `GET /vendas`, `/produtos-mais-vendidos`, `/clientes-top`, `/estoque`, `/estoque-baixo`, `/servicos`, `/servicos-ranking` |
| **Risco** | **MEDIO** — read-only, mas `/clientes-top` expoe email de usuarios; protegido por `requirePermission("relatorios.ver")` |
| **Complexidade de migracao** | Alta — 7 endpoints read-only com queries analiticas complexas (JOINs, GROUP BY, SUM) |
| **Contrato atual** | Variado: `{ labels, values, rows }` para graficos, bare array para estoque — sem `ok:true` |
| **SQL inline** | Sim — 8 queries |
| **Testes** | Nenhum |
| **Bloqueador** | Nenhum |
| **Falta criar** | `relatoriosRepository`, `relatoriosController` |
| **Acao ao tocar** | Migrar completo. Manter shape `{ labels, values, rows }` se frontend depende. |

---

### 6. `routes/auth/_legacy/userProfile.js`

| Campo | Valor |
|-------|-------|
| **Dominio** | Auth — perfil de usuario |
| **Linhas** | 288 |
| **Endpoints** | `GET /me`, `PUT /me`, `GET /admin/:id`, `PUT /admin/:id` |
| **Risco** | **ALTO** — manipula CPF (validacao + unicidade), update dinamico com SET/VALUES, mistura contexto user + admin |
| **Complexidade de migracao** | Alta — validacao CPF, campos dinamicos, dois contextos de auth, resposta usa `mensagem` (nao `message`) |
| **Contrato atual** | Bare user object no GET, `{ mensagem }` em erros (divergente: usa `mensagem` em vez de `message`) |
| **Validacao** | Manual com `EDITABLE` Set, `FIELD_MAX_LENGTH`, `sanitizeText` |
| **SQL inline** | **Nao** — ja usa `userRepository` para queries |
| **Testes** | `test/integration/userProfileAdmin.int.test.js` + `userProfile.dataexposure.test.js` existem |
| **Bloqueador** | Nenhum |
| **Falta criar** | `userProfileController`, `userProfileSchemas.js` (Zod com CPF), separar rotas user vs admin |
| **Acao ao tocar** | Migrar completo. Separar: `/me` fica em auth, `/admin/:id` fica em adminRoutes. Normalizar `mensagem` para `message`. |

---

### 7. `routes/ecommerce/_legacy/pedidos.js`

| Campo | Valor |
|-------|-------|
| **Dominio** | Ecommerce — pedidos do usuario |
| **Linhas** | 181 |
| **Endpoints** | `GET /` (listar pedidos), `GET /:id` (detalhe com itens) |
| **Risco** | **BAIXO** — read-only, usuario so ve seus proprios pedidos (filtro por `usuario_id`) |
| **Complexidade de migracao** | Baixa — ja usa `AppError` + `ERROR_CODES` corretamente; falta apenas extrair SQL para repository |
| **Contrato atual** | Bare array/object — sem `ok:true` mas erros ja passam por `next(new AppError(...))` |
| **Validacao** | Inline minima (id sanitizado com regex) |
| **SQL inline** | Sim — 3 queries (pedidos + itens + JOIN products) |
| **Testes** | Nenhum especifico |
| **Bloqueador** | Nenhum |
| **Falta criar** | `pedidosUserRepository` (leitura user-side), `pedidosUserController` |
| **Acao ao tocar** | Migrar completo. Mais facil dos legacy — ja usa AppError. |

---

## Q4 2026 — Baixa prioridade (outubro-dezembro)

Arquivos menos tocados ou com risco controlado.

---

### 8. `routes/admin/_legacy/adminPermissions.js`

| Campo | Valor |
|-------|-------|
| **Dominio** | Sistema — RBAC / permissoes |
| **Linhas** | 197 |
| **Endpoints** | `GET /`, `POST /`, `PUT /:id`, `DELETE /:id` |
| **Risco** | **ALTO** — modificar permissoes afeta toda a logica RBAC do sistema |
| **Complexidade de migracao** | Media |
| **Contrato atual** | Bare array no GET, `{ message }` em mutacoes — sem `ok:false` em erros |
| **Validacao** | Inline (`if (!chave \|\| !grupo)`) |
| **SQL inline** | Sim — 5 queries |
| **Testes** | Nenhum |
| **Dependencias** | `logAdminAction`, `requirePermission("permissions_manage")` |
| **Bloqueador** | Nenhum |
| **Falta criar** | `permissionsRepository`, `permissionsController`, `permissionsSchemas.js` |
| **Acao ao tocar** | Migrar completo. Manter `logAdminAction` e `requirePermission`. |

---

### 9. `routes/admin/_legacy/adminLogs.js`

| Campo | Valor |
|-------|-------|
| **Dominio** | Sistema — auditoria |
| **Linhas** | 255 |
| **Endpoints** | `GET /` (filtros + paginacao), `GET /:id` |
| **Risco** | **BAIXO** — somente leitura, sem mutacoes |
| **Complexidade de migracao** | Media — query dinamica com WHERE condicional (6 filtros opcionais + LIMIT/OFFSET) |
| **Contrato atual** | Bare array no GET, `{ message }` em erro — sem `ok:false` |
| **SQL inline** | Sim — 2 queries (com WHERE dinamico) |
| **Testes** | Nenhum |
| **Dependencias** | `requirePermission("logs_view")` |
| **Bloqueador** | Nenhum |
| **Falta criar** | `logsRepository` (com query builder para filtros), `logsController` |
| **Acao ao tocar** | Migrar completo. Query builder para filtros vai no repository. |

---

### 10. `routes/admin/_legacy/adminCupons.js`

| Campo | Valor |
|-------|-------|
| **Dominio** | Catalogo — cupons de desconto |
| **Linhas** | 337 |
| **Endpoints** | `GET /`, `POST /`, `PUT /:id`, `DELETE /:id` |
| **Risco** | **MEDIO** — cupons afetam preco final no checkout; `couponService.js` existe e consome a tabela `cupons` |
| **Complexidade de migracao** | Media |
| **Contrato atual** | Bare array/object no GET/POST, `{ message }` em DELETE; erro usa `ok:false` + `ERROR_CODES` parcialmente |
| **Validacao** | Inline (`if (!codigo \|\| !tipo \|\| !valor)`, `if (!["percentual","valor"].includes(tipo))`) |
| **SQL inline** | Sim — 6 queries |
| **Testes** | Nenhum |
| **Dependencias** | `couponService.js` (servico separado que le a mesma tabela para validacao no checkout) |
| **Bloqueador** | Nenhum |
| **Falta criar** | `cuponsRepository`, `cuponsController`, `cuponsSchemas.js` (Zod). Avaliar: `cuponsService` separado ou reutilizar `couponService` |
| **Acao ao tocar** | Migrar completo. Validacao de tipo+valor e regra de ER_DUP_ENTRY devem ir para service/schema. |

---

### 11. `routes/admin/_legacy/adminMarketingPromocoes.js`

| Campo | Valor |
|-------|-------|
| **Dominio** | Catalogo — promocoes de produto |
| **Linhas** | 394 |
| **Endpoints** | `GET /`, `POST /`, `PUT /:id`, `DELETE /:id` |
| **Risco** | **MEDIO** — promocoes alteram preco final do produto; regra de 1 promocao por produto esta inline |
| **Complexidade de migracao** | Alta — GET tem SQL complexo (COALESCE, CASE, subquery de imagem, calculo de final_price e status) |
| **Contrato atual** | Bare array no GET, `{ message }` em mutacoes — sem `ok:true/false` em nenhum endpoint |
| **Validacao** | Inline minima (`if (!product_id)`) |
| **SQL inline** | Sim — 6 queries (GET tem 30+ linhas de SQL) |
| **Testes** | Nenhum |
| **Dependencias** | `promocoesService.js` existe para lado publico — avaliar reuso |
| **Bloqueador** | Nenhum |
| **Falta criar** | `promocoesAdminRepository`, `promocoesAdminController`, `promocoesAdminSchemas.js` |
| **Acao ao tocar** | Migrar completo. Maior arquivo legacy (394 linhas). Avaliar reuso de `promocoesService.js`. |

---

### 12. `routes/public/_legacy/publicShopConfig.js`

| Campo | Valor |
|-------|-------|
| **Dominio** | Public — configuracoes da loja |
| **Linhas** | 182 |
| **Endpoints** | `GET /` (retorna config publica para header/footer) |
| **Risco** | **BAIXO** — read-only, sem auth, sem dados sensiveis |
| **Complexidade de migracao** | Media — funcao `normalizePublicSettings()` com compat legado (objeto `footer` aninhado) |
| **Contrato atual** | Objeto customizado com campos flat + objeto `footer` aninhado para compat; `SELECT *` no banco |
| **SQL inline** | Sim — 1 query (`SELECT * FROM shop_settings`) |
| **Testes** | Nenhum |
| **Bloqueador** | Nenhum — `configRepository` ja existe e pode ser estendido |
| **Falta criar** | `shopConfigPublicController`, metodo `findPublicSettings` em `configRepository` |
| **Acao ao tocar** | Migrar completo. Mover `normalizePublicSettings` para controller ou helper. Substituir `SELECT *` por campos explicitos. Preservar shape do `footer` aninhado se frontend depende. |

---

### 13. `routes/public/_legacy/publicProdutos.js`

| Campo | Valor |
|-------|-------|
| **Dominio** | Public — avaliacoes de produtos |
| **Linhas** | 354 |
| **Endpoints** | `GET /` (busca rapida — possivel dead code), `POST /avaliacoes` (auth obrigatoria), `GET /:id/avaliacoes` |
| **Risco** | **MEDIO** — POST tem transacao (INSERT avaliacao + UPDATE rating_avg no produto) |
| **Complexidade de migracao** | Media — transacao ACID no POST, busca rapida no GET pode ser dead code |
| **Contrato atual** | Bare array/objeto, `{ message }` em erros — sem `ok:true/false` |
| **SQL inline** | Sim — 5 queries (incluindo transacao com getConnection) |
| **Testes** | Nenhum |
| **Bloqueador** | **Frontend** — confirmar se `GET /api/public/produtos?busca=` tem consumidor real antes de migrar |
| **Falta criar** | `productReviewsRepository`, `productReviewsController`, schema Zod para POST |
| **Acao ao tocar** | Confirmar com frontend primeiro. Se GET / nao tem consumidor, remover. Migrar POST + GET /:id/avaliacoes. |

---

## Quadro resumo — visao rapida

| # | Arquivo | Dominio | Linhas | Risco | Complexidade | Testes | Janela |
|---|---------|---------|--------|-------|-------------|--------|--------|
| 1 | `adminUsers.js` | Sistema | 183 | ALTO | Media | Nenhum | Q3 |
| 2 | `adminAdmins.js` | Sistema | 258 | ALTO | Media | Int. test | Q3 |
| 3 | `adminSolicitacoesServicos.js` | Servicos | 166 | MEDIO | Baixa | Nenhum | Q3 |
| 4 | `adminStats.js` | Analytics | 313 | MEDIO | Alta | Nenhum | Q3 |
| 5 | `adminRelatorios.js` | Analytics | 282 | MEDIO | Alta | Nenhum | Q3 |
| 6 | `userProfile.js` | Auth | 288 | ALTO | Alta | Int. test | Q3 |
| 7 | `pedidos.js` | Ecommerce | 181 | BAIXO | Baixa | Nenhum | Q3 |
| 8 | `adminPermissions.js` | Sistema | 197 | ALTO | Media | Nenhum | Q4 |
| 9 | `adminLogs.js` | Sistema | 255 | BAIXO | Media | Nenhum | Q4 |
| 10 | `adminCupons.js` | Catalogo | 337 | MEDIO | Media | Nenhum | Q4 |
| 11 | `adminMarketingPromocoes.js` | Catalogo | 394 | MEDIO | Alta | Nenhum | Q4 |
| 12 | `publicShopConfig.js` | Public | 182 | BAIXO | Media | Nenhum | Q4 |
| 13 | `publicProdutos.js` | Public | 354 | MEDIO | Media | Nenhum | Q4 |

---

## Resumo por janela

| Janela | Arquivos | Linhas totais | Estimativa |
|--------|----------|---------------|------------|
| Q2 2026 (alta) | 0 | 0 | Concluido |
| Q3 2026 (media) | 7 | 1.671 | 4-5 semanas |
| Q4 2026 (baixa) | 6 | 1.719 | 3-5 semanas |
| **Total** | **13** | **3.390** | — |

---

## Ordem recomendada de migracao dentro de cada janela

### Q3 — por facilidade crescente

1. **pedidos.js** (181 linhas, baixo risco) — ja usa AppError; migracao rapida para aquecer
2. **adminSolicitacoesServicos.js** (166 linhas, medio risco) — menor arquivo, bloqueador resolvido
3. **adminUsers.js** (183 linhas, alto risco) — curto mas risco de dados sensiveis
4. **adminAdmins.js** (258 linhas, alto risco) — CRUD com bcrypt, ja tem teste de integracao
5. **adminStats.js** (313 linhas, medio risco) — muitas queries analiticas
6. **adminRelatorios.js** (282 linhas, medio risco) — similar a stats
7. **userProfile.js** (288 linhas, alto risco) — mais complexo: dois contextos auth, CPF, campos dinamicos

### Q4 — por facilidade crescente

1. **publicShopConfig.js** (182 linhas, baixo risco) — 1 endpoint read-only
2. **adminLogs.js** (255 linhas, baixo risco) — read-only com filtros
3. **adminPermissions.js** (197 linhas, alto risco) — CRUD simples mas RBAC-critico
4. **adminCupons.js** (337 linhas, medio risco) — CRUD com validacao de tipo
5. **publicProdutos.js** (354 linhas, medio risco) — depende de confirmacao frontend
6. **adminMarketingPromocoes.js** (394 linhas, medio risco) — maior arquivo, SQL complexo

---

## Checklist de migracao por arquivo

Ao migrar qualquer arquivo `_legacy/`, verificar todos os itens:

- [ ] Repository criado com todas as queries extraidas
- [ ] Controller criado com handlers usando `response.ok/created/noContent/paginated`
- [ ] Service criado (se houver logica de negocio alem de CRUD simples)
- [ ] Schema Zod criado para toda rota com body (POST/PUT/PATCH)
- [ ] Rota magra criada em `routes/{contexto}/` (fora de `_legacy/`)
- [ ] Mount atualizado em `adminRoutes.js` / `publicRoutes.js` / `ecommerceRoutes.js` / `authIndex.js`
- [ ] Arquivo `_legacy/` deletado
- [ ] Erros usam `next(new AppError(msg, ERROR_CODES.XXX, status))` — nenhum `res.status().json()` inline
- [ ] Respostas usam `lib/response.js` — nenhum `res.json()` direto
- [ ] `module.exports = { fn1, fn2 }` no final do controller (nao `exports.fn`)
- [ ] Este tracker atualizado (mover para historico + atualizar contagem)
- [ ] CLAUDE.md atualizado (remover da tabela legacy)

---

## Arquivos mortos — ja deletados

| Arquivo | Situacao |
|---------|----------|
| `routes/public/_legacy/publicServicos.js` | Deletado (2026-04-01) — `publicServicos.js` moderno |
| `routes/public/_legacy/publicPromocoes.js` | Deletado (2026-04-01) — `publicPromocoes.js` moderno |
| `routes/public/_legacy/publicServicosAvaliacoes.js` | Deletado (2026-04-01) — absorvido por `publicServicos.js` |
| `routes/auth/_legacy/userAccount.js` | Migrado (2026-04) — `userRegister.js` moderno + Zod |

---

## Historico — modulos concluidos

| Modulo | Tipo | Concluido em | Observacoes |
|--------|------|-------------|-------------|
| `adminDrones.js` + `publicDrones.js` | admin + public | 2025 | Referencia canonica com upload |
| `adminProdutos.js` | admin | 2025 | Referencia com Zod + multipart |
| `checkout.js` | ecommerce | 2025 | Referencia com transacoes |
| `cart.js` -> `cartController.js` | ecommerce | 2025 | Handlers extraidos |
| `adminCarts.js` | admin | 2025 | Rota magra com controller |
| `adminConfig.js` | admin | 2025 | Rota magra |
| `login.js` (user) | auth | 2025 | Auth com cookie HttpOnly |
| `adminLogin.js` | admin | 2025 | Auth admin com tokenVersion |
| `adminNews.js` | admin | 2025 | Controller em subdiretorio |
| `adminSiteHero.js` | admin | 2025 | Rota magra |
| `adminRoles.js` | admin | 2025 | Moderno, sem SQL inline |
| `adminPedidos.js` | admin | 2026-04-01 | Controller + schemas + lib/response.js |
| `publicServicos.js` | public | 2026-03 | servicosRepository + servicosService + controller |
| `publicPromocoes.js` | public | 2026-03 | promocoesService + controller |
| `publicProducts.js` -> controller | public | 2026-04-01 | Handlers extraidos para publicProductsController |
| `authRoutes.js` + `login.js` | auth | 2026-04-01 | Migrado de express-validator para Zod |
| `userAccount.js` -> `userRegister.js` | auth | 2026-04-01 | Zod, controller, sem express-validator |
| `adminCategorias.js` | admin | 2026 | Moderno |
| `publicCategorias.js` | public | 2026-04-01 | `categoriasRepository` + `categoriasPublicController` |
| `publicProductById.js` | public | 2026-04-01 | absorvido em `publicProductsController.getProductById` |
| `adminColaboradores.js` | admin | 2026 | Moderno |
| `adminServicos.js` | admin | 2026-04-01 | `servicosAdminRepository` + service + controller + Zod |
| `adminShippingZones.js` | admin | 2026-04-02 | `shippingZonesRepository` + service + controller + Zod |
| `adminComunicacao.js` | admin | 2026-04-02 | `comunicacaoRepository` + service reescrito + controller + Zod |
| `favorites.js` | ecommerce | 2026-04-02 | repository + service + controller + Zod |
| `adminEspecialidades.js` | admin | 2026-04-02 | `especialidadesRepository` + controller; endpoint publico movido |
| `adminConfigUpload.js` | admin | 2026-04-02 | `shopConfigUploadService` + controller; UPLOAD_ROOT fix |
