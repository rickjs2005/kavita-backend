# Endpoints — Mercado do Café

Referência completa dos endpoints HTTP do módulo.
Todas as respostas seguem o contrato `lib/response.js`:

```
Sucesso → { ok: true, data?, message?, meta? }
Erro    → { ok: false, code, message, details? }
```

---

## 1. Público — sem auth

### Corretoras
| Método | Rota | Descrição | Middleware |
|---|---|---|---|
| GET | `/api/public/corretoras` | Lista paginada. Query: `cidade`, `tipo_cafe`, `featured`, `page`, `limit`, `q` | — |
| GET | `/api/public/corretoras/:slug` | Detalhe + reviews aprovadas + horário | — |
| POST | `/api/public/corretoras/:slug/leads` | Cria lead qualificado | Turnstile + `leadsRateLimiter` |
| POST | `/api/public/corretoras/:slug/reviews` | Cria review (entra pending) | `leadsRateLimiter` |
| POST | `/api/public/corretoras/lote-vendido/:token` | Broadcast "vendi lote" | HMAC no path |

**Body POST /leads**:
```json
{
  "nome": "string",
  "telefone": "string",
  "cidade": "string",
  "objetivo": "vender | cotacao | conhecer",
  "tipo_cafe": "natural | cereja_descascado | cereja_natural | verde",
  "volume_range": "0-50 | 50-200 | 200-500 | 500+",
  "canal_preferido": "whatsapp | telefone | email",
  "mensagem": "string opcional",
  "turnstile_token": "string"
}
```

### Produtor — Auth
| Método | Rota | Descrição |
|---|---|---|
| POST | `/api/public/produtor/magic-link` | `{ email }` — envia link |
| POST | `/api/public/produtor/consume-token` | `{ token }` — emite JWT cookie `producerToken` |
| POST | `/api/public/produtor/logout` | Limpa cookie |

### Produtor logado (`verifyProducer`)
| Método | Rota | Descrição |
|---|---|---|
| GET | `/api/public/produtor/me` | Dados + histórico (match por `telefone_normalizado`) |
| PATCH | `/api/public/produtor/me` | Atualiza `nome`, `cidade`, `telefone` |
| GET | `/api/public/produtor/me/favorites` | Lista |
| POST | `/api/public/produtor/me/favorites` | `{ corretora_id }` |
| DELETE | `/api/public/produtor/me/favorites/:corretoraId` | |
| GET | `/api/public/produtor/me/alerts` | |
| POST | `/api/public/produtor/me/alerts` | `{ cidade?, tipo_cafe? }` |
| DELETE | `/api/public/produtor/me/alerts/:id` | |

---

## 2. Corretora logada (`verifyCorretora + validateCSRF`)

### Auth
| Método | Rota | Descrição |
|---|---|---|
| POST | `/api/corretora/auth/register` | Self-service cadastro + email verify |
| POST | `/api/corretora/auth/login` | Emite `authToken` (7d) |
| POST | `/api/corretora/auth/logout` | |
| POST | `/api/corretora/auth/verify-email` | `{ token }` |
| GET | `/api/corretora/auth/me` | User atual + role + plano |

### Perfil
| Método | Rota | Capability |
|---|---|---|
| GET | `/api/corretora/me` | — |
| PATCH | `/api/corretora/me` | `profile.edit` |
| POST | `/api/corretora/me/foto` | `profile.edit` (multer 1 arquivo) |

### Leads
| Método | Rota | Capability |
|---|---|---|
| GET | `/api/corretora/leads?status=&q=&page=` | `leads.view` |
| GET | `/api/corretora/leads/:id` | `leads.view` |
| PATCH | `/api/corretora/leads/:id/status` | `leads.manage` |
| GET | `/api/corretora/leads/export.csv` | `leads.view` + plan `leads_export` |

### Equipe
| Método | Rota | Capability |
|---|---|---|
| GET | `/api/corretora/team` | `team.view` |
| POST | `/api/corretora/team` | `team.manage` + `enforceUserLimit` |
| PATCH | `/api/corretora/team/:id/role` | `team.manage` (guard último owner) |
| DELETE | `/api/corretora/team/:id` | `team.manage` (guard último owner) |

### Reviews
| Método | Rota | Capability |
|---|---|---|
| GET | `/api/corretora/reviews` | `reviews.view` |

### Notificações
| Método | Rota | Descrição |
|---|---|---|
| GET | `/api/corretora/notifications` | Lista + unread count |
| PATCH | `/api/corretora/notifications/:id/read` | |
| PATCH | `/api/corretora/notifications/read-all` | |

### Assinatura
| Método | Rota | Descrição |
|---|---|---|
| GET | `/api/corretora/subscription` | Plano atual + capabilities + usage |

---

## 3. Admin (`verifyAdmin + validateCSRF`)

### Corretoras
| Método | Rota | Audit action |
|---|---|---|
| GET | `/api/admin/mercado-do-cafe/corretoras?status=&q=` | — |
| GET | `/api/admin/mercado-do-cafe/corretoras/:id` | — |
| PATCH | `/api/admin/mercado-do-cafe/corretoras/:id/approve` | `corretora.approved` |
| PATCH | `/api/admin/mercado-do-cafe/corretoras/:id/reject` | `corretora.rejected` |
| PATCH | `/api/admin/mercado-do-cafe/corretoras/:id/status` | `corretora.status_changed` |
| PATCH | `/api/admin/mercado-do-cafe/corretoras/:id/feature` | `corretora.featured_changed` |

### Reviews
| Método | Rota | Audit |
|---|---|---|
| GET | `/api/admin/mercado-do-cafe/reviews?status=` | — |
| PATCH | `/api/admin/mercado-do-cafe/reviews/:id` | `review.moderated` |

### Monetização
| Método | Rota | Audit |
|---|---|---|
| GET | `/api/admin/monetization/plans` | — |
| POST | `/api/admin/monetization/plans` | — |
| PATCH | `/api/admin/monetization/plans/:id` | — |
| POST | `/api/admin/monetization/assign` | `plan.assigned` |

### Audit
| Método | Rota | Descrição |
|---|---|---|
| GET | `/api/admin/audit?action=&target_type=&page=&limit=` | Lista eventos |

---

## 4. Códigos de erro mais comuns

Todos definidos em `constants/ErrorCodes.js`. Exemplos relevantes:

| Code | HTTP | Quando |
|---|---|---|
| `VALIDATION_ERROR` | 400 | Zod / regra simples |
| `UNAUTHORIZED` | 401 | JWT ausente/inválido |
| `FORBIDDEN` | 403 | Capability/plano insuficiente |
| `NOT_FOUND` | 404 | Slug/ID inexistente |
| `RATE_LIMITED` | 429 | Rate limiter |
| `CAPTCHA_FAILED` | 400 | Turnstile rejeitou |
| `PLAN_LIMIT_REACHED` | 403 | Tentou passar do `max_users` ou usar feature de plano superior |
| `LAST_OWNER_PROTECTED` | 409 | Guard de remover último owner |
