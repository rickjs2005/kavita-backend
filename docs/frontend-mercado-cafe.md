# Frontend · Mercado do Café

> Documentação do frontend do módulo Mercado do Café. Estado real em
> 2026-04-14, pós Sprints 1-7 + Lotes 1-4 (retenção, monetização,
> governança, polimento). Sem especulação — tudo aqui está no código.

---

## 1. Visão geral

**Stack:** Next.js 15 (App Router) · React 19 · TypeScript · Tailwind v4 · react-hook-form · react-hot-toast · Recharts.

**Papel:** UI do ecossistema Kavita Mercado do Café. Três públicos distintos, três experiências distintas:
- Produtor rural e visitante (dark committed com amber como acento)
- Corretora logada (light warm com amber — "Sala Reservada")
- Admin Kavita (dark operacional — mesmo shell dos outros módulos)

**Organização arquitetural:** RSC para páginas públicas estáticas (SEO + cache ISR) + Client Components onde há interação. Todo fetch usa `apiClient` (wrapper fetch com cookies HttpOnly + CSRF automático). Server-only data fetchers isolam responsabilidades em `src/server/data/`.

**Como isso funciona na prática:** quando o produtor entra em `/mercado-do-cafe/corretoras`, a página é servida pelo servidor Next.js que busca a listagem já com cache. O produtor só recebe HTML pronto + JS mínimo para filtros. Já no painel da corretora (`/painel/corretora`), tudo é client-side com cookie de autenticação.

---

## 2. Estrutura de pastas

```
src/
├── app/                          # App Router — todas as rotas
│   ├── mercado-do-cafe/          # Público
│   │   ├── page.tsx              # Landing
│   │   ├── corretoras/           # Listagem + detalhe + cadastro
│   │   ├── cidade/[slug]/        # Páginas regionais (SEO local)
│   │   ├── guia/                 # Guia educacional
│   │   ├── verificacao/          # Explicação de trust
│   │   └── lote-vendido/[id]/[token]/  # Confirmação de lote vendido
│   ├── produtor/entrar/          # Login produtor via magic link
│   ├── pricing/                  # Página pública de planos
│   ├── painel/
│   │   ├── corretora/            # Painel da corretora (auth corretora)
│   │   └── produtor/             # Painel do produtor (auth magic link)
│   └── admin/mercado-do-cafe/    # Admin da plataforma
│       ├── page.tsx              # Tabs: Regional, Corretoras, Solicitações, Reviews
│       ├── corretora/[id]/       # Drill-down
│       └── corretoras/[id]/      # CRUD detalhado
├── components/
│   ├── mercado-do-cafe/          # Públicos: CorretoraCard, LeadContactForm,
│   │                               CityChips, WhatsAppDirectButton, Reviews,
│   │                               MarketCotacaoPill, FavoriteButton
│   ├── painel-corretora/         # Corretora: PanelCard, PanelBrand, StatsCards,
│   │                               LeadsTable, NotificationsBell, CurrentPlanBadge,
│   │                               PanelOrnaments (grãos editoriais)
│   └── admin/mercado-do-cafe/    # Admin: RegionalDashboard, ReviewsModeration,
│                                   CorretorasTable, SubmissionsTable, Tabs
├── context/
│   ├── AdminAuthContext.tsx
│   ├── CorretoraAuthContext.tsx
│   └── ProducerAuthContext.tsx   # Lote 1 — magic link
├── hooks/
│   ├── useCorretorasAdmin.ts
│   ├── useCorretoraSubmissions.ts
│   ├── useCorretoraReviewsAdmin.ts
│   └── useRegionalStats.ts       # Sprint 3
├── lib/
│   ├── apiClient.ts              # Fonte única de HTTP
│   ├── regioes.ts                # Catálogo Zona da Mata (cidades, tipos de café, volumes)
│   └── errors.ts                 # ApiError class
├── types/
│   ├── corretora.ts              # PublicCorretora, CorretoraAdmin, PerfilCompra
│   ├── corretoraUser.ts          # CorretoraUser, CorretoraRole + can()
│   ├── lead.ts                   # CorretoraLead, LeadFormData, SafraTipo, AmostraStatus
│   ├── producer.ts               # Producer, ProducerFavorite, ProducerLeadHistoryItem
│   ├── review.ts                 # PublicCorretoraReview, AdminCorretoraReview
│   └── admin.ts
├── server/data/                  # RSC-only fetchers com next.revalidate
│   ├── corretoras.ts
│   └── cotacoes.ts
└── utils/absUrl.ts               # URL resolver para uploads
```

