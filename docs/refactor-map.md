# Refactor Map

Operational map of the most critical files before structural extraction.
Use this document as the reference for every extraction task in Phase 2 and beyond.

**Scope:** `routes/cart.js`, `routes/checkoutRoutes.js`, `controllers/checkoutController.js`,
`routes/adminPedidos.js`, `controllers/dronesAdminController.js`, `services/dronesService.js`.

**Status:** Read-only analysis. No code was changed to produce this document.

---

## 1. File-by-File Map

### `routes/cart.js` — 750 lines

| Field | Detail |
|-------|--------|
| **Responsibility** | All cart CRUD operations for authenticated users: read, add item, update quantity, remove item, clear cart |
| **SQL / data access** | Direct `pool.query()` and `pool.getConnection()`. All mutations use transactions with `FOR UPDATE` row locks |
| **Business rules** | (1) Stock read-only check: validates `desired <= products.quantity` before writing to cart — **does not debit stock**. (2) Auto-creates cart if none is open. (3) PATCH quantity: replaces current quantity with new value (not increment). (4) DELETE /: marks cart `status = "fechado"`. |
| **Dependencies** | `pool`, `authenticateToken`, `AppError`, `ERROR_CODES`, `middleware/cartValidation.validateQuantity` |
| **Risk** | HIGH — 3 separate transactions with row locks. Any extraction must preserve the `FOR UPDATE` on `products` and `carrinho_itens` or introduce race conditions |

**Queries executed:**
- `SELECT * FROM carrinhos WHERE usuario_id = ? AND status = "aberto"` (read cart, 4 endpoints)
- `INSERT INTO carrinhos (usuario_id)` (auto-create cart)
- `SELECT id, price, quantity FROM products WHERE id = ? FOR UPDATE` (stock lock, POST + PATCH)
- `SELECT id, quantidade FROM carrinho_itens WHERE carrinho_id = ? AND produto_id = ? FOR UPDATE` (item lock, POST)
- `UPDATE carrinho_itens SET quantidade = ? WHERE id = ?` (POST — increment)
- `INSERT INTO carrinho_itens (carrinho_id, produto_id, quantidade, valor_unitario)` (POST — new item)
- `UPDATE carrinho_itens SET quantidade = ? WHERE carrinho_id = ? AND produto_id = ?` (PATCH)
- `DELETE FROM carrinho_itens WHERE carrinho_id = ? AND produto_id = ?` (DELETE item)
- `DELETE FROM carrinho_itens WHERE carrinho_id = ?` (DELETE cart)
- `UPDATE carrinhos SET status = "fechado" WHERE id = ?` (DELETE cart)

---

### `routes/checkoutRoutes.js` — 753 lines

| Field | Detail |
|-------|--------|
| **Responsibility** | (1) Input validation and normalization middleware. (2) Shipping recalculation middleware (source of truth). (3) `POST /preview-cupom` — coupon preview endpoint. (4) Mounts `POST /` → `checkoutController.create` |
| **SQL / data access** | 2 direct `pool.query()` calls inside `POST /preview-cupom` only. The main checkout flow delegates SQL to `checkoutController`. |
| **Business rules** | (1) `validateCheckoutBody`: normalizes `entrega_tipo` (default ENTREGA), validates URBANA/RURAL address fields, normalizes address aliases (rua/endereco/logradouro). (2) `recalcShippingMiddleware`: recalculates shipping via `shippingQuoteService.getQuote()` — **ignores any shipping value from frontend**. Sets `req.body.shipping_*` fields for controller to persist. (3) `POST /preview-cupom`: full coupon validation logic — active check, expiry, max uses, minimum subtotal, discount calculation. Uses promotion-aware price (same formula as checkout). |
| **Dependencies** | `checkoutController`, `shippingQuoteService` (`getQuote`, `parseCep`, `normalizeItems`), `authenticateToken`, `validateCSRF`, `AppError`, `ERROR_CODES`, `pool` (preview-cupom only) |
| **Risk** | HIGH — `preview-cupom` contains **duplicate coupon validation logic** vs `checkoutController.js` (different context: preview vs actual application). Any extraction of coupon logic must unify both. |

