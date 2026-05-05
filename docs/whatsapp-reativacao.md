# WhatsApp — Reativação para o módulo Mercado do Café

> Auditoria do estado atual do canal WhatsApp + plano de execução para
> reativá-lo como canal primário do Mercado do Café (lead ↔ corretor
> ↔ produtor). Documento operacional — atualizado por etapa entregue.
>
> Decisões de produto associadas: ver [[corretora-modulo.md]] e
> registros em `kavita-os/02 - Pendências.md` / `05 - Decisões Técnicas.md`.

**Etapa atual:** 4 — Webhook + HMAC + inbound (concluída).
**Próxima etapa:** 5 — Frontend (`<WhatsAppStatusBadge>`, ação contextual nos cards de contrato, painel `/painel/corretora/whatsapp`).

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

## 6. Etapa 1 — concluída

✅ Auditoria concluída. Inventário completo, gaps mapeados, decisões
registradas, riscos documentados. Commit `87d8d34`.

---

## 7. Etapa 2 — Schema + migrations + seed (concluída)

Migration única: `migrations/2026050500000001-create-whatsapp-tables-and-seed-corretora-templates.js`.

### 7.1 Ajustes obrigatórios travados antes da migration

#### A) `whatsapp_messages.provider`
- Tipo: `ENUM('manual', 'api', 'stub')`
- Default: `'stub'`
- Motivo: distinguir mensagens simuladas (sprint atual), manuais (link `wa.me`) e reais (Meta Cloud) é crítico para auditoria, relatórios e cutover.
- Valor inicial em todos os registros novos do sprint = `'stub'`. Cutover muda só o default no service, não o histórico.

#### B) `whatsapp_inbound.handled_by_user_id` (era `handled_by_admin_id`)
- Tipo: `INT.UNSIGNED NULL` (sem FK referencial).
- Comentário no código fonte: "usuário responsável pelo tratamento da mensagem inbound — pode ser admin, corretora_user ou usuário interno".
- Motivo: o tratamento pode ser feito por qualquer um dos perfis. Restringir via FK a uma única tabela de usuários trava o domínio. Convenção semântica fica no service que escreve (`handled_at` + `handled_by_user_id` juntos).

#### C) Templates como rascunho
- Todos os 7 templates entram com:
  - `key` com prefixo `corretora_`
  - `category = 'UTILITY'` (decisão registrada: nenhum é MARKETING nesta fase)
  - `active = 0`
  - `approved_at = NULL`
  - `meta_template_name = NULL` (preenchido só após aprovação Meta + cutover)
  - `version = 1`
- Cutover futuro: definir `meta_template_name`, `approved_at = NOW()`, `active = 1` via UPDATE manual ou painel admin.

### 7.2 Schema entregue

#### `whatsapp_templates`
| Coluna | Tipo | Notas |
|---|---|---|
| id | INT.UNSIGNED PK auto | |
| key | VARCHAR(120) | identificador lógico, com prefixo `corretora_` |
| version | INT.UNSIGNED default 1 | múltiplas versões da mesma key convivem |
| language_code | VARCHAR(10) default `pt_BR` | renomeado de `language` na migration corretiva — ver §7.5 |
| category | ENUM(`UTILITY`,`MARKETING`,`AUTHENTICATION`) default UTILITY | |
| body | TEXT | render com placeholders `{{var}}` |
| variables | JSON | array de strings com nomes das variáveis |
| meta_template_name | VARCHAR(160) NULL | nome aprovado Meta — preenchido pós-cutover |
| active | TINYINT default 0 | 0 = rascunho |
| approved_at | DATETIME NULL | |
| created_at / updated_at | DATETIME | auto |

Índices: `UNIQUE(key, version)`, `(active, key)`.

