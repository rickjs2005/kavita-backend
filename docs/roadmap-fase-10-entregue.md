# Fase 10 — Entregue (roadmap consolidado)

Status: **FECHADA** em 2026-04-21. Documento único consolidando as
quatro sub-fases (10.1, 10.2, 10.3, 10.4) que levaram o Mercado do
Café do estado "marketplace regional" ao estado "SaaS de corretoras
pronto para piloto pago com corretoras reais da Zona da Mata MG".

- Fase original de planejamento: [`roadmap-fase-10.md`](roadmap-fase-10.md)
- Sub-fase pendente: **10.2.1** (Sintegra) e **11.x** (Escrow, NFPe, CPR) — não fazem parte desta entrega

---

## 1. Resumo executivo

Em 8 dias de execução a Fase 10 transformou o módulo Mercado do Café
de uma vitrine B2B regional em **plataforma de corretagem com rito
jurídico, transparência regulatória e dado vivo de mercado**:

- **10.1** — Corretora gera contrato de compra e venda de café em PDF
  com QR Code e hash, envia para assinatura digital (stub ClickSign
  pronto para produção), e processa o retorno por webhook com HMAC.
- **10.2** — Toda corretora passa por verificação KYC (CNPJ + QSA)
  antes de poder emitir contrato. FSM completo, mock adapter
  determinístico, BigDataCorp plugável via env.
- **10.3** — Produtor pode ver, exportar e pedir exclusão dos
  próprios dados. Canal do DPO público. 6 documentos de compliance
  versionados no repo.
- **10.4** — Preço CEPEA e ICE "C" NY aparecem no topo do painel da
  corretora em tempo real. Cron persiste snapshot diário com
  fallback stale.

### Ganho por stakeholder

**Produtor rural** — agora tem: prova documental vinculante ao
fechar negócio; painel de contratos com "Baixar PDF assinado";
controle total de privacidade (art. 18 LGPD operacional); ticker
de mercado para decidir preço.

**Corretora** — agora tem: emissão rápida de contrato (botão →
PDF em 3s → email de assinatura); selo "Corretora auditada" no
card público que justifica prêmio de confiança; ticker vivo que
dá cara de "painel profissional" e justifica plano pago.

**Admin Kavita** — agora tem: gate de KYC obrigatório antes de
qualquer corretora emitir contrato; canal de privacidade com
registro em `mensagens_contato` para auditoria ANPD; trilha
completa de consulta KYC (provider_response_raw para disputa).

### Maturidade do módulo

| Dimensão | Antes da Fase 10 | Depois |
|---|---|---|
| Rito jurídico | Handshake manual, sem papel | Contrato digital assinado com hash + QR |
| Compliance LGPD | Política genérica | RIPD + mapa de dados + 6 docs + endpoints art. 18 |
| Autoridade do diretório | Auto-declarada ("verificada por Kavita") | KYC CNPJ+QSA com FSM e provider plugável |
| Transparência de mercado | Editorial estático | Dado CEPEA/ICE vivo, persistido, com fallback stale |

---

## 2. Fase 10.1 — Contratos

### Objetivo
Sair de "corretora combina no WhatsApp" para "corretora emite
contrato de compra e venda com validade jurídica via assinatura
digital", fechando o vácuo mais caro do mercado de café: bancos e
tradings só aceitam papel.

### Arquitetura

```
/painel/corretora/leads/[id]  (lead.status=closed)
        │ clica "Gerar contrato"
        ▼
POST /api/corretora/contratos  (tipo, data_fields)
        │
        ▼
contratoService.gerarContrato:
  1. valida lead (scope + closed)
  2. parse Zod discriminado por tipo
  3. renderiza Handlebars (templates/contratos/*.hbs)
  4. Puppeteer HTML→PDF
  5. SHA-256 + QR Code apontando para /verificar/<token>
  6. grava em storage/contratos/<corretora>/<token>.pdf
  7. INSERT contratos + evento contract_generated na timeline
        │
        ▼
POST /api/corretora/contratos/:id/enviar
        │ CONTRATO_SIGNER_PROVIDER=clicksign|stub
        ▼
contratoSignerService.enviarParaClickSign:
  POST envelope → attach PDF → POST signers → PATCH running
        │
        ▼
UPDATE contratos status=sent + signer_envelope_id + signer_document_id

(usuário assina por email)
        │
        ▼
POST /api/webhooks/clicksign (HMAC via express.raw)
        │
        ▼
contratoSignerService.processarEventoWebhook:
  - upsert em webhook_events (dedup document:event:ts)
  - baixa PDF carimbado → signed_pdf_url + signed_hash_sha256
  - UPDATE contratos status=signed + signed_at
  - evento contract_signed na timeline
```

