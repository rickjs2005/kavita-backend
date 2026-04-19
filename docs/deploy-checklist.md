# Deploy checklist — Kavita backend

ETAPA 1 da sequência de endurecimento. Pipeline de deploy **roda migrations automaticamente** antes do server.js subir. Este doc existe para o operador ter um roteiro manual caso algo falhe.

---

## 1. Fluxo automático (padrão)

O `Dockerfile` termina com:

```dockerfile
CMD ["node", "scripts/deploy/entrypoint.js"]
```

O `entrypoint.js`:
1. Imprime `NODE_ENV`
2. Se `SKIP_DB_MIGRATE != 1`, roda `npx sequelize-cli db:migrate`
3. Se falhar, **exit 1** (orquestrador reinicia)
4. Se der certo, `require("server.js")` no mesmo process (herda SIGTERM)

Isso é suficiente em 99% dos deploys. **Não precisa rodar `npm run db:migrate` manual antes.**

---

## 2. Bypass de emergência

Quando se precisa subir réplica **sem mexer no schema** (ex.: rollback rápido):

```bash
SKIP_DB_MIGRATE=1 node scripts/deploy/entrypoint.js
```

Ou pelo orquestrador: setar env var `SKIP_DB_MIGRATE=1`.

---

## 3. Rodando migrations manualmente (quando o orquestrador não roda o entrypoint)

```bash
npm run db:migrate:prod   # NODE_ENV=production
npm run db:status:prod    # ver o que está aplicado
```

---

## 4. Checklist pré-deploy (primeiro deploy ou schema novo)

- [ ] `git pull` do commit a deployar
- [ ] `npm ci --omit=dev` (prod deps apenas)
- [ ] Variáveis de ambiente presentes: `JWT_SECRET`, `EMAIL_USER`, `EMAIL_PASS`, `APP_URL`, `BACKEND_URL`, `DB_*`, `MP_WEBHOOK_SECRET`, `CPF_ENCRYPTION_KEY`
- [ ] DB acessível do container (ping/port open)
- [ ] `npm run db:status:prod` mostra lista de migrations pendentes esperadas
- [ ] Deploy (entrypoint roda migrations + sobe server)
- [ ] Smoke test: `curl ${BACKEND_URL}/health` → 200

---

## 5. Rollback de uma migration

**Nunca** rode `db:undo:all` em produção. Sempre `db:undo` (uma de cada vez) e valide entre cada.

```bash
npm run db:undo  # reverte a última
# valide app ainda funciona
npm run db:undo  # se precisar reverter mais uma
```

---

## 6. Migrations recentes (jornada 2026-04-18)

Rode `npm run db:status:prod`. Se alguma destas estiver pendente:

- `2026041800000004-add-regional-fields-to-corretora-leads`
- `2026041800000005-add-recontact-tracking-to-corretora-leads`
- `2026041800000006-create-corretora-lead-notes`
- `2026041800000007-create-corretora-lead-events`
- `2026041800000008-add-proposal-fields-to-corretora-leads`
- `2026041800000009-create-corretora-admin-notes`
- `2026041800000010-add-regional-fields-to-corretoras`
- `2026041800000011-add-max-leads-per-month-to-plans` (ETAPA 1.4)
- `2026041800000012-add-pending-checkout-to-subscriptions` (ETAPA 1.2)

Deixe o entrypoint aplicar na subida.

---

## 7. Pré-condição `sequelize-cli`

Este projeto mantém `sequelize-cli` em **dependencies** (não devDependencies) para que o `--omit=dev` do Docker não o remova. Se o `npm ci` for reconfigurado, mantenha essa decisão.

---

## 8. Envio de e-mail em produção (P0-01)

O Kavita envia e-mails transacionais (aprovação de corretora, convite
de primeiro acesso, reset de senha, avisos de trial, confirmação de
lead). A factory de transporter fica em `services/mail/transport.js` e
decide o provider por env:

| MAIL_PROVIDER | Uso | Vars obrigatórias |
|---|---|---|
| `sendgrid` | **Recomendado em produção** | `SENDGRID_API_KEY`, `MAIL_FROM` |
| `smtp` | AWS SES, Mailgun, Postmark, SMTP corporativo | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_SECURE`, `MAIL_FROM` |
| `disabled` | **Bloqueado em produção** | só dev/CI |

### Configurando SendGrid (caminho recomendado)

1. Criar conta em https://sendgrid.com (plano Free = 100 e-mails/dia)
2. Verificar domínio remetente em **Settings → Sender Authentication**
   - DNS records (CNAMEs + SPF) precisam propagar antes do primeiro envio
3. Gerar API key em **Settings → API Keys** (permissão "Mail Send")
4. Setar no ambiente de produção:
   ```
   MAIL_PROVIDER=sendgrid
   SENDGRID_API_KEY=SG.xxxxx
   MAIL_FROM=no-reply@kavita.com.br
   MAIL_FROM_NAME=Kavita
   ```
5. Deploy. Primeiro e-mail testa o fluxo completo.

### Configurando SMTP genérico (fallback)

Qualquer provider compatível (AWS SES, Mailgun, Postmark, Resend, SMTP
corporativo) funciona via:

```
MAIL_PROVIDER=smtp
SMTP_HOST=email-smtp.us-east-1.amazonaws.com   # exemplo AWS SES
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=AKIAxxxxxx
SMTP_PASS=BAseSMTPPasswordFromIAM
MAIL_FROM=no-reply@kavita.com.br
```

### Testando envio em dev/staging

```bash
# E-mail curto pra validar credenciais:
npm run mail:test -- seu-email@exemplo.com

# Simula e-mail de primeiro acesso:
node scripts/send-test-email.js seu-email@exemplo.com invite

# Simula aviso de trial (3 dias):
node scripts/send-test-email.js seu-email@exemplo.com trial

# Em produção exige --allow-prod explícito:
NODE_ENV=production node scripts/send-test-email.js equipe@kavita.com.br plain --allow-prod
```

### Troubleshooting

| Sintoma | Causa provável | Fix |
|---|---|---|
| Boot não quebra mas nada é enviado | `MAIL_PROVIDER=disabled` em dev | Setar provider real; confirmar ausência em prod (env.js bloqueia disabled em prod) |
| `Invalid login: 535-5.7.8 BadCredentials` | Senha de app Gmail expirou | Migrar pra SendGrid (`MAIL_PROVIDER=sendgrid`) |
| E-mail cai no spam | `MAIL_FROM` não está num domínio verificado | Verificar domínio no SendGrid (SPF + DKIM) ou configurar DKIM no DNS |
| Error `Nenhum provider de e-mail configurado` no boot em prod | Nenhuma var setada | Definir `MAIL_PROVIDER` + credenciais antes do deploy |
| Teste passa mas produção falha | API key com permissão errada | SendGrid: garantir permissão "Mail Send" (não só "Email Activity") |

### Cron de verificação

Opcionalmente, agendar envio de smoke test diário pra um inbox monitorado:

```
0 9 * * * cd /var/app && NODE_ENV=production node scripts/send-test-email.js ops@kavita.com.br plain --allow-prod >> /var/log/kavita/mail-smoke.log 2>&1
```

Se o log mostrar erro, alerta imediato em vez de descobrir quando um
usuário real reclamar que não recebeu reset de senha.
