# Roadmap Fase 10 — Casco Jurídico Mínimo

Documento vivo. Fonte da verdade para priorização, dependências, esforço e
decisões comerciais da próxima onda de entregas do módulo Mercado do Café.

- **Aprovado em:** 2026-04-20
- **Base de partida:** Fase 9 concluída em 2026-04-18 (nota de robustez 7.4/10)
- **Meta de saída da Fase 10:** nota 8.4/10 e contratos assinados em produção
- **Meta de saída da Fase 11:** nota 9.0+ e rito operacional completo (contrato + pagamento + NFe + CPR)

---

## 1. Tese estratégica

Até a Fase 9, Kavita é um **marketplace B2B regional** com governança
admin madura. O produto conecta produtor a corretora, mas o rito da
negociação termina off-system (handshake manual, liquidação no banco
do comprador, nota fiscal emitida pelo contador do produtor).

A Fase 10 fecha o vácuo de confiança mais caro desse mercado: o papel.
O café é um mercado de fio de bigode entre pessoas, mas **banco e
trading só aceitam o título assinado**. Ao se tornar o repositório
oficial da verdade da negociação, Kavita deixa de ser "vitrine" e
passa a ser **a camada de registro**.

A Fase 11 é o pulo do gato de monetização: Asaas Split transforma a
operação de SaaS (ganha no fixo) em **fintech de nicho** (ganha no
take-rate). O risco operacional muda de qualidade — o suporte vai
receber "cadê meu dinheiro?" e precisa estar pronto.

### Posicionamento derivado

- Contrato digital → "Aqui a negociação tem valor jurídico desde o
  primeiro click."
- KYC/AML corretoras → "Aqui você só negocia com corretoras com
  CNPJ e sócios auditados."
- Ticker CEPEA → "Aqui o preço proposto é referenciado ao indicador
  ESALQ do dia — transparência não é promessa, é tela."
- Liquidação Asaas Split (Fase 11) → "O dinheiro não some — fica em
  custódia até a entrega ser confirmada."

Cada um desses quatro pontos é um argumento de venda independente
que justifica reajuste de plano PRO/MAX.

---

## 2. Decisões travadas (2026-04-20)

| Decisão | Escolha | Racional |
|---|---|---|
| Sequência | 10.1 primeiro; 10.2, 10.3, 10.4 em paralelo | Valor atrai cliente, compliance retém cliente. Começar pelo que vende. |
| Provedor de assinatura | ClickSign | API limpa, custo por assinatura baixo (~R$ 0,80–2), maduro no BR |
| Provedor KYC | Serpro Datavalid ou BigDataCorp | Escolha final por benchmark de preço/cobertura na 10.2 |
| Ticker | CEPEA-ESALQ (arábica) + ICE "C" (NY) | Scraping com fallback 24h; avaliar feed pago se fonte cair |
| Templates de contrato | Dois modelos: CV Disponível + CV Entrega Futura | Ritos diferentes no agronegócio; jurídico vai entregar os dois |
| Repasse de custo | Taxa de Tecnologia embutida no plano | Custos operacionais (~R$ 3–5 por negócio) são irrisórios perto do ticket |
| PDF oficial | SHA-256 + QR Code de verificação no rodapé | QR dá ar institucional quando o papel é impresso |

### Validação pendente antes do primeiro PR

- [ ] Jurídico entrega os dois templates (CV Disponível + CV Entrega Futura)
- [ ] Orçamento confirma custo ClickSign + Serpro/BigDataCorp
- [ ] Contador valida rito fiscal do produtor rural PF em MG (impacta 11.2)

---

## 3. Mapa de dependências

```
                 Base entregue (Fases 1-9)
                           |
      +--------------+-----+--------+--------+
      |              |              |        |
    [10.1]        [10.2]         [10.3]   [10.4]
   Contrato       KYC/AML       LGPD 2.0  Ticker
   +Assinat.    corretoras      (DPO)     CEPEA
      |              |
      +------+-------+
             |
           [11.1]
         Asaas Split
         (Escrow)
             |
      +------+------+
      |             |
    [11.2]       [11.3]
    NFPe/NFe    CPR eletrônica
```

Só há duas dependências duras:

1. **10.1 bloqueia 11.1** — não há escrow sem contrato assinado como gatilho
2. **10.1 + 10.2 bloqueiam 11.3** — CPR exige contrato + KYC da corretora

Todo o resto pode paralelizar conforme capacidade.

---

