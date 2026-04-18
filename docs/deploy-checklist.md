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