**Como isso funciona na prática:** tudo sob `src/app/` é uma rota. Rotas com `[param]` são dinâmicas. Arquivos `page.tsx` são o conteúdo da URL; `layout.tsx` envolve conjuntos de rotas (ex: o layout do painel da corretora força auth).

---

## 3. Rotas e páginas

### 3.1 Público (sem autenticação)

| Rota | Objetivo | Dados | Endpoints | Quem acessa |
|---|---|---|---|---|
| `/mercado-do-cafe` | Landing hub (RSC) | Featured corretoras, cotações, links para cidades | `/api/public/corretoras?featured=1`, `/api/public/news/cotacoes` | Qualquer visitante |
| `/mercado-do-cafe/corretoras` | Listagem paginada com filtros | Lista + cidades | `/api/public/corretoras`, `/api/public/corretoras/cities` | Qualquer visitante |
| `/mercado-do-cafe/corretoras/[slug]` | Detalhe da corretora | Perfil + reviews + form lead | `/api/public/corretoras/:slug`, `/api/public/corretoras/:slug/reviews`, `/api/public/corretoras/:slug/leads` (POST) | Qualquer visitante |
| `/mercado-do-cafe/corretoras/cadastro` | Formulário de cadastro | Submit com upload de logo | `POST /api/public/corretoras/submit` | Qualquer visitante |
| `/mercado-do-cafe/cidade/[slug]` | SEO regional (Manhuaçu, Lajinha, etc.) | Corretoras da cidade + cotação | `/api/public/corretoras?city=X` | Qualquer visitante |
| `/mercado-do-cafe/guia` | Educativo (6 tópicos: corretora, safra, Matas de Minas...) | Estático | Nenhum | Qualquer visitante |
| `/mercado-do-cafe/verificacao` | Explica os 5 critérios de verificação | Estático | Nenhum | Qualquer visitante |
| `/mercado-do-cafe/lote-vendido/[id]/[token]` | Produtor confirma "já vendi para outra" | HMAC validado no BE | `POST /api/public/corretoras/lote-vendido/:id/:token` | Produtor com link único |
| `/pricing` | Planos (RSC revalidate 5min) | Lista de planos + FAQ | `/api/public/plans` | Qualquer visitante |
| `/produtor/entrar` | Login por magic link | Form email + consume token | `POST /api/public/produtor/magic-link`, `POST /api/public/produtor/consume-token` | Qualquer visitante |

### 3.2 Painel da corretora (auth cookie `authToken` + CSRF)

| Rota | Objetivo | Endpoints |
|---|---|---|
| `/painel/corretora/login` | Login por senha | `POST /api/corretora/auth/login` |
| `/painel/corretora/primeiro-acesso?token=X` | Define senha via convite | `POST /api/corretora/auth/primeiro-acesso` |
| `/painel/corretora/esqueci-senha` / `/resetar-senha` | Recuperação | `POST /api/corretora/auth/password-reset/*` |
| `/painel/corretora` (dashboard) | Stats + notificações + leads recentes | `/api/corretora/leads/summary`, `/api/corretora/leads?limit=5`, `/api/corretora/plan` (badge) |
| `/painel/corretora/leads` | Pipeline completo | `/api/corretora/leads`, `PATCH /api/corretora/leads/:id`, `GET /api/corretora/leads/export` (CSV) |
| `/painel/corretora/perfil` | Edição do perfil regional expandido | `GET/PUT /api/corretora/profile` |
| `/painel/corretora/equipe` | Multi-usuário com roles | `/api/corretora/team` (GET/POST/PATCH/DELETE) |

### 3.3 Painel do produtor (auth cookie `producerToken` + CSRF)

| Rota | Objetivo | Endpoints |
|---|---|---|
| `/painel/produtor` | Favoritos + histórico | `/api/produtor/favorites`, `/api/produtor/leads/history` |
| `/painel/produtor/perfil` | Edita nome/cidade/telefone | `PUT /api/produtor/profile` |

### 3.4 Admin (auth cookie `adminToken` + CSRF)

