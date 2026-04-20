# Smoke Test ClickSign em Staging — Playbook

Roteiro copiável para validar o rito de assinatura ponta a ponta.
Use antes de tocar a PR 3 (UI) — detalhes de payload da ClickSign
sandbox são mais fáceis de corrigir no log do backend do que
debugando UI incompleta.

- Pré-requisito: PRs 1 e 2 aplicadas em staging
- Tempo estimado: 20–30 min
- Data: 2026-04-20

---

## 0. Provisionamento (uma vez só)

### 0.1. `.env` do staging

```bash
CONTRATO_SIGNER_PROVIDER=clicksign
CLICKSIGN_API_TOKEN=<token_sandbox>
CLICKSIGN_API_URL=https://sandbox.clicksign.com
CLICKSIGN_HMAC_SECRET=<segredo_webhook>
```

### 0.2. Migrations

```bash
cd kavita-backend
npm run db:migrate
# Deve aplicar:
#   2026042000000001-create-contratos
#   2026042000000002-add-signed-pdf-to-contratos
```

### 0.3. Webhook no painel ClickSign

1. <https://sandbox.clicksign.com> → `Configurações → Webhooks`
2. URL: `https://staging.kavita.com.br/api/webhooks/clicksign`
   (substitua pelo host real de staging; caminho sem `/public/`)
3. Eventos: marcar `auto_close`, `close`, `cancel`, `refuse`,
   `deadline`, `sign`
4. HMAC Secret: o mesmo que está em `CLICKSIGN_HMAC_SECRET`

### 0.4. Firewall / túnel

- **Staging na nuvem com IP fixo:** liberar saída para
  `sandbox.clicksign.com` (443) e entrada para o range de IPs da
  ClickSign (consulte o painel → Webhooks → "IPs de origem")
- **Staging local (raro):** use `cloudflared tunnel --url http://localhost:5000`
  ou `ngrok http 5000` e cadastre a URL pública no webhook ClickSign

### 0.5. Dados de teste no banco

Você precisa de um lead com `status='closed'` (deal_won),
`email` não-nulo e pertencente a uma corretora `active` com email
cadastrado. Query rápida para verificar:

```sql
SELECT l.id AS lead_id, l.nome, l.email,
       c.id AS corretora_id, c.name, c.email AS corretora_email
  FROM corretora_leads l
  JOIN corretoras c ON c.id = l.corretora_id
 WHERE l.status = 'closed'
   AND l.email IS NOT NULL
   AND c.email IS NOT NULL
   AND c.status = 'active'
 ORDER BY l.id DESC
 LIMIT 5;
```

Se vier vazio: crie/promova um lead para `closed` ou use o painel
da corretora para marcar deal_won num lead existente.

---

## 1. Sequence de smoke

Assumindo:
- `API_URL` = `https://staging.kavita.com.br/api`
- Cookies do painel da corretora em `cookies.txt` (via login)
- CSRF token em `CSRF`
- `LEAD_ID` = id do lead que você pegou na query acima

### 1.1. Gerar contrato (POST)

```bash
curl -sS -X POST "$API_URL/corretora/contratos" \
  -b cookies.txt \
  -H "Content-Type: application/json" \
  -H "x-csrf-token: $CSRF" \
  -d '{
    "lead_id": '$LEAD_ID',
    "tipo": "disponivel",
    "data_fields": {
      "safra": "2025/2026",
      "bebida_laudo": "Dura",
      "quantidade_sacas": 200,
      "preco_saca": 1450,
      "prazo_pagamento_dias": 15,
      "nome_armazem_ou_fazenda": "Armazém Geral Manhuaçu"
    }
  }' | jq
```

**Resposta esperada:**
```json
{
  "ok": true,
  "message": "Contrato gerado.",
  "data": {
    "id": 1,
    "status": "draft",
    "hash_sha256": "e3b0c4...",
    "qr_verification_token": "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa",
    "numero_externo": "KVT-AB12CD",
    "verify_url": "https://staging.kavita.com.br/verificar/..."
  }
}
```