## 4. Sub-fases da Fase 10

### 10.1 — Contrato + Assinatura Digital [CRÍTICO]

**Esforço:** 4 SP · **Dependência:** nenhuma · **Prioridade:** máxima

**Entregáveis técnicos**

- Migration `contratos`:
  - `id`, `lead_id`, `corretora_id`, `produtor_id`, `tipo` (disponivel | entrega_futura)
  - `pdf_url`, `hash_sha256`, `qr_verification_token`
  - `signer_provider` (clicksign), `signer_document_id`, `signer_envelope_id`
  - `status` (draft | sent | signed_partial | signed | cancelled | expired)
  - `sent_at`, `signed_at`, `created_by_user_id`
- `services/contratoService.js`:
  - `gerarPdf(lead, tipo)` — Puppeteer renderiza template Handlebars
    com dados do lote, calcula SHA-256, gera QR Code apontando para
    `APP_URL/verificar/{qr_verification_token}`
  - `enviarParaAssinatura(contrato)` — chama ClickSign API
  - `consumirWebhookClicksign(evento)` — atualiza status
- Rotas:
  - `POST /api/corretora/contratos/:lead_id` (gerar, corretora)
  - `POST /api/corretora/contratos/:id/enviar` (disparar assinatura)
  - `GET /api/corretora/contratos/:id/pdf` (baixar)
  - `GET /api/public/verificar/:token` (página pública de verificação)
  - `POST /api/public/webhooks/clicksign` (com HMAC validation)
- Audit em `corretora_lead_events`:
  - `contract_generated`, `contract_sent`, `contract_signed_partial`,
    `contract_signed`, `contract_cancelled`
- UI corretora: botão "Gerar contrato" em `/painel/corretora/leads/[id]`
  (habilitado apenas quando status é `deal_won`)
- UI produtor: página `/painel/produtor/contratos` lista os contratos
  pendentes e assinados com download
- Página pública `/verificar/[token]` mostra hash, partes, data de
  assinatura — serve para o "QR Code institucional"

**Templates jurídicos (input do jurídico)**

- `templates/contratos/cv-disponivel.hbs` — compra e venda de café
  já colhido, entrega curta (30 dias), sem variação de preço
- `templates/contratos/cv-entrega-futura.hbs` — compra a termo,
  cláusulas de safra, tolerância de qualidade, reajuste se cabível

**Feito quando**

Um lead `deal_won` vira contrato gerado pela corretora, o produtor
recebe email/WhatsApp da ClickSign, assina, o PDF final tem hash
SHA-256 + QR Code funcional, e ambos recebem cópia. O evento
`contract_signed` aparece na timeline do lead.

**Riscos**

- ClickSign rejeita quem não tem CPF validado → mitigar na 10.2 (KYC)
- Volume inicial baixo pode ficar abaixo do mínimo ClickSign → plano
  de contingência com D4Sign como reserva

---

### 10.2 — KYC/AML Corretoras [IMPORTANTE]

**Esforço:** 2.5 SP · **Dependência:** nenhuma · **Paralelo à 10.1**

**Entregáveis técnicos**

- Migration `corretora_kyc`:
  - `corretora_id`, `cnpj`, `razao_social_oficial`, `qsa_json`
  - `provider` (serpro | bigdatacorp), `provider_response_raw`
  - `risk_score`, `status` (pending | auto_approved | admin_review | approved | rejected)
  - `verified_at`, `verified_by_admin_id`, `reject_reason`
- Service `kycService.verificar(cnpj)` com timeout + retry
- Novo status de corretora: `pending_kyc` entre `draft` e `active`
- Gate hard: `corretoraService.generateContrato` bloqueia se
  `corretora.kyc_status != 'approved'`
- Painel admin `/admin/kyc` com fila de revisão manual
- Badge público "CNPJ verificado" no card da corretora

**Argumento comercial**

Na página pública da corretora, o selo "Verificada Kavita · CNPJ e
sócios auditados" é posicionamento, não apenas compliance. Isso
justifica o produtor fechar por aqui em vez de WhatsApp direto.

**Feito quando**

Nova corretora percorre pipeline `registro → pending_kyc →
auto_check → (auto_approve | admin_review) → approved`, e só pode
emitir contratos (10.1) após `approved`.

**Riscos**

- Serpro tem SLA variável → cache agressivo + reuso de 30d
- Sócio PEP ou restrição Bacen cai em `admin_review` obrigatório

---

### 10.3 — LGPD 2.0 [IMPORTANTE]

