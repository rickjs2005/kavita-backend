# WhatsApp — Reativação para o módulo Mercado do Café

> Auditoria do estado atual do canal WhatsApp + plano de execução para
> reativá-lo como canal primário do Mercado do Café (lead ↔ corretor
> ↔ produtor). Documento operacional — atualizado por etapa entregue.
>
> Decisões de produto associadas: ver [[corretora-modulo.md]] e
> registros em `kavita-os/02 - Pendências.md` / `05 - Decisões Técnicas.md`.

**Etapa atual:** 1 — Auditoria (este documento).
**Próxima etapa:** 2 — Schema + migrations.

---

## 1. Inventário do que existe

A integração WhatsApp **não foi desativada**. Está viva no módulo
Pedidos desde a entrega B3 (2026-04-25) em modo `manual` (default).
O que precisa ser feito é **estender** a infraestrutura para o
domínio da corretora — não recriar do zero.

### 1.1 Backend — services/whatsapp/

| Arquivo | Papel | Estado |
|---|---|---|
| `services/whatsapp/index.js` | Facade. `sendWhatsapp({ telefone, mensagem, options })` resolve adapter via `WHATSAPP_PROVIDER`. Exporta `getProvider`, `buildWaMeLink`, `normalizePhoneBR`. | ✅ vivo |
| `services/whatsapp/adapters/manual.js` | Gera link `wa.me`, retorna `{ status: "manual_pending", url }`. Default. Sem credencial. | ✅ vivo |
| `services/whatsapp/adapters/api.js` | Meta Cloud API real (`graph.facebook.com/{version}/{phoneId}/messages`). AbortController + timeout 8s. Suporta texto livre **e** template aprovado. Retorna `{ status: "sent" \| "error", messageId }`. | ✅ vivo, **não enviando em prod** porque `WHATSAPP_PROVIDER=manual` |
| `services/whatsapp/templateMap.js` | Mapeia evento → `WHATSAPP_TEMPLATE_*` (env) → params do body. Hoje cobre **6 eventos de pedido**: `pedido_criado`, `pagamento_aprovado`, `pedido_em_separacao`, `pedido_enviado`, `pedido_entregue`, `pedido_cancelado`. | ✅ vivo |

### 1.2 Backend — Helpers e utilidades

| Arquivo | Papel |
|---|---|
| `lib/waLink.js` | `normalizePhoneBR(raw)` (12–13 dígitos com prefixo 55) e `buildWaMeLink({ telefone, mensagem })`. **Não há `utils/phone.js` separado** — a normalização vive aqui e é importada em todo lugar. |
| `templates/whatsapp/*.js` (11 arquivos) | Renders hardcoded: `confirmacaoPedido`, `pagamentoAprovado`, `pedidoEmSeparacao`, `pedidoEnviado`, `pedidoEntregue`, `pedidoCancelado`, `ocorrenciaConfirmacao`, `ocorrenciaSolicitarDados`, `ocorrenciaTaxaExtra`, `ocorrenciaCorrecaoConcluida`, `ocorrenciaResolvida`. Cada um exporta função `(pedido) → string`. |

### 1.3 Backend — Callers do service

| Caller | Onde | Para quê |
|---|---|---|
| `services/comunicacaoService.js` | `sendWhatsapp(templateId, pedidoId, telefoneOverride)` (linha 188) e fan-out de status do pedido (linha 299). Persiste em `comunicacoes_enviadas`. | Pedidos: confirmação, pagamento aprovado, status, ocorrências. |
| `services/motoristaAuthService.js` | linha 194 — magic-link via WhatsApp para o motorista. | Logística (independente do módulo Pedidos). |
| `controllers/comunicacaoController.js` | linha 225 — endpoint admin para envio manual de template; linha 268 — preview de template. | Admin pode disparar avulso. |
| `services/checkoutNotificationService.js`, `services/orderService.js`, `services/paymentWebhookService.js`, `controllers/adminOrdersController.js`, `controllers/pedidosUserController.js` | Indiretos via `comunicacaoService`. | Eventos do funil de pedido. |

### 1.4 Backend — Tabela de log existente: `comunicacoes_enviadas`

Criada em **`migrations/2026022420502104-create-services-tables-0f760f23fd.js`**.
ENUM `status_envio` ampliado para incluir `manual_pending` em
**`migrations/2026042400000002-add-manual-pending-to-comunicacoes-enviadas.js`** (B1 da
auditoria de automação, 2026-04-24).

