# Módulo Mercado do Café — arquitetura consolidada

Documento de referência do módulo **corretora de café** do Kavita, capturado ao fim das Fases 1–8 (2026-04-18) e atualizado com referência à Fase 10 (2026-04-21).

> **📍 Documento principal do módulo.** Para mapeamento técnico detalhado (rotas → controllers → services → repositories) ver [backend-mercado-cafe.md](./backend-mercado-cafe.md). Para estado pós-Fase 10 (KYC, contratos, LGPD 2.0, ticker), ver [../BACKEND_SECURITY_ALIGNMENT.md](../BACKEND_SECURITY_ALIGNMENT.md) e [roadmap-fase-10-entregue.md](./roadmap-fase-10-entregue.md).

> **Posicionamento:** Kavita é a plataforma vertical para corretoras de café do Brasil. Nascemos na Zona da Mata Mineira (praça piloto — ver [regionalizacao-manhuacu.md](./regionalizacao-manhuacu.md)) e estamos preparados para atender qualquer região produtora — Sul de Minas, Cerrado, Mogiana, Matas de Minas, Caparaó, Espírito Santo, Sul da Bahia e outras. Estratégia de expansão em [estrategia-regioes.md](./estrategia-regioes.md).

> Ao editar este documento, manter ordem: **conceito → contratos → operação**. Nunca descrever código por linha — descrever **decisões** e **limites**.

---

## 1. Visão geral

O módulo tem três camadas independentes mas amarradas:

| Camada | Rota raiz | Quem vê | Auth |
|---|---|---|---|
| **Público** | `/mercado-do-cafe/*` | produtor rural anônimo | sem auth (Turnstile anti-bot em endpoints de escrita) |
| **Painel da corretora** | `/painel/corretora/*` | equipe da corretora (RBAC 4 papéis) | cookie `corretoraToken` (HttpOnly, 2h) |
| **Admin Kavita** | `/admin/mercado-do-cafe/*` + `/admin/monetization/*` | admin Kavita | cookie `adminToken` + permissão `mercado_cafe_manage` |

Modelo comercial: marketplace B2B regional (Zona da Mata MG) + CRM leve SaaS por plano (FREE trial 3m → PRO/MAX via Asaas).

---

## 2. Permissões

### Admin Kavita
- **`mercado_cafe_manage`** — permissão obrigatória para `/admin/mercado-do-cafe/*` E `/admin/monetization/*` (Fase 1).

### Corretora (RBAC interno — `lib/corretoraPermissions.js`)

| Capacidade | owner | manager | sales | viewer |
|---|:-:|:-:|:-:|:-:|
| `leads.view` | ✓ | ✓ | ✓ | ✓ |
| `leads.update` | ✓ | ✓ | ✓ | ✗ |
| `leads.export` | ✓ | ✓ | ✗ | ✗ |
| `profile.edit` | ✓ | ✓ | ✗ | ✗ |
| `team.view` | ✓ | ✓ | ✗ | ✗ |
| `team.invite` | ✓ | ✗ | ✗ | ✗ |
| `team.remove` | ✓ | ✗ | ✗ | ✗ |
| `team.change_role` | ✓ | ✗ | ✗ | ✗ |

Capability de plano (enforce via `planService.requirePlanCapability`): `leads_export`, `regional_highlight`, `advanced_reports`, `max_users`.

---

## 3. Status de lead

Hoje o lead tem 4 status principais e um enum separado para amostra:

### `status` (enum em `corretora_leads`)
- `new` — recém-criado, ninguém respondeu
- `contacted` — corretora tocou no lead; gravou `first_response_at`
- `closed` — deal won (tipicamente com `preco_fechado` preenchido)
- `lost` — deal lost

### `amostra_status` (enum paralelo)
- `nao_entregue` (default), `prometida`, `recebida`, `laudada`

### Campos de proposta (Fase 3)
- `preco_proposto` (R$/saca), `preco_fechado`, `data_compra`, `destino_venda` (`mercado_interno|exportacao|cooperativa|revenda|outro`)

