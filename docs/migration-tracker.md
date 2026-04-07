# Migration Tracker — kavita-backend

> **Última atualização:** 2026-04-07

---

## Como usar este documento

Este é o **registro único** do estado de migração arquitetural do projeto.
Cada módulo legado que existia com SQL inline na rota foi (ou será) migrado para o padrão moderno:
rota magra → controller → service → repository + Zod + `lib/response.js` + `AppError`.

---

## Estado atual

- **Diretórios `_legacy/`:** todos removidos. Não existem mais subpastas `_legacy/` em nenhuma pasta de rotas.
- **Módulos concluídos:** 27+ módulos migrados (ver histórico abaixo).
- **Módulos pendentes:** 13 arquivos ainda usam padrão legado (SQL inline, validação manual) mas já estão nos diretórios normais — não em `_legacy/`.

---

## Regra ao tocar módulo pendente

Ao modificar qualquer arquivo da tabela de pendentes (bug fix, feature nova):

1. **Migrar o arquivo completo** para o padrão moderno na mesma PR, **ou**
2. **Justificar na PR** o bloqueador concreto + abrir issue `[legacy] migrar {arquivo}`

**Proibições absolutas:**
- Nunca adicionar rotas novas em arquivos legados
- Nunca copiar padrões legados para código novo
- Nunca usar `res.json()` direto, `pool.query()` na rota ou `if (!campo)` em código novo

---

## Módulos pendentes — inventário atualizado

Estes arquivos estão em seus diretórios normais (não em `_legacy/`), mas ainda contêm SQL inline e/ou validação manual.

### Q3 2026 — Prioridade média

| # | Arquivo | Domínio | Linhas | Risco | Testes |
|---|---------|---------|--------|-------|--------|
| 1 | `routes/ecommerce/pedidos.js` | Ecommerce | 181 | BAIXO | Nenhum |
| 2 | `routes/admin/adminSolicitacoesServicos.js` | Serviços | 166 | MÉDIO | Nenhum |
| 3 | `routes/admin/adminUsers.js` | Sistema | 183 | ALTO | Nenhum |
| 4 | `routes/admin/adminAdmins.js` | Sistema | 258 | ALTO | Int. test |
| 5 | `routes/admin/adminStats.js` | Analytics | 313 | MÉDIO | Nenhum |
| 6 | `routes/admin/adminRelatorios.js` | Analytics | 282 | MÉDIO | Nenhum |
| 7 | `routes/auth/userProfile.js` | Auth | 288 | ALTO | Int. test |

### Q4 2026 — Prioridade baixa

| # | Arquivo | Domínio | Linhas | Risco | Testes |
|---|---------|---------|--------|-------|--------|
| 8 | `routes/admin/adminPermissions.js` | Sistema | 197 | ALTO | Nenhum |
| 9 | `routes/admin/adminLogs.js` | Sistema | 255 | BAIXO | Nenhum |
| 10 | `routes/admin/adminCupons.js` | Catálogo | 337 | MÉDIO | Nenhum |
| 11 | `routes/admin/adminMarketingPromocoes.js` | Catálogo | 394 | MÉDIO | Nenhum |
| 12 | `routes/public/publicShopConfig.js` | Public | 182 | BAIXO | Nenhum |
| 13 | `routes/public/publicProdutos.js` | Public | 354 | MÉDIO | Nenhum |

**Total pendente:** 13 arquivos, ~3.390 linhas.

---

## Checklist de migração por arquivo

Ao migrar qualquer arquivo pendente, verificar todos os itens:

- [ ] Repository criado com todas as queries extraídas
- [ ] Controller criado com handlers usando `response.ok/created/noContent/paginated`
- [ ] Service criado (se houver lógica de negócio além de CRUD simples)
- [ ] Schema Zod criado para toda rota com body (POST/PUT/PATCH)
- [ ] Rota magra substituiu o arquivo legado
- [ ] Erros usam `next(new AppError(msg, ERROR_CODES.XXX, status))` — nenhum `res.status().json()` inline
- [ ] Respostas usam `lib/response.js` — nenhum `res.json()` direto
- [ ] `module.exports = { fn1, fn2 }` no final do controller
- [ ] Este tracker atualizado (mover para histórico)
- [ ] CLAUDE.md atualizado se necessário

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
| `adminLogin.js` | auth | 2025 | Auth admin com tokenVersion |
| `adminNews.js` | admin | 2025 | Controller em subdiretório |
| `adminSiteHero.js` | admin | 2025 | Rota magra |
| `adminRoles.js` | admin | 2025 | Moderno, sem SQL inline |
| `adminCategorias.js` | admin | 2026 | Moderno |
| `adminColaboradores.js` | admin | 2026 | Moderno |
| `publicServicos.js` | public | 2026-03 | servicosRepository + servicosService + controller |
| `publicPromocoes.js` | public | 2026-03 | promocoesService + controller |
| `adminPedidos.js` | admin | 2026-04-01 | Controller + schemas + lib/response.js |
| `publicProducts.js` → controller | public | 2026-04-01 | Handlers extraídos para publicProductsController |
| `authRoutes.js` + `login.js` | auth | 2026-04-01 | Migrado de express-validator para Zod |
| `userAccount.js` → `userRegister.js` | auth | 2026-04-01 | Zod, controller, sem express-validator |
| `publicCategorias.js` | public | 2026-04-01 | categoriasRepository + categoriasPublicController |
| `publicProductById.js` | public | 2026-04-01 | Absorvido em publicProductsController.getProductById |
| `adminServicos.js` | admin | 2026-04-01 | servicosAdminRepository + service + controller + Zod |
| `adminShippingZones.js` | admin | 2026-04-02 | shippingZonesRepository + service + controller + Zod |
| `adminComunicacao.js` | admin | 2026-04-02 | comunicacaoRepository + service reescrito + controller + Zod |
| `favorites.js` | ecommerce | 2026-04-02 | repository + service + controller + Zod |
| `adminEspecialidades.js` | admin | 2026-04-02 | especialidadesRepository + controller |
| `adminConfigUpload.js` | admin | 2026-04-02 | shopConfigUploadService + controller |
