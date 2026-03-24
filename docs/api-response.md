# API Response Standard

## Objective

Define a single response format for all API endpoints.
This eliminates the current inconsistency where different routes return
`{ message }`, `{ success, message }`, `{ ok, data }`, or raw arrays
with no predictable shape.

---

## Current State (legacy)

The existing codebase uses at least four distinct response shapes:

```js
res.json({ message: "Operação realizada." })         // no success flag
res.json({ success: true, message: "Criado." })      // success field
res.status(201).json({ id, nome, slug })             // raw object, no envelope
res.json(rows)                                       // raw array
```

This is known debt. Routes written before this standard was defined will not
be changed immediately. See the adoption rule at the bottom of this document.

---

## Official Shape

### Success

```json
{ "ok": true }
{ "ok": true, "data": { ... } }
{ "ok": true, "data": [ ... ] }
{ "ok": true, "data": { ... }, "message": "Mensagem opcional." }
```

### Success with pagination

```json
{
  "ok": true,
  "data": [ ... ],
  "meta": {
    "total": 84,
    "page": 2,
    "limit": 10,
    "pages": 9
  }
}
```

### No body (204)

Empty response body. Used for DELETE and status-only PATCH/PUT.

### Error

Errors are handled by `middleware/errorHandler.js` and always return:

```json
{
  "ok": false,
  "code": "NOT_FOUND",
  "message": "Pedido não encontrado.",
  "details": { }
}
```

`details` is optional and omitted when null.

---

## Fields

| Field | Type | When present |
|-------|------|-------------|
| `ok` | `boolean` | Always |
| `data` | `any` | When there is a payload to return |
| `message` | `string` | When a human-readable message adds value |
| `meta` | `object` | Only on paginated lists |
| `code` | `string` | Errors only (error code from `constants/ErrorCodes.js`) |
| `details` | `any` | Errors only, when extra context is available |

### What `ok` means

- `ok: true` — the operation completed as expected.
- `ok: false` — the operation failed. `code` and `message` explain why.

`ok` is intentionally different from HTTP status. A 200 with `ok: true` means
success. A 400/404/500 with `ok: false` means failure. They are always consistent.

---

## Helpers

All helpers live in `lib/response.js`.

```js
const { ok, created, noContent, paginated, badRequest } = require("../lib/response");
```

### `ok(res, data?, message?)`

200 OK. General success.

```js
// data only
return ok(res, { id: 1, nome: "Produto X" });

// data + message
return ok(res, rows, "Lista carregada com sucesso.");

// no data (status-only, e.g. a flag toggle)
return ok(res);
```

### `created(res, data, message?)`

201 Created. New resource.

```js
return created(res, { id: result.insertId, nome, slug });
return created(res, { id: result.insertId }, "Role criado com sucesso.");
```

### `noContent(res)`

204 No Content. For DELETE and updates that return nothing.

```js
return noContent(res);
```

### `paginated(res, { items, total, page, limit })`

200 OK with `meta` block for list endpoints.

```js
const [rows] = await pool.query("SELECT ...");
const [[{ total }]] = await pool.query("SELECT COUNT(*) AS total ...");
return paginated(res, { items: rows, total, page: 1, limit: 20 });
```

### `badRequest(res, message, details?)`

400 Bad Request. For inline validation where `next` is unavailable.

**Prefer `next(new AppError(...))` in controllers.** Use `badRequest` only in
middleware or route files that do not have `next` in scope.

```js
// preferred — in controllers
return next(new AppError("produto_id inválido.", ERROR_CODES.VALIDATION_ERROR, 400));

// acceptable — in middleware without next
return badRequest(res, "CEP inválido.", { received: cep });
```

---

## When to Use Each Helper

| Scenario | Helper | HTTP |
|----------|--------|------|
| GET — returns resource(s) | `ok(res, data)` | 200 |
| POST — creates resource | `created(res, data)` | 201 |
| PUT/PATCH — updates resource | `ok(res, data)` or `ok(res)` | 200 |
| DELETE — removes resource | `noContent(res)` | 204 |
| GET — paginated list | `paginated(res, { items, total, page, limit })` | 200 |
| Validation error | `next(new AppError(..., 400))` | 400 |
| Not found | `next(new AppError(..., 404))` | 404 |
| Any other error | `next(new AppError(...))` | varies |

---

## Example in a Controller

```js
const { ok, created, noContent } = require("../lib/response");
const AppError = require("../errors/AppError");
const ERROR_CODES = require("../constants/ErrorCodes");

async function getAll(req, res, next) {
  try {
    const items = await roleService.listAll();
    return ok(res, items);
  } catch (err) {
    return next(err);
  }
}

async function create(req, res, next) {
  try {
    const role = await roleService.create(req.body);
    return created(res, role);
  } catch (err) {
    return next(err);
  }
}

async function remove(req, res, next) {
  try {
    await roleService.delete(Number(req.params.id));
    return noContent(res);
  } catch (err) {
    return next(err);
  }
}
```

---

## Adoption Rule

### Mandatory

Use these helpers in:
- All new endpoints, from the moment they are written.
- All route files or controllers being **fully rewritten** as part of a planned
  extraction task (Phase 2 and beyond).

### Progressive (not blocking)

Existing endpoints using `res.json({ message })` or raw formats are **not
required to be updated immediately**. They will be migrated as each module is
refactored.

Do not submit a PR that changes response format without also changing the
underlying business logic. Response format changes on existing endpoints are
a contract change and must be coordinated with the frontend.

### What not to do

```js
// do not create your own response shape
return res.json({ success: true, msg: "ok" });

// do not return raw arrays
return res.json(rows);

// do not mix ok and message directly on the root
return res.json({ ok: true, message: "feito", id: 123 });

// do not use legacy names in new code
const { sendSuccess } = require("../lib/response"); // ← deprecated
```

---

## Compatibility with Legacy Code

`lib/response.js` exports `sendSuccess`, `sendCreated`, and `sendPaginated`
as deprecated aliases that map to the new helpers. Any file that was already
importing these names will continue to work without changes.

```js
// still works — no migration needed immediately
const { sendSuccess, sendCreated, sendPaginated } = require("../lib/response");
```

The aliases will be removed when all legacy callers have been migrated.
Until then, they are marked `@deprecated` in the source.