| Rota | Objetivo | Endpoints |
|---|---|---|
| `/admin/mercado-do-cafe` | 4 tabs em uma página: Regional, Corretoras, Solicitações, Reviews | `/api/admin/mercado-do-cafe/*`, `/stats/*`, `/reviews` |
| `/admin/mercado-do-cafe/corretoras/[id]` | Edição CRUD | `GET/PUT /api/admin/mercado-do-cafe/corretoras/:id` |
| `/admin/mercado-do-cafe/corretoras/nova` | Criação manual | `POST /api/admin/mercado-do-cafe/corretoras` |
| `/admin/mercado-do-cafe/corretora/[id]` | Drill-down dossiê | `/api/admin/mercado-do-cafe/stats/corretora/:id` |
| `/admin/auditoria` | Audit log de ações sensíveis | `/api/admin/audit` |

---

## 4. Componentes principais

### 4.1 Público

- **`CorretoraCard`** — Cartão na listagem e destaques. Mostra logo, nome, cidade, descrição curta, ícones de canais de contato. Props: `corretora: PublicCorretora`.
- **`CorretoraContactChannels`** — Switchboard de 6 canais (WhatsApp, telefone, email, site, Instagram, Facebook) com variantes `compact` e `full` (numeradas 01-06). WhatsApp marcado como primário.
- **`LeadContactForm`** — Formulário qualificado com 9 campos: nome, telefone, cidade (select Zona da Mata), objetivo (chips), tipo de café (chips), volume (ranges), canal preferido (chips), córrego/localidade, safra (atual/remanescente), mensagem livre. Integra Turnstile (anti-bot).
- **`CityChips`** — Chips grandes de filtro regional. Modo dark/light. Sincroniza com query param `city`.
- **`WhatsAppDirectButton`** — Gera link `wa.me/` com mensagem pré-formatada contextualizada. Normaliza número automaticamente (prefix 55). Variantes primary/secondary/inline.
- **`CorretoraReviews`** — Seção pública de avaliações. Header com agregado (média + estrelas), form lazy-mounted (estrelas interativas + select de cidade + comentário). Mostra badge "Cliente verificado" se `verified_lead=true`.
- **`FavoriteButton`** — Detecta sessão de produtor; se logado, toggle com optimistic update; se não, redireciona para `/produtor/entrar?from=...`.
- **`MarketCotacaoPill`** — Pill de cotação de café arábica em 2 variantes (strip/stat).

### 4.2 Painel da corretora

- **`PanelCard`** — Surface premium (rounded-2xl, ring hairline, shadow sutil, top-highlight amber). Variantes `compact`/`default`/`spacious`, `accent="amber"` para destaque.
- **`PanelBrand` + `PanelBrandMark`** — Brand lockup (Kavita · Sala Reservada) + ícone geométrico de grão de café em SVG. Usado em login, nav, empty states.
- **`PanelOrnaments`** — `BeanScatter` (grãos decorativos em baixa opacidade), `OrnamentalDivider` (divisor editorial entre capítulos), `MarketStrip` (masthead de jornal com data/safra/região).
- **`StatsCards`** — KPI grid bento: 1 hero card dark "Total" (3 colunas) + 4 cards light 2×2.
- **`LeadsTable`** — Lista de leads. Cada row: nome + status badge, meta (telefone/cidade/data), chips de qualificação (objetivo, córrego, safra, volume, café, canal), bloco de mensagem, botão WhatsApp contextualizado, select de status, botão Nota interna (expandível). **`AmostraFlow`** inline (kanban 3 botões: Prometida → Recebida → Laudada). **Badge cinza "Lote vendido"** quando `lote_disponivel=false`.
- **`NotificationsBell`** — Bell icon no header com badge amber. Dropdown 360px com lista scrollável. Polling a cada 60s com pausa em aba background. Optimistic update ao marcar como lida.
- **`CorretoraPanelNav`** — Top nav sticky. Itens filtrados por role via `can(role, capability)`. Bell icon + avatar + logout.
- **`CurrentPlanBadge`** — Badge discreto do plano atual no hero do dashboard. Free = neutro com "Upgrade"; pago = amber.

### 4.3 Admin

- **`RegionalDashboard`** — 4 blocos + widget:
  - KPIs regionais (7 cards)
  - Alerta vermelho de leads pendurados >24h
  - Leads por cidade com barras
  - **Córregos ativos na semana** (Sprint 7) com barra proporcional
  - Ranking de corretoras clicáveis → drill-down