**Queries in `POST /preview-cupom`:**
- `SELECT id, price FROM products WHERE id IN (?)` (subtotal for coupon calc)
- `SELECT pp.product_id, final_price FROM product_promotions JOIN products WHERE ...` (promotion-aware pricing)
- `SELECT id, codigo, tipo, valor, minimo, expiracao, usos, max_usos, ativo FROM cupons WHERE codigo = ?`

---

### `controllers/checkoutController.js` — 564 lines

| Field | Detail |
|-------|--------|
| **Responsibility** | Creates an order: locks, deduplication, user update, cart discovery, order insert, stock debit, coupon application, shipping persistence, cart cleanup, notification dispatch |
| **SQL / data access** | All SQL via `pool.getConnection()` with a single transaction. 11 queries inside the transaction + 2 outside. Direct `pool.query()` (not via connection) for post-commit cart cleanup. |
| **Business rules** | See detailed breakdown in Section 2 below |
| **Dependencies** | `pool`, `comunicacaoService.dispararEventoComunicacao`, `AppError`, `ERROR_CODES` |
| **Risk** | CRITICAL — Contains the most concentrated business logic in the system. Single function, 564 lines. Uses MySQL `GET_LOCK` for idempotency. Stock debit and coupon increment happen inside the same transaction. |

**Queries executed (in order):**
1. `SELECT GET_LOCK('kavita_checkout_{userId}', 5)` — advisory lock, prevents double submit
2. `SELECT id FROM carrinhos WHERE usuario_id = ? AND status = "aberto"` — find open cart
3. `SELECT pp.pedido_id, composicao, cupom FROM pedidos_produtos JOIN pedidos WHERE ...` — deduplication check (2-min window)
4. `INSERT INTO pedidos (...)` — create order with status = 'pendente'
5. `SELECT id, price, quantity FROM products WHERE id IN (?) FOR UPDATE` — stock lock
6. `SELECT pp.product_id, final_price FROM product_promotions JOIN products WHERE ...` — promotion prices
7. (loop) `INSERT INTO pedidos_produtos (pedido_id, produto_id, quantidade, valor_unitario)` — order items
8. (loop) `UPDATE products SET quantity = quantity - ? WHERE id = ?` — **STOCK DEBIT** ← key
9. `SELECT id, ... FROM cupons WHERE codigo = ? FOR UPDATE` — coupon lock
10. `UPDATE cupons SET usos = usos + 1 WHERE id = ?` — **COUPON INCREMENT** ← key
11. `UPDATE pedidos SET total = ?` — set final total
12. `UPDATE pedidos SET shipping_price = ?, shipping_rule_applied = ?, ...` — persist shipping
13. `UPDATE carrinhos_abandonados SET recuperado = 1 WHERE carrinho_id = ?` — mark abandoned cart recovered
14. COMMIT
15. `UPDATE carrinhos SET status = "convertido" WHERE usuario_id = ? AND status = "aberto"` — post-commit, pool (not conn)

---

### `routes/adminPedidos.js` — 531 lines

| Field | Detail |
|-------|--------|
| **Responsibility** | Admin order management: list, detail, update payment status, update delivery status (with cancellation) |
| **SQL / data access** | Direct `pool.query()` for reads and non-cancel mutations. `pool.getConnection()` with transaction only for cancellation (status_entrega = 'cancelado') |
| **Business rules** | (1) Payment status transition: accepts `[pendente, pago, falhou, estornado]`. Updates both `status_pagamento` AND `status` (mirror). Dispatches `pagamento_aprovado` event when `pago`. (2) Delivery status transition: accepts `[em_separacao, processando, enviado, entregue, cancelado]`. Dispatches `pedido_enviado` event when `enviado`. (3) Cancellation: uses `FOR UPDATE`, idempotent stock restore only if not already cancelled AND `status_pagamento <> 'falhou'` (avoids double-restore with webhook). |
| **Dependencies** | `pool`, `verifyAdmin`, `address.parseAddress`, `comunicacaoService.dispararEventoComunicacao` |
| **Risk** | HIGH — Stock restoration on cancel is inline with the status update. The idempotency guard (`status_pagamento <> 'falhou'`) is critical — it prevents double-restore when the webhook already restored. Any extraction must preserve this exact guard. |