#### `whatsapp_messages`
| Coluna | Tipo | Notas |
|---|---|---|
| id | INT.UNSIGNED PK auto | |
| lead_id | INT.UNSIGNED NULL FK→`corretora_leads.id` SET NULL | |
| contract_id | INT.UNSIGNED NULL FK→`contratos.id` SET NULL | |
| corretora_id | INT.UNSIGNED NULL FK→`corretoras.id` SET NULL | |
| recipient_phone | VARCHAR(20) | E.164 sem `+` (ex.: `5533999991234`) |
| template_key | VARCHAR(120) NULL | FK lógica (não referencial) com `whatsapp_templates.key` |
| body | TEXT NULL | snapshot do que foi enviado |
| **provider** | **ENUM(`manual`,`api`,`stub`) default `stub`** | **ajuste A** |
| status | ENUM(`queued`,`queued_stub`,`manual_pending`,`sent`,`delivered`,`read`,`failed`) default `queued` | |
| provider_message_id | VARCHAR(120) UNIQUE NULL | id Meta — chave de idempotência no webhook |
| error_message | TEXT NULL | |
| retry_count | INT.UNSIGNED default 0 | |
| sent_at / delivered_at / read_at / failed_at | DATETIME NULL | timeline |
| created_at / updated_at | DATETIME | auto |

Índices: `recipient_phone`, `(lead_id, created_at)`, `(contract_id, created_at)`, `(corretora_id, created_at)`, `(status, created_at)`, `UNIQUE(provider_message_id)`.

#### `whatsapp_inbound`
| Coluna | Tipo | Notas |
|---|---|---|
| id | INT.UNSIGNED PK auto | |
| sender_phone | VARCHAR(20) | |
| body | TEXT NULL | |
| media_url | TEXT NULL | |
| lead_id | INT.UNSIGNED NULL FK→`corretora_leads.id` SET NULL | |
| contract_id | INT.UNSIGNED NULL FK→`contratos.id` SET NULL | |
| corretora_id | INT.UNSIGNED NULL FK→`corretoras.id` SET NULL | |
| raw_payload | JSON NULL | payload bruto Meta para auditoria |
| provider_message_id | VARCHAR(120) UNIQUE NULL | |
| received_at | DATETIME default NOW | |
| **handled_by_user_id** | **INT.UNSIGNED NULL (sem FK)** | **ajuste B** |
| handled_at | DATETIME NULL | |
| created_at / updated_at | DATETIME | auto |

Índices: `sender_phone`, `(lead_id, received_at)`, `(corretora_id, received_at)`, `UNIQUE(provider_message_id)`.

### 7.3 Templates definitivos no seed

Os 7 textos foram travados pelo comercial e entram **literalmente** no
seed. **Sem emojis. Sem links encurtados. Sem promessa de preço. Sem
afirmar que negociação está fechada antes do contrato.** Todos
UTILITY (transacionais).

#### 1. `corretora_lead_recebido`
**Variáveis**: `nome_corretora`, `nome_produtor`, `cidade_produtor`, `volume_cafe`, `tipo_cafe`

```
Olá, {{nome_corretora}}.

Você recebeu um novo interesse de venda de café pelo Kavita Mercado do Café.

Produtor: {{nome_produtor}}
Cidade: {{cidade_produtor}}
Volume informado: {{volume_cafe}}
Tipo de café: {{tipo_cafe}}

Acesse seu painel para analisar o contato e responder o produtor.

Mensagem automática do Kavita Mercado do Café.
```

#### 2. `corretora_corretor_designado`
**Variáveis**: `nome_produtor`, `nome_corretora`, `nome_corretor`

```
Olá, {{nome_produtor}}.

Seu atendimento no Kavita Mercado do Café foi direcionado para a corretora {{nome_corretora}}.

Responsável pelo contato: {{nome_corretor}}

A corretora poderá falar com você para entender melhor o café disponível, volume, localização e condições da negociação.

Mensagem automática do Kavita Mercado do Café.
```

#### 3. `corretora_proposta_enviada`
**Variáveis**: `nome_produtor`, `nome_corretora`, `volume_cafe`, `valor_proposta`, `condicao_pagamento`

```
Olá, {{nome_produtor}}.

A corretora {{nome_corretora}} registrou uma proposta para sua negociação de café no Kavita Mercado do Café.

Resumo da proposta:
Volume: {{volume_cafe}}
Valor informado: {{valor_proposta}}
Condição: {{condicao_pagamento}}

Acesse o atendimento ou fale com a corretora para conferir os detalhes antes de confirmar qualquer negociação.

Mensagem automática do Kavita Mercado do Café.
```

