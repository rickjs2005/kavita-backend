# Integração ClickSign — Fase 10.1 PR 2

Documento operacional da integração de assinatura digital via ClickSign
no módulo de contratos. Se você precisa entender o porquê da escolha
do ClickSign e a arquitetura do roadmap completo, leia primeiro
`roadmap-fase-10.md` e `contratos-templates.md`.

- Entregue em: 2026-04-20
- API usada: ClickSign **v3** (JSON:API)
- Escopo desta PR: envio + recepção do evento final. Reenvio manual,
  troca de signatários e relatórios ficam para evoluções incrementais.

---

## 1. Provisionamento inicial

### 1.1. Conta e tokens

1. Criar conta **sandbox** em <https://sandbox.clicksign.com>
2. `Configurações → API Access` → gerar `access token`
3. `Configurações → Webhooks` → novo webhook:
   - URL: `{APP_URL}/api/public/webhooks/clicksign`
   - Eventos: marcar `auto_close`, `close`, `cancel`, `refuse`,
     `deadline`, `sign`
   - Gerar **HMAC Secret** (guardar)

### 1.2. Variáveis de ambiente

```bash
# .env (ou equivalente em cada ambiente)
CONTRATO_SIGNER_PROVIDER=clicksign
CLICKSIGN_API_TOKEN=seu_token_api
CLICKSIGN_API_URL=https://sandbox.clicksign.com   # prod: https://app.clicksign.com
CLICKSIGN_HMAC_SECRET=seu_segredo_webhook
```

Em staging, manter `CONTRATO_SIGNER_PROVIDER=stub` até bater o primeiro
teste com contrato real. Troca para `clicksign` é uma operação de 1
linha + restart.

### 1.3. Smoke test

```bash
# Valida que o adapter tem credenciais. Se `isConfigured()` retornar
# false em boot, o service cai em stub automático.
node -e "console.log(require('./services/contratos/clicksignAdapter').isConfigured())"
```

---

## 2. Arquitetura

```
┌────────────────┐     POST /api/corretora/contratos/:id/enviar
│ Painel da      │────────────────────┐
│ corretora      │                    ▼
└────────────────┘          ┌─────────────────────┐
                            │ contratoService     │
                            │  .enviarParaAssinat │
                            └──────────┬──────────┘
                                       │ SIGNER_PROVIDER=clicksign
                                       ▼
                            ┌─────────────────────────┐
                            │ contratoSignerService   │
                            │  .enviarParaClickSign   │
                            └──────────┬──────────────┘
                                       │ adapter
                                       ▼
                            ┌─────────────────────────┐
                            │ clicksignAdapter        │
                            │  POST /envelopes        │
                            │  POST /envelopes/:id/   │
                            │    documents            │
                            │  POST /envelopes/:id/   │
                            │    signers              │
                            │  PATCH envelope.status  │
                            │    = running            │
                            └──────────┬──────────────┘
                                       │ envelope_id + document_id
                                       ▼
                            ┌─────────────────────────┐
                            │ UPDATE contratos        │
                            │  status=sent            │
                            │  signer_*               │
                            └─────────────────────────┘

                 ClickSign: envia email para signatários
                                       │
                                       │ (corretora assina / produtor assina)
                                       ▼
                 ClickSign: POST webhook
                                       │
                                       ▼
                            ┌─────────────────────────┐
                            │ POST /api/public/       │
                            │   webhooks/clicksign    │
                            │  express.raw() → HMAC   │
                            └──────────┬──────────────┘
                                       │
                                       ▼
                            ┌─────────────────────────┐
                            │ webhookClicksignCtrl    │
                            │  verify HMAC            │
                            │  translate event        │
                            │  recordIfNew (dedupe)   │
                            └──────────┬──────────────┘
                                       │
                                       ▼
                            ┌─────────────────────────┐
                            │ contratoSignerService   │
                            │  .processarEventoWebhook│
                            │  - updateStatus         │
                            │  - baixaPdfAssinado     │
                            │  - signed_pdf_url +     │
                            │    signed_hash_sha256   │
                            │  - evento na timeline   │
                            └─────────────────────────┘
```

---

## 3. Mapa de eventos → status

| Evento ClickSign | Status do contrato | Ação extra |
|---|---|---|
| `auto_close`, `close` | `signed` | Baixa PDF carimbado, grava `signed_pdf_url` + `signed_hash_sha256` |
| `cancel` | `cancelled` | `cancel_reason = "cancelado pela ClickSign"` |
| `refuse` | `cancelled` | `cancel_reason = "recusado por signatário"` |
| `deadline` | `expired` | Prazo do envelope venceu sem todas as assinaturas |
| `sign` (parcial) | — | Só registra em `webhook_events`; status principal só muda no `auto_close` |
| qualquer outro | — | Gravado em `webhook_events`, ignorado na transição |