### Próxima ação (Fase 3)
- `next_action_text` (string curta), `next_action_at` (datetime)

### Recontact dedupe (Fase 2)
- `recontact_count`, `last_recontact_at` — incrementados quando o mesmo produtor (telefone_normalizado) contacta a mesma corretora em < 24h

---

## 4. Timeline do lead (`corretora_lead_events`)

Tabela dedicada com `event_type` VARCHAR (não enum — evolui sem migration). Eventos tipados hoje:

| event_type | Quando emite | actor_type |
|---|---|---|
| `lead_created` | form público cria lead | `system` |
| `status_changed` | status muda (exceto closed/lost) | `corretora_user` |
| `deal_won` | status → `closed` **ou** `preco_fechado` preenchido pela 1ª vez | `corretora_user` |
| `deal_lost` | status → `lost` | `corretora_user` |
| `note_added` | `POST /leads/:id/notes` | `corretora_user` |
| `proposal_sent` | `preco_proposto` preenchido pela 1ª vez | `corretora_user` |
| `proposal_updated` | update em proposta existente | `corretora_user` |
| `next_action_set` | PATCH `/next-action` | `corretora_user` |

`meta` é JSON livre — carrega contexto (from/to status, preços, note_id, preview do texto etc.).

---

## 5. Endpoints novos (Fases 1–8)

### Público
| Método | Rota | Fase |
|---|---|---|
| GET | `/api/public/corretoras?tipo_cafe=&perfil_compra=&featured=` | 5 (filtros profundos) |
| GET | `/api/public/corretoras/:slug/track-record` | 8 (histórico agregado anônimo) |

### Painel da corretora
| Método | Rota | Fase |
|---|---|---|
| GET | `/api/corretora/leads/:id` | 3 (detalhe + notes + events) |
| POST | `/api/corretora/leads/:id/notes` | 3 |
| DELETE | `/api/corretora/leads/:id/notes/:noteId` | 3 |
| PATCH | `/api/corretora/leads/:id/proposal` | 3 |
| PATCH | `/api/corretora/leads/:id/next-action` | 3 |
| GET | `/api/corretora/leads/risks` | 4 (overdue + stale + pipeline value) |
| PUT | `/api/corretora/profile/logo` | 4 (multipart, multer) |
| POST | `/api/corretora/plan/checkout` | 6 (Asaas feature-flagged) |

### Admin
| Método | Rota | Fase |
|---|---|---|
| GET | `/api/admin/monetization/plans/:id/broadcast-preview` | 1.2 |
| GET | `/api/admin/monetization/reconciliation/summary` | 6.3 |
| GET | `/api/admin/monetization/reconciliation/subscriptions` | 6.3 |
| GET | `/api/admin/monetization/reconciliation/webhook-events` | 6.3 |
| GET | `/api/admin/mercado-do-cafe/corretoras/:id/admin-notes` | 7.3 |
| POST | `/api/admin/mercado-do-cafe/corretoras/:id/admin-notes` | 7.3 |
| DELETE | `/api/admin/mercado-do-cafe/corretoras/:id/admin-notes/:noteId` | 7.3 |
| GET | `/api/admin/audit?scope=...` | 7.2 (scope agrupa prefixes) |

---

## 6. Migrations novas (rodar antes do deploy)

Entre 2026-04-18 foram criadas 7 migrations sequenciais:

| Arquivo | Descrição |
|---|---|
| `2026041800000004-add-regional-fields-to-corretora-leads` | campos regionais no lead público (amostra, laudo, bebida percebida, urgência, consent LGPD) |
| `2026041800000005-add-recontact-tracking-to-corretora-leads` | `recontact_count`, `last_recontact_at` |
| `2026041800000006-create-corretora-lead-notes` | tabela de notas datadas do lead |
| `2026041800000007-create-corretora-lead-events` | tabela da timeline |
| `2026041800000008-add-proposal-fields-to-corretora-leads` | `preco_proposto/fechado/data_compra/destino_venda/next_action_*` + index |
| `2026041800000009-create-corretora-admin-notes` | notas internas admin Kavita (separadas das notas do lead) |
| `2026041800000010-add-regional-fields-to-corretoras` | `endereco_textual`, `compra_cafe_especial`, `volume_minimo_sacas`, `faz_retirada_amostra`, `trabalha_exportacao`, `trabalha_cooperativas` |

