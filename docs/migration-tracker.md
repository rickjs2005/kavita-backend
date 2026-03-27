# Migration Tracker — kavita-backend

> **Como usar:** atualizar `status atual` e colunas `precisa X?` à medida que o trabalho avança.
> Colunas `precisa X?`: ✅ = já OK (existe e correto) · ❌ = precisa criar/completar · ⚑ = existe mas incompleto.
>
> **Status:** `legado` → `parcial` → `moderno` → `migrado`
> Um módulo é `migrado` somente quando todos os 8 critérios (R1–R8) de `docs/migration-plan.md` estão satisfeitos.
>
> _Última atualização: 2026-03-27_

---

## Módulos legados em migração

### ⚠ Prioridade Alta — críticos

| Módulo | Tipo | Status | Prioridade | Risco | Testes int. | Repository | Service | Controller | Validação Zod | Response padrão | Observações |
|--------|------|--------|------------|-------|-------------|-----------|---------|-----------|---------------|-----------------|-------------|
| `adminRoles.js` | admin | **legado** | alta | alto | ❌ | ❌ `rolesRepository` | ❌ `rolesService` | ❌ | ❌ | ❌ | RBAC — bug silencioso = permissão errada. Transação: DELETE perms antigas + INSERT novas deve ser atômica. `adminLogs` deve continuar sendo chamado. Não tem nenhuma camada extraída ainda. |
| `adminServicos.js` | admin | **legado** | alta | alto | ❌ | ❌ `servicosRepository` | ❌ `servicosAdminService` | ❌ | ❌ | ❌ | Migrar antes de `publicServicos` para estabelecer o repository compartilhado. Upload com magic bytes + `keepImages` JSON + cleanup transacional de arquivos. `enqueueOrphanCleanup` obrigatório em rollback. |
| `publicServicos.js` | public | **legado** | alta | médio | ❌ | ❌ `servicosRepository` | ❌ `servicosPublicService` | ❌ | ❌ | ❌ | **Bloqueado** até `adminServicos` criar `servicosRepository`. Rating transacional (INSERT avaliação + UPDATE média incremental) — fórmula deve ser replicada exatamente. `normalizeImages()` lida com 3 formatos legados. 8 rotas. |

---

### ⚑ Prioridade Média — importantes

| Módulo | Tipo | Status | Prioridade | Risco | Testes int. | Repository | Service | Controller | Validação Zod | Response padrão | Observações |
|--------|------|--------|------------|-------|-------------|-----------|---------|-----------|---------------|-----------------|-------------|
| `adminPedidos.js` | admin | **parcial** | média | médio | ❌ | ✅ `orderRepository` | ✅ `orderService` | ❌ | ❌ | ❌ | Trabalho menor: mover validação de `ALLOWED_PAYMENT_STATUSES` para o service, Zod schema, substituir `res.json()`. Não duplicar a lógica de disparo de comunicação que vive no `orderService`. |
| `userAddresses.js` | auth | **parcial** | média | médio | ✅ | ✅ `addressRepository` | ❌ `addressService` | ❌ | ❌ | ❌ | Normalização URBANA/RURAL com múltiplos aliases de campos deve migrar para service. Zod schema deve aceitar todos os aliases (`endereco\|rua\|logradouro`). Não alterar valores literais "RURAL" e "S/N" no banco. |
| `adminShippingZones.js` | admin | **legado** | média | médio | ✅ | ❌ `shippingZonesRepository` | ❌ `shippingZonesService` | ❌ | ❌ | ❌ | Já usa AppError (mais avançado que outros legados). Repository deve receber `conn` como parâmetro para cobrir a transação zonas + cidades. Não alterar estrutura do objeto de resposta — usado pelo checkout. |
| `adminComunicacao.js` | admin | **parcial** | média | médio | ⚑ unit | ❌ | ⚑ `comunicacaoService` existe | ❌ | ❌ | ❌ | `comunicacaoService.js` existe e tem unit test, mas a rota ainda tem SQL inline e templates hardcoded. Templates HTML de email e texto WhatsApp devem ser preservados exatamente. `logComunicacao` grava no banco independente do envio. |
| `adminStats.js` | admin | **legado** | média | baixo | ❌ | ❌ `statsRepository` | ❌ | ❌ | N/A | ❌ | Read-only — risco zero de corrupção. Complexidade está no SQL de agregação (ticket médio, séries temporais com preenchimento de dias sem venda). Sem Zod (só query params — usar schema de query params do Zod). |

---