### Fluxo ClickSign
- Adapter `services/contratos/clicksignAdapter.js`
- API v3 JSON:API — envelope, document (base64), signers, requirements
  (action=agree+role=sign, action=provide_evidence+auth=email)
- HMAC SHA-256 verificado com `crypto.timingSafeEqual`
- Stub mode (`CONTRATO_SIGNER_PROVIDER=stub`) permite smoke em
  staging sem queimar token

### Smokes
```bash
node scripts/dev/smoke-contrato.js --email <corretora_user> --senha '<...>' --lead 1
```
Valida login → CSRF → gerar → enviar. Quando `CONTRATO_SIGNER_PROVIDER=clicksign`,
dispara envelope real na sandbox.

### Páginas frontend
- `/painel/corretora/leads/[id]` — tab Proposta com `ContratosSection` (botão gerar + cards)
- `/painel/produtor/contratos` — cards coloridos por status, download PDF assinado
- `/verificar/[token]` — layout de certificado serifado, hash em blocos de 8 chars

### Limitações conhecidas
- Reenvio manual de notificação ClickSign: rate-limited em 429, sem UI
- Download do PDF assinado é best-effort (URL S3 expira em ~5 min; log `signed_pdf_download_failed` se falhar)
- Cron de retry para baixar PDFs perdidos: não implementado
- ClickSign real em produção exige token + HMAC secret (stub em dev)

---

## 3. Fase 10.2 — KYC/AML