**Deploy:** `cd kavita-backend && npm run db:migrate`.

---

## 7. Fluxos

### 7.1 Fluxo do produtor (público)
1. Chega em `/mercado-do-cafe` → listagem filtrável por tipo_cafe, perfil_compra, destaque, cidade (Fase 5)
2. Abre `/mercado-do-cafe/corretoras/[slug]` — vê badge **Verificada por Kavita**, endereço + Google Maps (Fase 8), chips de operação (Fase 8), "Como funciona" em 5 etapas (Fase 5), track record agregado quando há lotes fechados (Fase 8)
3. Preenche `LeadContactForm` com Turnstile + honeypot (Fase 2) + consent LGPD
4. Backend aplica **dedupe 24h** (Fase 2): se mesmo telefone_normalizado já contactou, reaproveita lead existente + notifica corretora ("produtor voltou a chamar")
5. Produtor recebe e-mail com link HMAC `/lead-status/:id/:token` e opcionalmente `/lote-vendido/:id/:token`
6. Pode deixar review que passa por moderação (feedback inline emerald pós-submit — Fase 5)

### 7.2 Fluxo da corretora (painel)
1. Login → dashboard `PanelClient.tsx` com KPIs + MarketStrip + bloco **Operação agora** (Fase 4): pipeline em negociação, fechadas no mês, leads parados +48h, próximas ações vencidas
2. `/leads` — lista filtrável por status/amostra/bebida + preset urgência + score de prioridade
3. `/leads/[id]` (Fase 3) — detalhe completo:
   - Cabeçalho com score + quick actions (WhatsApp com template, copy telefone, mudar status)
   - Dados do lote
   - **Análise do café** (Fase 8) — bebida, SCA, peneira, umidade, defeitos, mercado, aptidão
   - Proposta e compra — preço proposto/fechado, data, destino
   - Próxima ação com datetime
   - Notas datadas
   - Timeline tipada lateral
4. `/perfil` — edita canais, regionais (cidades atendidas, tipos de café, perfil comercial, **endereço textual**, volume mínimo, café especial, retirada de amostra, exportação, cooperativas — Fase 8), **upload de logo** (Fase 4)
5. `/planos` — **Assinar via Asaas** (Fase 6): `POST /checkout` gera cobrança, abre link em nova aba; webhook atualiza status depois

### 7.3 Fluxo do admin Kavita
1. `/admin/mercado-do-cafe` — tabs Regional · Corretoras · Solicitações · Avaliações · Planos
2. Aprovação de submissão cria corretora + user pendente + plano FREE trial 3m + e-mail de boas-vindas
3. **Rejeição envia e-mail editorial** com motivo (Fase 1.4 / pré-existente confirmado)
4. Corretora individual (`/admin/mercado-do-cafe/corretora/[id]`) — Subscription, **Notas internas admin** (Fase 7.3, privadas por categoria), perfil, SLA
5. **Reconciliação Asaas** (`/admin/mercado-do-cafe/reconciliacao`, Fase 6.3) — KPIs webhook, tabela de subscriptions filtrável, eventos com erro
6. **Auditoria** (`/admin/auditoria`) — filtro de **escopo** (Fase 7.2) + `before/after` nos updates importantes