**Stock restore query (adminPedidos.js:482):**
```sql
UPDATE products p
  JOIN pedidos_produtos pp ON pp.produto_id = p.id
  SET p.quantity = p.quantity + pp.quantidade
WHERE pp.pedido_id = ?
```
**Guard:** only runs if `pedido.status_entrega !== 'cancelado' AND pedido.status_pagamento !== 'falhou'`

---

### `controllers/dronesAdminController.js` — 1,195 lines

| Field | Detail |
|-------|--------|
| **Responsibility** | Admin panel for the entire drones domain: page settings, landing config, drone models CRUD, model gallery, global gallery, representatives, comments |
| **SQL / data access** | Delegates all SQL to `dronesService.js`. No direct `pool.query()` calls. |
| **Business rules** | Orchestration only: calls service functions, handles response formatting, error handling, and media operations via `mediaService`. |
| **Dependencies** | `dronesService`, `mediaService`, `AppError` |
| **Risk** | MEDIUM — No SQL, but 1,195 lines handling 8 distinct sub-domains. Risk is in scope and cognitive load, not in data integrity. Safe to split by functional area without risk of breaking business rules. |

**Functional areas (candidates for split):**
- Page/landing config (lines ~109–370): `getPage`, `upsertPage`, `resetPageToDefault`, `getLandingConfig`, `upsertLandingConfig`
- Drone models CRUD (lines ~375–598): `listModels`, `createModel`, `deleteModel`, `getModelAggregate`, `upsertModelInfo`, `setModelMediaSelection`
- Model gallery (lines ~602–820): `listModelGallery`, `createModelGalleryItem`, `updateModelGalleryItem`, `deleteModelGalleryItem`
- Global gallery (lines ~828–1024): `listGallery`, `createGalleryItem`, `updateGalleryItem`, `deleteGalleryItem`
- Representatives (lines ~1025–1099): `listRepresentatives`, `createRepresentative`, `updateRepresentative`, `deleteRepresentative`
- Comments (lines ~1101–1154): `listComments`, `approveComment`, `rejectComment`, `deleteComment`

---

### `services/dronesService.js` — 1,326 lines

| Field | Detail |
|-------|--------|
| **Responsibility** | All data access and some business logic for the drones domain: page settings (JSON), model metadata, gallery (public + admin), representatives, comments (with approval workflow) |
| **SQL / data access** | Direct `pool.query()` throughout. No use of `pool.getConnection()` — operates without explicit transactions. |
| **Business rules** | Comment approval workflow, SHA-256 hash for comment deduplication, gallery item `sort_order` management, promotion-aware selection for drone media, dynamic schema detection (`hasColumn`, `getTableRowCount`) |
| **Dependencies** | `pool`, `mediaService` (indirectly via controller), `AppError` |
| **Risk** | MEDIUM — Large but well-encapsulated within the drones domain. No overlap with order/cart/payment logic. Risk is size and testability, not data integrity. |

**Functional areas (candidates for split):**
- Page/config functions (lines ~72–201): `getPageSettings`, `upsertPageSettings`
- Model info (lines ~202–424): `getModelInfo`, `upsertModelInfo`, `getSelectionsMapForModels`
- Gallery (lines ~425–640): `listGalleryPublic`, `listGalleryAdmin`, `createGalleryItem`, `updateGalleryItem`, `deleteGalleryItem`
- Representatives (lines ~641–844): `listRepresentativesPublic`, `listRepresentativesAdmin`, `createRepresentative`, `updateRepresentative`, `deleteRepresentative`
- Comments (lines ~846–1130): `listApprovedComments`, `listCommentsAdmin`, `createComment`, `deleteComment`, `setCommentStatus`

---

## 2. Critical Flow Analysis

### Stock Debit — where it happens

**One place, one query:**

```
controllers/checkoutController.js : line 340
  UPDATE products SET quantity = quantity - ? WHERE id = ?
  Context: inside transaction, after stock validation (FOR UPDATE lock)
  Trigger: POST /api/checkout
```

