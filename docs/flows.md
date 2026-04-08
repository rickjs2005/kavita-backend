# Critical Business Flows

> Documentacao dos fluxos criticos do backend: checkout, pagamento, webhook e cancelamento.
> Cada fluxo descreve a sequencia real de operacoes, componentes envolvidos e protecoes contra inconsistencia.
>
> Para decisoes arquiteturais por tras destes fluxos, consulte [decisions.md](decisions.md).

---

## 1. Checkout — criacao de pedido

### Objetivo

Criar um pedido a partir do carrinho do usuario autenticado, reservando estoque e aplicando cupom de desconto.

### Endpoint

```
POST /api/checkout
Auth: authenticateToken + validateCSRF
Middleware: validate(checkoutSchema) + recalcShipping
```

### Componentes

| Camada | Arquivo |
|--------|---------|
| Route | `routes/ecommerce/checkout.js` |
| Controller | `controllers/checkoutController.js` |
| Service | `services/checkoutService.js` |
| Repository | `repositories/checkoutRepository.js` |
| Middleware | `middleware/recalcShipping.js` |

### Pipeline (11 etapas)

```
0. Advisory lock (GET_LOCK) — serializa checkouts concorrentes do mesmo usuario
1. Atualiza dados do usuario (nome, telefone, cpf) — nao-bloqueante
2. Busca carrinho aberto — nao-bloqueante
3. Deduplicacao — detecta pedido identico nos ultimos 2 minutos
4. Cria registro do pedido (status pendente)
5. Trava produtos (SELECT ... FOR UPDATE) + busca promocoes ativas
6. Insere itens do pedido + debita estoque
7. Aplica cupom de desconto (opcional)
8. Persiste total final + dados de frete
9. Marca carrinho abandonado como recuperado — nao-bloqueante
10. COMMIT da transacao
11. Side effects pos-commit (notificacao + fechar carrinho) — fire-and-forget
```

### Protecoes contra inconsistencia

| Protecao | Mecanismo | Detalhe |
|----------|-----------|---------|
| Concorrencia | Advisory lock MySQL | `GET_LOCK('kavita_checkout_{userId}', 5)` — timeout de 5s |
| Deduplicacao | Composicao de produtos + cupom | Mesmos produtos + cupom nos ultimos 2 min = retorna pedido existente |
| Estoque | `SELECT ... FOR UPDATE` | Trava linhas de produto durante a transacao |
| Atomicidade | Transacao MySQL | Rollback automatico em caso de erro |
| Side effects | Fire-and-forget | Notificacao e fechamento de carrinho nao afetam o pedido |

### Request

```json
{
  "formaPagamento": "mercadopago",
  "endereco": {
    "cep": "12345678",
    "rua": "Rua das Flores",
    "numero": "100",
    "bairro": "Centro",
    "cidade": "Manhuacu",
    "estado": "MG"
  },
  "produtos": [
    { "id": 111, "quantidade": 1 }
  ],
  "cupom_codigo": "DESCONTO10"
}
```

Nota: `shipping_price`, `shipping_rule_applied`, `shipping_prazo_dias` e `shipping_cep` sao injetados pelo middleware `recalcShipping` — nao enviados pelo cliente.

### Response — pedido novo (201)

```json
{
  "ok": true,
  "data": {
    "pedido_id": 42,
    "total": 89.90,
    "total_sem_desconto": 99.90,
    "desconto_total": 10.00,
    "cupom_aplicado": "DESCONTO10",
    "nota_fiscal_aviso": "Nota fiscal sera entregue junto com o produto."
  },
  "message": "Pedido criado com sucesso"
}
```

### Response — pedido duplicado (200)

```json
{
  "ok": true,
  "data": {
    "pedido_id": 42,
    "nota_fiscal_aviso": "Nota fiscal sera entregue junto com o produto.",
    "idempotente": true
  },
  "message": "Pedido ja registrado."
}
```

### Erros esperados

| HTTP | Codigo | Causa |
|------|--------|-------|
| 400 | `VALIDATION_ERROR` | Schema Zod falhou, produto invalido, estoque insuficiente, cupom invalido |
| 401 | `AUTH_ERROR` | Usuario nao autenticado |
| 404 | `NOT_FOUND` | Produto nao encontrado |
| 409 | `VALIDATION_ERROR` | Advisory lock falhou (outro checkout em andamento) |

---

## 2. Inicializacao de pagamento (Mercado Pago)

### Objetivo

Criar uma preferencia de pagamento no Mercado Pago para um pedido existente.

### Endpoint

```
POST /api/payment/start
Auth: authenticateToken + validateCSRF
```

### Componentes

| Camada | Arquivo |
|--------|---------|
| Route | `routes/ecommerce/payment.js` |
| Controller | `controllers/paymentController.js` |
| Service | `services/paymentService.js` |
| Config | `config/mercadopago.js` |

### Fluxo

```
1. Controller extrai pedidoId do body
2. Service busca pedido e itens no banco
3. Service cria preferencia no MP com metadata.pedidoId
4. Retorna init_point (URL de pagamento) e preference_id
```

