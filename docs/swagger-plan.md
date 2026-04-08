# Plano de Documentacao Swagger — kavita-backend

> **Tipo:** Plano de execucao e inventario. Este nao e a documentacao final da API — e o backlog de cobertura Swagger.
>
> **Proposito:** Elevar a cobertura Swagger para 100%. Cada exemplo neste arquivo e pronto para copiar e colar na rota correspondente.
>
> _Ultima auditoria: 2026-03-27. Modulos criados apos esta data (corretoras, hero-slides, especialidades) nao estao inventariados aqui._

---

## Indice

1. [Inventario de endpoints sem documentacao](#1-inventário-de-endpoints-sem-documentação)
2. [Classificacao por prioridade](#2-classificação-por-prioridade)
3. [Padrao obrigatorio](#3-padrão-obrigatório)
4. [Ordem de execucao](#4-ordem-de-execução)
5. [Exemplos prontos — modulo a modulo](#5-exemplos-prontos--módulo-a-módulo)

---

## 1. Inventario de endpoints sem documentacao

> Fonte: auditoria em 27/03/2026 de todos os arquivos em `routes/**/*.js`.
> Swagger configurado em `docs/swagger.js` — varre `./routes/**/*.js`.
> Total geral: ~180 endpoints. Documentados: ~120. **Sem doc: ~60.**
>
> **Nota:** modulos adicionados apos 2026-03-27 (corretoras, hero-slides, especialidades) precisam de auditoria separada.

### Admin

| Arquivo | Prefixo | Endpoint | Método | Status |
|---------|---------|----------|--------|--------|
| `adminDrones.js` | `/api/admin/drones` | `/page` | GET | ❌ |
| `adminDrones.js` | `/api/admin/drones` | `/page` | PUT | ❌ |
| `adminDrones.js` | `/api/admin/drones` | `/page` | POST | ❌ |
| `adminDrones.js` | `/api/admin/drones` | `/page` | DELETE | ❌ |
| `adminDrones.js` | `/api/admin/drones` | `/page-settings` | GET | ❌ |
| `adminDrones.js` | `/api/admin/drones` | `/page-settings` | PUT | ❌ |
| `adminDrones.js` | `/api/admin/drones` | `/page-settings` | POST | ❌ |
| `adminDrones.js` | `/api/admin/drones` | `/config` | GET | ❌ |
| `adminDrones.js` | `/api/admin/drones` | `/config` | PUT | ❌ |
| `adminDrones.js` | `/api/admin/drones` | `/models` | GET | ❌ |
| `adminDrones.js` | `/api/admin/drones` | `/models` | POST | ❌ |
| `adminDrones.js` | `/api/admin/drones` | `/models/{modelKey}` | GET | ❌ |
| `adminDrones.js` | `/api/admin/drones` | `/models/{modelKey}` | PUT | ❌ |
| `adminDrones.js` | `/api/admin/drones` | `/models/{modelKey}` | DELETE | ❌ |
| `adminDrones.js` | `/api/admin/drones` | `/models/{modelKey}/gallery` | GET | ❌ |
| `adminDrones.js` | `/api/admin/drones` | `/models/{modelKey}/gallery` | POST | ❌ |
| `adminDrones.js` | `/api/admin/drones` | `/models/{modelKey}/gallery/{id}` | DELETE | ❌ |
| `adminDrones.js` | `/api/admin/drones` | `/models/{modelKey}/media-selection` | PUT | ❌ |
| `adminDrones.js` | `/api/admin/drones` | `/galeria` | GET | ❌ |
| `adminDrones.js` | `/api/admin/drones` | `/galeria` | POST | ❌ |
| `adminDrones.js` | `/api/admin/drones` | `/galeria/{id}` | DELETE | ❌ |
| `adminDrones.js` | `/api/admin/drones` | `/representantes` | GET | ❌ |
| `adminDrones.js` | `/api/admin/drones` | `/representantes` | POST | ❌ |
| `adminDrones.js` | `/api/admin/drones` | `/representantes/{id}` | PUT | ❌ |
| `adminDrones.js` | `/api/admin/drones` | `/representantes/{id}` | DELETE | ❌ |
| `adminDrones.js` | `/api/admin/drones` | `/comentarios` | GET | ❌ |
| `adminDrones.js` | `/api/admin/drones` | `/comentarios/{id}/aprovar` | PUT | ❌ |
| `adminDrones.js` | `/api/admin/drones` | `/comentarios/{id}/reprovar` | PUT | ❌ |
| `adminDrones.js` | `/api/admin/drones` | `/comentarios/{id}` | DELETE | ❌ |
| `adminNews.js` | `/api/admin/news` | `/clima` | GET | ❌ |
| `adminNews.js` | `/api/admin/news` | `/clima/stations` | GET | ❌ |
| `adminNews.js` | `/api/admin/news` | `/clima` | POST | ❌ |
| `adminNews.js` | `/api/admin/news` | `/clima/{id}` | PUT | ❌ |
| `adminNews.js` | `/api/admin/news` | `/clima/{id}` | DELETE | ❌ |
| `adminNews.js` | `/api/admin/news` | `/clima/{id}/sync` | POST | ❌ |
| `adminNews.js` | `/api/admin/news` | `/cotacoes` | GET | ❌ |
| `adminNews.js` | `/api/admin/news` | `/cotacoes/meta` | GET | ❌ |
| `adminNews.js` | `/api/admin/news` | `/cotacoes` | POST | ❌ |
| `adminNews.js` | `/api/admin/news` | `/cotacoes/{id}` | PUT | ❌ |
| `adminNews.js` | `/api/admin/news` | `/cotacoes/{id}` | DELETE | ❌ |
| `adminNews.js` | `/api/admin/news` | `/cotacoes/{id}/sync` | POST | ❌ |
| `adminNews.js` | `/api/admin/news` | `/cotacoes/sync-all` | POST | ❌ |
| `adminNews.js` | `/api/admin/news` | `/posts` | GET | ❌ |
| `adminNews.js` | `/api/admin/news` | `/posts` | POST | ❌ |
| `adminNews.js` | `/api/admin/news` | `/posts/{id}` | PUT | ❌ |
| `adminNews.js` | `/api/admin/news` | `/posts/{id}` | DELETE | ❌ |
| `adminProdutos.js` | `/api/admin/produtos` | `/` | GET | ❌ |
| `adminProdutos.js` | `/api/admin/produtos` | `/{id}` | GET | ❌ |
| `adminProdutos.js` | `/api/admin/produtos` | `/` | POST | ❌ |
| `adminProdutos.js` | `/api/admin/produtos` | `/{id}` | PUT | ❌ |
| `adminProdutos.js` | `/api/admin/produtos` | `/{id}` | DELETE | ❌ |
| `adminConfig.js` | `/api/admin/config` | `/` | GET | ❌ |
| `adminConfig.js` | `/api/admin/config` | `/` | PUT | ❌ |
| `adminConfig.js` | `/api/admin/config` | `/categories` | GET | ❌ |
| `adminConfig.js` | `/api/admin/config` | `/categories` | POST | ❌ |
| `adminConfig.js` | `/api/admin/config` | `/categories/{id}` | PUT | ❌ |
| `adminCarts.js` | `/api/admin/carrinhos` | `/scan` | POST | ❌ |
| `adminCarts.js` | `/api/admin/carrinhos` | `/` | GET | ❌ |
| `adminCarts.js` | `/api/admin/carrinhos` | `/{id}/notificar` | POST | ❌ |
| `adminCarts.js` | `/api/admin/carrinhos` | `/{id}/whatsapp-link` | GET | ❌ |
| `adminSiteHero.js` | `/api/admin/site-hero` | `/` | GET | ❌ |
| `adminSiteHero.js` | `/api/admin/site-hero` | `/` | PUT | ❌ |
| `adminServicos.js` | `/api/admin/servicos` | `/{id}` | PUT | ❌ |
| `adminShippingZones.js` | `/api/admin/shipping` | todos | — | ⚑ minimal |

### Auth

| Arquivo | Prefixo | Endpoint | Método | Status |
|---------|---------|----------|--------|--------|
| `userProfile.js` | `/api/users` | `/me` | GET | ❌ |
| `userProfile.js` | `/api/users` | `/me` | PUT | ❌ |
| `userProfile.js` | `/api/users` | `/admin/{id}` | GET | ❌ |
| `userProfile.js` | `/api/users` | `/admin/{id}` | PUT | ❌ |

### Public

| Arquivo | Prefixo | Endpoint | Método | Status |
|---------|---------|----------|--------|--------|
| `publicProducts.js` | `/api/products` | `/` | GET | ❌ |
| `publicDrones.js` | `/api/public/drones` | `/page` | GET | ❌ |
| `publicDrones.js` | `/api/public/drones` | `/galeria` | GET | ❌ |
| `publicDrones.js` | `/api/public/drones` | `/representantes` | GET | ❌ |
| `publicDrones.js` | `/api/public/drones` | `/comentarios` | GET | ❌ |
| `publicDrones.js` | `/api/public/drones` | `/comentarios` | POST | ❌ |
| `publicServicos.js` | `/api/public/servicos` | `/trabalhe-conosco` | POST | ❌ |

---

## 2. Classificação por prioridade

### Alta

| Arquivo | Endpoints sem doc | Motivo |
|---------|------------------|--------|
| `adminDrones.js` | 29/31 | Módulo de referência do projeto — estar sem doc é uma contradição; 29 endpoints de um módulo core totalmente invisíveis na UI do Swagger |
| `adminProdutos.js` | 5/5 | Produto é a entidade central do e-commerce; já tem `components/schemas/Product` definido no arquivo — endpoint blocks são o único passo que falta |
| `adminCarts.js` | 4/4 | Mesmo caso: schemas `AbandonedCart` e `AbandonedCartItem` já definidos — só faltam os blocos de endpoint |

### Média

| Arquivo | Endpoints sem doc | Motivo |
|---------|------------------|--------|
| `adminNews.js` | 17/17 | Módulo moderno com Zod schemas — documentar é mecânico mas o volume é alto |
| `userProfile.js` | 4/4 | Schemas `UserProfile` e `UserProfileUpdate` já definidos no arquivo |
| `adminSiteHero.js` | 2/2 | Apenas 2 endpoints; risco zero de errar |
| `publicProducts.js` | 1/2 | Só falta o GET `/` com seus query params |

### Baixa

| Arquivo | Endpoints sem doc | Motivo |
|---------|------------------|--------|
| `adminConfig.js` | 5/5 | Config interna do site — menos exposta ao frontend público |
| `adminShippingZones.js` | 0 (mínimo) | Documentado mas sem schemas de requestBody; completar é baixo risco |
| `publicDrones.js` | 5/8 | Legacy endpoints do módulo drones — já coberto parcialmente |
| `publicServicos.js` | 1/8 | Apenas `POST /trabalhe-conosco` faltando |
| `adminServicos.js` | 1/5 | Apenas `PUT /{id}` faltando |

---

## 3. Padrão obrigatório

Todo bloco `@openapi` deve seguir exatamente esta estrutura:

```js
/**
 * @openapi
 * /api/{prefixo}/{caminho}:
 *   {método}:
 *     tags: [{NomeDoGrupo}]
 *     summary: "Descrição curta (uma linha)"
 *     security:                          ← omitir em rotas públicas sem auth
 *       - BearerAuth: []
 *     parameters:                        ← omitir se não há params de rota/query
 *       - name: {param}
 *         in: path | query
 *         required: true | false
 *         schema: { type: string | integer }
 *         description: "Descrição do param"
 *     requestBody:                       ← omitir em GET/DELETE sem body
 *       required: true
 *       content:
 *         application/json:              ← ou multipart/form-data para upload
 *           schema:
 *             type: object
 *             required: [{campos}]
 *             properties:
 *               {campo}: { type: string, example: "valor" }
 *     responses:
 *       {código}:
 *         description: "Descrição"
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok: { type: boolean, example: true }
 *                 data:
 *                   $ref: '#/components/schemas/{NomeDoSchema}'  ← preferir ref
 *       400:
 *         description: "Dados inválidos"
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: "Não autenticado"
 *       500:
 *         description: "Erro interno"
 */
```

**Regras fixas:**
1. O caminho no bloco deve ser o **caminho completo** incluindo o prefixo da rota montada (`/api/admin/drones/...`, não apenas `/models/...`)
2. Segurança: `BearerAuth` (definido em `docs/swagger.js`) para rotas com `verifyAdmin` ou `authenticateToken`
3. Respostas de erro sempre incluem `400`, `401`, `500` para mutations; `404` quando há `params.id`
4. Shape de sucesso: `{ ok: true, data?, message?, meta? }` — nunca documentar shape diferente
5. Schemas reutilizáveis vão em `components/schemas` no início do arquivo da rota (`@openapi components`)

---

## 4. Ordem de execução

```
Sprint 1 — Quick wins (schemas já existem, só faltam endpoint blocks)
  1. adminProdutos.js     ← 5 endpoints, schema Product já definido
  2. adminCarts.js        ← 4 endpoints, schemas AbandonedCart já definidos
  3. userProfile.js       ← 4 endpoints, schemas UserProfile já definidos

Sprint 2 — Módulo de referência (o mais crítico)
  4. adminDrones.js       ← 29 endpoints; documentar em 4 grupos:
                             a. PAGE + CONFIG (9 endpoints)
                             b. MODELS (5 endpoints)
                             c. GALLERY + MEDIA-SELECTION (6 endpoints)
                             d. REPRESENTANTES + COMENTÁRIOS (8 endpoints)
                             e. GALERIA LEGADO (4 endpoints) — último, depriority

Sprint 3 — Módulos menores
  5. adminSiteHero.js     ← 2 endpoints
  6. publicProducts.js    ← 1 endpoint
  7. publicDrones.js      ← 5 endpoints legacy
  8. publicServicos.js    ← 1 endpoint (trabalhe-conosco)
  9. adminServicos.js     ← 1 endpoint (PUT /{id})

Sprint 4 — Volume
  10. adminNews.js        ← 17 endpoints (mecânico mas demorado)
  11. adminConfig.js      ← 5 endpoints
  12. adminShippingZones  ← completar schemas de requestBody
```

---

## 5. Exemplos prontos — módulo a módulo

---

### 5.1 `adminProdutos.js` — blocos prontos para colar

> Colar logo após o bloco `@openapi components/schemas/Product` existente no arquivo.

```js
/**
 * @openapi
 * /api/admin/produtos:
 *   get:
 *     tags: [Admin Produtos]
 *     summary: "Lista todos os produtos"
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: "Lista de produtos"
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok: { type: boolean, example: true }
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Product'
 *       401:
 *         description: "Não autenticado"
 *       500:
 *         description: "Erro interno"
 */
router.get("/", verifyAdmin, ctrl.list);

/**
 * @openapi
 * /api/admin/produtos/{id}:
 *   get:
 *     tags: [Admin Produtos]
 *     summary: "Retorna produto por ID"
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: integer }
 *         description: "ID do produto"
 *     responses:
 *       200:
 *         description: "Produto encontrado"
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok: { type: boolean, example: true }
 *                 data:
 *                   $ref: '#/components/schemas/Product'
 *       401:
 *         description: "Não autenticado"
 *       404:
 *         description: "Produto não encontrado"
 *       500:
 *         description: "Erro interno"
 */
router.get("/:id", verifyAdmin, ctrl.getById);

/**
 * @openapi
 * /api/admin/produtos:
 *   post:
 *     tags: [Admin Produtos]
 *     summary: "Cria produto com imagens (multipart)"
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [name, price, quantity]
 *             properties:
 *               name:
 *                 type: string
 *                 example: "Ração Premium 10kg"
 *               description:
 *                 type: string
 *                 nullable: true
 *               price:
 *                 type: number
 *                 example: 199.9
 *               quantity:
 *                 type: integer
 *                 example: 10
 *               category_id:
 *                 type: integer
 *                 example: 3
 *               shipping_free:
 *                 type: integer
 *                 enum: [0, 1]
 *                 example: 0
 *               shipping_free_from_qty:
 *                 type: integer
 *                 nullable: true
 *               images:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *                 description: "Até 10 imagens (jpg/png/webp)"
 *     responses:
 *       201:
 *         description: "Produto criado"
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok: { type: boolean, example: true }
 *                 data:
 *                   $ref: '#/components/schemas/Product'
 *       400:
 *         description: "Dados inválidos"
 *       401:
 *         description: "Não autenticado"
 *       500:
 *         description: "Erro interno"
 */
router.post("/", verifyAdmin, upload.array("images"), validate(CriarProdutoSchema), ctrl.create);

/**
 * @openapi
 * /api/admin/produtos/{id}:
 *   put:
 *     tags: [Admin Produtos]
 *     summary: "Atualiza produto e imagens (multipart)"
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               name: { type: string }
 *               description: { type: string, nullable: true }
 *               price: { type: number }
 *               quantity: { type: integer }
 *               category_id: { type: integer }
 *               shipping_free: { type: integer, enum: [0, 1] }
 *               shipping_free_from_qty: { type: integer, nullable: true }
 *               keepImages:
 *                 type: string
 *                 description: "JSON array de paths de imagens a manter: [\"/uploads/products/img.webp\"]"
 *               images:
 *                 type: array
 *                 items: { type: string, format: binary }
 *     responses:
 *       200:
 *         description: "Produto atualizado"
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok: { type: boolean, example: true }
 *                 data:
 *                   $ref: '#/components/schemas/Product'
 *       400:
 *         description: "Dados inválidos"
 *       401:
 *         description: "Não autenticado"
 *       404:
 *         description: "Produto não encontrado"
 *       500:
 *         description: "Erro interno"
 */
router.put("/:id", verifyAdmin, upload.array("images"), validate(AtualizarProdutoSchema), ctrl.update);

/**
 * @openapi
 * /api/admin/produtos/{id}:
 *   delete:
 *     tags: [Admin Produtos]
 *     summary: "Remove produto e suas imagens"
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: "Produto removido"
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok: { type: boolean, example: true }
 *                 message: { type: string, example: "Produto removido." }
 *       401:
 *         description: "Não autenticado"
 *       404:
 *         description: "Produto não encontrado"
 *       500:
 *         description: "Erro interno"
 */
router.delete("/:id", verifyAdmin, ctrl.remove);
```

---

### 5.2 `adminCarts.js` — blocos prontos para colar

> Colar logo após o bloco `@openapi components/schemas/AbandonedCart` existente no arquivo.

```js
/**
 * @openapi
 * /api/admin/carrinhos/scan:
 *   post:
 *     tags: [AdminCarrinhos]
 *     summary: "Varre e registra carrinhos abandonados"
 *     description: "Identifica carrinhos sem atividade há mais de X minutos e os marca como abandonados."
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: "Varredura concluída"
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     scanned: { type: integer, example: 42 }
 *                     marked: { type: integer, example: 7 }
 *       401:
 *         description: "Não autenticado"
 *       500:
 *         description: "Erro interno"
 */
router.post("/scan", verifyAdmin, ctrl.scanAbandoned);

/**
 * @openapi
 * /api/admin/carrinhos:
 *   get:
 *     tags: [AdminCarrinhos]
 *     summary: "Lista carrinhos abandonados"
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - name: page
 *         in: query
 *         schema: { type: integer, default: 1 }
 *       - name: limit
 *         in: query
 *         schema: { type: integer, default: 20, maximum: 100 }
 *     responses:
 *       200:
 *         description: "Lista paginada de carrinhos abandonados"
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok: { type: boolean, example: true }
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/AbandonedCart'
 *                 meta:
 *                   type: object
 *                   properties:
 *                     total: { type: integer }
 *                     page: { type: integer }
 *                     limit: { type: integer }
 *                     pages: { type: integer }
 *       401:
 *         description: "Não autenticado"
 *       500:
 *         description: "Erro interno"
 */
router.get("/", verifyAdmin, ctrl.listAbandoned);

/**
 * @openapi
 * /api/admin/carrinhos/{id}/notificar:
 *   post:
 *     tags: [AdminCarrinhos]
 *     summary: "Envia notificação de recuperação ao dono do carrinho"
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: integer }
 *         description: "ID do carrinho abandonado"
 *     responses:
 *       200:
 *         description: "Notificação enviada"
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok: { type: boolean, example: true }
 *                 message: { type: string, example: "Notificação enviada." }
 *       401:
 *         description: "Não autenticado"
 *       404:
 *         description: "Carrinho não encontrado"
 *       500:
 *         description: "Erro interno"
 */
router.post("/:id/notificar", verifyAdmin, ctrl.notify);

/**
 * @openapi
 * /api/admin/carrinhos/{id}/whatsapp-link:
 *   get:
 *     tags: [AdminCarrinhos]
 *     summary: "Gera link WhatsApp de recuperação para o carrinho"
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: "Link WhatsApp gerado"
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     url: { type: string, example: "https://wa.me/5511999999999?text=..." }
 *       401:
 *         description: "Não autenticado"
 *       404:
 *         description: "Carrinho não encontrado"
 *       500:
 *         description: "Erro interno"
 */
router.get("/:id/whatsapp-link", verifyAdmin, ctrl.getWhatsappLink);
```

---

### 5.3 `adminDrones.js` — blocos prontos para colar (grupos)

> O arquivo já tem tag e securityScheme definidos no topo. Colar cada grupo antes da
> respectiva rota. Os paths precisam do prefixo `/api/admin/drones/` completo.

#### Grupo PAGE + CONFIG

```js
/**
 * @openapi
 * /api/admin/drones/page:
 *   get:
 *     tags: [Admin Drones]
 *     summary: "Retorna configuração completa da página Drones"
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: "Configuração da página"
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     hero_title: { type: string, example: "Kavita Drones" }
 *                     hero_subtitle: { type: string, nullable: true }
 *                     hero_video_path: { type: string, nullable: true }
 *                     hero_image_fallback_path: { type: string, nullable: true }
 *                     cta_title: { type: string, nullable: true }
 *                     cta_message_template: { type: string, nullable: true }
 *                     cta_button_label: { type: string, nullable: true }
 *                     specs_title: { type: string, nullable: true }
 *                     specs_items_json: { type: array, nullable: true }
 *                     features_title: { type: string, nullable: true }
 *                     features_items_json: { type: array, nullable: true }
 *                     benefits_title: { type: string, nullable: true }
 *                     benefits_items_json: { type: array, nullable: true }
 *                     sections_order_json: { type: array, items: { type: string }, nullable: true }
 *                     models_json: { type: array, nullable: true }
 *       401:
 *         description: "Não autenticado"
 *       500:
 *         description: "Erro interno"
 *   put:
 *     tags: [Admin Drones]
 *     summary: "Salva configuração da página (multipart — heroVideo e heroImageFallback opcionais)"
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [hero_title]
 *             properties:
 *               hero_title: { type: string, maxLength: 120 }
 *               hero_subtitle: { type: string, maxLength: 255, nullable: true }
 *               hero_video_path: { type: string, nullable: true, description: "Manter path existente (sem novo upload)" }
 *               hero_image_fallback_path: { type: string, nullable: true }
 *               cta_title: { type: string, maxLength: 120, nullable: true }
 *               cta_message_template: { type: string, maxLength: 500, nullable: true }
 *               cta_button_label: { type: string, maxLength: 60, nullable: true }
 *               specs_title: { type: string, nullable: true }
 *               specs_items_json: { type: string, description: "JSON array serializado" }
 *               features_items_json: { type: string, description: "JSON array serializado" }
 *               benefits_items_json: { type: string, description: "JSON array serializado" }
 *               sections_order_json: { type: string, description: "JSON array de strings: [\"hero\",\"specs\",...] " }
 *               models_json: { type: string, description: "JSON array serializado" }
 *               heroVideo: { type: string, format: binary, description: "mp4, máx 30MB" }
 *               heroImageFallback: { type: string, format: binary, description: "jpg/png/webp, máx 5MB" }
 *     responses:
 *       200:
 *         description: "Configuração salva"
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok: { type: boolean, example: true }
 *                 message: { type: string, example: "Configuração salva." }
 *       400:
 *         description: "hero_title obrigatório ou arquivo inválido"
 *       401:
 *         description: "Não autenticado"
 *       500:
 *         description: "Erro interno"
 *   delete:
 *     tags: [Admin Drones]
 *     summary: "Reseta página para valores padrão"
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: "Página resetada"
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok: { type: boolean, example: true }
 *                 message: { type: string, example: "Página resetada para padrão." }
 *       401:
 *         description: "Não autenticado"
 *       500:
 *         description: "Erro interno"
 */

/**
 * @openapi
 * /api/admin/drones/config:
 *   get:
 *     tags: [Admin Drones]
 *     summary: "Retorna apenas os campos da landing (subconjunto do /page)"
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: "Config landing"
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     hero_title: { type: string }
 *                     hero_subtitle: { type: string, nullable: true }
 *                     hero_video_path: { type: string, nullable: true }
 *                     hero_image_fallback_path: { type: string, nullable: true }
 *                     cta_title: { type: string, nullable: true }
 *                     cta_message_template: { type: string, nullable: true }
 *                     cta_button_label: { type: string, nullable: true }
 *                     sections_order_json: { type: array, items: { type: string }, nullable: true }
 *       401:
 *         description: "Não autenticado"
 *       500:
 *         description: "Erro interno"
 *   put:
 *     tags: [Admin Drones]
 *     summary: "Salva config landing (multipart — mesmos campos do /page, sem specs/features/benefits)"
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [hero_title]
 *             properties:
 *               hero_title: { type: string, maxLength: 120 }
 *               hero_subtitle: { type: string, nullable: true }
 *               cta_title: { type: string, nullable: true }
 *               cta_message_template: { type: string, nullable: true }
 *               cta_button_label: { type: string, nullable: true }
 *               sections_order_json: { type: string, description: "JSON array serializado" }
 *               heroVideo: { type: string, format: binary, description: "mp4, máx 30MB" }
 *               heroImageFallback: { type: string, format: binary, description: "jpg/png/webp, máx 5MB" }
 *     responses:
 *       200:
 *         description: "Config salva"
 *       400:
 *         description: "hero_title obrigatório"
 *       401:
 *         description: "Não autenticado"
 *       500:
 *         description: "Erro interno"
 */
```

#### Grupo MODELS

```js
/**
 * @openapi
 * /api/admin/drones/models:
 *   get:
 *     tags: [Admin Drones]
 *     summary: "Lista modelos de drone"
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - name: includeInactive
 *         in: query
 *         schema: { type: integer, enum: [0, 1], default: 0 }
 *         description: "1 para incluir modelos inativos"
 *     responses:
 *       200:
 *         description: "Lista de modelos (se vazia, retorna DEFAULT_DRONE_MODELS)"
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     items:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           key: { type: string, example: "agras_t40" }
 *                           label: { type: string, example: "Agras T40" }
 *                           sort_order: { type: integer }
 *                           is_active: { type: integer, enum: [0, 1] }
 *       401:
 *         description: "Não autenticado"
 *       500:
 *         description: "Erro interno"
 *   post:
 *     tags: [Admin Drones]
 *     summary: "Cria modelo de drone"
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [key, label]
 *             properties:
 *               key:
 *                 type: string
 *                 pattern: "^[a-z0-9_]{2,20}$"
 *                 example: "agras_t40"
 *                 description: "Identificador único — a-z, 0-9, _ (2-20 chars)"
 *               label:
 *                 type: string
 *                 maxLength: 120
 *                 example: "Agras T40"
 *               sort_order:
 *                 type: integer
 *                 default: 0
 *               is_active:
 *                 type: integer
 *                 enum: [0, 1]
 *                 default: 1
 *     responses:
 *       201:
 *         description: "Modelo criado"
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     key: { type: string, example: "agras_t40" }
 *                 message: { type: string, example: "Modelo criado." }
 *       400:
 *         description: "Dados inválidos (key fora do padrão, label ausente)"
 *       401:
 *         description: "Não autenticado"
 *       409:
 *         description: "Já existe modelo com esse key"
 *       500:
 *         description: "Erro interno"
 *
 * /api/admin/drones/models/{modelKey}:
 *   get:
 *     tags: [Admin Drones]
 *     summary: "Retorna agregado do modelo (info + galeria + seleção de mídia)"
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - name: modelKey
 *         in: path
 *         required: true
 *         schema: { type: string }
 *         example: "agras_t40"
 *     responses:
 *       200:
 *         description: "Dados completos do modelo"
 *       401:
 *         description: "Não autenticado"
 *       404:
 *         description: "Modelo não encontrado"
 *       500:
 *         description: "Erro interno"
 *   put:
 *     tags: [Admin Drones]
 *     summary: "Atualiza informações textuais do modelo (JSON)"
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - name: modelKey
 *         in: path
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               label: { type: string, maxLength: 120 }
 *               sort_order: { type: integer }
 *               is_active: { type: integer, enum: [0, 1] }
 *               description: { type: string, nullable: true }
 *               specs_json: { type: string, description: "JSON serializado" }
 *     responses:
 *       200:
 *         description: "Modelo atualizado"
 *       401:
 *         description: "Não autenticado"
 *       404:
 *         description: "Modelo não encontrado"
 *       500:
 *         description: "Erro interno"
 *   delete:
 *     tags: [Admin Drones]
 *     summary: "Soft-delete (desativa) ou hard-delete do modelo"
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - name: modelKey
 *         in: path
 *         required: true
 *         schema: { type: string }
 *       - name: hard
 *         in: query
 *         schema: { type: integer, enum: [0, 1], default: 0 }
 *         description: "1 para remoção definitiva (irreversível)"
 *     responses:
 *       200:
 *         description: "Modelo desativado ou removido"
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     modelKey: { type: string }
 *                 message: { type: string, example: "Modelo desativado." }
 *       401:
 *         description: "Não autenticado"
 *       404:
 *         description: "Modelo não encontrado"
 *       500:
 *         description: "Erro interno"
 */
```

#### Grupo REPRESENTANTES

```js
/**
 * @openapi
 * /api/admin/drones/representantes:
 *   get:
 *     tags: [Admin Drones]
 *     summary: "Lista representantes (paginado)"
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - name: page
 *         in: query
 *         schema: { type: integer, default: 1 }
 *       - name: limit
 *         in: query
 *         schema: { type: integer, default: 20, maximum: 100 }
 *       - name: busca
 *         in: query
 *         schema: { type: string }
 *         description: "Filtro por nome, CNPJ ou cidade"
 *       - name: includeInactive
 *         in: query
 *         schema: { type: integer, enum: [0, 1], default: 0 }
 *     responses:
 *       200:
 *         description: "Lista paginada de representantes"
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     items:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id: { type: integer }
 *                           name: { type: string }
 *                           whatsapp: { type: string, example: "5511999999999" }
 *                           cnpj: { type: string }
 *                           instagram_url: { type: string, nullable: true }
 *                           address_city: { type: string, nullable: true }
 *                           address_uf: { type: string, nullable: true }
 *                           is_active: { type: integer, enum: [0, 1] }
 *                     total: { type: integer }
 *                     page: { type: integer }
 *                     limit: { type: integer }
 *       401:
 *         description: "Não autenticado"
 *       500:
 *         description: "Erro interno"
 *   post:
 *     tags: [Admin Drones]
 *     summary: "Cria representante"
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, whatsapp, cnpj]
 *             properties:
 *               name: { type: string, maxLength: 120 }
 *               whatsapp:
 *                 type: string
 *                 description: "Somente dígitos, 10-13 caracteres"
 *                 example: "5511999999999"
 *               cnpj: { type: string, maxLength: 20 }
 *               instagram_url: { type: string, maxLength: 255, nullable: true }
 *               address_street: { type: string, nullable: true }
 *               address_city: { type: string, nullable: true }
 *               address_uf: { type: string, maxLength: 2, nullable: true }
 *               address_cep: { type: string, nullable: true }
 *               notes: { type: string, maxLength: 255, nullable: true }
 *               sort_order: { type: integer, default: 0 }
 *               is_active: { type: integer, enum: [0, 1], default: 1 }
 *     responses:
 *       201:
 *         description: "Representante criado"
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     id: { type: integer }
 *                 message: { type: string, example: "Representante criado." }
 *       400:
 *         description: "Dados inválidos (whatsapp fora do formato, campos obrigatórios ausentes)"
 *       401:
 *         description: "Não autenticado"
 *       500:
 *         description: "Erro interno"
 *
 * /api/admin/drones/representantes/{id}:
 *   put:
 *     tags: [Admin Drones]
 *     summary: "Atualiza representante (campos enviados sobrescrevem; ausentes são ignorados)"
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name: { type: string }
 *               whatsapp: { type: string }
 *               cnpj: { type: string }
 *               instagram_url: { type: string, nullable: true }
 *               address_city: { type: string, nullable: true }
 *               address_uf: { type: string, nullable: true }
 *               is_active: { type: integer, enum: [0, 1] }
 *     responses:
 *       200:
 *         description: "Representante atualizado"
 *       400:
 *         description: "Dados inválidos"
 *       401:
 *         description: "Não autenticado"
 *       404:
 *         description: "Representante não encontrado"
 *       500:
 *         description: "Erro interno"
 *   delete:
 *     tags: [Admin Drones]
 *     summary: "Remove representante"
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: "Representante removido"
 *       401:
 *         description: "Não autenticado"
 *       404:
 *         description: "Representante não encontrado"
 *       500:
 *         description: "Erro interno"
 */
```

#### Grupo COMENTÁRIOS

```js
/**
 * @openapi
 * /api/admin/drones/comentarios:
 *   get:
 *     tags: [Admin Drones]
 *     summary: "Lista comentários para moderação"
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - name: page
 *         in: query
 *         schema: { type: integer, default: 1 }
 *       - name: limit
 *         in: query
 *         schema: { type: integer, default: 20, maximum: 100 }
 *       - name: status
 *         in: query
 *         schema: { type: string, enum: [PENDING, APPROVED, REJECTED] }
 *         description: "Filtro por status (maiúsculo)"
 *       - name: model_key
 *         in: query
 *         schema: { type: string }
 *         description: "Filtro por modelo"
 *     responses:
 *       200:
 *         description: "Lista paginada de comentários"
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     items:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id: { type: integer }
 *                           model_key: { type: string }
 *                           autor_nome: { type: string }
 *                           comentario: { type: string }
 *                           nota: { type: integer, nullable: true }
 *                           status: { type: string, enum: [PENDING, APPROVED, REJECTED] }
 *                           created_at: { type: string, format: date-time }
 *                     total: { type: integer }
 *                     page: { type: integer }
 *                     limit: { type: integer }
 *       401:
 *         description: "Não autenticado"
 *       500:
 *         description: "Erro interno"
 *
 * /api/admin/drones/comentarios/{id}/aprovar:
 *   put:
 *     tags: [Admin Drones]
 *     summary: "Aprova comentário"
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: "Comentário aprovado"
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     id: { type: integer }
 *                 message: { type: string, example: "Comentário aprovado." }
 *       401:
 *         description: "Não autenticado"
 *       404:
 *         description: "Comentário não encontrado"
 *       422:
 *         description: "Status não suportado nesta instância"
 *       500:
 *         description: "Erro interno"
 *
 * /api/admin/drones/comentarios/{id}/reprovar:
 *   put:
 *     tags: [Admin Drones]
 *     summary: "Reprova comentário"
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: "Comentário reprovado"
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok: { type: boolean, example: true }
 *                 data: { type: object, properties: { id: { type: integer } } }
 *                 message: { type: string, example: "Comentário reprovado." }
 *       401:
 *         description: "Não autenticado"
 *       404:
 *         description: "Comentário não encontrado"
 *       500:
 *         description: "Erro interno"
 *
 * /api/admin/drones/comentarios/{id}:
 *   delete:
 *     tags: [Admin Drones]
 *     summary: "Remove comentário definitivamente"
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: "Comentário removido"
 *       401:
 *         description: "Não autenticado"
 *       404:
 *         description: "Comentário não encontrado"
 *       500:
 *         description: "Erro interno"
 */
```

---

### 5.4 `userProfile.js` — blocos prontos para colar

> O arquivo já tem schemas `UserProfile` e `UserProfileUpdate` definidos. Colar os blocos de
> endpoint a seguir logo após esses schemas.

```js
/**
 * @openapi
 * /api/users/me:
 *   get:
 *     tags: [Usuário]
 *     summary: "Retorna perfil do usuário logado"
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: "Perfil do usuário"
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok: { type: boolean, example: true }
 *                 data:
 *                   $ref: '#/components/schemas/UserProfile'
 *       401:
 *         description: "Não autenticado"
 *       500:
 *         description: "Erro interno"
 *   put:
 *     tags: [Usuário]
 *     summary: "Atualiza perfil próprio (campos parciais — apenas o enviado é alterado)"
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UserProfileUpdate'
 *     responses:
 *       200:
 *         description: "Perfil atualizado"
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok: { type: boolean, example: true }
 *                 data:
 *                   $ref: '#/components/schemas/UserProfile'
 *       400:
 *         description: "Campo inválido (CPF duplicado, campo excede tamanho máximo, etc.)"
 *       401:
 *         description: "Não autenticado"
 *       409:
 *         description: "CPF já cadastrado em outra conta"
 *       500:
 *         description: "Erro interno"
 *
 * /api/users/admin/{id}:
 *   get:
 *     tags: [Usuário]
 *     summary: "(Admin) Retorna perfil de qualquer usuário"
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: "Perfil do usuário"
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok: { type: boolean, example: true }
 *                 data:
 *                   $ref: '#/components/schemas/UserProfile'
 *       401:
 *         description: "Não autenticado"
 *       403:
 *         description: "Sem permissão (não é admin)"
 *       404:
 *         description: "Usuário não encontrado"
 *       500:
 *         description: "Erro interno"
 *   put:
 *     tags: [Usuário]
 *     summary: "(Admin) Atualiza perfil de qualquer usuário"
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UserProfileUpdate'
 *     responses:
 *       200:
 *         description: "Perfil atualizado"
 *       400:
 *         description: "Campo inválido"
 *       401:
 *         description: "Não autenticado"
 *       403:
 *         description: "Sem permissão"
 *       404:
 *         description: "Usuário não encontrado"
 *       500:
 *         description: "Erro interno"
 */
```

---

### 5.5 `adminSiteHero.js` — bloco pronto para colar

```js
/**
 * @openapi
 * tags:
 *   - name: Admin Site Hero
 *     description: Gestão do hero principal do site
 *
 * /api/admin/site-hero:
 *   get:
 *     tags: [Admin Site Hero]
 *     summary: "Retorna configuração atual do hero"
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: "Dados do hero"
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     id: { type: integer }
 *                     hero_video_path: { type: string, nullable: true }
 *                     hero_image_path: { type: string, nullable: true }
 *                     hero_fallback_image_path: { type: string, nullable: true }
 *       401:
 *         description: "Não autenticado"
 *       500:
 *         description: "Erro interno"
 *   put:
 *     tags: [Admin Site Hero]
 *     summary: "Atualiza hero (multipart — heroVideo, heroImage ou heroFallbackImage)"
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: false
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               heroVideo:
 *                 type: string
 *                 format: binary
 *                 description: "Vídeo do hero (mp4)"
 *               heroImage:
 *                 type: string
 *                 format: binary
 *                 description: "Imagem principal (jpg/png/webp)"
 *               heroFallbackImage:
 *                 type: string
 *                 format: binary
 *                 description: "Imagem fallback para dispositivos sem vídeo"
 *     responses:
 *       200:
 *         description: "Hero atualizado"
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok: { type: boolean, example: true }
 *                 message: { type: string, example: "Hero atualizado." }
 *       400:
 *         description: "Arquivo inválido"
 *       401:
 *         description: "Não autenticado"
 *       500:
 *         description: "Erro interno"
 */
```

---

### 5.6 `publicProducts.js` — bloco do GET `/` faltante

> Colar acima do handler existente de `GET /`.

```js
/**
 * @openapi
 * /api/products:
 *   get:
 *     tags: [Produtos]
 *     summary: "Listagem paginada de produtos com filtros"
 *     parameters:
 *       - name: page
 *         in: query
 *         schema: { type: integer, default: 1 }
 *       - name: limit
 *         in: query
 *         schema: { type: integer, default: 12, maximum: 100 }
 *       - name: category_id
 *         in: query
 *         schema: { type: integer }
 *         description: "Filtro por categoria"
 *       - name: search
 *         in: query
 *         schema: { type: string }
 *         description: "Busca por nome"
 *       - name: sort
 *         in: query
 *         schema: { type: string, enum: [id, name, price, created_at], default: id }
 *       - name: order
 *         in: query
 *         schema: { type: string, enum: [asc, desc], default: asc }
 *     responses:
 *       200:
 *         description: "Lista paginada de produtos"
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok: { type: boolean, example: true }
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Product'
 *                 meta:
 *                   type: object
 *                   properties:
 *                     total: { type: integer }
 *                     page: { type: integer }
 *                     limit: { type: integer }
 *                     pages: { type: integer }
 *       500:
 *         description: "Erro interno"
 */
```