### Objetivo
Garantir que só corretoras com CNPJ auditado (QSA + situação
cadastral ATIVA) possam emitir contratos. Argumento comercial direto
("Aqui você só negocia com corretoras que a Kavita auditou o CNPJ e
os sócios") + proteção reputacional da plataforma.

### FSM de status

```
         ┌───────────────────────┐
         ▼                       │
pending_verification ─┬─→ under_review ──┬─→ verified (TERMINAL)
                      │                  │
                      ├─→ verified       ├─→ rejected ──→ under_review
                      └─→ rejected                         (resubmission)
```

`verified` é terminal no MVP — expiração/revalidação fica para
Fase 10.2.1. Transições inválidas retornam 409 CONFLICT.

### Mock adapter (determinístico)
Arquivo: `services/kyc/kycMockAdapter.js`

| CNPJ | Resultado |
|---|---|
| 14 dígitos válidos (não-repetidos) | `ATIVA` + QSA fake + risk_score=15 |
| Termina em `0000` | `INATIVA` (aprovação automática recusa) |
| Termina em `9999` | `SUSPENSA` |
| 14 zeros / repetidos | `INVALID_FORMAT` (400) |

### BigDataCorp adapter (stub)
Arquivo: `services/kyc/kycBigdatacorpAdapter.js`

- Interface contratual documentada (mesmo shape do mock)
- `isConfigured()` exige `BIGDATACORP_ACCESS_TOKEN` + `BIGDATACORP_TOKEN_ID`
- Resolver em `services/kyc/kycProviderResolver.js` — `KYC_PROVIDER=mock|bigdatacorp`
- Fallback gracioso: se BigDataCorp não está configurado, cai no mock com log
- Switch de produção é 1 linha em `.env`

### Gate de contrato
`services/contratoService.gerarContrato` chama
`corretoraKycService.requireVerifiedOrThrow(corretora)` **antes** de
renderizar qualquer PDF. Resposta 403 com `details.kyc_status`.

### Grandfather das corretoras existentes
Migration `2026042000000007` executa:
```sql
UPDATE corretoras SET kyc_status='verified', kyc_verified_at=NOW()
 WHERE status='active' AND deleted_at IS NULL;
```
+ registro em `corretora_admin_notes` (category='kyc') para trilha
de auditoria. Confirmado no ambiente: Laert do Café (id=4) e
Laricoffee (id=5) ambas `verified`.

### Endpoints

**Admin (`mercado_cafe_moderate`):**
```
GET  /api/admin/mercado-do-cafe/corretoras/:id/kyc
POST /api/admin/mercado-do-cafe/corretoras/:id/kyc/run-check  { cnpj }
POST /api/admin/mercado-do-cafe/corretoras/:id/kyc/approve
POST /api/admin/mercado-do-cafe/corretoras/:id/kyc/approve-manual  { notes? }
POST /api/admin/mercado-do-cafe/corretoras/:id/kyc/reject  { reason }
```

**Corretora autenticada:**
```
GET  /api/corretora/kyc  → { kyc_status, can_emit_contracts, cnpj, razao_social, rejected_reason }
```

### Smokes
```bash
node scripts/dev/smoke-kyc.js --corretora 4
```
11 checkpoints cobrem: reset → pending → invalid CNPJ → INATIVA →
approve 409 → reject → gate 403 em contratoService → valid CNPJ →
approve → verified + idempotência.

### Frontend
- `CorretoraCard` mostra selo "Corretora auditada" apenas quando
  `kyc_status=verified` (antes era intrínseco a toda ativa)
- `ContratosSection` desabilita botão "Gerar contrato" + banner
  âmbar explicando status
- Hook `useMyKycStatus` consumindo `/api/corretora/kyc`

### Limitações conhecidas
- **Sem Sintegra** — `qsa` JSON preparado, sem check bloqueante (Fase 10.2.1/11.2)
- **Sem provider real** — BigDataCorp é stub, plugar exige credencial + mapeamento de payload
- **Sem expiração de verified** — coluna `expires_at` existe em `corretora_kyc`, não é verificada hoje
- **Sem UI admin dedicada** — admin opera via curl/CLI no MVP (repo `privacyRequestsRepository.listAdminPending` não aplicável aqui; listagem de corretoras `under_review` exige SQL direto ou extensão do admin existente)

---

## 4. Fase 10.3 — LGPD 2.0

### Objetivo
Operacionalizar o art. 18 da LGPD para o produtor do Mercado do
Café, com self-service imediato no painel + canal público do DPO,
**antes** de a Fase 10.2 começar a coletar CNPJ/QSA de corretoras.

### Entregas

**Página pública** — `/privacidade` (RSC, indexável)
- Política em linguagem simples + seções de bases legais (art. 7º)
- Lista de compartilhamento (ClickSign, Asaas, Cloudflare, Sentry)
- Formulário do DPO com 7 tipos (acesso/correcao/exclusao/
  portabilidade/duvida/incidente/outro)
- Rate-limited em `POST /api/public/privacidade/contato` (3/h por IP)

**Painel autenticado** — `/painel/produtor/meus-dados`
- Snapshot do que o Kavita trata (conta + contagens de leads/contratos)
- Botão "Baixar meus dados (JSON)" — export imediato com projeção
  anti-vazamento (15 chaves proibidas varridas: password, senha, cpf,
  cpf_hash, totp_secret, token_version, reset_token, source_ip,
  user_agent, nota_interna, signer_envelope_id, signer_document_id,
  pdf_url etc)
- Botão "Pedir exclusão" — modal de confirmação + janela 30d de
  arrependimento
- Cancelamento de exclusão dentro da janela

**Fluxo de exclusão** (`services/producerPrivacyService`)
```
pedido → privacy_requests status=pending
       → producer_accounts.pending_deletion_at=NOW()
       → scheduled_purge_at = NOW() + 30d
       → UI alerta "sua conta será removida em X dias"
       → (titular pode cancelar)
       → após 30d: admin executa anonimização (hoje manual)
```

**Cookie banner** — honesto: só declara cookies necessários
(sessão, CSRF, preferência do próprio banner). Sem toggle fake.

### Docs compliance
`docs/compliance/` tem 6 documentos versionados:
- `mapa-de-dados.md` — inventário real (gerado de INFORMATION_SCHEMA)
- `bases-legais.md` — art. 7º por finalidade
- `retencao.md` — prazos + crons de backlog
- `direitos-dos-titulares.md` — art. 18 operacional + SLA
- `ripd.md` — Relatório de Impacto + avaliação de riscos
- `incidentes-seguranca.md` — fluxo interno + checklist ANPD (art. 48 LGPD citado sem cravar prazo específico sem fonte atualizada, conforme orientação expressa)

### Smokes
```bash
node scripts/dev/smoke-privacy.js --email <produtor>
```
9 checkpoints: login dev → CSRF → meus-dados → export + varredura
anti-vazamento → solicitar-exclusao → confirma agendamento → cancelar
→ confirma cancelamento → contato público → DB sanity.

### Limitações conhecidas
- Admin UI de `privacy_requests` não implementada (operação via SQL no MVP)
- Crons de retenção não implementados (`executeScheduledDeletionsJob`,
  `purgeLeadsAgedJob`, `reactivationEmailJob`)
- LGPD 2.0 ainda não cobre `usuarios` (e-commerce) — só
  `producer_accounts`; estrutura é extensível via `subject_type`
- DPO formal não designado (registrado como pendência em `ripd.md`)

---

## 5. Fase 10.4 — Ticker vivo

### Objetivo
Substituir o strip editorial do painel da corretora ("Mercado do
Café · Sala Reservada") por dado de mercado vivo — CEPEA arábica
(referência doméstica) + ICE "C" NY (referência internacional).
Sensação de "sistema vivo" que justifica hábito de uso diário.

### Arquitetura

```
Cron 0 18 * * 1-5 (America/Sao_Paulo)
        │ pós-fechamento CEPEA
        ▼
marketQuotesService.syncAll
  ├─ noticiasAgricolasAdapter (scraping CEPEA via HTML)
  └─ iceAdapter (Yahoo Chart API v8 KC=F)
        │
        ▼
UPSERT market_quotes (source, symbol, price_brl_cents,
                      price_usd_cents, variation_pct, quoted_at)
        │
        ▼
GET /api/public/market-quotes/current
  → projeção + is_stale=true se quoted_at > 48h
        │
        ▼
useMarketQuotes (cache 5min + dedup inflight)
        │
        ▼
<LiveMarketQuotes> dentro de <MarketStrip>
  CEPEA arábica R$ 1.765,66  +0,32%  ·  ICE C (NY) 288¢/lb  -5,39%
```

### CEPEA (doméstico)
- Adapter `noticiasAgricolasAdapter` (scraping)
- Path real descoberto na Fase 10.4: `/cotacoes/cafe/indicador-cepea-esalq-cafe-arabica`
- Parser strict-first com guarda de faixa plausível (R$ 500–5000/saca)
- ADR: "não inventa preço" — se parser falha, retorna null, UI esconde

### ICE "C" (internacional)
- Adapter `iceAdapter` usando Yahoo Chart API v8
- Stooq foi descartado (passou a exigir apikey em 2026)
- Yahoo v7 CSV foi descontinuado; v8 JSON é a alternativa estável gratuita

### DB `market_quotes`
- PK composta `(source, symbol)` — upsert idempotente
- `quoted_at` (data da fonte) ≠ `fetched_at` (timestamp do cron)
- `is_stale` calculado em runtime se `quoted_at > 48h`

### Frontend
- `MarketStrip` mobile usa `overflow-x-auto` + `whitespace-nowrap` +
  `scrollbar-none` (arrasta pro lado em vez de quebrar)
- `LiveMarketQuotes` usa `Intl.NumberFormat pt-BR` (vírgula decimal,
  sinal explícito com `signDisplay: "exceptZero"`)
- Valor primário com `drop-shadow` âmbar sutil + `tracking-normal`
  (não "desfaz" sob o `tracking-wide` do parent)
- Badge "(defasado)" quando `is_stale`

### Script manual
```bash
node scripts/dev/fetch-market-quotes.js
```
Dispara `syncAll` uma vez + imprime estado do DB.

### Limitações conhecidas
- **Scraping frágil** — se Notícias Agrícolas mudar layout, parser cai
  para null (não inventa preço, UI some gracefully)
- **Sem conversão ICE → BRL** — mostra só cents/lb. Para R$/saca
  equivalente precisaria PTAX do dia (cron a mais)
- **Ticker não plugado no painel do produtor** — só na corretora
  (decisão de produto; reusar é trivial)
- **Cron não está habilitado no ambiente local por default** —
  `MARKET_QUOTES_SYNC_ENABLED=true` no `.env`

---

## 6. Scripts de validação

| Script | Comando | Escopo | Quando rodar | Resultado esperado |
|---|---|---|---|---|
| `smoke-contrato.js` | `node scripts/dev/smoke-contrato.js --email <...> --senha '<...>' --lead 1` | Login corretora → CSRF → gerar contrato → enviar ClickSign (ou stub) | Após mudanças em `contratoService`, `clicksignAdapter`, `ContratosSection` | 8 checkpoints ✓ |
| `smoke-kyc.js` | `node scripts/dev/smoke-kyc.js --corretora 4` | FSM KYC completo + gate em `contratoService` | Após mudanças em `corretoraKycService`, `kycMockAdapter`, migration | 11 checkpoints ✓ |
| `smoke-privacy.js` | `node scripts/dev/smoke-privacy.js --email <produtor>` | LGPD end-to-end: meus-dados → export → exclusão → cancel → canal público | Após mudanças em `producerPrivacyService`, `/meus-dados`, docs compliance | 9 checkpoints ✓ |
| `fetch-market-quotes.js` | `node scripts/dev/fetch-market-quotes.js` | Coleta CEPEA + ICE → persiste em `market_quotes` | Após mudanças em adapters ou quando fonte externa mudar | `collected: ['cepea_esalq/...', 'ice_us/KC.F']` |

**Pré-requisitos comuns:**
- backend rodando (`npm start` na porta 5000 do `kavita-backend`)
- migrations aplicadas (`npm run db:migrate`)
- `.env` com `JWT_SECRET` + vars específicas de cada smoke

---

## 7. Decisões de produto (fixadas na Fase 10)

1. **Painel da corretora NÃO é bloqueado por KYC** — decisão
   explícita de UX. Corretora com `kyc_status=pending_verification`
   pode navegar, atender leads, qualificar amostras, registrar
   propostas. **Só a emissão/assinatura de contrato oficial é
   bloqueada.** Banner âmbar no `ContratosSection` explica por quê.

2. **Ticker CEPEA permanece público** — não é bloqueado nem por KYC
   nem por plano pago. É dado de mercado; todo produtor do Brasil
   consulta CEPEA gratuitamente no jornal agro.

3. **Sintegra fica para 10.2.1/11.2** — não é necessário emitir
   contrato de compra e venda. Só vira bloqueante quando Kavita
   emitir NFPe (Fase 11.2). Estrutura de dados em `corretora_kyc.qsa`
   já suporta ingestão de Sintegra no futuro.

4. **BigDataCorp real só quando houver credencial/demanda** — stub
   documentado; mock cobre todo o fluxo com CNPJs de teste. Custo
   por consulta (~R$ 0,50–2) não se justifica antes do piloto
   comercial.

5. **Asaas Split / Escrow fica para Fase 11.1** — Fase 10 é sobre
   contratos + KYC + transparência. Movimentação financeira é o
   salto seguinte, que muda Kavita de "SaaS de corretagem" para
   "fintech de nicho".

6. **Grandfather das corretoras ativas** — marca como `verified`
   automaticamente na migration. Alternativa (obrigar todas a
   refazer KYC) quebraria corretoras em produção e exigiria
   comunicação comercial. Registrado em `corretora_admin_notes`
   para trilha de auditoria.

7. **Cookie banner honesto** — só cookies necessários. Sem toggle
   fake. Quando entrar analytics opcional, adiciona o toggle; não
   antes.

8. **Admin UI das Fases 10.2 e 10.3 é débito técnico declarado** —
   operação via `curl`/SQL no MVP. Implementar tela vira tarefa
   conforme admin reclamar — não antes.

---

## 8. Riscos remanescentes

### Técnicos
1. **Scraping CEPEA é frágil** — se Notícias Agrícolas reorganizar
   HTML, parser cai (mitigado: retorna null em vez de valor errado).
   Mitigação definitiva: licenciar CEPEA B2B.
2. **Stooq descontinuado** — se Yahoo Chart API v8 cair, ICE some
   da tela. Plano B: Investing.com (scraping) ou feed pago.
3. **PDF assinado com download best-effort** — URL S3 da ClickSign
   expira em ~5 min. Se webhook não consegue baixar a tempo,
   `signed_pdf_url=null`. Recuperação: admin baixa manualmente do
   painel ClickSign ou cron de retry (não implementado).
4. **Cron de anonimização de exclusão LGPD não implementado** —
   depois de 30d pendentes, admin precisa executar manualmente
   via SQL ou service. Mitigação: baixo volume no MVP torna
   tolerável; cron entra conforme demanda.
5. **Sem provider KYC real** — mock aceita qualquer CNPJ como ATIVA.
   Piloto comercial exige pelo menos validação formal de CNPJ
   (Cafir Receita Federal pública é grátis com rate limit).

### Produto/comercial
6. **Sem Sintegra** — na fase de emissão fiscal (11.2) a ausência
   vira bloqueante. Endereçar antes de ativar NFPe.
7. **Sem escrow/split** — negociação continua fechando "no grito" e
   pagamento fora do sistema. Ok para piloto regional; vira risco
   de reputação quando escalar.
8. **Nenhum dos fluxos passou por teste manual em navegador real
   com corretora externa** — validação feita via smokes CLI + build
   compilado. Pré-requisito absoluto para produção: 1 sessão de
   teste com corretora piloto (Laert) validando UX end-to-end.
9. **DPO não nomeado formalmente** — RIPD cita contato provisório
   `privacidade@kavita.com.br`. Registrar DPO com ANPD antes do
   lançamento comercial.

### Regulatórios
10. **Prazo de notificação ANPD** — `incidentes-seguranca.md` cita
    art. 48 LGPD mas **não crava número de dias**, conforme
    orientação. Ao ocorrer incidente real, consultar regulamentação
    ANPD vigente no site oficial.
11. **Contratos CV café sem revisão jurídica formal** — templates
    `templates/contratos/*.hbs` foram escritos com base em modelos
    de mercado, não revisados por advogado. Pré-lançamento: review
    jurídico obrigatório.

---

## 9. Próximos passos recomendados

### Ordem sugerida (3 a 6 meses)

1. **Piloto comercial regional** — antes de qualquer código novo.
   Ativar Laert do Café + 1–2 corretoras adicionais em produção
   com ClickSign real. Coletar feedback 4–6 semanas antes de
   escalar. Budget: ClickSign assinatura (~R$ 59/mês + R$ 2,50/doc)
   e hospedagem.

2. **BigDataCorp real (Fase 10.2.1)** — quando tiver credencial
   contratada (~R$ 0,50/consulta). Trocar `KYC_PROVIDER=bigdatacorp`
   em prod + mapear payload cru no stub existente. Estimativa:
   1–2 SP. Inclui revisão de QSA contra lista PEP/OFAC.

3. **Sintegra + fiscal (Fase 11.2)** — só depois de decidir se
   Kavita emite NFPe direto ou se cada corretora opera com seu
   próprio CNPJ emitindo. Estimativa: 3–4 SP (integração SEFAZ-MG
   ou provedor tipo Focus NFe).

4. **Asaas Split / Escrow (Fase 11.1)** — salto para fintech de
   nicho. Precisa piloto comercial validado antes, porque muda o
   tipo de suporte que a operação recebe ("cadê meu dinheiro?").
   Estimativa: 3 SP + 2 SP de preparação de suporte (FAQ,
   templates, canal dedicado).

5. **Admin UI das fases 10.2/10.3** — quando o admin reclamar de
   operar via SQL/curl. Provavelmente após o piloto.

6. **Crons de retenção LGPD** — `executeScheduledDeletions`,
   `purgeOldLeads`, `reactivationEmails`. Quando o volume
   justificar (> 100 produtores inativos).

### Priorização sugerida

Piloto antes de qualquer nova fase. Tudo o mais pode esperar
feedback de campo. Tração comercial com a infraestrutura atual
(10.1–10.4) é mais valioso que a próxima fase técnica.

---

## Anexos

### Commits principais da Fase 10

| Fase | Commit | Descrição |
|---|---|---|
| 10.1 PR1 | `4455d17` | geração de contrato CV café com PDF assinável |
| 10.1 PR2 | `cc1eeeb` | integração ClickSign + webhook HMAC |
| 10.1 calibragem | `7dcd258` | calibragem ClickSign v3 após smoke real em sandbox |
| 10.1 PR3A+C | `be970e3` + `3930bc0` | UI corretora + verificação pública + LGPD mask |
| 10.1 PR4 | `d6edf21` + `7f6bc36` | painel do produtor + endpoints |
| 10.4 | `92d7bbd` + `aef2160` | ticker CEPEA + ICE |
| 10.4 polish | `0ec9490` | formato pt-BR, destaque e responsividade |
| 10.3 | `380b9d7` + `bbac7d4` | LGPD 2.0 (backend + frontend) |
| 10.3 fix | `ea45238` + `45935da` | fix rate limiter + smoke-privacy |
| 10.2 | `bb1f65d` + `d77d206` | KYC FSM + mock adapter + gate + frontend |
| 10.2 fix | `0349625` | findById correto + smoke-kyc.js |

### Migrations da Fase 10

```
2026042000000001-create-contratos
2026042000000002-add-signed-pdf-to-contratos
2026042000000003-create-market-quotes
2026042000000004-create-privacy-requests
2026042000000005-add-privacy-fields-to-producers
2026042000000006-create-corretora-kyc
2026042000000007-add-kyc-status-to-corretoras
```

### Testes unit

**59 testes em 6 suítes da Fase 10:**
- `contratoService.unit.test.js` — 11 casos (Zod + hash + projeção pública)
- `clicksignAdapter.unit.test.js` — 15 casos (HMAC + translateWebhookEvent)
- `iceAdapter.unit.test.js` — 7 casos (fetch Yahoo + parse)
- `producerPrivacyService.unit.test.js` — 7 casos (anti-vazamento + FSM delete)
- `kycMockAdapter.unit.test.js` — 13 casos (determinismo por CNPJ)
- `corretoraKycService.unit.test.js` — 6 casos (gate + VALID_TRANSITIONS)

Comando para rodar tudo:
```bash
cd kavita-backend
npx cross-env NODE_ENV=test NODE_PATH=./vendor \
  node ./node_modules/jest/bin/jest.js \
  test/unit/services/contratoService.unit.test.js \
  test/unit/services/clicksignAdapter.unit.test.js \
  test/unit/services/iceAdapter.unit.test.js \
  test/unit/services/producerPrivacyService.unit.test.js \
  test/unit/services/kycMockAdapter.unit.test.js \
  test/unit/services/corretoraKycService.unit.test.js \
  --runInBand
```

### Variáveis de ambiente introduzidas

```bash
# Fase 10.1
CONTRATO_SIGNER_PROVIDER=stub              # ou 'clicksign'
CLICKSIGN_API_TOKEN=                       # produção
CLICKSIGN_API_URL=https://sandbox.clicksign.com
CLICKSIGN_HMAC_SECRET=

# Fase 10.2
KYC_PROVIDER=mock                          # ou 'bigdatacorp'
BIGDATACORP_ACCESS_TOKEN=                  # produção
BIGDATACORP_TOKEN_ID=

# Fase 10.3
PRIVACY_DELETION_GRACE_DAYS=30
NEXT_PUBLIC_PRIVACY_EMAIL=privacidade@kavita.com.br

# Fase 10.4
MARKET_QUOTES_SYNC_ENABLED=false
MARKET_QUOTES_SYNC_CRON=0 18 * * 1-5
COTACAO_CAFE_PROVIDER=noticias_agricolas
ICE_COFFEE_PROVIDER_DISABLED=false
```