### Request

```json
{
  "pedidoId": 42
}
```

### Response (200)

```json
{
  "ok": true,
  "data": {
    "init_point": "https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=...",
    "preference_id": "123456789-abc"
  }
}
```

---

## 3. Webhook de pagamento (Mercado Pago)

### Objetivo

Receber notificacoes de pagamento do Mercado Pago e atualizar o status do pedido.

### Endpoint

```
POST /api/payment/webhook
Auth: validateMPSignature (HMAC-SHA256)
Sem CSRF (chamado pelo MP, nao pelo frontend)
```

### Componentes

| Camada | Arquivo |
|--------|---------|
| Route | `routes/ecommerce/payment.js` |
| Controller | `controllers/paymentController.js` |
| Middleware | `middleware/validateMPSignature.js` |
| Service | `services/paymentWebhookService.js` |
| Repository | `repositories/paymentRepository.js`, `repositories/orderRepository.js` |

### 3 camadas de protecao

```
Camada 1: Assinatura HMAC-SHA256
  - validateMPSignature valida o header x-signature
  - Usa crypto.timingSafeEqual() (resistente a timing attacks)
  - Sem MP_WEBHOOK_SECRET configurado → rejeita com 401 (fail-closed)

Camada 2: Idempotencia por event_id
  - Tabela webhook_events com UNIQUE(event_id) + FOR UPDATE
  - Evento ja processado → retorna "idempotent" sem reprocessar
  - Previne race conditions em webhooks duplicados

Camada 3: Validacao de status real via API
  - Busca status REAL do pagamento na API do MP (nao confia no body do webhook)
  - Guarda contra transicoes perigosas de status
```

### Mapeamento de status

| Status MP | Status interno |
|-----------|---------------|
| `approved` | `pago` |
| `rejected`, `cancelled` | `falhou` |
| `in_process`, `pending` | `pendente` |
| `charged_back`, `refunded` | `estornado` |

### Transicoes permitidas

```
pendente  → pago, falhou, estornado
falhou    → pago, pendente (retry)
pago      → estornado (chargeback/refund)
estornado → (estado final — nenhuma transicao)
```

### Comportamento de resposta HTTP

| Cenario | HTTP | Body | Motivo |
|---------|------|------|--------|
| Processado com sucesso | 200 | `{ ok: true }` | Confirma recebimento |
| Idempotente (ja processado) | 200 | `{ ok: true, idempotent: true }` | Evita reprocessamento |
| Evento ignorado (nao e pagamento) | 200 | `{ ok: true }` | Confirma recebimento |
| Erro transitorio (MP API fora) | 500 | `{ ok: false }` | MP retenta com backoff |
| Erro permanente (regra de negocio) | 200 | `{ ok: true }` | Evita retentativas infinitas |

O Mercado Pago interpreta respostas 4xx/5xx como falha e reenvia infinitamente. Por isso erros permanentes retornam 200.

---

## 4. Cancelamento e restauracao de estoque

### Cenarios de restauracao

O estoque pode ser restaurado por dois caminhos independentes, cada um com sua propria protecao:

#### Caminho 1: Cancelamento administrativo

```
Admin altera status_entrega → 'cancelado'
  ↓
orderService.updateDeliveryStatus()
  ↓
Transacao com FOR UPDATE no pedido
  ↓
Guard: status_entrega != 'cancelado' AND status_pagamento != 'falhou'
  ↓
orderRepository.restoreStock() — UPDATE sem guard SQL
  ↓
Commit
```

#### Caminho 2: Falha de pagamento (webhook)

```
Webhook MP → status 'rejected' ou 'cancelled'
  ↓
paymentWebhookService.handleWebhookEvent()
  ↓
Transacao com event_id idempotente
  ↓
orderRepository.restoreStockOnFailure() — UPDATE com guard SQL embutido
  ↓
Guard SQL: AND ped.status_pagamento <> 'falhou'
  ↓
Commit
```

### Protecao contra double-restore

| Cenario | Protecao |
|---------|----------|
| Dois webhooks com event_id diferentes | Guard SQL em `restoreStockOnFailure`: `AND status_pagamento <> 'falhou'` |
| Webhook + cancelamento admin | Guard no service: `status_pagamento !== 'falhou'` impede `restoreStock` se webhook ja processou |
| Dois cancelamentos admin | `FOR UPDATE` serializa; guard `status_entrega !== 'cancelado'` impede segundo restore |

### Estados de um pedido

```
status_pagamento: pendente → pago | falhou | estornado
status_entrega:   em_separacao → processando → enviado → entregue | cancelado
```

### Eventos de comunicacao

| Transicao | Evento disparado |
|-----------|-----------------|
| `status_pagamento` → `pago` | `pagamento_aprovado` (email + whatsapp) |
| `status_entrega` → `enviado` | `pedido_enviado` (email + whatsapp) |

Eventos sao fire-and-forget — falha na comunicacao nao afeta o pedido.