```sql
CREATE TABLE comunicacoes_enviadas (
  id            INT AUTO_INCREMENT PK,
  usuario_id    INT NULL  FK -> usuarios.id,
  pedido_id     INT NULL  FK -> pedidos.id,
  canal         ENUM('email','whatsapp') NOT NULL,
  tipo_template VARCHAR(50) NOT NULL,
  destino       VARCHAR(191) NOT NULL,
  assunto       VARCHAR(191) NULL,
  mensagem      TEXT NOT NULL,
  status_envio  ENUM('sucesso','erro','manual_pending') NOT NULL DEFAULT 'sucesso',
  erro          TEXT NULL,
  criado_em     DATETIME NOT NULL DEFAULT NOW()
);
```

**Observação crítica**: a tabela é **orientada a pedidos** (FKs em
`usuarios` e `pedidos`). Não tem `lead_id`, `contract_id`,
`corretora_id`, `provider_message_id`, nem campos de ciclo de vida
(`delivered_at`, `read_at`, `failed_at`). Não serve sem expansão para
o fluxo da corretora.

### 1.5 Backend — Configuração

`.env.example` linhas **380–447**:

```
WHATSAPP_PROVIDER=manual              # manual | api
WHATSAPP_API_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_API_VERSION=v22.0
WHATSAPP_API_TIMEOUT_MS=8000
WHATSAPP_TEMPLATE_PEDIDO_CRIADO=
WHATSAPP_TEMPLATE_PAGAMENTO_APROVADO=
WHATSAPP_TEMPLATE_PEDIDO_EM_SEPARACAO=
WHATSAPP_TEMPLATE_PEDIDO_ENVIADO=
WHATSAPP_TEMPLATE_PEDIDO_ENTREGUE=
WHATSAPP_TEMPLATE_PEDIDO_CANCELADO=
WHATSAPP_TEMPLATE_LANG=pt_BR
MOTORISTA_MAGIC_LINK_AUTO_SEND=true
MOTORISTA_AUTO_SEND_REQUIRES_API=false
```

**Não existe** `WHATSAPP_WEBHOOK_VERIFY_TOKEN` nem `WHATSAPP_WEBHOOK_SECRET`.

### 1.6 Backend — Testes

- `test/unit/services/whatsapp/apiAdapter.unit.test.js` — 16 testes
  do adapter API com `global.fetch` mockado. Cobre: missing creds,
  texto livre, template, params, language default, timeout, erros 4xx/5xx.
- Outros callers indiretos têm cobertura em `motoristaAuthService.unit.test.js`,
  `rotasService.unit.test.js`, etc.
- **Não há** teste para webhook (porque webhook não existe).

### 1.7 Frontend — uso atual

Buscando por `WhatsApp|whatsapp` no `kavita-frontend/src`, há **25+
arquivos** que renderizam links `wa.me` ou referências a contato
WhatsApp (botão flutuante, footer, formulário de contato, pedidos,
admin de motorista, admin de carrinhos). É infra **client-side
estática** — todos geram `wa.me` sem passar pelo backend.

Não existe componente `<WhatsAppStatusBadge>` específico, nem página
de "caixa de mensagens" da corretora. Há `QuickRepliesDropdown` em
`painel-corretora` (atalho de mensagem rápida no painel da corretora,
gera `wa.me` via lib client). Não persiste o envio.

---

## 2. Diff: o que falta para o briefing

