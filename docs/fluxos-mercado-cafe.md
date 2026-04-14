# Fluxos — Mercado do Café

Como frontend e backend conversam em cada cenário real do marketplace.
Documento focado em integração ponta-a-ponta.

---

## 1. Produtor envia lead para corretora

### Técnico
1. **Frontend** (`src/app/mercado-do-cafe/[slug]/LeadFormClient.tsx`)
   - Usa `react-hook-form` com Zod resolver.
   - Renderiza Turnstile (Cloudflare) invisível.
   - `POST /api/public/corretoras/:slug/leads` via `apiClient` com
     `{ nome, telefone, cidade, objetivo, tipo_cafe, volume_range, canal_preferido, mensagem, turnstile_token }`.
2. **Backend**
   - Rota: `routes/public/corretorasPublic.js` com `leadsRateLimiter`.
   - Valida Zod (`schemas/corretoraLeadsSchemas.js`).
   - `corretoraLeadsService.create`:
     - Valida Turnstile (fetch ao Cloudflare).
     - Busca corretora por slug.
     - Normaliza telefone.
     - `INSERT` em `corretora_leads` (status `new`).
     - Fire-and-forget: `corretoraNotificationsService.notifyNewLead`.
3. **Frontend** recebe `201` e exibe tela de sucesso com CTA para magic link
   ("Quer acompanhar este lead? Digite seu email.").

### Na prática
O produtor preenche um form curto e direcionado (não "fale conosco"). O
Turnstile bloqueia bots invisivelmente. A corretora recebe uma notificação
no sino em até 60s (polling). Se ainda não tem conta de produtor, é
convidado a criar via magic link para acompanhar.

---

## 2. Produtor cria conta (magic link)

### Técnico
1. **Frontend** (`src/app/produtor/entrar/page.tsx`): form com email.
   - `POST /api/public/produtor/magic-link { email }`.
2. **Backend** (`services/producerAuthService.js`):
   - `producerRepo.findByEmail` — se não existe, cria conta.
   - `tokenService.revokeAllForUser(user.id, "producer_magic")`.
   - Gera token novo, grava em `password_reset_tokens` (TTL 30min, scope `producer_magic`).
   - Fire-and-forget: envia email com link `APP_URL/produtor/entrar?token=...`.
   - Retorna `{ sent: true }` (sempre, mesmo se email existe — anti enumeration).
3. **Produtor clica no link** → `/produtor/entrar?token=XYZ`.
4. **Frontend** detecta `?token=` na URL e chama
   `POST /api/public/produtor/consume-token { token }`.
5. **Backend**:
   - `findValidToken(token, "producer_magic")`.
   - Revoga token (uso único).
   - `touchLastLogin`.
   - Emite JWT 30d em cookie HttpOnly `producerToken`.
   - No primeiro login (`!last_login_at` antes do touch), dispara welcome email.
6. **Frontend** redireciona para `/painel/produtor`.

### Na prática
Zero senha. O produtor só precisa do email. O link vale 30 minutos e funciona
uma vez. Na primeira entrada, recebe um welcome email com o que ele pode
fazer (favoritar, ver histórico, navegar por cidade).

---

## 3. Corretora gerencia leads

### Técnico
1. **Frontend** (`src/app/painel/corretora/PanelClient.tsx`):
   - Carrega `GET /api/corretora/leads?status=new&q=&page=1`.
   - Mostra cards com badge de SLA (cor por tempo).
   - Para mudar status: `PATCH /api/corretora/leads/:id/status { status, note }`.
2. **Backend**:
   - `requireCapability("leads.manage")` — rejeita role `viewer`.
   - `corretoraLeadsService.changeStatus`:
     - Se transição é `new → qualquer`, grava `first_response_at` + `first_response_seconds`.
     - Insere evento em `corretora_lead_events`.
     - Fire-and-forget: notifica owner se sales alterou.

### Na prática
A corretora vê o inbox ordenado por urgência. Ao clicar "Contatar" no
primeiro lead, o SLA é congelado e entra nas métricas. O sales da equipe
pode atualizar status sem poder convidar novas pessoas ou mexer no perfil.

---

## 4. Corretora convida novo membro

### Técnico
1. **Frontend** (`src/app/painel/corretora/equipe/EquipeClient.tsx`):
   - Form: email + role.
   - `POST /api/corretora/team { email, role }`.
2. **Backend**:
   - `requireCapability("team.manage")`.
   - `enforceUserLimit` (middleware que usa `planService.getPlanContext`):
     rejeita se já atingiu `capabilities.max_users`.
   - `corretoraTeamService.invite`:
     - Cria `corretora_users` pendente.
     - Envia email de convite com token.
