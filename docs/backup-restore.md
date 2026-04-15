# Backup e Restore — MySQL

Procedimento operacional para backup automático e restore assistido do banco do Kavita.

## Visão geral

- **Estratégia:** dump lógico (`mysqldump --single-transaction`) comprimido com `gzip`.
- **Retenção padrão:** 14 dias (configurável via `KEEP_DAYS`).
- **Destino padrão:** `/var/backups/kavita/YYYY-MM-DD/kavita-YYYYMMDD-HHMMSS.sql.gz`.
- **Escopo:** schema + dados + routines + triggers + events.

Não substitui backup binário/PITR (point-in-time recovery). Para RPO < 1h, adicionar replicação ou `--master-data` + binlog fora do escopo deste script.

## Variáveis

Lidas do ambiente ou de `kavita-backend/.env`:

| Var | Default | Descrição |
|---|---|---|
| `DB_HOST` | — | Host do MySQL |
| `DB_PORT` | `3306` | Porta |
| `DB_USER` | — | Usuário |
| `DB_PASSWORD` | — | Senha |
| `DB_NAME` | — | Nome do banco |
| `BACKUP_DIR` | `/var/backups/kavita` | Onde salvar |
| `KEEP_DAYS` | `14` | Dias de retenção |

O usuário do banco usado no backup precisa de `SELECT, LOCK TABLES, SHOW VIEW, TRIGGER, EVENT, PROCESS, RELOAD`.

## Executar backup manual

```bash
cd kavita-backend
./scripts/db/backup.sh
```

## Agendar (cron, a cada 6h)

```cron
0 */6 * * * /srv/kavita/kavita-backend/scripts/db/backup.sh >> /var/log/kavita-backup.log 2>&1
```

Em Docker/Kubernetes, rodar num CronJob com volume em `BACKUP_DIR` e as mesmas env vars. Em Windows Server, usar Task Scheduler apontando para WSL ou portar para PowerShell.

## Restore

O restore é destrutivo: **sempre** faz um snapshot do estado atual em `${BACKUP_DIR}/pre-restore/` antes de sobrescrever.

```bash
cd kavita-backend
CONFIRM=yes ./scripts/db/restore.sh /var/backups/kavita/2026-04-15/kavita-20260415-060000.sql.gz
```

Sem `CONFIRM=yes` o script aborta.

## Teste de restore (obrigatório trimestralmente)

1. Provisionar banco vazio de staging: `CREATE DATABASE kavita_restore_test;`
2. Rodar `restore.sh` apontando para o dump do dia, com `DB_NAME=kavita_restore_test`.
3. Validar contagens-chave (`SELECT COUNT(*) FROM corretoras;`, `FROM corretora_leads;`, `FROM admin_audit_logs;`).
4. Subir o backend apontando para `kavita_restore_test` em staging e smoke-test de login admin e painel corretora.
5. Registrar o teste em `docs/runbook.md` (data, duração, resultado).

## Checklist operacional

- [ ] `BACKUP_DIR` em volume distinto do banco (disco separado ou bucket).
- [ ] Arquivos enviados para off-site (S3/GCS/Azure Blob) dentro de 24h.
- [ ] Alerta se `kavita-backup.log` não tiver linha "backup ok" nas últimas 8h.
- [ ] Restore testado ao menos 1× por trimestre.

## Pendências (débito técnico)

- Off-site sync ainda é manual/ad-hoc; adicionar etapa `aws s3 cp` ou `rclone` no `backup.sh` quando o bucket for definido.
- PITR via binlog (RPO < 1h) — não implementado.
- Criptografia do dump em repouso (gpg `--symmetric`) — não implementado.