Guarde o `id` em `CONTRATO_ID`. Tempo: 5–15s (Puppeteer faz
cold-start na primeira requisição).

### 1.2. Verificar no banco

```sql
SELECT id, status, tipo, hash_sha256,
       LEFT(pdf_url, 50) AS pdf_url,
       qr_verification_token
  FROM contratos
 WHERE id = :CONTRATO_ID;
```

Verifique também que o arquivo existe no disco:

```bash
ls -la kavita-backend/storage/contratos/*/
```

### 1.3. Enviar para ClickSign

```bash
curl -sS -X POST "$API_URL/corretora/contratos/$CONTRATO_ID/enviar" \
  -b cookies.txt \
  -H "x-csrf-token: $CSRF" | jq
```

**Resposta esperada:**
```json
{
  "ok": true,
  "message": "Contrato enviado para assinatura.",
  "data": {
    "id": 1,
    "status": "sent",
    "signer_provider": "clicksign",
    "envelope_id": "abc-123-...",
    "document_id": "doc-456-..."
  }
}
```

**Tempo: 3–8s** (4 chamadas à API: envelope → document → signers × 2 → patch running).

Se travar mais de 30s, é timeout de rede — valide firewall.

### 1.4. Verificar no painel ClickSign

1. <https://sandbox.clicksign.com> logado
2. Envelopes → o envelope recém-criado deve aparecer com status
   "Em andamento"
3. Dois signatários: corretora + produtor, cada um com email

### 1.5. Assinar pelo sandbox

Os emails da sandbox caem em mailbox simulada — abra pelo próprio
painel ClickSign (ou use o email real se estiver validado).
Assine como **corretora** primeiro, depois como **produtor**.

Quando o segundo assina, ClickSign dispara `auto_close`.

### 1.6. Verificar recepção do webhook

**Logs do backend** (últimas linhas):

```bash
tail -f kavita-backend/logs/*.log | grep clicksign
# ou via systemd:
journalctl -u kavita-backend -f | grep clicksign
```

Sinais de sucesso em ordem:
```
clicksign.webhook.applied   { transition: "sent → signed" }
contrato.clicksign.webhook.applied
```

Ou, em caso de problema no download do PDF carimbado:
```
contrato.clicksign.signed_pdf_download_failed
```
(não é fatal — status vira `signed` mesmo assim)

### 1.7. Confirmar estado final

```sql
SELECT id, status, signed_at,
       signer_provider,
       LEFT(signed_pdf_url, 50) AS signed_pdf,
       signed_hash_sha256,
       cancel_reason
  FROM contratos
 WHERE id = :CONTRATO_ID;
```

Esperado:
- `status` = `signed`
- `signed_at` preenchido
- `signed_pdf_url` = `storage/contratos/<corretora>/<token>_signed.pdf`
- `signed_hash_sha256` = 64 hex (diferente do `hash_sha256` original)

### 1.8. Timeline do lead

```sql
SELECT event_type, title, created_at, meta
  FROM corretora_lead_events
 WHERE lead_id = :LEAD_ID
 ORDER BY created_at DESC
 LIMIT 10;
```

Deve conter `contract_generated`, `contract_sent`, `contract_signed`
em ordem cronológica.

### 1.9. Endpoint público de verificação

```bash
curl -sS "$API_URL/public/verificar-contrato/<token>" | jq
```

Deve devolver a projeção segura (sem telefone/email/preço).

---

## 2. webhook_events — inspeção e reconciliação

Listar os eventos ClickSign recebidos:

```sql
SELECT id, event_type, provider_event_id,
       LEFT(COALESCE(processing_error,''), 60) AS erro,
       processed_at, retry_count, created_at
  FROM webhook_events
 WHERE provider = 'clicksign'
 ORDER BY created_at DESC
 LIMIT 20;
```

