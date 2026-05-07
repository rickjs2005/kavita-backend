# Auditoria de Custos e APIs Externas — Kavita

> Data: 2026-05-09
> Tipo: análise técnica + financeira.
> Escopo: inventário completo de serviços externos, infra e custos regulatórios do Kavita (backend + frontend + módulo Mercado do Café).
> Solo dev no Brasil (CNPJ ainda não obrigatório, mas alguns SaaS exigem para faturamento).

---

## Sumário

1. [APIs e serviços já integrados no código](#1-apis-e-servicos-ja-integrados-no-codigo)
2. [APIs do roadmap (planejadas, não integradas)](#2-apis-do-roadmap-planejadas-nao-integradas)
3. [Infraestrutura e custos operacionais](#3-infraestrutura-e-custos-operacionais)
4. [Custos regulatórios e jurídicos](#4-custos-regulatorios-e-juridicos)
5. [Resumo executivo + 3 cenários](#5-resumo-executivo--3-cenarios)

> **Convenções:** preços em **R$** quando o provider cobra em real, em **USD** quando cobra em dólar. `⚠️ verificar` indica que o preço público não foi confirmado e precisa ser cotado direto com o provedor antes de assumir.

---

## 1) APIs e serviços já integrados no código

### 1.1 Pagamento

#### Mercado Pago (e-commerce)

| Item | Valor |
|---|---|
| **Função no Kavita** | Gateway de checkout do e-commerce (carrinho → pagamento → pedido). Webhooks com HMAC-SHA256. |
| **Onde** | `services/paymentService.js`, `services/paymentWebhookService.js`, `routes/ecommerce/payment.js`, `config/mercadopago.js` |
| **Webhook recebido** | `POST /api/payment/webhook` — valida `x-signature` |
| **Status** | **Em produção** |
| **Env vars** | `MP_ACCESS_TOKEN` (obrigatório prod, "APP_USR-…"), `MP_WEBHOOK_SECRET`, `MP_WEBHOOK_URL` (https obrigatório prod) |
| **Modelo de cobrança** | % sobre transação. **PIX 0,99%–1,99%** (link de pagamento). **Cartão crédito 4,98%** à vista; **8,99%** parcelado em 12x. **Débito 1,99%** (ou 0,74% no plano otimizado). |
| **Sem mensalidade** | Sim — cobrança apenas sobre transação realizada. |
| **Free tier** | Conta grátis; cobra só por pagamento processado. |
| **Bloqueante?** | **Sim** para checkout do e-commerce. Sem isso, módulo de pedidos não funciona. |
| **CNPJ exigido?** | **Não** para PF. Aceita CPF como vendedor. |

#### Asaas (assinaturas das corretoras + futuro split de escrow)

| Item | Valor |
|---|---|
| **Função no Kavita** | Subscription recorrente do plano da corretora (PRO R$ 99/mês, MAX R$ 349/mês). Webhook de status de pagamento. **Fase 11.1 vai usar Asaas Split** para escrow de café. |
| **Onde** | `services/payment/asaasAdapter.js`, `services/payment/asaasDomainHandler.js`, `services/corretoraPaymentService.js` |
| **Webhook recebido** | `POST /api/webhooks/asaas` — valida header `asaas-access-token` (constant-time) |
| **Status** | **Em staging** (sandbox configurado em `ASAAS_API_URL=https://sandbox.asaas.com/api/v3`). Aguarda cutover para prod. |
| **Env vars** | `ASAAS_API_KEY`, `ASAAS_API_URL`, `ASAAS_WEBHOOK_TOKEN` |
| **Modelo de cobrança** | Por cobrança recebida: **PIX R$ 1,99/transação** (R$ 0,99 nos 3 primeiros meses); **Cartão R$ 0,49 + 1,99%** sobre o valor (em parcelado/recorrente); **Boleto** taxa fixa por boleto pago. |
| **Mensalidade** | Sem mensalidade. Cobra só por cobrança recebida. |
| **Split** | Já incluso no plano-padrão sem custo adicional — taxa da cobrança é descontada antes da divisão. |
| **Bloqueante?** | **Sim** para monetização de corretoras. Sem isso, plano PRO/MAX não cobra automaticamente (cai no fluxo `payment_method=manual` do admin). |
| **CNPJ exigido?** | **Verificar** — Asaas geralmente aceita PF, mas para Split de pagamento alguns casos pedem CNPJ. ⚠️ confirmar antes da Fase 11.1. |

### 1.2 Assinatura digital de contratos

#### ClickSign

| Item | Valor |
|---|---|
| **Função no Kavita** | Assinatura digital de contratos de compra/venda de café (PRODUTOR ↔ CORRETORA). Envio do PDF, validação de signatário por email + HMAC do webhook. |
| **Onde** | `services/contratos/clicksignAdapter.js`, `services/contratoSignerService.js`, `services/contratoService.js` |
| **Webhook recebido** | `POST /api/webhooks/clicksign` — `Content-HMAC: sha256=<hex>` (express.raw + HMAC) |
| **Status** | **Stub em dev/staging.** ClickSign sandbox configurado. Em prod, `CONTRATO_SIGNER_PROVIDER=stub` é **bloqueado no boot** (`config/env.js`) — força `clicksign` real. |
| **Env vars** | `CONTRATO_SIGNER_PROVIDER`, `CLICKSIGN_API_TOKEN`, `CLICKSIGN_API_URL`, `CLICKSIGN_HMAC_SECRET` |
| **Modelo de cobrança** | Por documento enviado a assinatura. **Plano "20 docs" R$ 4,90/doc** (≈ R$ 98/mês). **Plano "100 docs" R$ 4,00/doc** (R$ 400/mês). **Plano "200 docs Plus" R$ 3,60/doc**. **Plus + Automação 100 docs R$ 235/mês** com 10 usuários. |
| **WhatsApp/SMS extra** | R$ 0,50 por WhatsApp, R$ 0,50 por SMS (se usar canal além de email). |
| **Free tier** | Período de teste gratuito (~5 docs). Sem free tier permanente. |
| **Bloqueante?** | **Sim** para Fase 10.1 (contratos digitais). Sem isso, contratos viram PDF impresso e perde a auditabilidade. |
| **CNPJ exigido?** | **Verificar** — planos pessoais possíveis, mas API e suporte profissional costumam pedir CNPJ. ⚠️ |

### 1.3 Mensageria

#### WhatsApp Business Cloud API (Meta)

| Item | Valor |
|---|---|
| **Função no Kavita** | Notificações transacionais ao produtor: status de pedido, magic-link motorista, alerta de lead novo, contrato assinado. **NÃO usado ainda** para o copy humanizado novo do `humanMessageBuilder` — está em modo `stub` por padrão. |
| **Onde** | `services/whatsapp/adapters/api.js`, `services/whatsapp/whatsappService.js`, `services/whatsapp/whatsappWebhookService.js`. Adapters: `stub` (default), `manual` (gera link `wa.me`), `api` (Meta Cloud real) |
| **Webhook recebido** | `POST /api/webhooks/whatsapp` — `X-Hub-Signature-256` HMAC + GET verify token |
| **Status** | **Stub em dev**, **manual em staging**. API real ainda não ativada (precisa templates aprovados pela Meta + permanent token). |
| **Env vars** | `WHATSAPP_PROVIDER`, `WHATSAPP_API_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_API_VERSION`, `WHATSAPP_WEBHOOK_VERIFY_TOKEN`, `WHATSAPP_WEBHOOK_SECRET`, `WHATSAPP_TEMPLATE_*` (6 templates) |
| **Modelo de cobrança (Meta, julho 2025+)** | **Per-message pricing** desde 1 jul/2025. Brasil: **Marketing USD $0,0625/msg**; **Utility USD $0,0068/msg** (1–1.000), USD $0,0065 (1.001–10.000), com escalonamento; **Authentication** (não usado aqui). |
| **Janela 24h** | Utility template enviado durante janela de atendimento de 24h é **GRATUITO**. Estratégia: usar `sendFreeText` quando dentro da janela, template aprovado quando fora. |
| **Free tier** | Primeiros 1.000 conversation/mês gratuitos (legado pré-jul/2025) — **descontinuado**. Hoje cobra desde a 1ª. |
| **Bloqueante?** | **Não** — fallback `manual` (link `wa.me`) funciona sem API. Bloqueante só se quiser disparo automático em massa fora da janela 24h. |
| **CNPJ exigido?** | **Sim** — WhatsApp Business Account exige CNPJ verificado pela Meta. Solo dev sem CNPJ usa modo `manual` apenas. |

#### Zenvia SMS

| Item | Valor |
|---|---|
| **Função no Kavita** | SMS transacional de fallback quando produtor opta por SMS no formulário. Usado pelo SMS humanizado em `corretoraLeadsService` (status new→contacted). |
| **Onde** | `services/sms/zenviaAdapter.js`, `services/smsService.js` |
| **Status** | **Opcional** (feature-flagged via presença de `ZENVIA_TOKEN`). |
| **Env vars** | `ZENVIA_TOKEN`, `ZENVIA_SMS_FROM`, `ZENVIA_ENDPOINT` |
| **Modelo de cobrança** | ~R$ 0,12–0,18/SMS no Brasil (varia com volume). ⚠️ verificar tabela atual com Zenvia |
| **Free tier** | Sem free tier permanente; trial inicial de poucos SMS. |
| **Bloqueante?** | **Não** — SMS é opt-in do produtor. |
| **CNPJ exigido?** | **Sim** — Zenvia exige CNPJ para conta de envio. |

### 1.4 Email transacional

#### SendGrid (recomendado para prod)

| Item | Valor |
|---|---|
| **Função no Kavita** | Email transacional: reset de senha, confirmação de cadastro, lead recebido (corretora + produtor), follow-up 7d, alerta leads parados, trial expirando. |
| **Onde** | `services/mail/transport.js`, `services/mailService.js` |
| **Status** | **Em produção** quando `MAIL_PROVIDER=sendgrid` setado. Atualmente env exemplo está como `disabled` (dev). |
| **Env vars** | `MAIL_PROVIDER=sendgrid`, `SENDGRID_API_KEY`, `MAIL_FROM`, `MAIL_FROM_NAME` |
| **Modelo de cobrança** | **Trial 60 dias** (100 emails/dia ≈ 3.000/mês); **Essentials USD $19,95/mês** até 100k emails; **Pro USD $89,95/mês** até 2,5M. **Plano free permanente foi descontinuado em 2025.** |
| **Free tier** | Não há mais free tier permanente — após 60 dias precisa pagar. |
| **Bloqueante?** | **Sim** em produção (sem email transacional, fluxo de auth e notificação não fecha). |
| **CNPJ exigido?** | **Não** — aceita CPF para conta. |

#### SMTP genérico (alternativas)

- **AWS SES**: USD $0,10/1.000 emails. **Sem mensalidade**. Exige verificação de domínio. Mais barato para alto volume. **Sem CNPJ obrigatório** (aceita conta AWS de PF).
- **Resend**: USD $20/mês (50k emails) — concorrente direto do SendGrid.
- **Mailgun**: USD $35/mês (50k emails).
- **Postmark**: USD $15/mês (10k emails).

#### Gmail legado (fallback dev only)

| Item | Valor |
|---|---|
| **Status** | Deprecado. Aceito em dev com `EMAIL_USER` + `EMAIL_PASS` (app password). Senhas expiram com frequência. |
| **Bloqueante?** | Não em prod. |

### 1.5 Cotações e dados agrícolas

#### Yahoo Finance API v8 (cotação ICE café)

| Item | Valor |
|---|---|
| **Função** | Cotação do contrato futuro de café arábica (KC=F) na NY ICE. |
| **Onde** | `services/cotacoes/iceAdapter.js`, `jobs/cotacoesSyncJob.js` |
| **Status** | **Em produção** (sync 4h ou conforme `COTACOES_SYNC_CRON`). |
| **URL** | `https://query1.finance.yahoo.com/v8/finance/chart/KC=F` |
| **Cobrança** | **Gratuita**, sem chave API. Frágil — pode mudar de comportamento sem aviso. |
| **Bloqueante?** | **Não** — fallback gracioso (UI mostra "—"). |

#### Notícias Agrícolas (scraping CEPEA)

| Item | Valor |
|---|---|
| **Função** | Cotação CEPEA arábica (Esalq) via scraping do HTML público. |
| **Onde** | `services/cotacoes/noticiasAgricolasAdapter.js` |
| **URL** | `https://www.noticiasagricolas.com.br/cotacoes/cafe/indicador-cepea-esalq-cafe-arabica` |
| **Status** | **Em produção** com regex tolerante + fallback (min/max). |
| **Cobrança** | **Gratuita**, mas **viola ToS** se interpretado estritamente — risco operacional. Plano B documentado: feed pago CEPEA ≈ R$ 500/mês ⚠️ verificar |
| **Bloqueante?** | Não — fallback gracioso. |

#### Open-Meteo (clima)

| Item | Valor |
|---|---|
| **Função** | Previsão de tempo + chuva para cidades cafeeiras (Kavita News). |
| **Onde** | `services/climaSyncService.js`, `jobs/climaSyncJob.js` |
| **URLs** | `api.open-meteo.com/v1/forecast`, `geocoding-api.open-meteo.com/v1/search` |
| **Cobrança** | **Gratuita** (free tier 10.000 calls/dia). Rate limit 1,5s entre requests. |
| **Bloqueante?** | Não. |

#### BCB PTAX (cotação dólar)

- URL: `https://olinda.bcb.gov.br/olinda/servico/PTAX/...`
- **Gratuito**, sem chave. Endpoint público do Banco Central.

#### Stooq (descontinuado)

- Antes usava `stooq.pl/q/d/l/`. Agora exige API key. **Desativado em código** — Yahoo Finance é a fonte ativa.

### 1.6 KYC / Verificação

#### BigDataCorp (CNPJ + QSA)

| Item | Valor |
|---|---|
| **Função** | Validação de CNPJ da corretora durante onboarding (Receita Federal + QSA — Quadro de Sócios). Bloqueante para aprovação de corretora em produção. |
| **Onde** | `services/kyc/kycBigdatacorpAdapter.js`, `services/kyc/kycMockAdapter.js`, `services/kyc/kycProviderResolver.js` |
| **Status** | **Mock em dev/staging.** Em prod, `KYC_PROVIDER=mock` é **bloqueado**. Sem credencial paga, KYC fica travado. |
| **Env vars** | `KYC_PROVIDER`, `BIGDATACORP_ACCESS_TOKEN`, `BIGDATACORP_TOKEN_ID` |
| **API** | `POST https://plataforma.bigdatacorp.com.br/empresas` |
| **Modelo de cobrança** | **Pay-as-you-use**. Estimativa pública não disponível na página — preço sob consulta. ⚠️ verificar (referência de mercado: ~R$ 0,30–1,00 por consulta CNPJ + QSA, depende do pacote). |
| **Free tier** | Nenhum permanente. Pode ter trial inicial. |
| **Bloqueante?** | **Sim** em produção para aprovar nova corretora. Alternativa: usar fonte gratuita (Receita WS, Sintegra) com cobertura limitada. |
| **CNPJ exigido?** | **Sim** para contratar BigDataCorp. |

**Alternativas mais baratas (avaliar antes de fechar BigDataCorp):**
- **CNPJá API** — free tier real, ~R$ 0,01–0,05 por consulta. Cobertura RF + QSA.
- **ReceitaWS** — gratuito mas com rate limit + sem QSA confiável.
- **Serpro Datavalid/CNPJ** — caro e exige CNPJ + contrato.

### 1.7 Storage de mídia

#### AWS S3 (recomendado para prod)

| Item | Valor |
|---|---|
| **Função** | Upload de imagens (produtos, drones, news, KYC corretoras), PDFs de contratos, comprovantes motorista. |
| **Onde** | `services/media/adapters/s3Adapter.js`, `services/mediaService.js` |
| **Status** | Plugável. Default = `disk` (local). S3 ativa via env. |
| **Env vars** | `MEDIA_STORAGE_DRIVER=s3`, `AWS_S3_BUCKET`, `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_S3_ENDPOINT` (opcional para R2/MinIO/Wasabi) |
| **SDK** | `@aws-sdk/client-s3` v3 |
| **Modelo de cobrança** | **USD $0,023/GB-mês** storage; **USD $0,09/GB egress** após 100GB free; ~USD $0,005/1k requests PUT/COPY/POST. |

#### Cloudflare R2 (alternativa muito mais barata)

- **USD $0,015/GB-mês** storage.
- **Egress 100% gratuito** (zero — diferencial massivo vs S3).
- **API S3-compatível** — driver `s3Adapter.js` funciona com `AWS_S3_ENDPOINT=https://<account>.r2.cloudflarestorage.com`.
- **Free tier**: 10 GB storage + 1M requests/mês gratuitos.

> **Recomendação:** usar **R2 desde o dia 1** se ainda não fechou S3. Reduz custo em 30–95% conforme egress (PDFs de contratos baixados pelo produtor causam egress significativo).

#### Disco local (default)

- Sem custo de SaaS. Custo embutido no plano da VPS/EC2.
- Risco: dados perdidos se VPS falhar. Backup do volume necessário.

### 1.8 Observabilidade

#### Sentry (error tracking)

| Item | Valor |
|---|---|
| **Função** | Captura de erros 5xx + uncaught exceptions + APM tracing. LGPD-friendly (scrubbing de CPF, email, telefone). |
| **Onde** | `lib/sentry.js` (backend), `instrumentation.ts` + `sentry.*.config.ts` (frontend) |
| **Status** | **Opt-in** (no-op se DSN ausente). Recomendado para prod. |
| **Env vars** | `SENTRY_DSN` (backend), `NEXT_PUBLIC_SENTRY_DSN` (frontend), `SENTRY_TRACES_RATE` |
| **SDKs** | `@sentry/node` v10.49, `@sentry/nextjs` v10.50 |
| **Modelo de cobrança** | **Developer (free)**: 5.000 errors/mês + 10.000 spans + 1 user + 30 dias retenção. **Team USD $26/mês** (anual) ou $29/mês: 50k errors + 5M spans + 5 users. **Business USD $80/mês** (anual). |
| **Bloqueante?** | **Não** — opt-in. Sem Sentry, erros aparecem no log estruturado (Pino). |
| **CNPJ exigido?** | Não. |

#### Pino (logger) + Datadog/CloudWatch (futuro)

- **Pino** é dependência interna, sem custo.
- **Datadog/CloudWatch/Loki** podem consumir os logs JSON em prod. Datadog ~USD $15/host/mês ⚠️ opcional.

### 1.9 Frontend / utilidades

#### Google Maps

| Item | Valor |
|---|---|
| **Função** | Embed de mapa nas páginas (corretoras, drones, etc). Configurado via `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` mas **uso ativo no código não confirmado**. ⚠️ verificar |
| **Modelo de cobrança** | USD $200 free credit/mês; depois USD $7/1k chamadas Maps Embed; USD $5/1k chamadas Places. |
| **Bloqueante?** | Não — verificar se está realmente em uso antes de configurar. |

#### Cloudflare Turnstile (CAPTCHA)

| Item | Valor |
|---|---|
| **Função** | Anti-bot em formulários públicos (cadastro, contato, lead). |
| **Env** | `NEXT_PUBLIC_TURNSTILE_SITE_KEY` |
| **Modelo de cobrança** | **Gratuito** até 1 milhão de solves/mês (free tier permanente). Acima disso, salto direto para Enterprise USD $2.000/mês. |
| **Bloqueante?** | Recomendado para prod. Não bloqueante. |

#### ViaCEP

- URL: `https://viacep.com.br/ws/{cep}/json/`
- **Gratuito**, sem chave. Rate limit informal.

---

## 2) APIs do roadmap (planejadas, não integradas)

Detalhamento em `docs/roadmap-fase-10.md`, `docs/roadmap-fase-10-entregue.md` e `docs/billing-mercado-cafe.md`.

### 2.1 Fase 11.1 — Asaas Split (escrow)

| Item | Valor |
|---|---|
| **O que resolve** | Comprador paga via PIX/cartão, dinheiro fica em **custódia (escrow)** no Asaas até produtor confirmar entrega da amostra. Quando libera, repassa para corretora descontando comissão Kavita. Transição de SaaS para fintech de nicho. |
| **Status** | **Planejado** (3 SP). Asaas adapter base já existe (planos). Split específico não. |
| **Custo extra** | Asaas Split é **incluído no plano-padrão** sem fee adicional — taxa da cobrança (PIX/cartão/boleto) é descontada antes da divisão. Sem mensalidade extra. |
| **Risco** | Asaas tem limite de volume. Mitigação documentada: monitorar desde primeira operação + contato BV Agro. |
| **Bloqueante?** | Sim para Fase 11.1 entrar em produção. |

### 2.2 Fase 11.2 — NFPe / NFe (emissão fiscal)

| Item | Valor |
|---|---|
| **O que resolve** | Quando escrow é liberado, sistema emite NFPe automaticamente em nome do produtor rural PF (SEFAZ-MG). |
| **Provedor candidato** | **Focus NFe** — provedor de emissão fiscal integrado. |
| **Status** | **Pré-design** (4 SP). Nenhum código de fiscal ainda. |
| **Custo Focus NFe** | **Solo R$ 89,90/mês** (1 CNPJ, 100 NFs); **Start R$ 113,90/mês** (3 CNPJ); **Growth R$ 548/mês** (CNPJs ilimitados, 4.000 NFs); **Enterprise** custom para 50k+/mês. **Trial 30 dias.** Plano específico para produtor rural não existe — mas aceita e-CPF A1 do produtor. |
| **Custos colaterais** | **Certificado digital e-CPF A1**: ~R$ 200–300/ano (validade 1 ano) ou ~R$ 400/3 anos (A3 com token). **Cada produtor PF** que emitir NFPe via Kavita precisa do dele OU usa NFF (Nota Fiscal Fácil) gov.br SEM certificado. |
| **Riscos jurídicos** | SEFAZ-MG NFPe para PF é mais complexa que para PJ. **Bloqueante**: validação com contador antes de tocar 11.2. |
| **NF-e produtor rural obrigatória 5/jan/2026** (já está em vigor — todas as operações). |
| **Bloqueante?** | Sim para Fase 11.2. |
| **CNPJ exigido?** | Focus NFe pode aceitar e-CPF do solo dev para teste, mas para emissão em produção em nome de terceiros (corretoras), CNPJ + procuração eletrônica recomendados. ⚠️ verificar |

### 2.3 Fase 11.3 — CPR Eletrônica (B3 / CERC)

| Item | Valor |
|---|---|
| **O que resolve** | Cédula de Produto Rural eletrônica registrada na B3 ou CERC (Banco Central). Permite produtor usar como garantia em empréstimos bancários. |
| **Provedor candidato** | **B3 Registro** ou **CERC**. |
| **Status** | **Pré-design** (5 SP). |
| **Custo** | **Não documentado publicamente.** B3 cobra por registro; CERC tem tabela própria. ⚠️ verificar com B3 e CERC diretamente. |
| **Bloqueante regulatório** | Pode exigir Kavita ser regulada como **fintech de crédito** pelo BC. Risco alto de virar projeto de 3–6 meses de adequação regulatória. |
| **Bloqueante?** | Sim para 11.3, mas 11.3 não é necessária para piloto comercial. |

### 2.4 Sintegra (validação inscrição estadual)

| Item | Valor |
|---|---|
| **O que resolve** | Cruzar inscrição estadual da corretora com base oficial. Vira bloqueante quando NFPe (11.2) entra em produção. |
| **Custo** | **Gratuito** (web service público da Receita / Sintegra). |
| **Status** | Estrutura preparada (`corretora_kyc.qsa` JSON), sem check ativo. 1–2 SP para implementar. |
| **Bloqueante?** | Sim para 11.2 (NFPe). |

### 2.5 Itens menores no roadmap

- **Retry manual de webhook_event** na reconciliação admin (UI faltando — backend pronto)
- **Persistência do checkout_url Asaas** na subscription (já implementado em commit 067f294)
- **Kanban em /leads** com drag-drop (UX, sem custo externo)

---

## 3) Infraestrutura e custos operacionais

### 3.1 Hospedagem

#### Backend (Node.js + Express)

| Item | Valor |
|---|---|
| **Stack** | Node 20 + Express + MySQL 2 raw pool. Dockerfile previsto (kavita-frontend tem; kavita-backend usa entrypoint próprio em `scripts/deploy/entrypoint.js` que roda migrations + start). |
| **CI/CD** | GitHub Actions publica imagem em **GitHub Container Registry (GHCR)** (workflow `cd.yml`). |
| **Recomendado para piloto** | **Railway** USD $5–20/mês (hobby plan + uso) ou **Fly.io** ~USD $5–15/mês ou **Hetzner CX22** ≈ €4,50/mês (≈ R$ 28). VPS Brasil (Locaweb, KingHost) R$ 30–60/mês. |
| **CNPJ exigido?** | Railway / Fly: cartão internacional, sem CNPJ. Hetzner: cartão sem CNPJ. VPS BR: pode pedir CNPJ ou aceitar PF. |

#### Frontend (Next.js 15)

| Item | Valor |
|---|---|
| **Stack** | Next.js 15 + Serwist PWA opt-in. Dockerfile multi-stage. Output standalone. |
| **Recomendado** | **Vercel hobby (gratuito)** para piloto (100GB bandwidth/mês, 100h build) — mas aceita só para projetos não-comerciais. Para comercial: Vercel Pro USD $20/mês. **Alternativa: Cloudflare Pages** (gratuito comercial até 100k requests/dia) ou rodar o container Next.js na mesma VPS do backend. |
| **CNPJ exigido?** | Vercel: cartão internacional, aceita PF. Cloudflare: aceita PF. |

### 3.2 Banco de dados

| Item | Valor |
|---|---|
| **Stack** | MySQL 8. Pool raw via `mysql2`. Sequelize só para migrations. 99 migrations desde 2026-02-24. |
| **Volume estimado piloto** | < 1 GB. Tabelas core: produtos (~hundreds), pedidos (mil/mês), corretoras (dezenas), leads (centenas/mês), whatsapp_messages (mil/mês). |
| **Opções de hosting** | **Railway MySQL** USD $5–10/mês inclui 1GB + scale. **PlanetScale** (MySQL serverless) USD $39/mês (Hobby foi descontinuado). **AWS RDS db.t3.micro** USD $13–17/mês. **Self-hosted** na mesma VPS do backend (R$ 0 extra mas exige backup manual). |
| **Backup** | Script `scripts/backup-mysql.js` (mysqldump gzipped, retenção 30 dias). Pode subir para S3/R2. |

### 3.3 Storage

Vide §1.7. **R2 recomendado** desde dia 1 (USD $0,015/GB + egress grátis vs S3 USD $0,023/GB + USD $0,09/GB egress).

**Estimativa de volume piloto:** ~500 MB iniciais (produtos + drones + news), crescimento ~50 MB/mês conforme corretoras subirem KYC + contratos PDF.

### 3.4 Email

Vide §1.4. Para piloto:
- **AWS SES** USD $0,10/1.000 emails — mais barato. Exige verificação de domínio (24–72h).
- **SendGrid Trial 60 dias** depois Essentials USD $19,95/mês — mais simples de configurar.

**Volume estimado:**
- Auth (reset, MFA): ~10/dia
- Lead recebido (corretora + produtor): ~20/dia
- Follow-ups + alertas: ~10/dia
- **Total: ~1.500/mês no piloto**, escala para ~15k/mês com 50 corretoras + 500 leads.

### 3.5 Domínio e SSL

| Item | Valor |
|---|---|
| **Domínio .com.br** | **R$ 40/ano** (Registro.br — exige CPF brasileiro). |
| **Domínio .com** | USD $10–15/ano (Cloudflare Registrar at-cost). |
| **SSL** | **Gratuito** via Let's Encrypt (auto-renovado pelo provider) ou Cloudflare. |

### 3.6 Observabilidade

Vide §1.8. **Sentry Developer (free)** suficiente para piloto — 5.000 errors/mês cobre solo dev tranquilo. Subir para Team USD $26/mês quando passar do limite.

### 3.7 CDN

- **Cloudflare** (free tier permanente cobre quase tudo o que esse projeto precisa: cache, SSL, DDoS).
- Vercel Edge Network já incluso se usar Vercel.

---

## 4) Custos regulatórios e jurídicos

| Item | Custo estimado | Quando precisa |
|---|---|---|
| **Templates de contrato (advogado especialista agro)** | **R$ 2.500–8.000** (única vez) | Antes do piloto comercial real (Fase 10.1). Mencionado em `roadmap-fase-10-entregue.md` linha 477. |
| **Validação fiscal com contador (PR rural MG)** | **R$ 800–2.000** (consulta inicial) + **R$ 200–400/mês** (acompanhamento) | Bloqueante para Fase 11.2 (NFPe). Mencionado em `roadmap-fase-10.md` linha 62. |
| **Certificado digital e-CPF A1** | **R$ 200–300/ano** | Quando solo dev for emitir NFPe em nome próprio ou da Kavita. |
| **Certificado digital e-CNPJ A1** | **R$ 250–400/ano** | Se abrir CNPJ. Necessário para Asaas Split e WhatsApp Business. |
| **CNPJ MEI** | R$ 71/mês DAS (R$ 853/ano) | MEI cobre até R$ 81k faturamento/ano. Para piloto ≥ R$ 100k/ano, precisa Simples ME (R$ 360k/ano limite). |
| **DPO / LGPD** | **R$ 500–1.500/mês** se contratar consultor | Não obrigatório no MVP solo dev (escala < 10 atendimentos/mês). Documentado em `compliance/ripd.md`. Email DPO atual: `privacidade@kavita.com.br`. |
| **Registro de marca (INPI)** | **R$ 322 (Net Bens — uma classe)** + R$ 745 se quiser proteção em mais classes. **Validade 10 anos.** | Recomendado antes de anúncio público (registrar "Kavita" + logo). |
| **Adequação Marco Civil + LGPD** | Templates prontos suficientes para MVP | Termos de uso e política de privacidade já em `kavita-frontend/src/app/privacidade` e `compliance/`. Revisão jurídica inicial: incluído no orçamento de templates de contrato. |
| **Inscrição como fintech de crédito (BC)** | **6 meses + R$ 50k+** estimado | **Apenas se 11.3 (CPR) entrar em produção**. Pode ser evitado parceria com banco/instituição autorizada. |

---

## 5) Resumo executivo + 3 cenários

### Tabela consolidada

| Serviço | Categoria | Status | Custo fixo/mês | Custo variável | Bloqueante? |
|---|---|---|---|---|---|
| Mercado Pago | Pagamento e-commerce | Produção | R$ 0 | 0,99–4,98% transação | **Sim** |
| Asaas | Subscription corretoras | Staging | R$ 0 | R$ 1,99/PIX, R$ 0,49+1,99% cartão | **Sim** |
| ClickSign | Contratos digitais | Stub→prod | ~R$ 100 (plano 20 docs) a R$ 235 (plano 100+automação) | R$ 0,50 SMS/WA extra | **Sim** Fase 10.1 |
| WhatsApp Cloud API | Mensageria | Stub | R$ 0 | USD $0,0068/utility, $0,0625/marketing | Não (manual fallback) |
| Zenvia SMS | SMS fallback | Opcional | R$ 0 | ~R$ 0,15/SMS ⚠️ | Não |
| SendGrid | Email | Trial / prod | USD $0 (60 dias) → $19,95 | USD $0,005/email após cota | **Sim** prod |
| AWS SES (alt) | Email | Não integrado | USD $0 | USD $0,10/1k emails | Alt SendGrid |
| BigDataCorp | KYC corretoras | Mock→prod | R$ 0 | ~R$ 0,30–1,00/consulta ⚠️ | **Sim** prod |
| AWS S3 | Storage | Plugável | USD $0 | $0,023/GB + $0,09/GB egress | Não (disk fallback) |
| Cloudflare R2 (alt) | Storage | Não integrado | USD $0 | $0,015/GB + egress grátis | Alt S3 |
| Sentry | Observability | Opt-in | USD $0 (Dev) → $26 (Team) | — | Não |
| Cloudflare Turnstile | Anti-bot | Em uso | USD $0 | — (até 1M solves/mês) | Não |
| Open-Meteo | Clima | Em uso | USD $0 | — | Não |
| Yahoo Finance | Cotação ICE | Em uso | USD $0 | — | Não |
| BCB PTAX | Cotação USD | Em uso | R$ 0 | — | Não |
| **Asaas Split** | **Escrow Fase 11.1** | **Planejado** | R$ 0 | Mesmas taxas Asaas | **Sim** Fase 11.1 |
| **Focus NFe** | **NFPe Fase 11.2** | **Pré-design** | R$ 89,90 (Solo) → R$ 548 (Growth) | — | **Sim** Fase 11.2 |
| **B3/CERC** | **CPR Fase 11.3** | **Pré-design** | ⚠️ verificar | ⚠️ verificar | Sim Fase 11.3 |
| **Domínio .com.br** | Infra | — | R$ 3,30/mês (R$ 40/ano) | — | **Sim** |
| **VPS / Hospedagem** | Infra | — | R$ 30–100 (VPS BR) ou USD $5–20 (Railway/Fly) | — | **Sim** |
| **Hosting Frontend** | Infra | — | USD $0 (Cloudflare Pages) ou USD $20 (Vercel Pro) | — | **Sim** |
| **MySQL** | Infra | — | USD $0 (self-hosted) ou USD $13 (RDS micro) | — | **Sim** |
| **Backup S3/R2** | Infra | — | USD $0–5 | — | Recomendado |

### Cenário 1 — Mínimo viável (beta regional, < 10 corretoras pagantes)

**Premissa:** solo dev, sem CNPJ, 10 corretoras em piloto Manhuaçu, ~50 leads/mês, ~500 emails/mês, sem WhatsApp API, contratos manuais ou ClickSign trial.

| Item | Custo/mês | Notas |
|---|---|---|
| VPS (Hetzner CX22 ou Locaweb) | **R$ 30** | Backend + MySQL + storage local |
| Cloudflare Pages (frontend) | **R$ 0** | Free tier comercial |
| Domínio .com.br | **R$ 3,30** | R$ 40/ano amortizado |
| SendGrid trial → AWS SES | **R$ 1** | ~500 emails @ $0,10/1k = ~R$ 0,30 |
| Cloudflare Turnstile | R$ 0 | Free |
| Sentry Dev | R$ 0 | Free 5k errors |
| Mercado Pago | R$ 0 fixo | % sobre transação real |
| Asaas (sandbox) | R$ 0 | Ainda não cobrando |
| ClickSign Trial → manual | R$ 0 | Trial 30 dias depois reaprova |
| BigDataCorp **mock** | R$ 0 | KYC manual (revisão admin) |
| **TOTAL FIXO** | **~R$ 35/mês** | + variáveis pequenas (% MP) |

**Variáveis estimadas:** R$ 100–500/mês em taxas Mercado Pago + Asaas conforme volume real.

### Cenário 2 — Operação normal (50 corretoras, 500 leads/mês)

**Premissa:** CNPJ aberto (MEI ou ME), 50 corretoras pagantes (mix FREE/PRO/MAX), ~500 leads/mês, ~5k emails/mês, WhatsApp Cloud API ativo, BigDataCorp em produção, ClickSign produção, R2 ativo.

| Item | Custo/mês | Notas |
|---|---|---|
| Railway/Fly backend + DB | **USD $25 ≈ R$ 130** | Backend + Postgres/MySQL gerenciado |
| Vercel Pro frontend | **USD $20 ≈ R$ 105** | Comercial OK |
| Cloudflare R2 storage | **USD $1 ≈ R$ 5** | ~50 GB sem egress |
| Domínio | **R$ 3,30** | |
| SendGrid Essentials | **USD $19,95 ≈ R$ 105** | 100k emails (sobra) |
| Sentry Team | **USD $26 ≈ R$ 137** | 50k errors |
| Cloudflare Turnstile | R$ 0 | Free |
| ClickSign Plus 100 + Automação | **R$ 235** | 100 contratos/mês |
| BigDataCorp consultas | **~R$ 50** | 50 corretoras × R$ 1 (estimativa) |
| WhatsApp Cloud (utility, fora janela 24h) | **USD $7 ≈ R$ 37** | ~1.000 msg utility @ $0,0068 |
| MEI DAS | **R$ 71** | |
| Contador (acompanhamento) | **R$ 250** | |
| **TOTAL FIXO** | **~R$ 1.130/mês** | |

**Variáveis estimadas:** R$ 800–3.000/mês em taxas MP + Asaas conforme GMV.

**MRR mínimo para cobrir:** ~12 corretoras pagando PRO (R$ 99) ou ~3 MAX (R$ 349) — operação se sustenta facilmente.

### Cenário 3 — Escala (6 meses à frente, 200 corretoras, 3.000 leads/mês, Fase 11 ativa)

**Premissa:** 200 corretoras, 3.000 leads/mês, contratos digitais + escrow + NFPe ativos, ~50k emails/mês.

| Item | Custo/mês | Notas |
|---|---|---|
| Railway / VPS médio | **USD $50 ≈ R$ 265** | Backend + DB com escala |
| Vercel Pro | **USD $20 ≈ R$ 105** | |
| Cloudflare R2 | **USD $5 ≈ R$ 26** | ~300 GB |
| Domínio | R$ 3,30 | |
| AWS SES | **USD $5 ≈ R$ 26** | 50k emails @ $0,10/1k |
| Sentry Team | **USD $26 ≈ R$ 137** | |
| ClickSign Plus 200 | **R$ 720** | 200 contratos/mês |
| BigDataCorp | **R$ 200** | 200 KYC × R$ 1 |
| WhatsApp Cloud | **USD $30 ≈ R$ 158** | ~5k utility + 100 marketing |
| Focus NFe Growth | **R$ 548** | 4.000 NFs |
| Certificado e-CNPJ A1 | **R$ 30/mês** | R$ 350/ano amortizado |
| Asaas Split | R$ 0 fixo | Embutido nas taxas |
| MEI → ME (Simples) | **~R$ 1.500** | depende do faturamento |
| Contador | **R$ 400** | Maior complexidade fiscal |
| Sentry → Business | **USD $80 ≈ R$ 421** | 100k+ errors necessário |
| **TOTAL FIXO** | **~R$ 4.540/mês** | |

**Variáveis estimadas:** R$ 5.000–20.000/mês em taxas Asaas (escrow + plano) + MP.

**MRR mínimo para cobrir:** ~14 MAX (R$ 349 × 14) + 50 PRO + comissão sobre escrow. Realista com 200 corretoras.

---

## Apontamentos finais e riscos

### Redundâncias detectadas

- **SendGrid + AWS SES + Resend + Mailgun + Postmark + SMTP genérico**: o código suporta todos. Para reduzir complexidade operacional, **escolher 1** (recomendação: AWS SES por preço se houver paciência para verificação de domínio; senão SendGrid).
- **Yahoo Finance + Notícias Agrícolas**: ambos para cotação. Mantenham os 2 — fontes diferentes (ICE NY vs CEPEA Esalq) servem propósitos diferentes.
- **Mercado Pago + Asaas**: NÃO são redundantes — MP cuida do e-commerce, Asaas das corretoras (subscription + futuro escrow). Manter os 2.

### Pegadinhas fiscais

1. **CNPJ ainda não obrigatório no MVP** mas vira pré-requisito quando:
   - WhatsApp Business API for ativado (Meta exige CNPJ verificado)
   - Asaas Split entrar em produção (alguns casos exigem CNPJ)
   - Fase 11.2 NFPe (precisa procuração eletrônica)
2. **NF-e produtor rural obrigatória desde 5/jan/2026** — toda venda do produtor PF precisa NF agora. Sem Fase 11.2 implementada, o produtor é responsável por emitir manualmente.
3. **Certificado digital** vai virar custo recorrente (R$ 200–400/ano por entidade). Solo dev pode usar e-CPF se emitir em nome próprio.

### Pendências de verificação ⚠️

Itens onde o preço público não foi confirmado e precisam ser cotados antes de fechar:

- **BigDataCorp** — pricing exato de consulta CNPJ + QSA (estimei R$ 0,30–1,00 por referência de mercado)
- **Zenvia SMS** — R$/SMS atual no Brasil
- **B3 Registro / CERC** — custos de registro de CPR
- **CNPJá** como alternativa ao BigDataCorp — confirmar tabela
- **Feed pago CEPEA** — caso o scraping quebre
- **Focus NFe** — confirmar se aceita e-CPF para emissão em nome de terceiros (corretoras)
- **Google Maps** — confirmar se está realmente em uso ou se é env morta

### Recomendação imediata

**Para piloto (próximas 4 semanas):**
1. Stack Cenário 1 (~R$ 35/mês fixo)
2. ClickSign Trial 30 dias para validar 5 contratos reais
3. Continuar BigDataCorp em mock + revisão admin manual
4. Não abrir CNPJ ainda — aguardar piloto comercial validar tese

**Para beta pago (4–8 semanas):**
1. Migrar para Cenário 2 (~R$ 1.130/mês)
2. Abrir MEI (R$ 71/mês)
3. Contratar advogado para templates de contrato (R$ 2.500 única vez)
4. Validar com contador rito fiscal de PR rural (bloqueante para 11.2)

**Para escala (3–6 meses):**
1. Avaliar abertura de ME (Simples) se faturar > R$ 80k/ano
2. Implementar Fase 11.1 (Asaas Split) antes de 11.2/11.3
3. Avaliar parceria com instituição financeira para evitar virar fintech regulada (CPR)

---

## Fontes consultadas

- [Asaas — Preços e taxas](https://www.asaas.com/precos-e-taxas)
- [Asaas — Split de pagamentos](https://materiais.asaas.com/split-de-pagamentos)
- [Mercado Pago — Tarifas](https://www.mercadopago.com.br/ajuda/custo-receber-pagamentos_453)
- [ClickSign — Planos](https://www.clicksign.com/preco-b2)
- [SendGrid Pricing](https://sendgrid.com/en-us/pricing)
- [Sentry Plans](https://sentry.io/pricing/)
- [WhatsApp Business Platform Pricing](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing)
- [Cloudflare Turnstile Plans](https://developers.cloudflare.com/turnstile/plans/)
- [Cloudflare R2 Pricing](https://developers.cloudflare.com/r2/pricing/)
- [Focus NFe Planos](https://focusnfe.com.br/precos/)
- [BigDataCorp Documentação](https://docs.bigdatacorp.com.br/plataforma/docs/pricing)
- [Reforma Tributária NF-e Produtor Rural 2026](https://inventsoftware.com.br/en/financeiro/nfe-produtor-rural-obrigatoriedade-2026)