### 7.4 Fluxo Asaas (pagamento)
1. Corretora clica "Assinar agora" em `/planos`
2. Frontend chama `POST /api/corretora/plan/checkout`
3. Backend (controller `createCheckout`) valida plano is_public/is_active + email no perfil
4. Se `paymentService.isGatewayActive()` == false (dev/sandbox sem credenciais), retorna `gateway_available: false` — frontend cai no fluxo manual (`POST /plan/upgrade`)
5. Se ativo, chama `createCheckoutForCorretora` → adapter Asaas `upsertCustomer` + `createSubscription` → retorna `checkout_url`
6. Atualiza subscription local com `provider`, `provider_subscription_id`, `provider_status='pending_checkout'`
7. Frontend abre `checkout_url` em nova aba
8. Asaas envia webhook → `paymentService.ingestWebhook` valida assinatura + registra em `webhook_events` (INSERT IGNORE por `provider_event_id`) → handler de domínio aplica transição (activate/past_due/cancel)
9. Admin vê em `/admin/mercado-do-cafe/reconciliacao` — eventos com erro ficam visíveis com mensagem

### 7.5 Governança de destaque regional
- Cap global `MAX_FEATURED_CORRETORAS` (env, default 5)
- Antes de ligar destaque, **valida capability `regional_highlight` do plano ativo** da corretora (Fase 1.3) — FREE não pode, PRO/MAX podem
- Desligar destaque nunca é bloqueado (idempotente)
- Arquivar e inativar limpam destaque automaticamente

### 7.6 Broadcast de capabilities de plano (Fase 5.4 + Fase 1.2)
- Admin edita plano e **opcionalmente** marca "Aplicar a assinaturas ativas"
- Fase 1.2 adiciona **preview obrigatório**: `GET /plans/:id/broadcast-preview` → modal com lista de corretoras afetadas + divergência de snapshot
- Só depois de confirmar é que `broadcastCapabilitiesFromPlan` sobrescreve `capabilities_snapshot` em todas as subs ativas do plano
- Auditado como `plan.capabilities_broadcast` com `affected_subscriptions` + `before/after`

---

## 8. Testes unitários (88+ cobertos)

Suítes relevantes:
- `test/unit/services/corretorasService.unit.test.js` (28 tests) — approval/rejection + **toggleFeatured com regional_highlight** (Fase 9.1)
- `test/unit/services/corretoraLeadsService.unit.test.js` (11 tests, Fase 9.1) — dedupe 24h, detalhe tenant-scoped, notas
- `test/unit/services/adminAuditService.unit.test.js` (7 tests, Fase 9.1) — diffFields
- `test/unit/services/planService.unit.test.js` — broadcast preview + assign
- `test/unit/services/corretoraPaymentService.unit.test.js` — adapter Asaas + ingestWebhook idempotência

---

## 9. Limites conhecidos (honestidade técnica)

- **`diffFields` não-canônico**: JSON.stringify com ordem de chaves instável pode dar falso-positivo. Em prática usamos sempre o mesmo reader (repo), então a ordem é estável.
- **Track record com midpoint estimado**: soma de sacas é heurística (ate_50→35, 50_200→125, etc.). Aceitável como prova social; não é dado fiscal.
- **Reconciliação sem paginação**: limite hard 100 eventos. Para MRR maior, adicionar offset/limit.
- **Sem retry manual de webhook_event com erro**: depende do cron de reprocessamento.
- **Sem persistência do checkout_url**: se a corretora fechar a aba, perde o link. Futuro: guardar última URL em `meta`.
- **Permissão `mercado_cafe_manage` na `/admin/monetization`**: aplicada (Fase 1.1) mas sem granularidade fina (qualquer admin com a permissão pode tudo).
- **SLA público com `n>=30`** (Fase 5): corretoras novas não exibem SLA até acumular amostra confiável.

---

## 10. Próximas frentes sugeridas

- Retry manual de webhook_event com erro na reconciliação admin
- Persistir `checkout_url` na subscription (retomada pós-fechamento de aba)
- Granularidade em `mercado_cafe_manage` (split por ação: approve vs moderate vs plan)
- Kanban em `/leads` com drag-drop
- Backfill regional — dashboard admin que mostra quantas corretoras ainda não preencheram os 6 novos campos regionais
- Dashboard widget "leads em risco" no painel da corretora (derivado de `/risks`) como bloco destacado

---

_Última revisão: 2026-04-18, ao fim da Fase 8._