### ▽ Prioridade Baixa — CRUD simples

| Módulo | Tipo | Status | Prioridade | Risco | Testes int. | Repository | Service | Controller | Validação Zod | Response padrão | Observações |
|--------|------|--------|------------|-------|-------------|-----------|---------|-----------|---------------|-----------------|-------------|
| `userProfile.js` | auth | **parcial** | baixa | baixo | ⚑ admin | ✅ `userRepository` | ❌ | ❌ | ❌ | ❌ | `userProfileAdmin.int.test.js` cobre só endpoints admin. CPF pode ser `""` para limpar (deve gravar NULL) — Zod schema precisa aceitar `string \| ""`. Lógica de CPF → `userService`. |
| `adminMarketingPromocoes.js` | admin | **legado** | baixa | baixo | ❌ | ❌ `promocoesRepository` | ❌ `promocoesService` | ❌ | ❌ | ❌ | Cálculo de `final_price` (promo_price ou discount_percent) deve ir para service. Regra de uma-promo-por-produto: mover para verificação prévia no repository (AppError 409). Pode reutilizar `produtosRepository` para leitura de preço base. |
| `adminCupons.js` | admin | **legado** | baixa | baixo | ❌ | ❌ `cuponsRepository` | ❌ `cuponsService` | ❌ | ❌ | ❌ | CRUD de tabela única. `ER_DUP_ENTRY` → trocar por SELECT prévio + AppError 409 CONFLICT. Normalização de tipos (percentual/valor) → Zod enum. |
| `publicProdutos.js` | public | **legado** | baixa | baixo | ❌ | ⚑ `productRepository` (parcial) | ❌ | ❌ | ❌ | ❌ | **Bloqueado:** confirmar com frontend se `GET /api/public/produtos?busca=` tem uso real antes de iniciar. `productRepository` cobre listagem mas não `produto_avaliacoes`. Sistema de avaliação segue mesmo padrão de `publicServicos`. |

---

## Módulos modernos — referência

> Estes módulos satisfazem todos os critérios R1–R8. Usar como exemplo ao migrar.

| Módulo | Tipo | Status | Testes int. | Repository | Service | Controller | Validação Zod | Response padrão | Referência para |
|--------|------|--------|-------------|-----------|---------|-----------|---------------|-----------------|-----------------|
| `adminDrones.js` + `publicDrones.js` | admin + public | **migrado** | ✅ | ✅ `dronesRepository` | ✅ `services/drones/` | ✅ `controllers/drones/` | ✅ `dronesSchemas.js` | ✅ | padrão completo com upload |
| `adminProdutos.js` | admin | **migrado** | — | ✅ `produtosRepository` | ✅ `produtosAdminService` | ✅ `produtosController` | ✅ `requests.js` | ✅ | padrão completo com Zod + multipart |
| `checkout.js` | ecommerce | **migrado** | ✅ | ✅ `checkoutRepository` | ✅ `checkoutService` | ✅ `checkoutController` | ✅ `checkoutSchemas.js` | ✅ | padrão completo com transações |
| `cart.js` | ecommerce | **migrado** | ✅ | ✅ `cartRepository` | ✅ `cartService` | — | — | ✅ | padrão service + repository |
| `adminCarts.js` | admin | **moderno** | ✅ | — | — | ✅ `cartsController` | — | ✅ | rota magra com controller |
| `adminConfig.js` | admin | **moderno** | — | ✅ `configRepository` | ✅ `configAdminService` | ✅ `configController` | — | ✅ | rota magra |
| `login.js` (user auth) | auth | **migrado** | — | ✅ `userRepository` | — | ✅ `authController` | ✅ | ✅ | auth com cookie HttpOnly |
| `adminLogin.js` | admin | **migrado** | — | — | ✅ `authAdminService` | ✅ `authAdminController` | — | ✅ | auth admin com tokenVersion |
| `adminNews.js` | admin | **moderno** | — | ✅ `postsRepository` | — | ✅ `controllers/news/` | — | ✅ | controller em subdiretório |
| `adminSiteHero.js` | admin | **moderno** | — | ✅ `heroRepository` | — | ✅ `siteHeroController` | — | ✅ | — |

---

## Resumo numérico

| Status | Qtd | % |
|--------|-----|---|
| migrado | 5 | 24% |
| moderno | 5 | 24% |
| parcial | 3 | 14% |
| legado | 8 | 38% |
| **Total** | **21** | — |

> **Meta:** zerar a coluna `legado`. Módulos `parcial` são os de menor esforço — começar por eles.