| # | Solicitado | Existe? | Ação |
|---|---|---|---|
| 1 | Service consolidado com `sendMessage` / `sendFreeText` | 🟡 Parcial — existe `sendWhatsapp` único; precisa wrapper com nome novo + log estruturado | Etapa 3 |
| 2 | `utils/phone.js` E.164 | 🟡 Existe `lib/waLink.js` com `normalizePhoneBR`; criar wrapper `utils/phone.js` re-exportando + extender | Etapa 3 |
| 3 | Rate limit + retry exponencial 3× | ❌ Adapter API faz 1 tentativa única | Etapa 3 |
| 4 | Tabela `whatsapp_messages` com `lead_id` / `contract_id` / `provider_message_id` / ciclo de vida | ❌ Existe só `comunicacoes_enviadas` (pedido-only) | Etapa 2 |
| 5 | Tabela `whatsapp_templates` versionados | ❌ Templates hoje são arquivos JS hardcoded + envs `WHATSAPP_TEMPLATE_*` | Etapa 2 |
| 6 | 7 templates do Mercado do Café | ❌ Existem 6 de pedido + 5 de ocorrência. Nenhum de corretora. | Etapa 4 |
| 7 | Webhook `POST /api/webhooks/whatsapp` + verificação Meta + HMAC + inbound | ❌ Não existe rota nem tabela `whatsapp_inbound` | Etapa 5 |
| 8 | Provider `stub` | ❌ Existem `manual` e `api`; criar 3º adapter | Etapa 3 |
| 9 | Frontend `<WhatsAppStatusBadge>` + ação contextual nos cards de contrato (amber/green) + página `/painel/corretora/whatsapp` | ❌ Não existe | Etapa 6 |
| 10 | Envs `WHATSAPP_WEBHOOK_VERIFY_TOKEN` + `WHATSAPP_WEBHOOK_SECRET` | ❌ Não existe no `.env.example` | Etapas 2 + 5 |

---

## 3. Decisões de design — registradas para esta reativação

### 3.1 Conviver com `comunicacoes_enviadas` em vez de migrar
A tabela atual está acoplada a `pedidos`/`usuarios` por FK. Migrar
significa:
- (a) relaxar FKs e adicionar colunas opcionais (lead_id, contract_id, corretora_id, provider_message_id, delivered_at, read_at, failed_at, retry_count) → impacto em todos os repositories que consultam por pedido_id;
- (b) ou criar tabela paralela.

**Decisão**: criar `whatsapp_messages` **nova**, dedicada ao novo fluxo
(corretora + futuras integrações). `comunicacoes_enviadas` continua
sendo a verdade do módulo Pedidos. Convergência das duas em uma
única tabela "comunicações" fica como dívida P2 para uma sprint
futura, quando todo o ecossistema usar a estrutura nova.

Na prática durante a transição:
- Pedidos continuam logando em `comunicacoes_enviadas` via
  `comunicacaoService.sendWhatsapp(...)`.
- Corretora loga em `whatsapp_messages` via `whatsappService.sendMessage(...)`.
- Frontend de painel lê só `whatsapp_messages` (escopo do briefing).

### 3.2 Prefixo `corretora_` nas 7 keys novas (alinhado com OK do usuário)
Para não colidir com as 6 envs `WHATSAPP_TEMPLATE_PEDIDO_*` já em uso
nem com os 11 arquivos `templates/whatsapp/*.js` do módulo Pedidos:

| Key na tabela `whatsapp_templates` | Variável Meta sugerida (pra submissão) |
|---|---|
| `corretora_lead_recebido` | `corretora_lead_recebido_v1` |
| `corretora_corretor_designado` | `corretora_corretor_designado_v1` |
| `corretora_proposta_enviada` | `corretora_proposta_enviada_v1` |
| `corretora_contrato_pronto_assinatura` | `corretora_contrato_pronto_assinatura_v1` |
| `corretora_contrato_assinado` | `corretora_contrato_assinado_v1` |
| `corretora_lembrete_assinatura_pendente` | `corretora_lembrete_assinatura_pendente_v1` |
| `corretora_kyc_pendente` | `corretora_kyc_pendente_v1` |

A versão (`_v1`) só é nome da template **na Meta**; na tabela local o
campo `version` permite múltiplas versões da mesma `key` convivendo
e ativando/desativando por flag `active`.

### 3.3 3º adapter `stub` — default neste sprint
Dois adapters hoje (`manual`, `api`). Criar um terceiro `stub`:
- Não envia mensagem.
- Não gera link `wa.me`.
- Persiste em `whatsapp_messages` com `status='queued_stub'`.
- Loga `whatsapp.stub.message` para debug.

Usado:
- Default no sprint de reativação (`WHATSAPP_PROVIDER=stub`).
- CI / testes integração sem rede.
- Smoke local sem precisar de WhatsApp Web.

### 3.4 Frontend — ação contextual no card de contrato (alinhado com OK)
Ajuste do briefing original (botão genérico → ação por estado):

| Estado do card | Cor | Ação WhatsApp |
|---|---|---|
| Pendente / aguardando assinatura | amber | "Enviar para assinatura via WhatsApp" → template `corretora_contrato_pronto_assinatura` |
| Assinado | green | "Reenviar comprovante via WhatsApp" → template `corretora_contrato_assinado` |
| Expirado / cancelado | grey | sem ação WhatsApp (status terminal) |
| Falha (provider error) | red | "Tentar novamente" → reusa última intent |