---

## 4. Idempotência e reconciliação

### 4.1. `webhook_events`

`provider_event_id` é determinístico: `{document_key}:{event_name}:{occurred_at}`.
Se a ClickSign reenviar o mesmo evento, `INSERT IGNORE` devolve
`affectedRows=0` e o controller responde 200 sem side-effect.

### 4.2. Falhas domain_handler

Se `processarEventoWebhook` lança (ex.: download do PDF assinado cai),
o webhook responde **200** mas marca `webhook_events.processing_error`.
Admin pode reprocessar pela tela existente
`/admin/monetization/reconciliation` (provider = `clicksign`).

### 4.3. Re-geração de contrato

Contratos cancelados ou expirados **não** podem ser "reenviados". A
corretora gera um novo via `POST /api/corretora/contratos`. O lead
ainda precisa estar em `deal_won` e não ter outro contrato ativo
(draft/sent/signed) — regra enforçada em `hasActiveForLead`.

---

## 5. Segurança

### 5.1. HMAC

- Header esperado: `Content-HMAC: sha256=<hex>`
- Chave: `CLICKSIGN_HMAC_SECRET`
- Comparação: `crypto.timingSafeEqual` com buffers mesmo tamanho
- Se HMAC secret ausente, **fail-closed** (401)

### 5.2. Raw body preservado

A rota `/webhooks/clicksign` usa `express.raw({ type: "*/*" })` para
que o HMAC seja calculado sobre os bytes exatos. Se alguém adicionar
`express.json()` antes, a assinatura quebra silenciosamente (só passa
se o JSON for byte-perfect).

### 5.3. PDF assinado em storage privado

Mesmo padrão do draft: `storage/contratos/<corretora_id>/<token>_signed.pdf`,
servido só via endpoint autenticado.

---

## 6. Sinais de operação

Logs emitidos (pino):

- `contrato.clicksign.enviado` — sucesso de criação de envelope
- `contrato.clicksign.envelope_failed` — falha ao falar com API
- `clicksign.webhook.signature_invalid` — HMAC inválido (possível ataque ou config errada)
- `clicksign.webhook.duplicate_ignored` — idempotência funcionou
- `clicksign.webhook.applied` — transição aplicada
- `contrato.clicksign.signed_pdf_download_failed` — assinatura aconteceu mas baixar o PDF carimbado falhou (não-fatal)
- `clicksign.webhook.domain_apply_failed` — erro na regra de domínio, entra em reconciliação

Dashboards (Grafana, quando ligado na Fase 10.3): plotar taxa de
`signature_invalid` (> 0 em produção deve disparar alerta — alguém
tentando forjar webhook).

---

## 7. Limites conhecidos

- **Sem retry manual do envio**: se `criarEnvelopeCompleto` falhar no
  meio (ex.: network entre POST signer e PATCH status=running),
  o contrato fica em `draft` e a corretora precisa disparar "Enviar"
  de novo. Evolução possível: guardar `envelope_id` parcial e
  permitir retomar.
- **Download do PDF assinado não tem retry automático**: se falhar,
  fica `signed_pdf_url=null` e admin baixa manualmente do painel
  ClickSign. Cron de reconciliação é trabalho futuro.
- **Produtor sem email não consegue assinar**: o service rejeita
  com 400 antes de abrir envelope. Fase 12 deveria oferecer canal
  WhatsApp ClickSign como fallback.
- **Envelope sem prazo explícito**: usamos default ClickSign (tipicamente
  30 dias). Quando jurídico pedir prazos por contrato, plugar campo
  `deadline_at` no `criarEnvelopeCompleto`.

---

## 8. Testes

- `test/unit/services/clicksignAdapter.unit.test.js` — HMAC + tradução
  de evento + isConfigured (13 casos)
- Integração ponta a ponta (envio real para sandbox ClickSign) fica
  fora da CI — precisa token. Rodar manualmente com
  `NODE_ENV=integration-clicksign npm run test:int`.

---

## 9. Checklist de produção

Antes de virar a chave `CONTRATO_SIGNER_PROVIDER=clicksign` em prod:

- [ ] Migration `2026042000000002` aplicada
- [ ] `CLICKSIGN_API_TOKEN` + `CLICKSIGN_HMAC_SECRET` em prod
- [ ] Webhook configurado no painel ClickSign apontando para produção
- [ ] Smoke manual: 1 contrato teste (sandbox) com dois signers
- [ ] Admin familiar com tela `/admin/monetization/reconciliation`
      filtrando por `provider=clicksign`
- [ ] Plano de suporte treinado no FAQ "cadê meu dinheiro?" — não é
      só da Fase 11, já começa aqui: "cadê meu contrato?"
