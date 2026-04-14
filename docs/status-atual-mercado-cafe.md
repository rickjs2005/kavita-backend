# Status Atual — Mercado do Café

Fotografia do módulo em **2026-04-13**. O que já está pronto, o que é débito
técnico consciente e o que ainda falta para escalar.

---

## 1. Pronto e em produção

### Catálogo público
- Listagem de corretoras com filtros (cidade, tipo_café, destaque).
- Página detalhe com reviews aprovadas, horário, cidades atendidas,
  tipos de café aceitos, córrego/safra/amostra.
- SEO com sitemap e OpenGraph por slug.
- Componentes editoriais próprios (`BeanScatter`, `OrnamentalDivider`,
  `MarketStrip`) — identidade visual de café.

### Captura de leads
- Form qualificado (objetivo, tipo_cafe, volume, canal).
- Turnstile invisível + rate limit por IP+slug.
- Normalização de telefone para permitir broadcast cross-corretoras.

### Auth passwordless do produtor
- Magic link por email (TTL 30min, uso único, scope isolado).
- JWT 30d em cookie HttpOnly.
- Welcome email no primeiro login.
- Vinculação retroativa de histórico via `telefone_normalizado`.

### Painel da corretora
- Inbox de leads com SLA visual.
- Fluxo de mudança de status com auditoria em `corretora_lead_events`.
- Export CSV (gate por plano).
- Gestão de perfil: foto responsável, horário, cidades atendidas, tipos de café.
- Multi-user com 4 roles (owner/manager/sales/viewer).
- Guards contra remoção/rebaixamento do último owner.
- Sino de notificações (polling 60s, pausa em background).
- Página de plano atual + uso vs limite.

### Painel do produtor
- Perfil com telefone (chave para histórico retroativo).
- Favoritos de corretoras.
- Alertas por cidade + tipo de café.
- Histórico de leads enviados com status atual.

### Admin
- Moderação de corretoras (aprovar/rejeitar/destacar).
- Moderação de reviews.
- CRUD de planos com capabilities JSON livre.
- Atribuição de plano manual (billing prep).
- Audit log com snapshot de admin + meta + filtro por action.

### Segurança
- 3 contextos JWT isolados.
- CSRF double-submit em todas as rotas autenticadas.
- HMAC determinístico para broadcast "lote vendido" (sem CSRF).
- Rate limit nas rotas públicas sensíveis.
- Token version para invalidar sessões.

---

## 2. Débitos técnicos conhecidos

### Billing passivo
- Schema pronto: `provider`, `provider_subscription_id`, `provider_status`,
  `current_period_end_at` em `corretora_subscriptions`.
- **Falta**: webhook do Mercado Pago para virar status automaticamente e
  rotina de expiração ao fim do período.
- **Impacto**: hoje o plano é atribuído manualmente pelo admin.

### Notificações não realtime
- Frontend faz polling 60s (com pausa quando aba em background).
- **Falta**: SSE ou WebSocket para push real.
- **Impacto**: corretora pode demorar até 1min para ver novo lead. Tolerável
  no MVP — SLA público é medido em minutos/horas.

### Paginação do audit log
- Backend retorna só o array, sem `meta.pages` ou `total`.
- **Impacto**: frontend mostra botões "Anterior/Próxima" sem saber total.
  Funcional, mas feio.

### Testes automatizados
- Integração cobre: auth corretora, auth produtor (magic link), criação de lead.
- **Falta**: matriz de capabilities (permissões por role), broadcast de lote vendido,
  moderação de reviews, audit log.
- **Hoje**: essas rotas estão validadas por smoke manual.

### Observabilidade
- Logs estruturados existem (`corretora.lead.created`, `admin.audit.*`, etc.).
- **Falta**: dashboard/alertas no Grafana (ou equivalente) sobre SLA médio,
  volume de leads por cidade, taxa de aprovação de reviews.

---

## 3. Faltante — próximas prioridades

### Prioridade alta
1. **Webhook Mercado Pago** — completar billing ativo. Schema já existe.
2. **Página pública "Mercado do Café" institucional** — hoje o entrypoint é a lista;
   falta storytelling sobre o que é, para quem serve, como funciona.
3. **Email de follow-up para produtor** (7d pós-lead) — aumenta review rate.

### Prioridade média
4. **Realtime via SSE** para o sino da corretora.
5. **Dashboard de métricas** para admin: leads/cidade, SLA médio, plano ativo.
6. **Testes de integração**: capabilities matrix + broadcast.
7. **Paginação real do audit log** (devolver `meta.pages`).

### Prioridade baixa / ideia
8. **Leaderboard público de SLA** (opt-in) — ranking das corretoras mais responsivas por cidade.
9. **Programa de indicação produtor→produtor** com crédito em destaque.
10. **Tradução EN** para exportadores.

---

## 4. Riscos conhecidos

| Risco | Mitigação atual | O que ainda falta |
|---|---|---|
| Spam de leads falsos | Turnstile + rate limit | — |
| Corretora abusa de convites | `max_users` por plano | Alertar admin via audit em delta suspeito |
| Produtor perde acesso ao email | Magic link só por email | Alternativa via WhatsApp OTP |
| Admin deletado perde histórico | Snapshot de `admin_nome` em audit | — |
| Banco cai | pool com retry | Backup + disaster recovery ainda informal |

---

## 5. Métricas mínimas para acompanhar (quando formos ativar)

- Leads/dia por cidade.
- % de leads com `first_response_at` < 1h / < 24h.
- Taxa de review (leads → review submetida).
- Taxa de aprovação de review.
- Corretoras com plano ativo vs Free.
- Produtores ativos (último lead em 30d).