- **`ReviewsModeration`** — Filter chips (Pendentes/Aprovadas/Rejeitadas/Todas) + lista com ações inline (Aprovar 1 clique / Rejeitar com motivo opcional).
- **`MercadoCafeTabs`** — 4 tabs: Regional (default), Corretoras, Solicitações, Avaliações. Badge de pendentes em Solicitações e Avaliações.
- **`AuditClient`** — Lista de audit logs com filter chips por tipo de ação + paginação.

---

## 5. Fluxos do frontend

### 5.1 Visita pública (produtor descobrindo corretora)
```
/mercado-do-cafe  →  [clica cidade]
/mercado-do-cafe/cidade/manhuacu  →  [clica corretora]
/mercado-do-cafe/corretoras/[slug]
  → ver reviews (sem auth)
  → clicar WhatsApp direto (pré-formatado) OU preencher form qualificado
  → [form envia lead com 9 campos] → /api/public/corretoras/:slug/leads
  → tela de sucesso
```

### 5.2 Cadastro de corretora
```
/mercado-do-cafe/corretoras/cadastro
  → form em 3 seções (empresa + contatos + senha)
  → POST /api/public/corretoras/submit (com Turnstile)
  → /cadastro/sucesso
  → admin aprova em /admin/mercado-do-cafe (tab Solicitações)
  → email de aprovação → corretora recebe link
  → /painel/corretora/login com credenciais
```

### 5.3 Gestão de leads pela corretora
```
/painel/corretora  →  [nova notificação no bell]
  → clica item da notificação → /painel/corretora/leads (link direto)
  → vê lead qualificado com chips (córrego, volume, canal)
  → clica "WhatsApp" (abre conversa pré-formatada)
  → marca status (new → contacted) [dispara SLA tracking no BE]
  → avança kanban de amostra (Prometida → Recebida → Laudada)
  → se produtor sinalizar lote vendido → aparece badge cinza + notif in-panel
```

### 5.4 Gestão de equipe
```
/painel/corretora/equipe (visível só para owner/manager via can())
  → owner clica "+ Convidar"
  → InviteForm: nome + email + role (sales/manager/viewer)
  → POST /api/corretora/team
  → backend valida enforceUserLimit (max_users do plano)
  → email com magic link (token 7 dias)
  → convidado clica → define senha → entra no painel
```

### 5.5 Login do produtor (passwordless)
```
/produtor/entrar  →  [form email]
  → POST /api/public/produtor/magic-link (rate-limited)
  → backend envia email com link /produtor/entrar?token=X
  → produtor clica → /produtor/entrar?token=X consome automaticamente
  → cookie producerToken setado → redirect /painel/produtor
  → welcome email se for primeiro login
  → painel mostra favoritos + histórico (JOIN por telefone_normalizado)
```

### 5.6 Admin regional
```
/admin/mercado-do-cafe (tab Regional ativa por default)
  → KPIs + alerta de leads pendurados + mapa de córregos
  → clica corretora no ranking → /admin/mercado-do-cafe/corretora/[id]
  → dossiê: stats 90d + perfil + SLA min/médio/máx + reviews agregado + origem geográfica
  → pode moderar reviews na tab Avaliações
  → /admin/auditoria mostra quem fez o quê
```

---

## 6. Estados, permissões e proteção

### 6.1 Três contextos de autenticação independentes

- `AdminAuthContext` — cookie `adminToken` (2h TTL), roles master/gerente/suporte/leitura
- `CorretoraAuthContext` — cookie `authToken` (7d TTL), roles owner/manager/sales/viewer
- `ProducerAuthContext` — cookie `producerToken` (30d TTL), sem roles (produtor é único tipo)

### 6.2 Proteção de rotas

- `app/painel/corretora/layout.tsx` — guard: sem sessão → `/painel/corretora/login?from=...`
- `app/painel/produtor/layout.tsx` — guard: sem sessão → `/produtor/entrar?from=...`
- `app/admin/layout.tsx` — guard existente espelhado para o módulo

### 6.3 Capabilities da corretora (lib `types/corretoraUser.ts`)

Função `can(role, capability)` espelha a matriz do backend. Usada para:
- Esconder item "Equipe" do nav se role não tem `team.view`
- Esconder botão "+ Convidar" se role não tem `team.invite`
- Esconder botão "Exportar CSV" se role não tem `leads.export`
- Esconder select de status se role = viewer (só leitura)

### 6.4 Feature gates por plano

