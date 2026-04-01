# Migration Tracker — kavita-backend

> **Última atualização:** 2026-04-01
>
> **Como usar:**
> - Ao abrir uma PR que toca um arquivo `_legacy/`: migrar o arquivo completo, OU documentar
>   na PR description por que a migração completa não foi feita e abrir issue de acompanhamento.
> - Colunas `precisa X?`: ✅ = existe e correto · ❌ = precisa criar · ⚑ = existe mas incompleto
> - **Status:** `legado` → `parcial` → `moderno` → `migrado`
>   - `migrado` = todos os critérios satisfeitos (R1–R8 em `docs/migration-plan.md`)

---

## Regra de toque

> **Ao tocar qualquer arquivo em `_legacy/`, na mesma PR:**
> 1. Migrar o arquivo completo para o padrão moderno, **ou**
> 2. Documentar explicitamente na PR description por que a migração completa não foi feita
>    + abrir issue de acompanhamento com o arquivo e os bloqueadores.
>
> Correção de bug sem migração é aceita **apenas** para incidentes de produção urgentes.
> Nunca adicionar novas rotas em arquivos `_legacy/`.

---

## Arquivos _legacy/ ativos — roadmap

### 🔴 Alta prioridade — Q2 2026 (abril–junho)

| Arquivo | Linhas | Bloqueador | Falta criar | Responsável |
|---------|--------|-----------|-------------|-------------|
| `routes/public/_legacy/publicProductById.js` | 83 | nenhum | absorver em `publicProductsController.js` | backend |
| `routes/admin/_legacy/adminServicos.js` | 421 | nenhum¹ | `servicosAdminController`, `servicosAdminService`, `servicosRepository` (admin) | backend |
| `routes/admin/_legacy/adminShippingZones.js` | 322 | nenhum | `shippingZonesRepository`, `shippingZonesService`, `shippingZonesController` | backend |

¹ `servicosRepository.js` existe para o lado público — reutilizar ou estender para admin.

**Por que alta:** `publicProductById` é o único arquivo legado ainda incluso por uma rota moderna.
`adminServicos` e `adminShippingZones` afetam fluxos críticos (serviços e frete de checkout).

---

### 🟡 Média prioridade — Q3 2026 (julho–setembro)

#### Auth / usuário

| Arquivo | Linhas | Bloqueador | Falta criar | Responsável |
|---------|--------|-----------|-------------|-------------|
| `routes/auth/_legacy/userAccount.js` | 195 | `validators/authValidator.js`² | `registerSchema` em `schemas/authSchemas.js`, migrar para authController | backend |
| `routes/auth/_legacy/userProfile.js` | 288 | nenhum | `userProfileService`, controller de perfil | backend |

² `validators/authValidator.js` ainda exporta `registerValidators` para este arquivo.
Ao migrar `userAccount.js`: criar `registerSchema` e pode-se então deletar `authValidator.js` e a pasta `validators/`.

#### Ecommerce

| Arquivo | Linhas | Bloqueador | Falta criar | Responsável |
|---------|--------|-----------|-------------|-------------|
| `routes/ecommerce/_legacy/pedidos.js` | 181 | nenhum | `pedidosRepository` (user-side), `pedidosController` (usuário) | backend |
| `routes/ecommerce/_legacy/favorites.js` | 146 | nenhum | `favoritesRepository`, `favoritesController` | backend |

#### Admin — operações com usuários/admins

| Arquivo | Linhas | Bloqueador | Falta criar | Responsável |
|---------|--------|-----------|-------------|-------------|
| `routes/admin/_legacy/adminUsers.js` | 183 | nenhum | `adminUsersController`, `adminUsersService` | backend |
| `routes/admin/_legacy/adminAdmins.js` | 258 | nenhum | `adminAdminsController` | backend |
| `routes/admin/_legacy/adminComunicacao.js` | 462 | nenhum³ | `adminComunicacaoController` | backend |
| `routes/admin/_legacy/adminSolicitacoesServicos.js` | 166 | `adminServicos` (shared domain) | `solicitacoesController` | backend |

³ `comunicacaoService.js` existe com unit test. A rota ainda tem SQL inline e templates hardcoded.
Templates HTML/WhatsApp devem ser preservados exatamente.

#### Admin — analytics

| Arquivo | Linhas | Bloqueador | Falta criar | Responsável |
|---------|--------|-----------|-------------|-------------|
| `routes/admin/_legacy/adminStats.js` | 313 | nenhum | `statsRepository`, `statsController` | backend |
| `routes/admin/_legacy/adminRelatorios.js` | 282 | nenhum | `relatoriosRepository`, `relatoriosController` | backend |



