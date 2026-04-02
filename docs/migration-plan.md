# Plano de Migração Arquitetural — kavita-backend

> **Propósito:** Tornar visível e operacional a transição de módulos legados para o padrão
> moderno (rota magra → controller → service → repository + Zod + AppError + lib/response.js).
>
> **Público:** qualquer dev que tocar este repositório.
> **Atualização:** toda vez que um módulo muda de status, atualizar a seção [Tracker](#tracker).

---

## Índice

1. [Definição de "migrado"](#1-definição-de-migrado)
2. [Regra operacional: nada sem testes](#2-regra-operacional-nada-sem-testes)
3. [Módulos legados — inventário real](#3-módulos-legados--inventário-real)
4. [Classificação por prioridade](#4-classificação-por-prioridade)
5. [Ordem recomendada de execução](#5-ordem-recomendada-de-execução)
6. [Riscos e dependências por módulo](#6-riscos-e-dependências-por-módulo)
7. [Tracker](#7-tracker)

---

## 1. Definição de "migrado"

Um módulo é considerado **migrado** quando todos os itens abaixo são verificáveis no código:

| # | Critério | Como verificar |
|---|----------|----------------|
| R1 | **Rota magra** — arquivo de rota sem `pool.query()`, sem `if (!campo)`, sem `res.json()` | `grep -n "pool.query\|res.json\|if (!" routes/...` retorna zero |
| R2 | **Controller separado** — `controllers/{domínio}/` com funções async `(req, res, next)` | Arquivo existe, exporta handlers nomeados |
| R3 | **Service separado** — `services/{domínio}/` com toda lógica de negócio, sem req/res | Arquivo existe, não importa `express` |
| R4 | **Repository separado** — `repositories/{domínio}Repository.js` com todo SQL | Arquivo existe, funções recebem `conn` como parâmetro quando usam transação |
| R5 | **Validação centralizada** — schema Zod em `schemas/` aplicado via `middleware/validate.js` | Schema existe, rota usa `validate(Schema)` antes do controller |
| R6 | **AppError em todos os erros** — zero `res.status(4xx).json(...)` inline | `grep -n "res.status" routes/... controllers/...` retorna zero |
| R7 | **Contrato de resposta** — `lib/response.js` em todos os caminhos de sucesso | `grep -n "res.json" controllers/...` retorna zero |
| R8 | **Testes mínimos** — arquivo `test/integration/{módulo}.int.test.js` com cobertura dos contratos de rota | Arquivo existe, `npm run test:int` passa |

> **R1–R7 são não-negociáveis.** R8 é pré-requisito para abrir PR de migração, não pós.

---

## 2. Regra operacional: nada sem testes

**Regra:** Nenhuma migração é considerada entregue sem testes de integração passando.

**Por quê:** A migração não muda comportamento — ela move código entre camadas. O único
sinal confiável de que o comportamento foi preservado são testes que exercitam as rotas reais.
Não há exceção para módulos "simples".

**Como aplicar na prática:**

```
1. Escrever teste de integração ANTES de mover o código (TDD de migração)
   → Testar contra o código legado: todos devem passar
2. Migrar o código
   → Todos os testes ainda devem passar (sem alterar os testes)
3. Só então abrir PR
```

**Template de teste:** usar `test/integration/adminDrones.int.test.js` como referência.
Padrões obrigatórios:
- `jest.resetModules()` + `jest.doMock()` antes de cada `require` da rota
- Pool mockado via `makeMockConn()` de `test/testUtils`
- AAA (Arrange → Act → Assert) em todos os casos
- Sem snapshots
- Cobrir: sucesso 200/201, erro 400 de validação, erro 404/409 de negócio, erro 500 inesperado

---

## 3. Módulos legados — inventário real

> Módulos já modernos (`adminProdutos`, `adminConfig`, `adminCarts`, `authRoutes`) foram
> excluídos desta lista. Módulos híbridos estão marcados com ⚑.

| Arquivo | Linhas | Rota montada em | Principal problema |
|---------|--------|-----------------|-------------------|
| `routes/admin/adminRoles.js` | 488 | `/api/admin/roles` | SQL inline, transações, validação manual |
| `routes/admin/adminServicos.js` | 421 | `/api/admin/servicos` | SQL inline + upload de imagem + transações |
| `routes/admin/adminComunicacao.js` | 462 | `/api/admin/comunicacao` | SQL inline + envio de email + templates hardcoded |
| `routes/admin/adminMarketingPromocoes.js` | 394 | `/api/admin/marketing/promocoes` | SQL inline, cálculo de preço inline |
| `routes/admin/adminPedidos.js` ⚑ | 320 | `/api/admin/pedidos` | Já usa `orderService`, mas validação inline e `res.json()` direto |
| `routes/admin/adminCupons.js` | 337 | `/api/admin/cupons` | SQL inline, normalização manual de tipos |
| `routes/admin/adminShippingZones.js` | 322 | `/api/admin/shipping/zones` | SQL inline + transações (já usa AppError) |
| `routes/admin/adminStats.js` | 313 | `/api/admin/stats` | SQL de agregação inline, sem repository |
| `routes/public/publicServicos.js` | 667 | `/api/public/servicos` | SQL inline + sistema de rating + contadores de analytics |
| `routes/public/publicProdutos.js` | 354 | `/api/public/produtos` | SQL inline + sistema de avaliação + possível endpoint morto |
| `routes/auth/userAddresses.js` ⚑ | 575 | `/api/users/addresses` | Já usa `addressRepository`, mas normalização inline e `res.json()` direto |
| `routes/auth/userProfile.js` ⚑ | 288 | `/api/users/me` e `/api/users/admin/:id` | Já usa `userRepository`, mas validação inline e `res.json()` direto |

**Total:** 12 módulos — 4.945 linhas a migrar.

---

## 4. Classificação por prioridade

### Alta

Módulos com pelo menos um de: acesso público com carga real, operação transacional de escrita,
gestão de permissões, ou risco de corrupção de dados se migrado errado.

#### `publicServicos.js` — prioridade alta
- **Por quê:** Endpoint público com maior volume de leitura. Sistema de rating com transação
  (INSERT avaliação + UPDATE média) que, se falhar sem rollback, corrompe os dados de pontuação.
  Contadores de analytics (views, cliques WhatsApp) sem transação — aceitável — mas precisam
  estar em service para testabilidade.
- **Complexidade:** Alta. 667 linhas. 8 rotas. Helper functions inline (`normalizeImages`,
  `attachImages`, `buildWhereClause`, `mapRowToService`) que precisam migrar para service/utils.

#### `adminServicos.js` — prioridade alta
- **Por quê:** Compartilha domínio com `publicServicos.js` (tabelas `colaboradores`,
  `especialidades`, `colaborador_images`). Migrar admin primeiro estabelece o repository
  compartilhado que a migração pública vai reutilizar. Upload de imagem com validação de
  magic bytes e limpeza transacional — se esse fluxo for quebrado, arquivos órfãos ficam
  no disco.
- **Complexidade:** Alta. 421 linhas. Transações, multipart upload, remoção de imagens.

#### `adminRoles.js` — prioridade alta
- **Por quê:** RBAC — gere permissões de acesso de toda a área admin. Um bug silencioso na
  migração pode conceder ou revogar permissões incorretamente. Usa transações para atribuição
  de permissões. Depende de `adminLogs` para auditoria — esse acoplamento precisa ser mantido.
- **Complexidade:** Alta. 488 linhas. JOIN com GROUP_CONCAT, transações, lista de permissões.

---

### Média

Módulos importantes mas com menor risco de corrupção de dados ou que já têm parte da
arquitetura em lugar.

#### `adminPedidos.js` ⚑ — prioridade média
- **Por quê:** Já delega ao `orderService`. O trabalho restante é pequeno: mover validação de
  `ALLOWED_PAYMENT_STATUSES` para o service, substituir `res.json()` por `lib/response.js`,
  e adicionar Zod schema. Esforço de 1 sprint para completar o que está no meio.
- **Complexidade:** Baixa (trabalho incremental sobre código já parcialmente migrado).

#### `adminShippingZones.js` — prioridade média
- **Por quê:** Afeta cálculo de frete no checkout. Já usa AppError e tem bom gerenciamento
  de transações. O trabalho é extrair SQL para repository e validação para Zod.
- **Complexidade:** Média. 322 linhas. Transações corretas, lógica de cidade-por-zona.

#### `adminComunicacao.js` — prioridade média
- **Por quê:** Envolve envio de email transacional. Templates hardcoded precisam ser
  externalizados para um service testável. Baixo volume de uso (admin manual), então
  risco de regressão em produção é menor.
- **Complexidade:** Média. 462 linhas. Templates HTML inline, lógica de WhatsApp, log de
  comunicações no banco.

#### `userAddresses.js` ⚑ — prioridade média
- **Por quê:** Já usa `addressRepository`. Normalização complexa de endereços URBANA/RURAL com
  aliases de campos — esse código deve migrar para um `addressService` para ser testável
  unitariamente. Afeta checkout (endereço de entrega).
- **Complexidade:** Média. 575 linhas, mas a lógica de repository já está extraída.

#### `adminStats.js` — prioridade média
- **Por quê:** Read-only — zero risco de corrupção. Mas queries de agregação espalhadas na
  rota não são testáveis nem reutilizáveis. Migrar para `statsRepository` permite cache e
  reuso futuro.
- **Complexidade:** Baixa a média. SQL complexo mas sem transações nem side effects.

---

### Baixa

Módulos CRUD simples sem transações críticas ou já com camada de repository presente.

#### `userProfile.js` ⚑ — prioridade baixa
- **Por quê:** Já usa `userRepository`. Trabalho restante: Zod schema para campos editáveis,
  mover lógica de CPF para service, substituir `res.json()` por `lib/response.js`.
- **Complexidade:** Baixa. 288 linhas. Lógica de campo dinâmico simples.

#### `adminMarketingPromocoes.js` — prioridade baixa
- **Por quê:** CRUD simples. A lógica de negócio mais relevante (cálculo de `final_price`,
  regra de uma-promo-por-produto) é direta e testável. Nenhuma transação multitabela.
- **Complexidade:** Baixa. 394 linhas, mas a lógica de negócio real é ~50 linhas.

#### `adminCupons.js` — prioridade baixa
- **Por quê:** CRUD simples de tabela única. Normalização de tipos pode ir para Zod sem esforço.
  Detecção de código duplicado via `ER_DUP_ENTRY` deve migrar para verificação prévia no
  repository (padrão do projeto).
- **Complexidade:** Baixa. 337 linhas. Tabela única, sem transações.

#### `publicProdutos.js` — prioridade baixa
- **Por quê:** O endpoint `GET /api/public/produtos?busca=` pode ser código morto (o frontend
  usa `GET /api/products` via `publicProducts.js`). Confirmar antes de gastar esforço.
  Sistema de avaliação segue o mesmo padrão de `publicServicos.js`.
- **Complexidade:** Baixa a média. Bloquear migração até confirmar se `GET ?busca=` tem uso real.

---

## 5. Ordem recomendada de execução

A ordem considera: (a) dependências de domínio, (b) repositórios compartilhados, (c) retorno
sobre esforço.

```
Fase A — Completar híbridos (trabalho incremental, retorno rápido)
  1. adminPedidos       — já tem service, completar em 1-2 dias
  2. userProfile        — já tem repository, completar em 1 dia
  3. userAddresses      — já tem repository, completar em 2-3 dias (normalização complexa)

Fase B — Domínio Serviços (repository compartilhado entre admin e público)
  4. adminServicos      — criar servicosRepository + servicosAdminService
  5. publicServicos     — reutilizar servicosRepository, criar servicosPublicService

Fase C — Segurança e infraestrutura
  6. adminRoles         — criar rolesRepository + rolesService

Fase D — Infraestrutura de e-commerce
  7. adminShippingZones — criar shippingZonesRepository + shippingZonesService
  8. adminComunicacao   — criar comunicacaoService com templates externalizados

Fase E — CRUD simples e analytics
  9. adminStats         — criar statsRepository
  10. adminMarketingPromocoes — criar promocoesRepository + promocoesService
  11. adminCupons       — criar cuponsRepository + cuponsService
  12. publicProdutos    — confirmar status do endpoint morto antes de começar
```

**Regra de sequência dentro de cada fase:** sempre escrever o teste de integração antes de
mover o código. O teste escrito sobre o código legado é o "baseline" — se passar no legado
e passar no moderno, a migração está correta.

---

## 6. Riscos e dependências por módulo

### `publicServicos.js`

| Item | Detalhe |
|------|---------|
| **Risco principal** | Sistema de rating transacional: INSERT avaliação + UPDATE média calculada. Se a fórmula de média incremental (`((avg * count) + nota) / (count + 1)`) for reimplementada errada no service, dados de pontuação ficam incorretos silenciosamente. |
| **Risco secundário** | `normalizeImages()` lida com dados em 3 formatos (string JSON, array, string simples) — legado do banco. Qualquer perda de caso na migração quebra exibição de imagens. |
| **Dependência** | Compartilha tabelas com `adminServicos.js`. Migrar `adminServicos` primeiro para ter `servicosRepository` estabilizado. |
| **Pré-requisito** | `servicosRepository.js` deve existir antes de começar esta migração. |

### `adminServicos.js`

| Item | Detalhe |
|------|---------|
| **Risco principal** | Upload de imagem com validação de magic bytes: a lógica de `keepImages` (quais imagens do update preservar) usa `JSON.parse` de campo do body. Se o service não replicar essa lógica exatamente, imagens são deletadas indevidamente. |
| **Risco secundário** | `enqueueOrphanCleanup` deve ser chamado em qualquer caminho de rollback. Se o service falhar antes do commit e não enfileirar limpeza, arquivos físicos ficam órfãos. |
| **Dependência** | Precede `publicServicos.js`. |
| **Pré-requisito** | `mediaService.persistMedia` e `mediaService.enqueueOrphanCleanup` — já existem, não alterar. |

### `adminRoles.js`

| Item | Detalhe |
|------|---------|
| **Risco principal** | A atribuição de permissões é transacional: DELETE das permissões antigas + INSERT das novas. Se o service implementar como dois calls separados sem transação, há janela de inconsistência onde o role fica sem permissões. |
| **Risco secundário** | `requirePermission("roles_manage")` está no mount em `routes/index.js`. Não remover esse middleware durante a migração. |
| **Dependência** | `adminLogs` service deve continuar sendo chamado para auditoria. Não omitir ao migrar. |
| **Pré-requisito** | Nenhum módulo externo precisa ser migrado antes. |

### `adminPedidos.js`

| Item | Detalhe |
|------|---------|
| **Risco principal** | `orderService.updatePaymentStatus` e `orderService.updateDeliveryStatus` disparam comunicação (email/WhatsApp) internamente. Não duplicar essa lógica no controller/rota durante a migração. |
| **Dependência** | `orderService` já existe e está estável. Não reescrever — apenas remover a validação inline da rota. |
| **Pré-requisito** | Nenhum. |

### `adminShippingZones.js`

| Item | Detalhe |
|------|---------|
| **Risco principal** | A lógica de cidades (INSERT IGNORE na tabela `shipping_zone_cities` + DELETE no update) deve ser transacional. Se o repository não receber a conexão como parâmetro, o rollback não cobre a tabela de cidades. |
| **Dependência** | Usado indiretamente pelo checkout (`shippingQuoteService`). Mudança de schema de resposta pode quebrar cálculo de frete. Não alterar estrutura do objeto retornado. |
| **Pré-requisito** | Nenhum. |

### `adminComunicacao.js`

| Item | Detalhe |
|------|---------|
| **Risco principal** | Templates HTML e de WhatsApp estão hardcoded na rota (4 templates: confirmacao_pedido, pagamento_aprovado, pedido_enviado, pedido_cancelado). Ao mover para service, devem ser preservados exatamente — qualquer alteração no HTML quebra formatação em clientes de email. |
| **Risco secundário** | `logComunicacao` grava no banco independentemente do envio ter sucesso. Esse comportamento deve ser mantido no service. |
| **Dependência** | `mailService.sendTransactionalEmail` — não alterar interface. |
| **Pré-requisito** | Nenhum. |

### `userAddresses.js`

| Item | Detalhe |
|------|---------|
| **Risco principal** | Normalização de campos aceita múltiplos aliases (`endereco | rua | logradouro`, `complemento | ponto_referencia | referencia`). O Zod schema deve aceitar todos os aliases ou o frontend quebra sem aviso. |
| **Risco secundário** | Endereços do tipo RURAL gravam "RURAL" e "S/N" como valores literais para compatibilidade com código legado. Não substituir esses valores por `null`. |
| **Dependência** | `addressRepository` já existe. Usar como está, sem reescrever. |
| **Pré-requisito** | Nenhum. |

### `userProfile.js`

| Item | Detalhe |
|------|---------|
| **Risco principal** | CPF pode ser enviado como string vazia (`""`) para limpar o campo (grava NULL). Zod schema deve aceitar `string | ""` e diferenciar de `undefined`. Se implementar `.required()` no schema, remove a funcionalidade de limpar o CPF. |
| **Dependência** | `userRepository` já existe. Usar como está. |
| **Pré-requisito** | Nenhum. |

### `adminStats.js`

| Item | Detalhe |
|------|---------|
| **Risco principal** | Baixo — read-only. Risco é de regressão em queries (cálculo de ticket médio, preenchimento de dias sem venda no array de séries temporais). Testes devem cobrir o formato exato do array de vendas (`{ dia, total }`). |
| **Dependência** | Nenhuma dependência de outros módulos legados. |
| **Pré-requisito** | Nenhum. |

### `adminMarketingPromocoes.js`

| Item | Detalhe |
|------|---------|
| **Risco principal** | Cálculo de `final_price` (promo_price se definido, senão aplica discount_percent sobre o preço do produto) deve ser replicado exatamente no service. |
| **Dependência** | Lê tabela `products` para verificar existência e obter preço base. `productAdminRepository` pode ser reutilizado para essa leitura. |
| **Pré-requisito** | Nenhum (pode reutilizar `productAdminRepository` para reads de produto). |

### `adminCupons.js`

| Item | Detalhe |
|------|---------|
| **Risco principal** | Baixo. O tratamento de `ER_DUP_ENTRY` deve migrar para verificação prévia (`SELECT` antes do `INSERT`) — padrão do projeto — com AppError 409 CONFLICT. |
| **Dependência** | Nenhuma. |
| **Pré-requisito** | Nenhum. |

### `publicProdutos.js`

| Item | Detalhe |
|------|---------|
| **Risco principal** | `GET /api/public/produtos?busca=` pode ser código morto. Se for removido antes de confirmar com o frontend, há risco de quebra silenciosa. **Confirmar antes de iniciar a migração.** |
| **Dependência** | Sistema de avaliação de produtos usa `produto_avaliacoes`. Verificar se `productPublicRepository` já tem queries para essa tabela antes de criar um novo. |
| **Pré-requisito** | Confirmar status do endpoint `GET ?busca=`. |

---

## 7. Tracker

> Atualizar esta seção conforme o trabalho avança. Status: `todo` | `in_progress` | `done`.
> Cada linha representa um módulo completo (todos os critérios R1–R8 atendidos).

### Fase A — Completar híbridos

| Módulo | Arquivo | Status | PR | Obs |
|--------|---------|--------|-----|-----|
| Pedidos (admin) | `routes/admin/adminPedidos.js` | `todo` | — | Já tem `orderService`; completar validação + response |
| Perfil de usuário | `routes/auth/userProfile.js` | `todo` | — | Já tem `userRepository`; completar Zod + response |
| Endereços de usuário | `routes/auth/userAddresses.js` | `todo` | — | Já tem `addressRepository`; normalização → service |

### Fase B — Domínio Serviços

| Módulo | Arquivo | Status | PR | Obs |
|--------|---------|--------|-----|-----|
| Serviços (admin) | `routes/admin/adminServicos.js` | `todo` | — | Criar `servicosRepository` + `servicosAdminService` |
| Serviços (público) | `routes/public/publicServicos.js` | `todo` | — | Reutilizar `servicosRepository`; criar `servicosPublicService` |

### Fase C — Segurança

| Módulo | Arquivo | Status | PR | Obs |
|--------|---------|--------|-----|-----|
| Roles e permissões | `routes/admin/adminRoles.js` | `todo` | — | Criar `rolesRepository` + `rolesService`; manter `adminLogs` |

### Fase D — E-commerce

| Módulo | Arquivo | Status | PR | Obs |
|--------|---------|--------|-----|-----|
| Zonas de frete | `routes/admin/adminShippingZones.js` | `todo` | — | Criar `shippingZonesRepository` + `shippingZonesService` |
| Comunicação admin | `routes/admin/adminComunicacao.js` | `todo` | — | Criar `comunicacaoService`; externalizar templates |

### Fase E — CRUD e analytics

| Módulo | Arquivo | Status | PR | Obs |
|--------|---------|--------|-----|-----|
| Estatísticas admin | `routes/admin/adminStats.js` | `todo` | — | Criar `statsRepository`; read-only, risco baixo |
| Promoções | `routes/admin/adminMarketingPromocoes.js` | `todo` | — | Criar `promocoesRepository` + `promocoesService` |
| Cupons | `routes/admin/adminCupons.js` | `todo` | — | Criar `cuponsRepository` + `cuponsService` |
| Produtos (público, avaliações) | `routes/public/publicProdutos.js` | `todo` | — | **Bloqueado:** confirmar se `GET ?busca=` tem uso real |

---

### Módulos modernos (referência)

Estes módulos já seguem o padrão completo e servem como exemplo:

| Módulo | Rota | Controller | Service | Repository |
|--------|------|-----------|---------|------------|
| Auth admin | `routes/admin/adminLogin.js` | `controllers/admin/authAdminController.js` | `services/authAdminService.js` | — |
| Drones (admin) | `routes/admin/adminDrones.js` | `controllers/drones/` | `services/drones/` | `repositories/dronesRepository.js` |
| Drones (público) | `routes/public/publicDrones.js` | `controllers/dronesPublicController.js` | `services/dronesService.js` | `repositories/dronesRepository.js` |
| Produtos (admin) | `routes/admin/adminProdutos.js` | `controllers/produtosController.js` | `services/produtosAdminService.js` | `repositories/productAdminRepository.js` |
| News (admin) | `routes/admin/adminNews.js` | `controllers/news/` | — | `repositories/postsRepository.js` |
| Checkout | `routes/ecommerce/checkout.js` | `controllers/checkoutController.js` | `services/checkoutService.js` | `repositories/checkoutRepository.js` |
| Auth usuário | `routes/auth/login.js` | `controllers/authController.js` | — | `repositories/userRepository.js` |

---

*Última atualização: 2026-03-27*