#### 4. `corretora_contrato_gerado`
**Variáveis**: `nome_produtor`, `numero_contrato`, `nome_corretora`, `volume_cafe`

```
Olá, {{nome_produtor}}.

O contrato da sua negociação de café foi gerado no Kavita Mercado do Café.

Contrato: {{numero_contrato}}
Corretora: {{nome_corretora}}
Volume: {{volume_cafe}}

Confira as informações com atenção antes de seguir para a assinatura.

Mensagem automática do Kavita Mercado do Café.
```

#### 5. `corretora_contrato_assinatura_pendente`
**Variáveis**: `nome_produtor`, `numero_contrato`, `nome_corretora`, `volume_cafe`

```
Olá, {{nome_produtor}}.

O contrato {{numero_contrato}} está aguardando sua assinatura.

Corretora: {{nome_corretora}}
Volume: {{volume_cafe}}

Acesse o link enviado pela corretora ou entre em contato com ela para finalizar esta etapa.

Mensagem automática do Kavita Mercado do Café.
```

#### 6. `corretora_contrato_assinado`
**Variáveis**: `nome_produtor`, `numero_contrato`, `nome_corretora`, `volume_cafe`

```
Olá, {{nome_produtor}}.

O contrato {{numero_contrato}} foi marcado como assinado no Kavita Mercado do Café.

Corretora: {{nome_corretora}}
Volume: {{volume_cafe}}

Guarde essa informação para acompanhar a negociação com mais segurança.

Mensagem automática do Kavita Mercado do Café.
```

#### 7. `corretora_lembrete_retorno_produtor`
**Variáveis**: `nome_produtor`, `nome_corretora`

```
Olá, {{nome_produtor}}.

Passando para lembrar que existe um atendimento em aberto no Kavita Mercado do Café com a corretora {{nome_corretora}}.

Caso ainda tenha interesse na negociação, responda a corretora ou acesse seu atendimento para continuar.

Mensagem automática do Kavita Mercado do Café.
```

> Observação: a key 7 ficou `corretora_lembrete_retorno_produtor`
> (não `corretora_lembrete_assinatura_pendente` da auditoria
> original). O briefing final renomeou o template — agora ele é um
> lembrete genérico de retorno, não específico de assinatura.
> Atualizada no seed e nesta seção.

### 7.4 Status final da Etapa 2

✅ Migration criada com 3 tabelas + 7 templates como rascunho (active=0).
✅ Conviver com `comunicacoes_enviadas` (não foi tocada).
✅ Aplicação não foi integrada ainda (próxima etapa).

---

## 7.5 Correção pós-Etapa 2: estratégia de idioma (`language_code`)

A migration original (`2026050500000001`) criou `whatsapp_templates.language`
e **não** criou nenhuma coluna de idioma em `whatsapp_messages`. A
revisão técnica identificou dois gaps que foram corrigidos antes
da Etapa 3:

1. O nome canônico da coluna na Meta Cloud API (campo `language.code`
   no payload de envio de template) é "language code". Padronizar a
   nomenclatura local como `language_code` evita o ruído de
   `language` vs `code` espalhado por service/adapter/webhook.
2. O histórico de envio precisa registrar o **idioma efetivamente
   usado** no momento do disparo, não só o idioma do template no
   instante atual. Sem isso, mudar `whatsapp_templates.language_code`
   de uma versão para outra reescreveria o histórico de mensagens
   antigas — quebra de auditoria.

### Correção aplicada

Migration `2026050500000002-add-language-code-to-whatsapp-tables.js`:

```sql
ALTER TABLE whatsapp_templates
  CHANGE COLUMN language language_code
  VARCHAR(10) NOT NULL DEFAULT 'pt_BR'
  COMMENT 'Código de idioma do template aprovado/submetido na Meta, ex: pt_BR';

ALTER TABLE whatsapp_messages
  ADD COLUMN language_code VARCHAR(10) NOT NULL DEFAULT 'pt_BR'
  COMMENT 'Código de idioma usado no envio do template WhatsApp, ex: pt_BR';
```

