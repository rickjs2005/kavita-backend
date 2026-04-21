# Mapa de Dados Pessoais — Kavita

Inventário real, gerado a partir da auditoria das tabelas em
`INFORMATION_SCHEMA` no ambiente de desenvolvimento (2026-04-20).
Serve de fonte de verdade para **bases legais**, **retenção** e
**resposta a requisições de titulares**.

Qualquer nova tabela que armazene dado pessoal deve ser adicionada
aqui **antes** de ir para produção — vide `PR template` em
`docs/compliance/direitos-dos-titulares.md`.

---

## Legenda de risco

- **Baixo:** identificador simples (email profissional, nome comercial)
- **Médio:** PII típica (telefone, endereço, histórico de compra)
- **Alto:** dado que exige proteção extra (CPF, senha, localização
  precisa, token)

---

## Tabela-fonte por domínio

### 1. Usuário da loja (e-commerce)

| Tabela | Campos PII | Finalidade | Base legal | Retenção | Acesso | Risco |
|---|---|---|---|---|---|---|
| `usuarios` | nome, email, senha (hash), cpf (criptografado), cpf_hash, telefone, endereco, data_nascimento, resetToken, tokenVersion | Conta + login + nota fiscal | Execução de contrato (art. 7º V) + obrigação legal (art. 7º II — fiscal) | Ativa: vida útil da conta. Inativa: 5 anos (prescrição tributária) | Própria + admin | **Alto** (CPF) |
| `enderecos_usuario` | cep, endereco, numero, bairro, cidade, estado, telefone, ponto_referencia, comunidade | Entrega de pedido | Execução de contrato | Enquanto conta ativa; apagar quando conta excluída, salvo vínculo a pedido retido por obrigação fiscal | Própria + admin (pedidos) | Médio |
| `pedidos` | endereco (texto livre), shipping_cep | Histórico de compra + nota fiscal | Execução de contrato + obrigação legal fiscal | **5 anos** (art. 173 CTN — prescrição fiscal) | Próprio + admin financeiro | Médio |
| `produto_avaliacoes` | comentario (texto livre — pode conter PII) | Prova social do catálogo | Legítimo interesse (art. 7º IX) | Enquanto produto ativo; anonimizar autor quando conta excluída | Leitura pública + autor + admin | Baixo |
| `favorites` | usuario_id (vínculo) | Experiência personalizada | Legítimo interesse | Enquanto conta ativa | Próprio | Baixo |

### 2. Produtor (Mercado do Café)

| Tabela | Campos PII | Finalidade | Base legal | Retenção | Acesso | Risco |
|---|---|---|---|---|---|---|
| `producer_accounts` | email, nome, cidade, telefone, telefone_normalizado | Conta passwordless (magic link) + vínculo retroativo a leads | Execução de contrato + consentimento (art. 7º I) | Ativa: vida útil. Inativa: 12 meses após last_login | Próprio + admin | Médio |
| `producer_alert_subscriptions` | email (vínculo) + cidade + tipo_cafe | Alerta de corretora que matcheia perfil | Consentimento (opt-in explícito) | Até o produtor cancelar | Próprio | Baixo |
| `producer_favorites` | producer_id + corretora_id | Favoritos | Legítimo interesse | Enquanto conta ativa | Próprio | Baixo |

### 3. Lead da corretora (canal de captação)

| Tabela | Campos PII | Finalidade | Base legal | Retenção | Acesso | Risco |
|---|---|---|---|---|---|---|
| `corretora_leads` | nome, telefone, telefone_normalizado, email, cidade, mensagem, preco_*, obs_*, source_ip, user_agent, consentimento_contato | CRM da corretora + prospecção | **Consentimento** (formulário exige `consentimento_contato=true`) | Ativa: vida útil do negócio. Arquivada (status=lost/closed): 24 meses então anonimizar | Corretora-escopo + admin | Médio |
| `corretora_lead_notes` | body (texto livre) | Histórico interno CRM | Consentimento (herdado do lead) | Igual ao lead-pai (CASCADE) | Corretora-escopo | Baixo |
| `corretora_lead_events` | title + meta (JSON) | Timeline/auditoria | Consentimento (herdado) | Igual ao lead-pai (CASCADE) | Corretora-escopo | Baixo |

### 4. Operadores da corretora (staff B2B)

| Tabela | Campos PII | Finalidade | Base legal | Retenção | Acesso | Risco |
|---|---|---|---|---|---|---|
| `corretora_users` | nome, email, password_hash, totp_secret, last_login_ip | Autenticação dos operadores da corretora | Execução de contrato (SaaS corporativo) | Enquanto vínculo ativo; desativação preserva histórico de auditoria | Próprio + owner da corretora + admin | **Alto** (senha + 2FA) |
| `corretoras` | contact_name, phone, whatsapp, email, foto_responsavel_path, endereco_textual | Ficha pública + contato comercial | Execução de contrato | Vida útil do relacionamento + 5 anos (auditoria) | Público (parte) + corretora + admin | Médio |

### 5. Contato público e comunicação

| Tabela | Campos PII | Finalidade | Base legal | Retenção | Acesso | Risco |
|---|---|---|---|---|---|---|
| `mensagens_contato` | nome, email, telefone, mensagem, ip | Formulário de contato geral + canal de privacidade | Legítimo interesse + Cumprimento de direitos do titular (LGPD art. 18) | 24 meses para contato geral; **indefinida** para solicitações de titulares (auditoria ANPD) | Admin | Médio |
| `email_suppressions` | email | Bounce/unsubscribe; evitar enviar emails a quem optou por sair | Obrigação de respeitar opt-out | Indefinida enquanto ativa | Sistema (send-time check) | Baixo |
| `password_reset_tokens` | token (hash), scope | Recuperação de senha / magic link | Execução de contrato | 30 min (TTL curto) | Sistema | **Alto** (token) |

### 6. Governança e infraestrutura

| Tabela | Campos PII | Finalidade | Base legal | Retenção | Acesso | Risco |
|---|---|---|---|---|---|---|
| `webhook_events` | payload (JSON — pode conter PII de terceiros: ClickSign signers, Asaas customers) | Idempotência + reconciliação | Legítimo interesse operacional | 90 dias após processed_at | Admin | Médio |
| `admin_audit_log` (se existir) | snapshot antes/depois | Auditoria administrativa | Obrigação legal + legítimo interesse | 5 anos | Admin | Médio |
| `drone_comments` / `drone_representatives` | (campos similares ao catálogo) | Conteúdo editorial | Legítimo interesse | Enquanto ativo | Admin + público (parte) | Baixo |

---

## Dados que **não** sob nenhuma hipótese aparecem em exportação ao titular

Backend controla via projeção explícita na exportação; nunca
espelhar o modelo 1:1:

- `senha` / `password_hash` / `cpf` (mesmo criptografado) / `cpf_hash`
- `resetToken` / `tokenVersion` / `totp_secret`
- `webhook_events.payload` (dados de terceiros)
- `corretora_lead_notes` que não foram criadas pelo próprio titular
  (são anotações internas da corretora sobre ele)
- `source_ip` / `user_agent` / `last_login_ip` (anonimizar antes de
  expor — mostrar apenas data do último acesso)

---

## Próximas revisões deste mapa

- **Fase 10.2 (KYC/AML)** — incluirá `corretora_kyc` com CNPJ + QSA,
  revisar classificação e retenção (7 anos sugerido para evidência
  de due diligence)
- **Fase 11.1 (Escrow)** — dados bancários do produtor entram em
  cena; exigem reclassificação Alto + criptografia at-rest