---

## 5. Preview de cupom

### Objetivo

Validar um cupom e calcular o desconto sem criar pedido. Endpoint read-only.

### Endpoint

```
POST /api/checkout/preview-cupom
Auth: authenticateToken + validateCSRF
```

### Request

```json
{
  "codigo": "DESCONTO10",
  "produtos": [
    { "id": 111, "quantidade": 1 }
  ]
}
```

### Response (200)

```json
{
  "ok": true,
  "data": {
    "desconto": 10.00,
    "total_original": 99.90,
    "total_com_desconto": 89.90,
    "cupom": { "codigo": "DESCONTO10", "tipo": "percentual", "valor": 10 }
  }
}
```

---

## 6. Autenticacao — login de usuario

### Endpoint

```
POST /api/login
Sem auth. Rate limited + account lockout.
```

### Fluxo

```
1. Valida email + senha
2. Verifica account lockout (Redis + in-memory fallback)
3. Busca usuario no banco por email
4. Compara senha com bcrypt
5. Gera JWT com { id, tokenVersion }
6. Define cookie auth_token (HttpOnly, maxAge alinhado ao JWT)
7. Retorna dados basicos do usuario
```

### Request

```json
{
  "email": "usuario@email.com",
  "senha": "minhasenha123"
}
```

### Response — sucesso (200)

```json
{
  "ok": true,
  "data": {
    "user": { "id": 1, "nome": "Joao", "email": "usuario@email.com" }
  },
  "message": "Login bem-sucedido!"
}
```

Cookie definido: `auth_token` (HttpOnly, secure em prod, sameSite strict em prod / lax em dev). Validade alinhada ao JWT (default 7d).

### Erros

| HTTP | Codigo | Causa |
|------|--------|-------|
| 401 | `AUTH_ERROR` | Credenciais invalidas |
| 429 | `AUTH_ERROR` | Conta bloqueada por tentativas |

---

## 7. Autenticacao — login admin (com MFA)

### Endpoint

```
POST /api/admin/login
POST /api/admin/login/mfa
Sem auth. Rate limited + account lockout.
```

### Fluxo sem MFA

```
1. Valida email + senha
2. Verifica account lockout
3. Busca admin por email + verifica senha bcrypt
4. Se admin NAO tem MFA ativo:
   - Gera JWT com { id, tokenVersion, role, permissions }
   - Define cookie adminToken (HttpOnly, maxAge 2h)
   - Retorna dados do admin com permissoes
```

### Fluxo com MFA

```
1-3. Igual ao fluxo sem MFA
4. Se admin TEM MFA ativo (mfa_active && mfa_secret):
   - Cria challenge com ID unico, IP-bound, expiracao
   - Retorna { mfaRequired: true, challengeId }
5. Frontend envia POST /api/admin/login/mfa com { challengeId, code }
6. Valida: challenge existe, nao expirou, IP confere
7. Valida codigo TOTP via speakeasy (window: 1)
8. Se valido: gera JWT + define cookie + retorna admin
```

### Request — login inicial

```json
{
  "email": "admin@kavita.com",
  "senha": "senhaadmin"
}
```

### Response — sem MFA (200)

```json
{
  "ok": true,
  "data": {
    "admin": {
      "id": 1,
      "email": "admin@kavita.com",
      "nome": "Admin",
      "role": "master",
      "role_id": 1,
      "permissions": ["pedidos.ver", "config.editar"]
    }
  },
  "message": "Login realizado com sucesso."
}
```

Cookie definido: `adminToken` (HttpOnly, secure em prod, sameSite lax, maxAge 2h).

### Response — MFA requerido (200)

```json
{
  "ok": true,
  "data": {
    "mfaRequired": true,
    "challengeId": "uuid-do-challenge"
  }
}
```

### Request — MFA step 2

```json
{
  "challengeId": "uuid-do-challenge",
  "code": "123456"
}
```

### Response — MFA validado (200)

Mesma resposta do login sem MFA (admin com permissoes + cookie).

### Erros

| HTTP | Codigo | Causa |
|------|--------|-------|
| 400 | `VALIDATION_ERROR` | Email/senha ausentes, challengeId/code ausentes |
| 401 | `AUTH_ERROR` | Credenciais invalidas, challenge invalido/expirado, codigo MFA errado |
| 429 | `AUTH_ERROR` | Conta bloqueada |

### Logout admin

```
POST /api/admin/logout
Auth: verifyAdmin
```

Incrementa `tokenVersion` no banco — invalida todos os tokens ativos imediatamente. Limpa cookie `adminToken`.

### Sessao e cookies

| Cookie | Contexto | HttpOnly | Validade | Revogacao |
|--------|----------|----------|----------|-----------|
| `auth_token` | Usuario | Sim | 7d (alinhado ao JWT) | tokenVersion no banco |
| `adminToken` | Admin | Sim | 2h | tokenVersion no banco |
| `csrf_token` | Ambos | Nao (JS legivel) | 2h | Renovar via GET /api/csrf-token |