`CHANGE COLUMN` em vez de `RENAME COLUMN` para garantir que
default + comment fiquem definidos numa única instrução.

### Estratégia de idioma — contrato

- **Templates começam em `pt_BR`** — todas as 7 entradas semeadas
  na Etapa 2 têm `language_code='pt_BR'`. Idioma adicional vira
  uma nova versão da `key` (ex.: nova linha `corretora_lead_recebido`
  / version 2 / language_code `en_US`).
- **Service usa `language_code` do template** ao montar a chamada
  Meta. A resolução é: `whatsappService.sendMessage` busca o
  template por `(key, version, active=1)` e injeta o
  `language.code = template.language_code` no payload
  `messages.create`.
- **`whatsapp_messages.language_code` registra o idioma usado no
  envio**. Default `pt_BR` para conveniência; sempre populado pelo
  service no momento do INSERT (ainda que igual ao default). Esse
  campo é a verdade auditável — independente de mudanças
  posteriores em `whatsapp_templates`.

### Validação pós-correção

```
+---------------+-------------+------+-----+---------+-------+
| whatsapp_templates.language_code | varchar(10) | NO | | pt_BR | |
| whatsapp_messages.language_code  | varchar(10) | NO | | pt_BR | |
+---------------+-------------+------+-----+---------+-------+

Os 7 templates após o rename: language_code = 'pt_BR' (todos).
```

### O que muda na Etapa 3 por causa disso

- O service `sendMessage({ key, variables, ... })` resolve template
  por `(key, version, active=1)` e usa `template.language_code`
  para o payload Meta + para preencher `whatsapp_messages.language_code`
  no log.
- `sendFreeText({ to, text })` (texto livre, dentro da janela 24h)
  preenche `language_code` com `'pt_BR'` por default ou com o
  código que o caller passar como override.

---

Aguardando OK para Etapa 3 (`whatsappService.js` + adapter `stub` + retry).

---

## 8. Etapa 3 — Send service + adapter stub + retry (concluída)

### 8.1 Arquivos novos

| Arquivo | Função |
|---|---|
| `services/whatsapp/whatsappService.js` | Service consolidado da corretora. `sendMessage` + `sendFreeText`. |
| `services/whatsapp/adapters/stub.js` | Adapter `stub` — não envia nada, retorna `provider_message_id` determinístico `stub_<ts>_<rand>`. |
| `repositories/whatsappRepository.js` | Acesso SQL puro a `whatsapp_templates` + `whatsapp_messages`. |
| `utils/phone.js` | Wrapper sobre `lib/waLink.js`: `toE164`, `validateBR`, `maskPhone` (mascarar PII em logs). |

### 8.2 Arquivos modificados

| Arquivo | O que mudou |
|---|---|
| `services/whatsapp/index.js` | `getProvider()` agora aceita `manual | api | stub`. Quando provider=stub, traduz `queued_stub` → `manual_pending` no retorno para preservar contrato dos callers historicos (modulo Pedidos). |
| `services/whatsapp/adapters/api.js` | Retry exponencial 3× para falhas transitórias (timeout, 429, 5xx). 4xx (400/401/403) não retenta. Backoff 500/1500/3000 ms (override via `WHATSAPP_API_RETRY_BACKOFF_MS` para testes). |
| `.env.example` | `WHATSAPP_PROVIDER=stub` (default no sprint). Adicionadas `WHATSAPP_API_MAX_ATTEMPTS=3` e `WHATSAPP_STUB_FORCE_FAIL=false`. |

### 8.3 Contrato do `whatsappService`

```js
// Sucesso
{ ok: true, message_id, status, provider, provider_message_id, language_code }

// Erro de domínio (antes do adapter)
{ ok: false, code, message }
//   code:
//     VALIDATION_ERROR — telefone inválido / key vazia / text vazio
//     NOT_FOUND        — template inexistente
//     CONFLICT         — template inativo OU api sem meta_template_name
//     SERVER_ERROR     — adapter falhou após retries
```

