# Tabelas — Mercado do Café

Referência das tabelas MySQL usadas pelo módulo Mercado do Café.
DDL simplificado (colunas principais). Para o schema exato, consulte as
migrations em `migrations/2026041400000001..10_*.js`.

---

## `corretoras`
Entidade pública. Um registro por corretora cadastrada.

| Coluna | Tipo | Obs |
|---|---|---|
| `id` | INT PK | |
| `slug` | VARCHAR(120) UNIQUE | URL pública |
| `nome` | VARCHAR(160) | |
| `cidade` | VARCHAR(80) | Cidade sede |
| `cidades_atendidas` | JSON | Array de cidades atendidas |
| `tipos_cafe` | JSON | Array: natural, cereja_descascado, cereja_natural, verde |
| `perfil_compra` | TEXT | "Compramos commodity + especial..." |
| `horario` | JSON | `{ seg: "8-18", sab: "8-12", dom: null }` |
| `anos_atuacao` | SMALLINT | |
| `foto_responsavel_path` | VARCHAR(255) | `/uploads/corretoras/...` |
| `corrego_localidade` | VARCHAR(160) | Opcional — córrego específico |
| `safra_tipo` | VARCHAR(40) | nova/velha/ambas |
| `amostra_status` | VARCHAR(40) | `accepts_by_mail`, `in_person_only`, etc |
| `lote_disponivel` | TINYINT(1) | Flag "tem lote pra amostra agora" |
| `status` | ENUM | `pending`, `approved`, `rejected`, `suspended` |
| `featured` | TINYINT(1) | Destaque global |
| `created_at` / `updated_at` | TIMESTAMP | |

---

## `corretora_users`
Contas de login. N por corretora.

| Coluna | Tipo | Obs |
|---|---|---|
| `id` | INT PK | |
| `corretora_id` | INT FK | |
| `email` | VARCHAR(180) UNIQUE | |
| `password_hash` | VARCHAR(255) | bcrypt |
| `nome` | VARCHAR(160) | |
| `role` | ENUM | `owner`, `manager`, `sales`, `viewer` |
| `is_active` | TINYINT(1) | |
| `email_verified_at` | DATETIME NULL | |
| `token_version` | INT | Invalida JWTs quando incrementado |
| `last_login_at` | DATETIME NULL | |

---

## `corretora_leads`
Leads enviados por produtores.

| Coluna | Tipo | Obs |
|---|---|---|
| `id` | INT PK | |
| `corretora_id` | INT FK | |
| `producer_account_id` | INT NULL | Vincula se produtor já logado |
| `nome` | VARCHAR(160) | |
| `telefone` | VARCHAR(40) | Cru do form |
| `telefone_normalizado` | VARCHAR(20) | Chave p/ broadcast (55 + digits) |
| `cidade` | VARCHAR(80) | |
| `objetivo` | ENUM | `vender`, `cotacao`, `conhecer` |
| `tipo_cafe` | VARCHAR(40) | |
| `volume_range` | VARCHAR(30) | `0-50`, `50-200`, `200-500`, `500+` |
| `canal_preferido` | ENUM | `whatsapp`, `telefone`, `email` |
| `mensagem` | TEXT | |
| `status` | ENUM | `new`, `contacted`, `negotiating`, `won`, `lost`, `sold_elsewhere` |
| `first_response_at` | DATETIME NULL | Grava na 1ª saída de `new` |
| `first_response_seconds` | INT NULL | Diferença em s |
| `ip` | VARCHAR(45) | |
| `created_at` | TIMESTAMP | |

Índices: `(corretora_id, status, created_at)`, `(telefone_normalizado, created_at)`.

---

## `corretora_lead_events`
Histórico de mudança de status.

| Coluna | Tipo |
|---|---|
| `id` | INT PK |
| `lead_id` | INT FK |
| `actor_user_id` | INT NULL FK `corretora_users` |
| `from_status` | VARCHAR(30) |
| `to_status` | VARCHAR(30) |
| `note` | TEXT |
| `created_at` | TIMESTAMP |

---

## `corretora_reviews`
Avaliações pós-contato.

| Coluna | Tipo | Obs |
|---|---|---|
| `id` | INT PK | |
| `corretora_id` | INT FK | |
| `producer_account_id` | INT NULL | |
| `lead_id` | INT NULL | Vincula ao lead que gerou |
| `rating` | TINYINT | 1-5 |
| `comentario` | TEXT | |
| `status` | ENUM | `pending`, `approved`, `rejected` |
| `moderated_by` | INT NULL | admin_id |
| `moderated_at` | DATETIME NULL | |
| `created_at` | TIMESTAMP | |

---

## `corretora_notifications`
Sino in-panel por corretora.

