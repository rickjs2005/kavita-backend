# RIPD — Relatório de Impacto à Proteção de Dados

Relatório de Impacto da plataforma Kavita — Mercado do Café.

- **Versão:** 1.0 (Fase 10.3, 2026-04-20)
- **Responsável:** DPO designado (rever antes de produção)
- **Próxima revisão obrigatória:** a cada nova migração de PII
  (vide template em `direitos-dos-titulares.md`)

---

## 1. Controlador

- **Controlador:** Kavita (CNPJ e endereço físico a preencher antes
  da disponibilização pública deste RIPD)
- **DPO/Encarregado:** a designar formalmente antes do lançamento
  comercial; contato provisório: `privacidade@kavita.com.br`

## 2. Operadores (processadores) envolvidos

| Operador | Função | Dados transmitidos |
|---|---|---|
| ClickSign | Assinatura digital de contratos | Nome, email dos signatários (corretora + produtor) |
| Asaas | Gateway de pagamento de planos da corretora | Dados de cobrança da corretora (não do produtor final) |
| Cloudflare Turnstile | Proteção anti-bot em formulários | IP + fingerprint do cliente (sem vínculo a titular Kavita) |
| Notícias Agrícolas (scraping) | Fonte de cotação | Nenhum dado pessoal sai do Kavita |
| Yahoo Finance (API) | Fonte de cotação | Nenhum dado pessoal sai |
| Provedor de email transacional | Envio de magic link, notificações | Email do destinatário, assunto, body |
| Provedor de SMS (opt-in) | Envio de aviso de lote | Telefone do produtor que opto-in |
| Sentry | Observabilidade de erro | Metadados de request; **não** enviamos body com PII |
| BCB / CEPEA | Fontes públicas | Nenhum dado pessoal sai |

Cada operador opera sob cláusulas de proteção de dados no contrato
comercial ou Termos (fonte externa). DPA formal quando o provedor
exigir.

## 3. Finalidade e necessidade

| Tratamento | Necessário? | Base legal | Volume estimado |
|---|---|---|---|
| Autenticação do usuário/produtor/corretora | Sim | Execução de contrato | ~1k contas (MVP) |
| Captação de lead | Sim | Consentimento explícito | ~100/mês MVP |
| Emissão de contrato | Sim | Execução de contrato + consentimento do signatário | ~10/mês MVP |
| Notificação transacional | Sim | Execução de contrato | depende |
| Analytics de SLA | Sim | Legítimo interesse | interno |
| Marketing/newsletter | **Não ativado hoje** | Consentimento seria requerido quando ligar | — |

## 4. Avaliação de riscos

### Risco 1 — Vazamento de credenciais/tokens

- **Impacto potencial:** tomada de conta.
- **Mitigações ativas:**
  - Senha em bcrypt (usuário) e magic link passwordless (produtor)
  - JWT HttpOnly com token_version (revogação em massa possível)
  - CSRF double-submit em mutações
  - 2FA TOTP opcional para corretora
- **Risco residual:** Baixo-Médio

### Risco 2 — Exposição de lead a terceiro (IDOR)

- **Impacto potencial:** corretora A vê lead da corretora B.
- **Mitigações ativas:**
  - Repositório escopa por `corretora_id = req.corretoraUser.corretora_id`
  - `findByIdForCorretora(id, corretora_id)` em todas as leituras
  - Testes de integração cobrindo tentativa de acesso cruzado
- **Risco residual:** Baixo

### Risco 3 — Exposição de PII em rota pública

- **Impacto potencial:** scraper coleta dados de leads.
- **Mitigações ativas:**
  - `/verificar/:token` mostra apenas iniciais do produtor (J. Silva)
  - Rate limit em formulários públicos
  - Turnstile em submissions
- **Risco residual:** Baixo

### Risco 4 — Retenção indefinida

- **Impacto potencial:** dados ficam além do necessário.
- **Mitigações ativas:**
  - Política de retenção documentada (`retencao.md`)
  - Anonimização configurável no fluxo de exclusão
- **Risco residual:** Médio (crons de retenção ainda não
  implementados — item do backlog)

### Risco 5 — Comprometimento de provedor externo (ClickSign, Asaas)

- **Impacto potencial:** exposição de nome/email de signatário.
- **Mitigações ativas:**
  - Dados mínimos enviados (nome + email apenas)
  - CPF não enviado a ClickSign no MVP (`has_documentation=false`)
  - HMAC em webhook impede forja
- **Risco residual:** Baixo-Médio

---

## 5. Medidas técnicas e organizacionais

### Técnicas
- Senha via bcrypt, CPF via AES-256-GCM (`CPF_ENCRYPTION_KEY`)
- TLS ponta-a-ponta (HTTPS)
- Helmet com CSP endurecida em rotas admin
- Rate limit Redis/memória-fallback
- Logs estruturados (pino) sem body de PII
- Storage privado (`storage/contratos/`) fora de `/uploads` público

### Organizacionais
- Pair review obrigatória em PR que toca PII (template em
  `direitos-dos-titulares.md`)
- Acesso ao banco de produção restrito a DPO + 1 dev sênior
- Logs de auditoria admin (`adminAuditService.diffFields`) com
  before/after imutável
- DPO com contato publicado em `/privacidade`

## 6. Necessidade e proporcionalidade

O tratamento é proporcional à finalidade. Não coletamos dado
"porque pode ser útil um dia" — cada campo novo exige revisão
deste documento.

Exemplo de não-tratamento deliberado:
- **Não** coletamos localização GPS do produtor, apenas cidade.
- **Não** coletamos CPF do produtor em captura de lead (só quando
  entra CPR eletrônica na Fase 11.3).
- **Não** enviamos nome completo no endpoint público de verificação
  de contrato — mostramos iniciais (`J. Silva`).