### 8.4 Fluxo de status

```
                     ┌────────────────────────┐
sendMessage(...)  →  │ valida phone + key     │
                     │ valida template ativo  │  → CONFLICT/NOT_FOUND
                     └──────────┬─────────────┘
                                │
                     ┌──────────▼─────────────┐
                     │ insertMessage(queued/  │
                     │   queued_stub/         │  ← whatsapp_messages.status = pre-status
                     │   manual_pending)      │
                     └──────────┬─────────────┘
                                │
                     ┌──────────▼─────────────┐
                     │ adapter.send(...)      │
                     └──────────┬─────────────┘
                                │
                ┌───────────────┼───────────────┐
                ▼               ▼               ▼
           queued_stub    manual_pending      sent
        (provider=stub) (provider=manual) (provider=api)
                                                │
                                              error
                                                │
                                              failed
                                                │
                                          retry_count++
                                                │
                                          + error_message
                                          + failed_at
```

### 8.5 Política de retry (adapter API)

- **Retentar**: timeout (status 0), 429, 5xx.
- **Não retentar**: 400, 401, 403 e qualquer outro 4xx.
- **Tentativas**: até `WHATSAPP_API_MAX_ATTEMPTS` (default 3).
- **Backoff**: 500ms → 1500ms → 3000ms.
- **Logging**: cada tentativa loga `whatsapp.api.attempt_failed` com status code, retryable, attempt/max. Sucesso final loga `whatsapp.api.sent` com `attempts`.

### 8.6 Stub adapter — propósito e uso

- **Default no sprint** (`WHATSAPP_PROVIDER=stub`).
- Retorna `{ status: "queued_stub", messageId: "stub_<ts>_<rand>" }`.
- Não chama Meta. Não gera link wa.me.
- `WHATSAPP_STUB_FORCE_FAIL=true` → retorna `status="error"` para validar caminho de falha sem precisar de provider real.
- Útil em CI, dev local, staging, e como guardrail antes do cutover Meta (templates ainda `active=0`).

### 8.7 Contrato do `language_code` (consolidação §7.5)

- `sendMessage` lê `whatsapp_templates.language_code` e copia para `whatsapp_messages.language_code` no INSERT.
- Override via `language_code` no input prevalece se for válido.
- `sendFreeText` usa override quando passado, senão `pt_BR`.
- Service NÃO consulta `whatsapp_templates` no momento do retorno — `whatsapp_messages.language_code` é a verdade auditável imutável.

### 8.8 Logs estruturados — convenção

Cada envio gera 2–3 entradas:
1. `whatsapp.send.queued` (após INSERT pré-envio)
2. `whatsapp.api.attempt_failed` (quando aplicável, uma por tentativa)
3. `whatsapp.send.completed` (sucesso) ou `whatsapp.send.failed` (erro)

Campos sempre presentes:
- `correlation` (ex.: `wa_<ts>_<rand>`)
- `provider`
- `template_key` ou `null` (free text)
- `language_code`
- `lead_id`, `contract_id`, `corretora_id`
- `recipient_masked` (nunca o número completo — `5533*****1234`)
- `body_len` (nunca o body completo)
- `message_id` (PK em `whatsapp_messages`)
- `provider_message_id` quando disponível
- `attempts` (api retry)
- `err` sanitizado quando `failed`

### 8.9 Compatibilidade — modulo Pedidos

Pedidos (`comunicacaoService.sendWhatsapp`) continua funcionando:
- Lê `WHATSAPP_PROVIDER`. Se `stub`, recebe `status="manual_pending"` com `url=null` (traduzido pelo facade legado).
- `comunicacoes_enviadas` registra como `manual_pending`.
- 11 templates hardcoded de pedidos não são tocados.

### 8.10 Limites — o que ainda não entrou