### 3.5 Webhook — segurança em camadas
- `GET /api/webhooks/whatsapp` — verificação Meta com `WHATSAPP_WEBHOOK_VERIFY_TOKEN` (echo `hub.challenge`).
- `POST /api/webhooks/whatsapp` — HMAC-SHA256 com `WHATSAPP_WEBHOOK_SECRET` sobre raw body. Express `raw()` antes do parser JSON. Idempotência por `provider_message_id`.

### 3.6 `utils/phone.js` — wrapper compatível, não substituto
- Re-exporta `normalizePhoneBR` de `lib/waLink.js`.
- Adiciona `toE164(raw)` que retorna com `+` (Meta API aceita ambos; usaremos `+` em logs e no banco).
- Adiciona `validateBR(raw)` (booleano).
- Mantém `lib/waLink.js` intacto para não quebrar callers atuais.

---

## 4. Riscos identificados

| Risco | Severidade | Mitigação |
|---|---|---|
| Janela 24h da Meta — texto livre só funciona dentro de 24h após cliente responder. Fora disso, Meta retorna 400. | Alta | Templates UTILITY aprovados são obrigatórios fora da janela. Default `stub` evita risco no sprint. |
| Aprovação de templates pela Meta pode levar dias e exigir ajuste de copy. | Média | Templates entram com `active=0` e `approved_at=NULL`; cutover só após aprovação. |
| Política de marketing — se algum template for classificado MARKETING (não UTILITY), exige opt-in explícito do destinatário. | Média | Os 7 templates são UTILITY (transacional, não promocional). Reforçar no copy submetido. |
| Convivência de schemas `comunicacoes_enviadas` vs `whatsapp_messages` — operação precisa saber qual consultar. | Baixa | Documentar matriz: pedido → `comunicacoes_enviadas`; corretora → `whatsapp_messages`. |
| HMAC do webhook — se `express.json()` consumir body antes de validar, assinatura quebra. | Média | Aplicar `express.raw({ type: "application/json" })` apenas na rota do webhook (já há precedente em `routes/public/webhookClicksign.js`). |
| Rate limit Meta — Meta tem limite de mensagens/segundo por phoneId. | Baixa | Adapter já tem timeout; adicionar retry exponencial não pode disparar avalanche em erro 4xx. |
| Stub default em produção — admin pode confundir "envio simulado" com "envio real". | Baixa | Header `[STUB]` em log + flag clara no painel quando provider=stub. |

---

## 5. Plano de execução (recapitulado)

| Etapa | Entrega | Commit | Status |
|---|---|---|---|
| 1 | Auditoria + plano (este doc) | `docs(whatsapp): auditoria do estado atual + plano de reativação` | **Em revisão** |
| 2 | Migrations: `whatsapp_messages`, `whatsapp_templates`, `whatsapp_inbound` + seed dos 7 templates como rascunho | `feat(whatsapp): tabelas messages/templates/inbound + seed de rascunho` | Pendente |
| 3 | `services/whatsapp/whatsappService.js` (sendMessage/sendFreeText) + adapter `stub` + retry exponencial + `utils/phone.js` | `feat(whatsapp): service de envio com log estruturado e retry` | Pendente |
| 4 | `POST /api/webhooks/whatsapp` + HMAC + persistência inbound + atualização status | `feat(whatsapp): webhook de status + inbound com HMAC` | Pendente |
| 5 | Frontend `<WhatsAppStatusBadge>` + ação contextual nos cards + página `/painel/corretora/whatsapp` | `feat(whatsapp): painel da corretora — cards de mensagens + ações` | Pendente |
| 6 | Testes unit + integration | `test(whatsapp): unit + integration cobrindo service e webhook` | Pendente |
| 7 | Atualizar `corretora-modulo.md` + fechar este doc | `docs(whatsapp): atualiza corretora-modulo + fecha doc de reativação` | Pendente |

---

## 6. Status final desta etapa

✅ Auditoria concluída. Inventário completo, gaps mapeados, decisões
registradas, riscos documentados. **Nenhum arquivo de código foi
alterado nesta etapa.**

Aguardando OK para prosseguir para a Etapa 2 (migrations + seed).