**Esforço:** 1.5 SP · **Dependência:** nenhuma · **Paralelo à 10.1**

**Entregáveis técnicos**

- Página autenticada `/painel/produtor/meus-dados`:
  - Export completo (reaproveita export CSV existente)
  - Solicitação de exclusão (soft-delete 30d + anonimização
    `corretora_leads.telefone_normalizado` → hash)
- Endpoint `POST /api/producer/lgpd/delete-request`
- Canal do titular público: `/privacidade` com formulário + email
  `dpo@kavita.com.br`
- Documentação em `docs/compliance/`:
  - `ripd.md` — Relatório de Impacto à Proteção de Dados
  - `bases-legais.md` — mapeamento por categoria de dado
  - `retencao.md` — política de retenção por tabela
  - `incidente-anpd.md` — fluxo de notificação em 72h
- Runbook atualizado em `docs/runbook.md` com passos de incidente
- Cookie banner revisado (Turnstile invisível não basta)

**Feito quando**

Um produtor consegue pedir e receber seus dados em até 48h pela UI,
existe documentação de RIPD versionada no repo, e o runbook cobre
notificação ANPD.

---

### 10.4 — Ticker CEPEA Real-Time [IMPORTANTE]

**Esforço:** 1.5 SP · **Dependência:** nenhuma · **Paralelo à 10.1**

**Entregáveis técnicos**

- Migration `market_quotes` (source, symbol, price_brl, price_usd,
  quoted_at)
- Cron `scripts/fetch-cepea.js` rodando 4×/dia úteis:
  - Pega CEPEA-ESALQ arábica (indicador 4/5 bica corrida) via CSV
    público ou scraping do HTML
  - Pega ICE "C" (NY) via fonte gratuita (Yahoo Finance API)
  - Grava snapshot em `market_quotes`
- Service `marketQuotesService.current()` com cache em memória 5min
- Endpoint público `GET /api/public/market-quotes/current`
- Refactor `MarketStrip` consumindo o endpoint, com fallback
  gracioso se snapshot mais recente for > 24h
- Formulário de proposta no painel da corretora referencia cotação
  do dia como sugestão de preço

**Feito quando**

`MarketStrip` mostra preço CEPEA do dia com timestamp, o produtor
público vê a cotação, e a corretora pode propor "+X sobre CEPEA" na
proposta.

**Riscos**

- Scraping CEPEA quebra se HTML mudar → monitorar taxa de erro do
  cron, alerta via email quando > 30%
- Plano B: assinar feed pago CEPEA (~R$ 500/mês) se scraping virar
  manutenção crônica

---

### Polimento técnico (sprints paralelas) [POLIMENTO]

**Esforço:** 2 SP distribuído · **Dependência:** nenhuma

Itens 🟢 do parecer da consultoria estratégica:

- [ ] Checkout URL persistido (`0.2 SP`) — evita perder link se
      corretora fechar aba
- [ ] Paginação audit log com `meta.pages` + `total` (`0.2 SP`)
- [ ] Realtime SSE substitui polling de 60s (`0.8 SP`)
- [ ] Dashboard Grafana: SLA médio, volume/cidade, taxa aprovação
      de reviews (`0.5 SP`)
- [ ] `mercado_cafe_manage` granular (approve/moderate/plan em 3
      capabilities separadas) (`0.3 SP`)

---

## 5. Esforço e calendário

| Sub-fase | SP | Semanas (solo) | Dev pode paralelizar? |
|---|---:|---:|---|
| 10.1 Contrato + Assinatura | 4.0 | 4 | Não (fio condutor) |
| 10.2 KYC/AML | 2.5 | 2-3 | Sim (após schema do 10.1) |
| 10.3 LGPD 2.0 | 1.5 | 1-2 | Sim |
| 10.4 CEPEA | 1.5 | 1-2 | Sim |
| Polimento | 2.0 | distribuído | Sim |
| **Total Fase 10** | **11.5** | **8-10 semanas** | — |

Premissa: 1 dev pleno solo, 4h efetivas/dia úteis. Se dobrar o
time, divide pela metade. Se trocar por dev sênior com experiência
em ClickSign, corta 2 semanas.

---

## 6. Fase 11 — visão do próximo ciclo

Não entra em detalhe aqui — ganha doc próprio ao fim da Fase 10.
Resumo para manter no horizonte:

| Sub-fase | SP | Dependência |
|---|---:|---|
| 11.1 Asaas Split (escrow) | 3 | 10.1 |
| 11.2 NFPe/NFe (Focus NFe) | 4 | 11.1 |
| 11.3 CPR eletrônica (B3 Reg./CERC) | 5 | 10.1 + 10.2 |

### Alerta operacional da transição 10 → 11

O salto de SaaS para fintech de nicho muda o tipo de suporte que a
operação recebe. Preparar **antes** de ligar a 11.1:

- FAQ dedicado "quando o dinheiro é liberado?"
- Template de resposta para "comprador atrasou o pagamento"
- Canal direto de escalada (WhatsApp Business dedicado)
- SLA interno de resposta financeira (ex.: 2h úteis)

Sem isso, a 11.1 vira pesadelo de reputação mesmo com a tecnologia
funcionando.

---

## 7. Marcos verificáveis

### Marco Fase 10

> Uma corretora verificada (KYC aprovado) gera contrato assinado
> digitalmente com um produtor, referenciando cotação CEPEA do dia,
> e o sistema mantém trilha auditável LGPD-compliant. O PDF final
> tem hash SHA-256 + QR Code público de verificação.

**Nota de robustez projetada:** 7.4 → 8.4

### Marco Fase 11

> Comprador paga dentro do sistema via Asaas Split, dinheiro fica em
> custódia, produtor confirma entrega, split executa, NFPe do
> produtor rural é emitida automaticamente, e o contrato vira CPR
> registrada na B3.

**Nota de robustez projetada:** 8.4 → 9.0+

---

## 8. Riscos consolidados e mitigações

| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| ClickSign exige CPF validado que KYC não cobre | Média | Alto | 10.2 valida CPF do responsável legal da corretora antes do primeiro contrato |
| Scraping CEPEA quebra | Média | Médio | Alerta de taxa de erro + fallback 24h + plano B com feed pago |
| Jurídico atrasa templates | Alta | Alto | Começar 10.2/10.3/10.4 em paralelo; 10.1 não bloqueia ninguém no primeiro mês |
| SEFAZ-MG NFPe produtor PF é mais complexa que supõe-se | Média | Alto | Validar com contador antes de tocar 11.2 |
| Asaas Split tem limite de volume | Baixa no MVP | Alto | Monitorar desde a primeira operação; ter contato BV Agro para escalada |
| Custo ClickSign cresce com volume | Baixa | Baixo | Repasse via Taxa de Tecnologia já decidido |
| Corretora reclama do gate de KYC | Alta | Médio | Comunicar como selo de qualidade, não como barreira; auto_approval rápido para CNPJ limpo |
| Suporte financeiro despreparado na 11.1 | Alta | Muito alto | FAQ + templates + canal dedicado **antes** de ligar o Split |

---

## 9. Próximos passos imediatos (semana 2026-04-20 → 2026-04-27)

1. **Jurídico** — abrir solicitação dos dois templates (CV Disponível
   + CV Entrega Futura) com cláusulas mínimas: preço, sacas, bebida,
   peneira, prazo entrega, multa 10%, foro comarca da corretora
2. **Financeiro** — aprovar orçamento ClickSign + Serpro/BigDataCorp
   (benchmark dos dois)
3. **Técnico** — abrir PR de esqueleto da migration `contratos` + stub
   de `contratoService.gerarPdf` (sem integração ClickSign ainda)
4. **Comercial** — rascunhar comunicado "Novo: contrato digital com
   validade jurídica" para lançamento ao fim da Fase 10
5. **Operação** — listar corretoras atuais que precisarão passar por
   KYC retroativo (10.2 ligado)

---

## 10. Histórico de decisões

| Data | Decisão | Autor |
|---|---|---|
| 2026-04-20 | Aprovação da Fase 10 e priorização por valor comercial | Product Owner |
| 2026-04-20 | Sequência 10.1 primeiro; 10.2/10.3/10.4 em paralelo | Product Owner |
| 2026-04-20 | ClickSign como provedor de assinatura | Product Owner |
| 2026-04-20 | Dois templates jurídicos (Disponível + Entrega Futura) | Product Owner |
| 2026-04-20 | QR Code + SHA-256 no rodapé de PDFs oficiais | Product Owner |
| 2026-04-20 | Custos operacionais repassados via Taxa de Tecnologia | Product Owner |

Este arquivo deve ser atualizado sempre que uma decisão nova for
tomada ou uma premissa mudar. Não versionamos aqui detalhe de
implementação — PRs e commits são a fonte da verdade do código.