| Coluna | Tipo |
|---|---|
| `id` | INT PK |
| `corretora_id` | INT FK |
| `type` | VARCHAR(40) — `lead.new`, `lead.sold_elsewhere`, `review.new`, etc |
| `title` | VARCHAR(200) |
| `body` | TEXT |
| `meta` | JSON |
| `created_at` | TIMESTAMP |

## `corretora_notification_reads`
Read receipts por user (N corretora_users × N notifications).

| Coluna | Tipo |
|---|---|
| `notification_id` | INT FK |
| `user_id` | INT FK `corretora_users` |
| `read_at` | DATETIME |

PK composta `(notification_id, user_id)`.

---

## `plans`
Catálogo de planos.

| Coluna | Tipo | Obs |
|---|---|---|
| `id` | INT PK | |
| `slug` | VARCHAR(40) UNIQUE | `free`, `pro`, `premium` |
| `nome` | VARCHAR(80) | |
| `price_cents` | INT | |
| `capabilities` | JSON | `{ leads_export: true, max_users: 5, featured_slots: 1 }` |
| `is_active` | TINYINT(1) | |

Seed inicial: Free, Pro, Premium.

## `corretora_subscriptions`
Assinatura ativa por corretora (1-para-1 lógico).

| Coluna | Tipo | Obs |
|---|---|---|
| `id` | INT PK | |
| `corretora_id` | INT FK | |
| `plan_id` | INT FK | |
| `status` | ENUM | `active`, `past_due`, `canceled` |
| `provider` | VARCHAR(30) NULL | `mercadopago`, futuro |
| `provider_subscription_id` | VARCHAR(120) NULL | |
| `provider_status` | VARCHAR(40) NULL | |
| `current_period_end_at` | DATETIME NULL | |
| `created_at` / `updated_at` | TIMESTAMP | |

## `corretora_city_promotions`
Destaques regionais pagos.

| Coluna | Tipo |
|---|---|
| `id` | INT PK |
| `corretora_id` | INT FK |
| `cidade` | VARCHAR(80) |
| `starts_at` | DATETIME |
| `ends_at` | DATETIME |
| `slot` | TINYINT — ordem do destaque |

---

## `producer_accounts`
Conta passwordless do produtor.

| Coluna | Tipo | Obs |
|---|---|---|
| `id` | INT PK | |
| `email` | VARCHAR(180) UNIQUE | |
| `nome` | VARCHAR(160) NULL | |
| `cidade` | VARCHAR(80) NULL | |
| `telefone` | VARCHAR(40) NULL | Preenchido no perfil |
| `telefone_normalizado` | VARCHAR(20) NULL | Chave p/ histórico retroativo |
| `is_active` | TINYINT(1) | |
| `token_version` | INT | |
| `last_login_at` | DATETIME NULL | |

## `producer_favorites`
| Coluna | Tipo |
|---|---|
| `producer_account_id` | INT FK |
| `corretora_id` | INT FK |
| `created_at` | TIMESTAMP |

PK composta `(producer_account_id, corretora_id)`.

## `producer_alert_subscriptions`
| Coluna | Tipo |
|---|---|
| `id` | INT PK |
| `producer_account_id` | INT FK |
| `cidade` | VARCHAR(80) NULL |
| `tipo_cafe` | VARCHAR(40) NULL |
| `is_active` | TINYINT(1) |

---

## `password_reset_tokens` (reutilizada)
Tabela pré-existente estendida via ALTER para permitir scope livre.

| Coluna | Tipo | Obs |
|---|---|---|
| `id` | INT PK | |
| `user_id` | INT | `corretora_users` OU `producer_accounts` conforme scope |
| `token_hash` | CHAR(64) | SHA-256 |
| `scope` | VARCHAR(40) | `password_reset`, `corretora_invite`, `producer_magic` |
| `expires_at` | DATETIME | |
| `used_at` | DATETIME NULL | |
| `created_at` | TIMESTAMP | |

---

## `admin_audit_logs`
Ações sensíveis do admin.

| Coluna | Tipo | Obs |
|---|---|---|
| `id` | BIGINT PK | |
| `admin_id` | INT NULL | FK `admins` (NULL se deletado) |
| `admin_nome` | VARCHAR(160) | Snapshot — sobrevive a deleção |
| `action` | VARCHAR(60) | `corretora.approved`, `plan.assigned`, etc |
| `target_type` | VARCHAR(40) NULL | `corretora`, `review`, `plan` |
| `target_id` | INT NULL | |
| `meta` | JSON NULL | Livre — antes/depois, motivo, etc |
| `ip` | VARCHAR(45) NULL | |
| `created_at` | TIMESTAMP | |

Índices: `(action, created_at)`, `(target_type, target_id)`, `(admin_id, created_at)`.