The cart (`routes/cart.js`) **does not debit stock**. It only reads `products.quantity` to enforce the limit. Stock belongs to the order, not the cart.

---

### Stock Restoration — three separate points

This is the most dangerous diffusion in the system. Stock can be restored from three independent code paths:

| # | File | Line | Trigger | Guard |
|---|------|------|---------|-------|
| 1 | `repositories/paymentRepository.js` | 228 | Payment gateway returns `rejected` or `cancelled` (via webhook) | `ped.status_pagamento <> 'falhou'` — prevents double restore |
| 2 | `routes/adminPedidos.js` | 482 | Admin manually sets `status_entrega = 'cancelado'` | `status_entrega <> 'cancelado' AND status_pagamento <> 'falhou'` — prevents double restore |
| 3 | *(implicit)* | — | No restore on `status_pagamento = 'estornado'` — **gap**: a refund does not return stock | No guard exists because the path does not exist |

**Critical: the two guards must remain synchronized.**
If either guard is changed independently, double-restore or missed-restore becomes possible.

**Implicit gap:** `estornado` (chargebacked/refunded) does not trigger stock restoration. Whether this is intentional must be verified before extraction.

---

### Coupon Application — two places with different intents

| File | Context | What it does |
|------|---------|-------------|
| `routes/checkoutRoutes.js` (lines 563–731) | `POST /api/checkout/preview-cupom` | Validates coupon, calculates discount, **does not increment `usos`** |
| `controllers/checkoutController.js` (lines 352–455) | `POST /api/checkout` (inside transaction) | Validates coupon with `FOR UPDATE`, calculates discount, **increments `usos`** |

Both implement the same validation rules (active, expiry, max uses, minimum order). The logic is duplicated with one key difference: only the checkout controller mutates the coupon.

**Extraction note:** A future `couponService` must expose two methods: `validateCoupon(codigo, subtotal)` (read-only, for preview) and `applyCoupon(conn, codigo, subtotal)` (transactional, for checkout). They cannot be the same function.

---

### Order Status Transitions — two separate controllers

| Status type | Where | Trigger | Side effect |
|-------------|-------|---------|-------------|
| `status_pagamento` | `routes/adminPedidos.js:375` | Admin updates payment status | Dispatches `pagamento_aprovado` event if `pago` |
| `status_pagamento` | `services/paymentWebhookService.js` | MP webhook | Updates `status` and `status_pagamento` together; restores stock on `falhou` |
| `status_entrega` | `routes/adminPedidos.js:504` | Admin updates delivery status | Dispatches `pedido_enviado` if `enviado`; restores stock if `cancelado` |

**The `status` field mirrors `status_pagamento`.** This is explicit in both `adminPedidos.js` (line 375: `SET status_pagamento = ?, status = ?`) and `paymentWebhookService.js`. Any future service must keep this mirror rule.

**No single source of truth for "what status transitions are valid".** The allowed values are hardcoded as inline arrays in `adminPedidos.js` and implicitly in `paymentWebhookService.js` (`mapMPStatusToDomain`). A future `orderService` should define a single transition map.

---

### Cart ↔ Checkout Interaction

The relationship is sequential, not bidirectional:

```
cart.js                       checkoutController.js
──────────────────────────    ───────────────────────────────────────
Validates stock availability  Debits stock (FOR UPDATE lock)
Stores item + valor_unitario  Reads products.price fresh (ignores cart price)
status = "aberto"             status = "convertido" (post-commit, pool.query)
                              Marks carrinhos_abandonados.recuperado = 1
```

**Key points:**
1. The checkout controller **ignores `carrinho_itens.valor_unitario`**. It fetches fresh prices from `products` + `product_promotions`. The cart price is display-only.
2. Cart closure (`status = "convertido"`) happens **outside the transaction**, after commit (line 509). A crash between commit and cart closure leaves a cart in "aberto" state but the order exists — acceptable, does not affect inventory.
3. The `produtos` array in `POST /api/checkout` comes from the frontend, not from reading the cart. The cart and the checkout request are parallel channels. There is no enforced "cart must match request" validation.

---

## 3. Dangerous Coupling Points