- ❌ Webhook `POST /api/webhooks/whatsapp` — Etapa 4.
- ❌ Inbound do produtor → `whatsapp_inbound` — Etapa 4.
- ❌ HMAC de webhook + verify token — Etapa 4.
- ❌ Frontend `<WhatsAppStatusBadge>` + cards de contrato + página `/painel/corretora/whatsapp` — Etapa 5.
- ❌ Envio real à Meta — bloqueado por design: todos os 7 templates da corretora estão `active=0` E sem `meta_template_name`. Service retorna `CONFLICT` se alguém tentar `WHATSAPP_PROVIDER=api` antes do cutover.

### 8.11 Validação

- **Lint** nos 8 arquivos editados/novos: 0 erros.
- **Testes**: 1842/1842 unit verde (32 novos: 12 do whatsappService, 4 do stub, 6 retry adapter, 10 utils/phone).
- Rodando `WHATSAPP_PROVIDER=stub`, módulo Pedidos não quebra (testes legados de `comunicacaoService` permanecem verdes).
- Retry exponencial validado com cenários 429 → sucesso (2 tentativas), 5xx esgotado (3 tentativas), timeout retentado.

---

Aguardando OK para Etapa 4 (webhook + inbound + HMAC).

---

## 9. Etapa 4 — Webhook + HMAC + inbound (concluída)

### 9.1 Arquivos novos

| Arquivo | Função |
|---|---|
| `services/whatsapp/whatsappWebhookService.js` | `verifySubscription` (GET hub.challenge), `verifySignature` (HMAC-SHA256 timing-safe), `processWebhookPayload` (status updates + inbound). |
| `controllers/public/webhookWhatsappController.js` | `verify` (GET) + `ingest` (POST). Valida HMAC sobre `req.rawBody` antes de delegar ao processador. |
| `routes/public/webhookWhatsapp.js` | Rota pública: GET sem rate limit, POST com `webhookLimiter` + `express.raw` defensivo. |
| `test/unit/services/whatsapp/whatsappWebhookService.unit.test.js` | 20 testes. |
| `test/unit/controllers/webhookWhatsappController.unit.test.js` | 7 testes. |

### 9.2 Arquivos modificados

| Arquivo | O que mudou |
|---|---|
| `repositories/whatsappRepository.js` | + `findMessageByProviderId`, `updateMessageStatusByProviderId` (com FSM idempotente sent→delivered→read), `findInboundByProviderId`, `insertInbound`. |
| `routes/publicRoutes.js` | Registra `/webhooks/whatsapp`. |
| `.env.example` | + `WHATSAPP_WEBHOOK_VERIFY_TOKEN`, `WHATSAPP_WEBHOOK_SECRET`. |

### 9.3 Endpoints

#### `GET /api/webhooks/whatsapp`
Verificação de subscrição da Meta. Resposta:
- `?hub.mode=subscribe&hub.verify_token=...&hub.challenge=N` → `200 text/plain` com `N` cru se token bater.
- Token errado / mode errado / token não configurado → `403 forbidden`.

#### `POST /api/webhooks/whatsapp`
Eventos (status updates + inbound). Cabeçalho obrigatório:
```
X-Hub-Signature-256: sha256=<hex>
```
Validação HMAC-SHA256 sobre `req.rawBody` (bytes exatos preservados pelo `express.json({ verify })` global). Comparação **timing-safe** via `crypto.timingSafeEqual`.

| Caso | Resposta |
|---|---|
| HMAC válido | `200 { ok:true, summary:{...} }` |
| HMAC inválido / ausente | `401 { code: AUTH_ERROR }` |
| JSON inválido (após HMAC ok) | `200 { ok:false, reason: invalid_json }` |
| Exceção no processador | `200 { ok:false, reason: process_failed }` |

**Por que 200 em erro de domínio**: a Meta marca o webhook como falho e dispara backoff agressivo se receber 4xx/5xx repetidos. Com 200 + log + Sentry, conseguimos debugar sem perder o stream de eventos.

### 9.4 Status FSM (em `whatsapp_messages`)

`updateMessageStatusByProviderId` aplica FSM idempotente:

```
sent  →  delivered  →  read   (terminal)
   ↘                    ↗
              failed          (terminal)
```

