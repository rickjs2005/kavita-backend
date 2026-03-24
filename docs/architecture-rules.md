# Architecture Rules

This document defines the official architecture and refactoring rules for this project.
It must be followed in all new code and all refactoring work going forward.

---

## Layers and Responsibilities

### Route (`routes/`)
- Mounts middleware and delegates to a controller method.
- Contains no SQL, no business logic, no `if/else` on domain rules.
- Acceptable in a route file: path definition, auth middleware, CSRF, rate limiting, input parsing, `controller.method(req, res, next)`.

```js
// correct
router.post("/cart", authenticateToken, validateCSRF, cartController.addItem);

// incorrect — business logic and SQL do not belong here
router.post("/cart", authenticateToken, async (req, res) => {
  const [rows] = await pool.query("SELECT ...");
  if (rows[0].stock < req.body.qty) { ... }
  ...
});
```

### Controller (`controllers/`)
- Receives `req` and `res`, calls one or more services, returns the response.
- Contains no SQL and no domain rules.
- Handles input extraction, calls service, maps service result or error to HTTP response.

```js
// correct
async function addItem(req, res, next) {
  try {
    const result = await cartService.addItem(req.user.id, req.body);
    return res.status(201).json(result);
  } catch (err) {
    return next(err);
  }
}
```

### Service (`services/`)
- Contains all business logic for a domain.
- Has no knowledge of `req`, `res`, or HTTP concepts.
- Calls repositories for data access. May call other services for cross-domain logic.
- Throws `AppError` for expected business errors.

```js
// correct
async function addItem(userId, { productId, quantity }) {
  const product = await cartRepository.findProduct(productId);
  if (product.stock < quantity) {
    throw new AppError("Estoque insuficiente.", ERROR_CODES.STOCK_LIMIT, 409);
  }
  return cartRepository.insertItem(userId, productId, quantity);
}
```

### Repository (`repositories/`)
- Contains all SQL for a domain. No business logic.
- Accepts plain parameters, returns plain rows or values.
- Functions that participate in a transaction receive `conn` as the first argument.
- Functions that run standalone acquire and release their own connection from `pool`.

```js
// correct
async function findProduct(productId) {
  const conn = await pool.getConnection();
  try {
    const [[row]] = await conn.query("SELECT * FROM products WHERE id = ?", [productId]);
    return row || null;
  } finally {
    conn.release();
  }
}
```

---

## Refactoring Rules

These rules apply to all refactoring work in this project.

### What must not change during refactoring
- HTTP method and URL of any existing endpoint.
- Shape of the request body expected by each endpoint.
- Shape of the response returned to the client.
- Auth and permission requirements on any existing endpoint.
- Database schema.

Any change to the above is a **feature change**, not a refactoring, and requires a separate PR with explicit review.

### How to refactor safely
1. **Extract inward, not outward.** Move logic from route → controller → service → repository. Never move logic toward the route.
2. **One extraction at a time.** Extract one function or one layer per PR. Do not restructure and refactor in the same commit.
3. **Keep the contract.** The route file may change entirely; the HTTP contract must not.
4. **Run integration tests before and after.** A refactoring PR that breaks an existing integration test is incorrect by definition.
5. **No mixed concerns in a single PR.** A PR that extracts `cartService.js` must not also fix a bug or add a feature.

---

## Error Handling

- All expected errors must be thrown as `AppError` from the service layer.
- The global handler in `middleware/errorHandler.js` catches all `AppError` instances and formats the response.
- Routes and controllers must not catch and swallow errors silently. Use `next(err)`.
- Use constants from `constants/ErrorCodes.js` for the `code` field.

```js
// correct — service throws, route propagates
throw new AppError("Pedido não encontrado.", ERROR_CODES.NOT_FOUND, 404);

// incorrect — catching and re-wrapping without cause
try { ... } catch { res.status(500).json({ message: "Erro." }); }
```

---

## Response Format

All API responses must follow this structure:

```json
// success with data
{ "data": { ... } }
{ "data": [ ... ] }

// success with message only
{ "message": "Operação realizada com sucesso." }

// success with both
{ "data": { ... }, "message": "Criado com sucesso." }

// error (handled by errorHandler.js)
{ "code": "NOT_FOUND", "message": "Pedido não encontrado." }
```

> **Note:** Existing endpoints that return a different shape must not be changed during refactoring.
> Align to this format only when creating new endpoints or when a route is being fully rewritten as part of an approved extraction task.

---

## File Naming

| Layer | Convention | Example |
|-------|-----------|---------|
| Route | `{domain}.routes.js` or legacy flat name | `cart.routes.js` |
| Controller | `{domain}.controller.js` | `cart.controller.js` |
| Service | `{domain}Service.js` | `cartService.js` |
| Repository | `{domain}Repository.js` | `cartRepository.js` |

New files must follow this convention. Existing files are renamed only when fully rewritten.

---

## Shared Code

- `shared/` or top-level `utils/` for pure functions used across multiple domains (e.g., `cpf.js`, `sanitize.js`).
- `middleware/` for Express middleware only.
- `config/` for environment, database, and third-party client configuration.
- A utility that contains domain logic belongs in a service, not in `utils/`.

---

## Current State

The project is in active architectural migration. Many existing route files contain inline SQL and business logic that predate these rules. **This is known debt.** Do not replicate this pattern in new code.

When touching an existing file:
- If the file is being fully rewritten as part of a planned extraction task: apply these rules in full.
- If the file is being touched for a bug fix or minor change: do not restructure it. Fix the issue only.

---

## Checklist for New Code

Before opening a PR, verify:

- [ ] Route file has no `pool.query()` calls
- [ ] Route file has no domain `if/else` logic
- [ ] Controller has no `pool.query()` calls
- [ ] Service has no `req` or `res` references
- [ ] Repository has no domain rules, only SQL
- [ ] Errors are thrown as `AppError` from the service
- [ ] No existing HTTP contract was changed
- [ ] Integration tests pass before and after the change