3. **Remover membro**:
   - `DELETE /api/corretora/team/:id` via `apiClient.request(url, { method: "DELETE" })`.
   - Guard no service: não permite remover o último owner.

### Na prática
A corretora só pode ter tantos usuários quanto o plano permite. Rebaixar o
último owner é rejeitado — garantia de que sempre existe alguém com controle total.

---

## 5. Admin aprova corretora e atribui plano

### Técnico
1. **Frontend** (`src/app/admin/mercado-do-cafe/AdminCorretorasClient.tsx`):
   - Lista corretoras com filtro de status.
   - Ações: aprovar, rejeitar, destacar.
2. **Backend**:
   - `PATCH /api/admin/mercado-do-cafe/corretoras/:id/approve`.
   - Atualiza status + `adminAuditService.record({ action: "corretora.approved", ... })`.
3. **Atribuir plano**:
   - `POST /api/admin/monetization/assign { corretoraId, planId, periodEndAt }`.
   - `planService.assignPlan` cria/atualiza `corretora_subscriptions`.
   - Audit log: `plan.assigned`.

### Na prática
Toda ação do admin que afeta corretoras, reviews ou planos é registrada
com snapshot do nome do admin + meta em JSON. A página
`/admin/auditoria` mostra o histórico filtrável.

---

## 6. Broadcast "lote vendido"

### Técnico
1. Email enviado ao produtor ao receber lead inclui botão "Já vendi este lote".
2. Link: `APP_URL/lote-vendido/:token` onde token é HMAC-SHA256 determinístico
   do `(leadId, telefone_normalizado, JWT_SECRET)`.
3. **Frontend** (`/lote-vendido/[token]/page.tsx`) chama
   `POST /api/public/corretoras/lote-vendido/:token`.
4. **Backend** (`corretoraLeadsService.markSold`):
   - Verifica HMAC com `timingSafeEqual`.
   - Busca todos os leads com mesmo `telefone_normalizado` nos últimos 45 dias.
   - Para cada corretora distinta, cria `corretora_notification`
     do tipo `lead.sold_elsewhere` com meta.

### Na prática
Sem login, sem CSRF (protegido pelo HMAC). Em um clique, o produtor avisa
o ecossistema que já fechou negócio — as outras corretoras param de cobrar
follow-up daquele telefone.

---

## 7. Admin modera review

### Técnico
1. Review chega via `POST /api/public/corretoras/:slug/reviews` com status `pending`.
2. **Frontend admin** (`/admin/mercado-do-cafe/reviews`):
   - `PATCH /api/admin/mercado-do-cafe/reviews/:id { status: "approved" | "rejected" }`.
3. **Backend**: `corretoraReviewsService.moderateReview`:
   - Atualiza status.
   - Audit log: `review.moderated` com meta `{ before, after }`.
   - Se aprovada, passa a aparecer no público.

### Na prática
Nenhuma review chega ao público sem o olhar do admin. O histórico de
moderação (quem aprovou/rejeitou o quê) fica em `admin_audit_logs`.

---

## Integrações resumidas FE↔BE

| Fluxo | FE origem | BE destino | Auth |
|---|---|---|---|
| Listar corretoras | `/mercado-do-cafe` | `GET /api/public/corretoras` | — |
| Detalhe + reviews | `/mercado-do-cafe/[slug]` | `GET /api/public/corretoras/:slug` | — |
| Enviar lead | `LeadFormClient` | `POST /api/public/corretoras/:slug/leads` | Turnstile + rate limit |
| Magic link | `/produtor/entrar` | `POST /api/public/produtor/magic-link` | — |
| Consumir token | `/produtor/entrar?token=` | `POST /api/public/produtor/consume-token` | token único |
| Painel produtor | `/painel/produtor` | `GET /api/public/produtor/me` | `producerToken` |
| Inbox corretora | `/painel/corretora` | `GET /api/corretora/leads` | `authToken` + capability |
| Mudar status | idem | `PATCH /api/corretora/leads/:id/status` | + `leads.manage` |
| Exportar CSV | idem | `GET /api/corretora/leads/export.csv` | + plano `leads_export` |
| Equipe | `/painel/corretora/equipe` | `/api/corretora/team` | + `team.manage` |
| Notificações | sino | `GET /api/corretora/notifications` (polling 60s) | `authToken` |
| Aprovar corretora | `/admin/mercado-do-cafe` | `PATCH .../:id/approve` | `adminToken` |
| Atribuir plano | `/admin/monetizacao` | `POST /api/admin/monetization/assign` | `adminToken` |
| Audit | `/admin/auditoria` | `GET /api/admin/audit` | `adminToken` |