`CurrentPlanBadge` consulta `/api/corretora/plan` e mostra plano atual. Endpoints de features pagas retornam 403 com `capability` no `details` quando o plano não tem direito — UI pode apresentar upsell (ainda não implementado).

---

## 7. Integração com backend (mapa frontend→endpoints)

| Área | Páginas/Componentes | Endpoints principais |
|---|---|---|
| Landing hub | `/mercado-do-cafe/page.tsx` | `GET /api/public/corretoras?featured=1`, `GET /api/public/news/cotacoes` |
| Listagem | `/corretoras`, `CityChips`, `CorretoraFilters` | `GET /api/public/corretoras`, `GET /api/public/corretoras/cities` |
| Detalhe | `/corretoras/[slug]`, `CorretoraReviews`, `FavoriteButton`, `LeadContactForm` | `GET /api/public/corretoras/:slug`, `GET/POST /reviews`, `POST /leads`, `/api/produtor/favorites/:id` |
| Cadastro | `/corretoras/cadastro` | `POST /api/public/corretoras/submit` |
| Pricing | `/pricing` | `GET /api/public/plans` |
| Produtor login | `/produtor/entrar` | `POST /api/public/produtor/magic-link`, `POST /consume-token` |
| Produtor painel | `/painel/produtor/*` | `/api/produtor/me`, `/favorites`, `/leads/history`, `/profile`, `/alerts` |
| Corretora dashboard | `PanelClient`, `StatsCards`, `NotificationsBell`, `CurrentPlanBadge` | `/api/corretora/leads/summary`, `/leads?limit=5`, `/notifications/unread-count`, `/plan` |
| Corretora leads | `/painel/corretora/leads`, `LeadsTable`, `AmostraFlow` | `GET /leads`, `PATCH /leads/:id` (status+nota+amostra_status), `GET /leads/export` |
| Corretora perfil | `ProfileClient` | `GET/PUT /api/corretora/profile` |
| Corretora equipe | `EquipeClient` | `GET/POST /team`, `PATCH /team/:id/role`, `DELETE /team/:id` |
| Corretora notificações | `NotificationsBell` | `GET /notifications`, `/unread-count`, `POST /:id/read`, `/read-all` |
| Admin regional | `RegionalDashboard` via `useRegionalStats` | `/stats/regional`, `/leads-por-cidade`, `/corretoras-performance`, `/leads-pendurados`, `/corregos-ativos` |
| Admin drill-down | `/admin/mercado-do-cafe/corretora/[id]` | `/corretoras/:id`, `/stats/corretora/:id` |
| Admin reviews | `ReviewsModeration` | `GET /reviews`, `POST /reviews/:id/moderate` |
| Admin auditoria | `/admin/auditoria` | `GET /api/admin/audit` |

---

## 8. Resumo prático do frontend

### O que resolve bem
- Identidade visual regional consistente (dark committed + amber)
- Fluxos de 3 personas bem separados (produtor / corretora / admin) com guards próprios
- Leads qualificados em form multi-step com UX de chips (melhor que radios/selects)
- WhatsApp direto pré-formatado — redução de fricção real
- Notifications bell com polling leve (pausa em background)
- Multi-usuário com UI de capabilities escondendo o que não é permitido
- Drill-down de corretora no admin — navegação rica do ranking

### Pontos fortes
- Reuso de componentes (`PanelCard`, `PanelBrandMark`, `MarketStrip`)
- Separação clara: RSC para SEO + client components para interação
- `apiClient` como única porta de saída HTTP (CSRF + cookies automáticos)
- Types alinhados com backend (enums espelhados em `regioes.ts` e `corretoraUser.ts`)

### Pontos de atenção
- Paginação em admin audit logs está simplificada (sem meta pages no unwrap atual)
- Polling de 60s é um "pseudo-realtime" — pode ficar desatualizado até 1min
- Sem placeholders otimistas em algumas operações (ex: criar review, convidar membro)
- Página `/pricing` não consome `/api/corretora/plan` para mostrar "você está neste plano"
- Favoritos não mostrados nas páginas públicas (só no painel)

### O que ainda falta
- UI admin de gestão de planos (hoje é só REST)
- UI admin de criação de destaque pago por cidade
- Página do produtor para alertas de cotação (esqueleto existe no backend)
- UI de upsell inline quando feature é bloqueada por plano (hoje só 403)
- Loader skeleton em páginas que hoje mostram "Carregando..." seco