| Point | Files involved | Risk |
|-------|---------------|------|
| Stock restore guards must stay synchronized | `paymentRepository.js:228` + `adminPedidos.js:482` | Double-restore or missed-restore if guards diverge |
| `status` mirrors `status_pagamento` | `adminPedidos.js:375` + `paymentWebhookService.js` | Status inconsistency if one path stops mirroring |
| Coupon validation duplicated | `checkoutRoutes.js:563` + `checkoutController.js:352` | Rule divergence (e.g., a new validation added to one but not the other) |
| Shipping recalculation injected via `req.body` | `checkoutRoutes.js:499` + `checkoutController.js:471` | Controller reads `req.body.shipping_*` set by middleware; if middleware order changes, shipping is not persisted |
| Cart closure outside transaction | `checkoutController.js:509` | Cart stays "aberto" on crash after commit — cosmetic, not critical |
| `GET_LOCK` must be released on the same connection | `checkoutController.js:554` | Lock leaks if `connection.release()` is called before `RELEASE_LOCK` |

---

## 4. Points of Diffuse Responsibility

| Responsibility | Where it lives today | Should live in |
|---------------|---------------------|---------------|
| Coupon validation rules | `checkoutRoutes.js` + `checkoutController.js` | `services/couponService.js` |
| Stock debit | `checkoutController.js` | `services/checkoutService.js` |
| Stock restore on failure | `repositories/paymentRepository.js` | `repositories/orderRepository.js` (single place) |
| Stock restore on cancel | `routes/adminPedidos.js` | `services/orderService.js` |
| Order status transitions | `routes/adminPedidos.js` + `paymentWebhookService.js` | `services/orderService.js` |
| Cart auto-creation | `routes/cart.js` | `services/cartService.js` |
| Address normalization at checkout | `routes/checkoutRoutes.js` | `services/addressService.js` or `utils/address.js` (already partially exists) |
| Promotion-aware pricing | `routes/checkoutRoutes.js (preview)` + `checkoutController.js` | `services/pricingService.js` or `repositories/productRepository.js` |

---

## 5. Questions This Map Now Answers

- **Where is stock debited?** `checkoutController.js:340` — only here, inside a transaction.
- **Where is stock restored?** Two places: `paymentRepository.js:228` (webhook failure) and `adminPedidos.js:482` (admin cancel). Guards must stay synchronized.
- **Where is the coupon applied?** `checkoutController.js:352–455` (with `FOR UPDATE` and `usos` increment). Preview only in `checkoutRoutes.js:563`.
- **Where do order status transitions happen?** Admin manual: `adminPedidos.js`. Gateway-driven: `paymentWebhookService.js`. No unified transition table.
- **Does the cart debit stock?** No. The cart validates availability and stores `valor_unitario`, but `products.quantity` is only decremented at checkout.
- **What happens to the cart after checkout?** Marked as `convertido` after transaction commit, via a separate `pool.query()` (not in the transaction).
- **What is the idempotency mechanism at checkout?** MySQL `GET_LOCK` per user (serializes concurrent checkouts) + fingerprint deduplication on product composition within a 2-minute window.
- **Is `status` the same as `status_pagamento`?** Yes — both fields are updated together on every status change. The `status` field mirrors `status_pagamento`.

---

## 6. Operational Conclusion

Before any extraction begins, the following invariants must be preserved exactly:

1. **Stock debit and coupon increment happen in the same atomic transaction** (checkoutController). They cannot be split into separate service calls without a wrapping transaction that crosses both.
2. **The two stock restore guards (`status_pagamento <> 'falhou'`) must remain logically equivalent** even if moved to different services. They exist to prevent double-restore; if they diverge, inventory becomes inconsistent.
3. **Coupon extraction requires two distinct service methods** — a read-only `validate` for preview and a transactional `apply` for checkout. They cannot share a single function signature.
4. **The shipping values arrive at the controller via `req.body`** (injected by middleware). Any refactor of the checkout route must preserve this injection or change the controller interface together.
5. **`GET_LOCK` must be released before `connection.release()`** — already correct in current code; must not be lost in extraction.
6. **The drones controller/service split is safe to do independently** — it has no overlap with order, cart, stock, or payment logic.