- `processed_at IS NOT NULL` + sem erro → OK
- `processing_error` preenchido → use a UI admin de reconciliação
  (`/admin/monetization/reconciliation` filtrando por provider=clicksign)
  para inspecionar `payload` completo e decidir

---

## 3. Matriz de erros comuns

| Sintoma | Causa provável | Como diagnosticar | Como resolver |
|---|---|---|---|
| `curl` retorna 401 "Assinatura inválida" em `/webhooks/clicksign` | HMAC secret diferente entre painel e env | Compare `CLICKSIGN_HMAC_SECRET` com o secret no webhook do painel | Reconfigure no painel e reinicie o backend |
| Backend loga `clicksign.webhook.signature_invalid` mas ClickSign insiste | Middleware `express.json()` parseou antes do `express.raw()` | Verifique `routes/public/webhookClicksign.js` — `express.raw({ type: "*/*" })` tem que estar na rota, não global | Manter raw scoped à rota |
| `POST /corretora/contratos/:id/enviar` retorna 502 "Falha ao enviar..." | Credencial ClickSign inválida ou API fora do ar | `node -e "console.log(require('./services/contratos/clicksignAdapter').isConfigured())"` + teste manual de `curl sandbox.clicksign.com/api/v3/envelopes` com token | Revisar token e URL (sandbox vs prod) |
| ClickSign rejeita envelope "content_base64 inválido" | PDF corrompido ou header base64 faltando | Abrir `storage/contratos/<corretora>/<token>.pdf` e confirmar que é PDF válido | Regenerar com `POST /corretora/contratos` — o PDF é determinístico pelos dados do lead |
| `signed_pdf_download_failed` mas status virou `signed` | URL temporária do PDF assinado expirou antes do fetch | Chamar manualmente `GET /api/v3/documents/:document_id` via curl com token | Tudo bem — o fato legal é a assinatura. PR futura terá cron de retry |
| Contrato fica em `draft`, envelope criado no painel mas status não muda | `criarEnvelopeCompleto` falhou depois do POST envelope (network) | Log `contrato.clicksign.envelope_failed` + envelope "vazio" no painel | Cancele o envelope no painel e reenvie pelo `/enviar` |
| Lead não aceita ser usado "Produtor sem e-mail" | `corretora_leads.email` é NULL | Query SQL acima filtra por `email IS NOT NULL`, mas UI pode ter deixado passar | Editar lead pelo painel ou update manual |
| Corretora "sem e-mail de responsável" | `corretoras.email` é NULL | `SELECT email FROM corretoras WHERE id = ?` | Atualizar perfil pela UI da própria corretora ou admin |

---

## 4. Sinais de que o smoke passou

- [ ] `POST /corretora/contratos` devolve 201 com hash + token
- [ ] PDF existe em `storage/contratos/<corretora>/<token>.pdf` e
      abre no Acrobat/Preview com QR + hash no rodapé
- [ ] `POST /corretora/contratos/:id/enviar` devolve status=sent
      com envelope_id e document_id reais (não `stub-*`)
- [ ] Envelope visível no painel ClickSign sandbox
- [ ] Após assinar as duas partes, log
      `clicksign.webhook.applied { transition: sent → signed }`
- [ ] DB: `signed_pdf_url` e `signed_hash_sha256` preenchidos
- [ ] `corretora_lead_events` tem `contract_signed` com
      `meta.provider = clicksign`
- [ ] `webhook_events` tem linhas com `processed_at` preenchido

Se todas as caixas marcam, staging está pronto. Próxima
manobra: PR 3 (UI).

---

## 5. Rollback / corte de emergência

Se algo der errado em staging e você precisa "congelar" a integração
sem derrubar o backend:

```bash
# Volta para stub sem trocar código
export CONTRATO_SIGNER_PROVIDER=stub
pm2 restart kavita-backend   # ou systemctl restart
```

Contratos já enviados para ClickSign continuam válidos lá; novos
pedidos de envio caem no stub (status=sent sem provedor real).
Quando o problema for resolvido, volte para `clicksign`.