---

### 🟢 Baixa prioridade — Q4 2026 (outubro–dezembro)

| Arquivo | Linhas | Bloqueador | Falta criar | Responsável |
|---------|--------|-----------|-------------|-------------|
| `routes/admin/_legacy/adminEspecialidades.js` | 82 | `adminServicos` (shared domain) | `especialidadesRepository`, `especialidadesController` | backend |
| `routes/admin/_legacy/adminConfigUpload.js` | 143 | nenhum | `configUploadController` | backend |
| `routes/admin/_legacy/adminPermissions.js` | 197 | nenhum | `permissionsController` | backend |
| `routes/admin/_legacy/adminLogs.js` | 255 | nenhum | `logsRepository`, `logsController` | backend |
| `routes/admin/_legacy/adminCupons.js` | 337 | nenhum | `cuponsRepository`, `cuponsService`, `cuponsController` | backend |
| `routes/admin/_legacy/adminMarketingPromocoes.js` | 394 | nenhum⁴ | `promocoesRepository` (admin-side), `promocoesAdminController` | backend |
| `routes/public/_legacy/publicShopConfig.js` | 182 | nenhum | `shopConfigController` | backend |
| `routes/public/_legacy/publicProdutos.js` | 354 | frontend⁵ | `productReviewsController` | backend + frontend |

⁴ `promocoesService.js` existe para o lado público. Avaliar reuso para admin.
⁵ Confirmar com frontend se `GET /api/public/produtos` e `produto_avaliacoes` têm uso real antes de iniciar.

---

## Arquivos mortos — ação imediata: deletar

| Arquivo | Situação |
|---------|----------|
| `routes/public/_legacy/publicServicos.js` | **Deletado** (2026-04-01) — modern `publicServicos.js` montado em index.js |
| `routes/public/_legacy/publicPromocoes.js` | **Deletado** (2026-04-01) — modern `publicPromocoes.js` montado em index.js |
| `routes/public/_legacy/publicServicosAvaliacoes.js` | **Deletado** (2026-04-01) — endpoints cobertos por `publicServicos.js` moderno |

---

## Resumo por janela

| Janela | Arquivos | Linhas totais | Estimativa |
|--------|----------|---------------|------------|
| Q2 2026 (alta) | 3 | 826 | 2–3 semanas |
| Q3 2026 (média) | 11 | 2.576 | 5–7 semanas |
| Q4 2026 (baixa) | 8 | 2.344 | 4–6 semanas |
| **Total** | **22** | **5.819** | — |

---

## Histórico — módulos concluídos

| Módulo | Tipo | Concluído em | Observações |
|--------|------|-------------|-------------|
| `adminDrones.js` + `publicDrones.js` | admin + public | 2025 | Referência canônica com upload |
| `adminProdutos.js` | admin | 2025 | Referência com Zod + multipart |
| `checkout.js` | ecommerce | 2025 | Referência com transações |
| `cart.js` → `cartController.js` | ecommerce | 2025 | Handlers extraídos |
| `adminCarts.js` | admin | 2025 | Rota magra com controller |
| `adminConfig.js` | admin | 2025 | Rota magra |
| `login.js` (user) | auth | 2025 | Auth com cookie HttpOnly |
| `adminLogin.js` | admin | 2025 | Auth admin com tokenVersion |
| `adminNews.js` | admin | 2025 | Controller em subdiretório |
| `adminSiteHero.js` | admin | 2025 | Rota magra |
| `adminRoles.js` | admin | 2025 | Moderno, sem SQL inline |
| `adminPedidos.js` | admin | 2026-04-01 | Controller + schemas + lib/response.js |
| `publicServicos.js` | public | 2026-03 | servicosRepository + servicosService + controller |
| `publicPromocoes.js` | public | 2026-03 | promocoesService + controller |
| `publicProducts.js` → controller | public | 2026-04-01 | Handlers extraídos para publicProductsController |
| `authRoutes.js` + `login.js` | auth | 2026-04-01 | Migrado de express-validator para Zod |
| `adminCategorias.js` | admin | 2026 | Moderno |
| `publicCategorias.js` | public | 2026-04-01 | `findActiveCategories` em `categoriasRepository` + `categoriasPublicController` |
| `adminColaboradores.js` | admin | 2026 | Moderno |