- Mesmo status: no-op.
- Status anterior na ordem: no-op (delivered não volta para sent).
- Estados terminais (`read`, `failed`): qualquer evento posterior é no-op.
- Cada transição válida atualiza `status` + timestamp granular (`sent_at`, `delivered_at`, `read_at`, `failed_at`).
- `failed` extrai `error_message` do payload Meta (`errors[0].title|message + code`).

### 9.5 Inbound

Tipos de mensagem suportados:
- `text` → `body`
- `image`, `video`, `document`, `audio` → `media_url = meta://media/<id>` + caption opcional em `body`
- `button` → `body = button.text`
- `interactive` → `body = JSON.stringify(payload)`

**Idempotência**: lookup por `provider_message_id` (UNIQUE em `whatsapp_inbound`). Reentrega Meta vira `duplicateInbound++`.

**Lookup contextual** (lead/contract/corretora) ainda não implementado nesta etapa — campos ficam `NULL`. Próxima sprint pode resolver via `sender_phone` (correlacionar com `corretora_leads.telefone_normalized`).

`raw_payload` JSON guarda o webhook inteiro para auditoria — útil quando Meta evolui formato e queremos reprocessar.

### 9.6 Logs estruturados

| Evento | Quando |
|---|---|
| `whatsapp.webhook.verify_failed` | GET com token errado/ausente |
| `whatsapp.webhook.signature_invalid` | POST com HMAC quebrado |
| `whatsapp.webhook.invalid_json` | HMAC ok mas body não é JSON |
| `whatsapp.webhook.status_updated` / `_skipped` | Status FSM aplicado ou no-op |
| `whatsapp.webhook.inbound_received` | Nova mensagem inbound persistida |
| `whatsapp.webhook.processed` | Sumário final do POST |
| `whatsapp.webhook.partial_errors` | POST teve erros parciais nos itens |
| `whatsapp.webhook.process_failed` | Exceção no processador |

PII mascarada: `recipient_masked` / `sender_masked` (nunca o número completo).

### 9.7 Operação Meta — onboarding

1. No painel Meta (Developers → WhatsApp → Configuration):
   - Callback URL: `https://api.kavita.com.br/api/webhooks/whatsapp`
   - Verify Token: o valor que você setar em `WHATSAPP_WEBHOOK_VERIFY_TOKEN`
   - Subscribe nos campos: `messages` (mínimo)
2. No `.env` de produção:
   ```
   WHATSAPP_WEBHOOK_VERIFY_TOKEN=<32+ chars random>
   WHATSAPP_WEBHOOK_SECRET=<App Secret do app Meta>
   ```
3. Meta dispara `GET` para verificar — controller responde `200 + challenge`.
4. Eventos passam a chegar via `POST` assinado.

### 9.8 Limites — o que ainda não entrou

- ❌ Frontend `<WhatsAppStatusBadge>` + cards contextuais + página de inbox → **Etapa 5**.
- ❌ Lookup automático de `lead_id`/`contract_id`/`corretora_id` em inbound a partir de `sender_phone` → próxima sprint.
- ❌ Resposta automática a inbound — fluxo manual via painel da corretora (a corretora vê e responde via `sendFreeText` ou template).
- ❌ Templates ainda `active=0` — webhook funciona mas service de envio bloqueia em modo `api`.

### 9.9 Validação

- **Lint** nos 7 arquivos: 0 erros.
- **Tests**: **1869/1869 unit verde** (27 novos: 20 webhook service + 7 controller).
- Cenários cobertos:
  - GET verify ok / token errado / mode errado / token não configurado
  - HMAC válido / inválido / sem header / secret não configurado / timing-safe
  - Status: delivered / read / failed (com error_message extraído) / duplicado / desconhecido
  - Inbound texto / imagem com caption / idempotência por `provider_message_id`
  - Payload `object != whatsapp_business_account` / payload null
  - Exceção no processador → 200 com `reason: process_failed`
  - JSON inválido com HMAC ok → 200 com `reason: invalid_json`

---

Aguardando OK para Etapa 5 (frontend).
