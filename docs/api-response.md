# API Response Standard

> Contrato unico de resposta para todos os endpoints da API.

---

## Formato oficial

### Sucesso

```json
{ "ok": true }
{ "ok": true, "data": { ... } }
{ "ok": true, "data": { ... }, "message": "Mensagem opcional." }
```

### Sucesso com paginacao

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

### Sucesso com meta (sem paginacao)

```json
{
  "ok": true,
  "data": { ... },
  "meta": { "provider": "inmet", "took_ms": 420 }
}
```

### No body (204)

Resposta vazia. Usado para DELETE e PATCH/PUT sem retorno.

### Erro

Erros sao tratados por `middleware/errorHandler.js`:

```json
{
  "ok": false,
  "code": "NOT_FOUND",
  "message": "Pedido nao encontrado.",
  "details": { }
}
```

`details` e opcional e omitido quando null.

---

## Campos

| Campo | Tipo | Quando presente |
|-------|------|-----------------|
| `ok` | `boolean` | Sempre |
| `data` | `any` | Quando ha payload |
| `message` | `string` | Quando mensagem legivel agrega valor |
| `meta` | `object` | Paginacao ou contexto adicional |
| `code` | `string` | Apenas em erros (constante de `constants/ErrorCodes.js`) |
| `details` | `any` | Apenas em erros, quando ha contexto extra |

---

## Helpers — `lib/response.js`

```js
const { response } = require("../lib");

response.ok(res, data);                             // 200
response.ok(res, data, "mensagem");                 // 200 com message
response.ok(res, data, null, meta);                 // 200 com meta
response.created(res, data);                        // 201
response.noContent(res);                            // 204
response.paginated(res, { items, total, page, limit }); // 200 + meta paginacao
response.badRequest(res, message, details);         // 400 (preferir AppError)
```

### Quando usar cada helper

| Cenario | Helper | HTTP |
|---------|--------|------|
| GET — retorna recurso(s) | `ok(res, data)` | 200 |
| POST — cria recurso | `created(res, data)` | 201 |
| PUT/PATCH — atualiza | `ok(res, data)` ou `ok(res)` | 200 |
| DELETE — remove | `noContent(res)` | 204 |
| GET — lista paginada | `paginated(res, { items, total, page, limit })` | 200 |
| Erro de validacao | `next(new AppError(..., 400))` | 400 |
| Nao encontrado | `next(new AppError(..., 404))` | 404 |

---

## Mapeamento HTTP -> ERROR_CODES

| HTTP | Codigo | Quando usar |
|------|--------|-------------|
| 400 | `VALIDATION_ERROR` | Schema Zod falhou ou parametro invalido |
| 401 | `AUTH_ERROR` | Credenciais invalidas, token invalido |
| 401 | `UNAUTHORIZED` | Sem token / sem autenticacao |
| 403 | `FORBIDDEN` | Autenticado mas sem permissao |
| 404 | `NOT_FOUND` | Recurso nao encontrado |
| 409 | `CONFLICT` | Recurso ja existe ou estado incompativel |
| 429 | `RATE_LIMIT` | Rate limit excedido |
| 500 | `SERVER_ERROR` | Erro interno nao previsto |

---

## Exemplo em controller

```js
const AppError = require("../errors/AppError");
const ERROR_CODES = require("../constants/ErrorCodes");
const { response } = require("../lib");

const list = async (req, res, next) => {
  try {
    const items = await service.listAll();
    return response.ok(res, items);
  } catch (err) {
    return next(err);
  }
};

const create = async (req, res, next) => {
  try {
    const item = await service.create(req.body);
    return response.created(res, item);
  } catch (err) {
    return next(err);
  }
};

const remove = async (req, res, next) => {
  try {
    await service.delete(Number(req.params.id));
    return response.noContent(res);
  } catch (err) {
    return next(err);
  }
};

module.exports = { list, create, remove };
```

---

## Regras

- Todo codigo novo **obrigatoriamente** usa `lib/response.js`.
- Todo erro esperado usa `next(new AppError(msg, ERROR_CODES.XXX, status))`.
- Nunca `res.json({ ... })` cru em controllers.
- Nunca `res.status(4xx).json(...)` inline.
- Codigos de erro sempre de `constants/ErrorCodes.js` — nunca strings literais.
